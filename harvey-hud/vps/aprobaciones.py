# Bandeja del señor (/opt/data/hud/aprobaciones.py): las tarjetas del equipo que esperan su decisión.
#   aprobaciones.py listar                          -> JSON con las «Aprobar: …» y las preguntas pendientes
#   aprobaciones.py responder <tablero> <id> <aprobar|rechazar|responder>   (el texto del señor, por stdin)
# Lo usan el HUD del PC (por ssh) y la app del iPhone. Una «Aprobar: …» solo aparece cuando su tarjeta de trabajo
# (la madre) ya está terminada, es decir, cuando Lince ya la ha revisado.
import glob, json, os, re, sqlite3, subprocess, sys

TABLEROS = {os.path.basename(os.path.dirname(p)): p for p in glob.glob("/opt/data/kanban/boards/*/kanban.db")}
TEXTO_MAX = 20_000


def leer_aprobar(carpeta):
    try:
        with open(os.path.join(carpeta, "APROBAR.md"), encoding="utf-8") as f:
            return f.read()[:TEXTO_MAX]
    except (OSError, TypeError):
        return None


def listar():
    out = []
    for slug, db in sorted(TABLEROS.items()):
        c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        q = """select t.id, t.title, t.assignee, t.created_by, t.body, t.workspace_path, t.created_at,
                      (select e.payload from task_events e where e.task_id = t.id and e.kind = 'blocked'
                       order by e.id desc limit 1),
                      (select e.created_at from task_events e where e.task_id = t.id and e.kind = 'blocked'
                       order by e.id desc limit 1)
               from tasks t
               where t.status = 'blocked' and not exists (
                 select 1 from task_links l join tasks p on p.id = l.parent_id
                 where l.child_id = t.id and p.status != 'done')"""
        for tid, title, quien, autor, body, carpeta, creada, payload, desde in c.execute(q):
            try:
                motivo = json.loads(payload or "{}").get("reason") or ""
            except ValueError:
                motivo = ""
            aprobar = title.lower().startswith("aprobar")
            if motivo == "initial_status":
                motivo = ""
            # una «Aprobar: …» va a nombre de Harvey (es quien envía), pero la pide el agente que la creó
            out.append({"tablero": slug, "id": tid, "titulo": title, "agente": (autor or quien) if aprobar else quien,
                        "tipo": "aprobar" if aprobar else "pregunta",
                        "motivo": motivo or (body or "")[:2000], "texto": leer_aprobar(carpeta) if aprobar else None,
                        "carpeta": carpeta, "desde": desde or creada})
        c.close()
    return sorted(out, key=lambda x: x["desde"] or 0)


def responder(slug, tid, accion, texto):
    if slug not in TABLEROS or not re.fullmatch(r"t_[0-9a-f]{6,16}", tid) or accion not in ("aprobar", "rechazar", "responder"):
        sys.exit("Datos no válidos")
    if not any(x["tablero"] == slug and x["id"] == tid for x in listar()):
        sys.exit("Esa tarjeta ya no está esperando al señor")
    texto = texto.strip()[:4000]
    if accion == "responder" and not texto:
        sys.exit("Falta la respuesta")
    nota = {"aprobar": "APROBADO por el señor. Haz exactamente lo que dice la tarjeta y ciérrala.",
            "rechazar": "RECHAZADO por el señor: no se hace nada fuera. Ciérrala apuntando que se rechazó.",
            "responder": "El señor responde:"}[accion]
    nota = f"{nota} {texto}".strip() if texto else nota
    r = subprocess.run(["/opt/hermes/bin/hermes", "kanban", "--board", slug, "unblock", tid, "--reason", nota],
                       capture_output=True, text=True, timeout=90)
    if r.returncode:
        sys.exit((r.stderr or r.stdout).strip()[-300:])


if __name__ == "__main__":
    if sys.argv[1:2] == ["responder"] and len(sys.argv) == 5:
        responder(*sys.argv[2:5], sys.stdin.read() if not sys.stdin.isatty() else "")
    elif sys.argv[1:] != ["listar"]:
        sys.exit(__doc__ or "uso: aprobaciones.py listar | responder <tablero> <id> <accion>")
    print(json.dumps(listar(), ensure_ascii=False))
