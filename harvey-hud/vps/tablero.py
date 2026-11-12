# Equipo, tablero y objetivos de Harvey para el HUD (/opt/data/hud/tablero.py), leyendo los kanban.db de cada tablero
# y las fichas de wiki/objetivos (solo lectura).
#   tablero.py equipo    -> JSON: una línea por agente (qué hace ahora) y lo terminado en las últimas 24 h
#   tablero.py tablero   -> JSON: objetivos, tarjetas por columna (cola, trabajando, revisión, hecho 7 días), la bandeja,
#                           lo último que ha pasado, la reunión de dirección y el freno de cupo (Tablero y Oficina)
#   tablero.py comentar <tablero> <id>   -> deja el mensaje del señor (por stdin) en la tarjeta
# snapshot.py importa equipo() (bloque «equipo»); el HUD pide el tablero con /api/tablero.
import glob, json, os, re, sqlite3, subprocess, sys, time
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aprobaciones  # la bandeja: lo que espera al señor

AGENTES = ["sherlock", "jordan", "eco", "leonardo", "lince", "tomo"]
TABLEROS = {os.path.basename(os.path.dirname(p)): p for p in glob.glob("/opt/data/kanban/boards/*/kanban.db")}
OBJETIVOS = "/opt/data/wiki/objetivos"
# lo que espera al señor: bloqueada y sin tarjeta madre por terminar (misma regla que aprobaciones.py)
SIN_MADRE_PENDIENTE = """not exists (select 1 from task_links l join tasks p on p.id = l.parent_id
                          where l.child_id = t.id and p.status != 'done')"""
# trámites de la cadena que no son un encargo en sí
TRAMITE = ("archivar", "aprobar", "revisar")


def ro(path):
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def equipo():
    ahora = time.time()
    gente = {a: {"agente": a, "estado": "libre"} for a in AGENTES}
    hechas = []
    peso = {"libre": 0, "cola": 1, "espera": 2, "trabajando": 3}

    def pon(agente, estado, **datos):
        g = gente.get(agente)
        if g is None:
            return
        if peso[estado] > peso[g["estado"]]:
            g.update(estado=estado, **datos, mas=0)
        elif peso[estado] == peso[g["estado"]] and estado != "libre":
            g["mas"] += 1  # «y 1 más»

    for slug, db in sorted(TABLEROS.items()):
        c = ro(db)
        # trabajando: el perfil del turno abierto (al pedir revisión la tarjeta pasa a Lince, pero quien trabaja es el del turno)
        for tid, titulo, perfil, desde in c.execute(
                "select t.id, t.title, r.profile, r.started_at from task_runs r join tasks t on t.id = r.task_id"
                " where r.status = 'running' and r.ended_at is null order by r.started_at"):
            pon(perfil, "trabajando", tarjeta=tid, titulo=titulo, tablero=slug, desde=desde)
        for tid, titulo, quien, autor, status, desde in c.execute(
                f"select t.id, t.title, t.assignee, t.created_by, t.status, coalesce(t.started_at, t.created_at) from tasks t"
                f" where t.status in ('blocked', 'ready', 'todo', 'triage', 'scheduled') and {SIN_MADRE_PENDIENTE}"):
            if status == "blocked":
                aprobar = titulo.lower().startswith("aprobar")  # va a nombre de Harvey, pero la pide quien la creó
                pon((autor or quien) if aprobar else quien, "espera", tarjeta=tid, titulo=titulo, tablero=slug, desde=desde,
                    aprobar=aprobar)
            else:
                pon(quien, "cola", tarjeta=tid, titulo=titulo, tablero=slug, desde=desde)
        # quien la hizo es el del primer turno: tras la revisión la tarjeta queda a nombre de Lince
        for tid, titulo, quien, fin in c.execute(
                "select t.id, t.title, coalesce((select r.profile from task_runs r where r.task_id = t.id order by r.id limit 1),"
                " t.assignee), t.completed_at from tasks t where t.status in ('done', 'archived')"
                " and t.completed_at > ? order by t.completed_at desc", (ahora - 86400,)):
            if not titulo.lower().startswith(TRAMITE):
                hechas.append({"tarjeta": tid, "titulo": titulo, "agente": quien, "tablero": slug, "fin": fin})
        c.close()
    return {"agentes": list(gente.values()), "hechas": hechas[:10]}


def secciones(txt):
    """{«Hitos»: texto, ...} de los «## Título» de una ficha."""
    partes = re.split(r"^## +(.+?)\s*$", txt, flags=re.M)
    return {partes[i]: partes[i + 1].strip() for i in range(1, len(partes) - 1, 2)}


def fecha(s):
    try:
        return date.fromisoformat(s)
    except (TypeError, ValueError):
        return None  # «AAAA-MM-DD» de la plantilla sin rellenar


def objetivos(carpeta=OBJETIVOS, hoy=None):
    """Una ficha por objetivo (wiki/objetivos/*.md): estado, plazo, hitos, siguiente paso y semáforo."""
    hoy = hoy or date.today()
    out = []
    for p in sorted(glob.glob(os.path.join(carpeta, "*.md"))):
        nombre = os.path.basename(p)[:-3]
        if nombre == "README" or nombre.startswith("_"):
            continue
        txt = open(p, encoding="utf-8").read().replace("\r\n", "\n")
        meta = {}
        m = re.match(r"---\n(.*?)\n---\n", txt, re.S)
        if m:
            for linea in m.group(1).splitlines():
                k, _, v = linea.partition(":")
                meta[k.strip()] = v.strip()
        sec = secciones(txt)
        titulo = re.search(r"^# +(?:Objetivo:\s*)?(.+?)\s*$", txt, re.M)
        hitos = [{"hecho": x.lower() == "x", "texto": t.strip()}
                 for x, t in re.findall(r"^\s*[-*] \[([ xX])\] (.+)$", sec.get("Hitos", ""), re.M)]
        hechos = sum(h["hecho"] for h in hitos)
        avance = hechos / len(hitos) if hitos else 0
        desde, limite = fecha(meta.get("desde")), fecha(meta.get("fecha_limite"))
        tiempo = None
        if desde and limite and limite > desde:
            tiempo = min(1, max(0, (hoy - desde).days / (limite - desde).days))
        estado = meta.get("estado", "activo")
        # semáforo: el avance de los hitos frente al tiempo que ya ha pasado del plazo
        if estado != "activo":
            semaforo = "gris"
        elif limite and hoy > limite and avance < 1:
            semaforo = "rojo"
        elif tiempo is None or avance + 0.15 >= tiempo:
            semaforo = "verde"
        elif avance + 0.35 >= tiempo:
            semaforo = "ambar"
        else:
            semaforo = "rojo"
        primera = lambda s: next((l.strip("-* ").strip() for l in s.splitlines() if l.strip() and not l.startswith("<")), "")
        out.append({"id": nombre, "titulo": titulo.group(1) if titulo else nombre, "estado": estado,
                    "tablero": meta.get("tablero", ""), "desde": meta.get("desde"), "fecha_limite": meta.get("fecha_limite"),
                    "cupo_maximo": meta.get("cupo_maximo", ""), "hitos": hitos, "hechos": hechos, "semaforo": semaforo,
                    "siguiente": primera(sec.get("Siguiente paso", "")), "situacion": primera(sec.get("Estado", ""))})
    return out


def ultimo_turno(c, tid):
    """(base de datos, sesión) del último turno de un agente en la tarjeta, según el evento owner_admitted."""
    fila = c.execute("select payload from task_events where task_id = ? and kind = 'owner_admitted' order by id desc limit 1",
                     (tid,)).fetchone()
    try:
        p = json.loads(fila[0]) if fila else {}
        return p.get("db"), p.get("session_id")
    except ValueError:
        return None, None


def tablero():
    ahora = time.time()
    dia0 = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    tarjetas, gasto, obj_espera, recientes = [], {}, {}, []
    perfiles = {}  # base de datos de cada perfil, abierta una vez

    def perfil(path):
        if path not in perfiles:
            perfiles[path] = ro(path) if path and os.path.exists(path) else None
        return perfiles[path]

    for slug, db in sorted(TABLEROS.items()):
        c = ro(db)
        c.row_factory = sqlite3.Row
        todas = {r["id"]: r for r in c.execute("select id, title, status, tenant from tasks")}
        padres = {}
        for p, h in c.execute("select parent_id, child_id from task_links"):
            padres.setdefault(h, []).append(p)

        def objetivo(tid, vistos=()):
            # el suyo o el de la tarjeta de la que sale (las antiguas no lo heredaban)
            if todas[tid]["tenant"]:
                return todas[tid]["tenant"]
            for p in padres.get(tid, []):
                if p in todas and p not in vistos:
                    o = objetivo(p, vistos + (tid,))
                    if o:
                        return o
            return None

        filas = c.execute(
            "select t.*, (select r.profile from task_runs r where r.task_id = t.id and r.status = 'running' order by r.id desc limit 1) as trabaja,"
            " (select r.profile from task_runs r where r.task_id = t.id order by r.id limit 1) as autor,"
            " (select r.summary from task_runs r where r.task_id = t.id and r.summary is not null order by r.id desc limit 1) as resumen,"
            " exists(select 1 from task_events e where e.task_id = t.id and e.kind = 'review_requested') as revisada"
            " from tasks t where t.status != 'archived' and (t.status != 'done' or t.completed_at > ?)", (ahora - 7 * 86400,)).fetchall()
        for t in filas:
            pendientes = [todas[p]["title"] for p in padres.get(t["id"], []) if p in todas and todas[p]["status"] != "done"]
            st = t["status"]
            if st == "done":
                col = "hecho"
            elif st == "review" or (st == "running" and t["assignee"] == "lince" and t["revisada"]):
                col = "revision"
            elif st == "running":
                col = "trabajando"
            elif st == "blocked" and not pendientes:
                obj_espera[(slug, t["id"])] = objetivo(t["id"])
                continue  # está en la bandeja (aprobaciones.listar), con su texto y sus botones
            else:
                col = "cola"
            obj = objetivo(t["id"])
            tarjeta = {"id": t["id"], "tablero": slug, "titulo": t["title"], "columna": col, "estado": st, "autor": t["autor"],
                       "agente": t["trabaja"] or (t["autor"] if st == "done" else None) or t["assignee"],
                       "objetivo": obj, "creada": t["created_at"], "empezada": t["started_at"], "terminada": t["completed_at"],
                       "espera_a": pendientes, "cuerpo": (t["body"] or "")[:1200], "resumen": (t["resumen"] or t["result"] or "")[:800]}
            # último paso del agente (su sesión en la base de datos de su perfil) y lo gastado hoy en el objetivo
            base, sesion = ultimo_turno(c, t["id"]) if st in ("running", "review") or obj else (None, None)
            d = perfil(base)
            if d and sesion:
                if st in ("running", "review"):
                    paso = d.execute("select tool_name, timestamp from messages where session_id = ? and role = 'tool'"
                                     " and tool_name is not null order by id desc limit 1", (sesion,)).fetchone()
                    if paso:
                        tarjeta["paso"], tarjeta["paso_t"] = paso
                if obj:
                    for ent, sal in d.execute("select coalesce(input_tokens, 0), coalesce(output_tokens, 0) from sessions"
                                              " where id = ? and started_at >= ?", (sesion, dia0)):
                        gasto[obj] = gasto.get(obj, 0) + ent + sal
            tarjetas.append(tarjeta)
        # lo último que ha pasado (el rótulo de la Oficina): quién lo hizo es el perfil del turno del evento, salvo «terminó»,
        # que es del autor (el turno que la cierra es la revisión de Lince), y «encargo nuevo», que es del asignado de entonces
        # (al pedir revisión la tarjeta pasa a nombre de Lince)
        for kind, cuando, payload, titulo, asignado, hizo, autor in c.execute(
                "select e.kind, e.created_at, e.payload, t.title, t.assignee, r.profile,"
                " (select r2.profile from task_runs r2 where r2.task_id = t.id order by r2.id limit 1) from task_events e"
                " join tasks t on t.id = e.task_id left join task_runs r on r.id = e.run_id"
                " where e.kind in ('created', 'review_requested', 'changes_requested', 'completed', 'blocked', 'unblocked', 'commented')"
                " order by e.id desc limit 15"):
            try:
                p = json.loads(payload or "{}") or {}
            except ValueError:
                p = {}
            p = p if isinstance(p, dict) else {}
            if p.get("reason") == "initial_status" or (kind == "created" and titulo.lower().startswith("aprobar")):
                continue  # una «Aprobar: …» recién creada, que aún espera a su madre (sale en el buzón al llegar)
            if kind == "created":
                asignado = p.get("assignee") or asignado
            quien = autor if kind == "completed" and autor else hizo
            recientes.append({"tipo": kind, "t": cuando, "titulo": titulo, "agente": quien or asignado, "asignado": asignado, "tablero": slug})
        c.close()
    espera = aprobaciones.listar()
    for x in espera:  # la bandeja también sabe de qué objetivo es cada cosa
        x["objetivo"] = obj_espera.get((x["tablero"], x["id"]))
    objs = objetivos()
    for o in objs:
        o["tokens_hoy"] = gasto.get(o["id"], 0)
        o["tarjetas"] = sum(t["objetivo"] == o["id"] for t in tarjetas) + sum(x["objetivo"] == o["id"] for x in espera)
    orden = {"trabajando": 0, "revision": 1, "cola": 2, "hecho": 3}
    tarjetas.sort(key=lambda t: (orden[t["columna"]], -(t["terminada"] or t["empezada"] or t["creada"] or 0)))
    return {"objetivos": objs, "tarjetas": tarjetas, "espera": espera, "tableros": sorted(TABLEROS),
            "recientes": sorted(recientes, key=lambda x: -x["t"])[:15], "reunion": reunion(), "freno": freno()}


def reunion():
    """Cuándo despertó de verdad la reunión de dirección (su vigilante vio cambios) y cuándo pasó por última vez."""
    try:
        j = json.load(open("/opt/data/cron/jobs.json"))
        jobs = j.get("jobs", j) if isinstance(j, dict) else j
        x = next(x for x in (jobs if isinstance(jobs, list) else jobs.values())
                 if str(x.get("name", "")).startswith("Equipo de Harvey · Reunión"))
        return {"cambio": (x.get("monitor_state") or {}).get("last_changed_at"), "ultima": x.get("last_run_at")}
    except (OSError, ValueError, StopIteration):
        return {}


def freno():
    try:
        return bool(json.load(open("/opt/data/hud/cupo_ultimo.json")).get("freno"))
    except (OSError, ValueError):
        return False


def comentar(slug, tid, texto):
    """El señor deja un mensaje en una tarjeta desde la Oficina (el agente lo lee en su siguiente turno)."""
    texto = texto.strip()[:2000]
    if slug not in TABLEROS or not re.fullmatch(r"t_[0-9a-f]{6,16}", tid) or not texto:
        sys.exit("Datos no válidos")
    r = subprocess.run(["/opt/hermes/bin/hermes", "kanban", "--board", slug, "comment", tid, "Mensaje del señor: " + texto,
                        "--author", "señor"], capture_output=True, text=True, timeout=90)
    if r.returncode:
        sys.exit((r.stderr or r.stdout).strip()[-300:])


if __name__ == "__main__":
    accion = sys.argv[1:] and sys.argv[1]
    if accion == "equipo":
        print(json.dumps(equipo(), ensure_ascii=False))
    elif accion == "tablero":
        print(json.dumps(tablero(), ensure_ascii=False))
    elif accion == "comentar" and len(sys.argv) == 4:
        comentar(sys.argv[2], sys.argv[3], sys.stdin.read())
        print(json.dumps({"ok": True}))
    else:
        sys.exit("uso: tablero.py equipo | tablero | comentar <tablero> <id> (texto por stdin)")
