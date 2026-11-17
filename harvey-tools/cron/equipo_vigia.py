# Cron «Equipo de Harvey» (sin IA, cada minuto): avisa al iPhone y al HUD cuando termina un encargo del equipo
# (la última tarjeta de TRABAJO de una cadena: el «Archivar» de Tomo no cuenta, va después y no hace esperar al señor),
# cuando una tarjeta se bloquea esperando al señor y cuando una tarjeta lleva demasiado en marcha (a los 45 min se lo
# recuerda al agente en su tarjeta; a la hora, aviso al señor). Sin novedades no imprime nada. La primera vez solo memoriza.
import glob, json, os, sqlite3, subprocess, time

ESTADO = "/opt/data/hud/equipo_estado.json"
HARVEY_DB = "/opt/data/state.db"
TABLEROS = {os.path.basename(os.path.dirname(p)): p for p in glob.glob("/opt/data/kanban/boards/*/kanban.db")}
ESPERA_INFORME = 300  # segundos que se espera el informe de Harvey antes de avisar sin él
RECORDAR, AVISAR = 45 * 60, 60 * 60  # tarjeta en marcha: nota al agente / aviso al señor (el 17/11 un HTML tardó 72 min)
HERMES = "/opt/hermes/bin/hermes"
archivar = lambda titulo: (titulo or "").lower().startswith("archivar")


def recorta(s, n=260):
    s = " ".join((s or "").split())
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + "…"


def raiz(c, tid):
    """La primera tarjeta del encargo (sin madre), que es la que lleva su nombre y la conversación de Harvey."""
    vistos = set()
    while tid not in vistos:
        vistos.add(tid)
        madres = [r[0] for r in c.execute(
            "select l.parent_id from task_links l join tasks p on p.id = l.parent_id where l.child_id = ?"
            " order by p.created_at", (tid,))]
        if not madres:
            break
        tid = madres[0]
    return c.execute("select title, session_id, created_at from tasks where id = ?", (tid,)).fetchone()


def informe_harvey(sesion, desde, tarjetas=()):
    """Lo que Harvey le escribió al señor sobre el encargo: su último mensaje no [SILENT] tras un aviso del tablero de una
    de sus `tarjetas` (si se dan). Hermes le despierta en su conversación al terminar cada tarjeta, pero esos turnos no
    llegan solos a la pantalla. Lo de las tarjetas importa: al compactar, Hermes reescribe mensajes viejos con hora nueva."""
    if not sesion:
        return None
    try:
        c = sqlite3.connect(f"file:{HARVEY_DB}?mode=ro", uri=True)
        filas = c.execute("select role, content from messages where session_id = ? and timestamp > ?"
                          " and role in ('user', 'assistant') order by id", (sesion, desde)).fetchall()
    except sqlite3.Error:
        return None
    tras_aviso, texto = False, None
    for rol, cont in filas:
        cont = (cont or "").strip()
        if rol == "user":
            tras_aviso = cont.startswith("[kanban]") and (not tarjetas or any(t in cont for t in tarjetas))
        elif tras_aviso and cont and "[SILENT]" not in cont:
            texto = cont
    return texto


def novedades(slug, db, desde):
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    ultimo = c.execute("select coalesce(max(id), 0) from task_events").fetchone()[0]
    if desde is None:
        return ultimo, []
    out = []
    q = """select e.kind, e.payload, t.id, t.title, t.assignee, t.result,
                  exists(select 1 from task_links l join tasks h on h.id = l.child_id
                         where l.parent_id = t.id and lower(h.title) not like 'archivar%') as tiene_hijos
           from task_events e join tasks t on t.id = e.task_id
           where e.id > ? and e.kind in ('completed', 'blocked') order by e.id"""
    for kind, payload, tid, title, quien, result, hijos in c.execute(q, (desde,)):
        try:
            p = json.loads(payload or "{}")
        except ValueError:
            p = {}
        if kind == "blocked":
            if p.get("reason") == "initial_status":
                continue  # una «Aprobar: …» recién creada: se avisa cuando termine su tarjeta madre (abajo)
            out.append(f"El equipo necesita algo de usted: «{title}» (@{quien}, tablero {slug}). "
                       f"{recorta(p.get('reason') or result or 'Pregúntele a Harvey qué falta.')}")
            continue
        if title.lower().startswith("aprobar") or archivar(title):
            continue  # cerrar una «Aprobar: …» o archivar no es el fin de un encargo (ya se avisó con su tarjeta de trabajo)
        # la «Aprobar: …» se avisa cuando terminan TODAS sus madres (como la bandeja), no con la primera
        aprobar = [r[0] for r in c.execute(
            """select h.title from task_links l join tasks h on h.id = l.child_id
               where l.parent_id = ? and h.status = 'blocked' and lower(h.title) like 'aprobar%'
                 and not exists (select 1 from task_links l2 join tasks p on p.id = l2.parent_id
                                 where l2.child_id = h.id and p.status != 'done')""", (tid,))]
        if aprobar:  # revisado por Lince: ya puede decidir el señor
            out.append(f"Necesita su visto bueno: {', '.join(f'«{t}»' for t in aprobar)} (tablero {slug}). "
                       "Lo tiene en la bandeja del HUD y de la app.")
        elif not hijos:  # fin del trabajo (solo le queda, si acaso, el archivo): se avisa con el informe de Harvey (abajo)
            out.append({"tablero": slug, "tarjeta": tid, "t": time.time()})
    return ultimo, out


def fin_de_encargo(p):
    """Aviso de un encargo terminado, o None si aún conviene esperar el informe de Harvey."""
    c = sqlite3.connect(f"file:{TABLEROS[p['tablero']]}?mode=ro", uri=True)
    titulo, sesion, creada = raiz(c, p["tarjeta"])
    # ¿queda trabajo del mismo encargo (un «Rehacer: …» de Harvey, por ejemplo)? Entonces no ha terminado: se espera
    if sesion and c.execute("""select 1 from tasks where session_id = ? and created_at >= ?
                                 and status not in ('done', 'archived') and lower(title) not like 'archivar%'
                                 and not (status = 'blocked' and lower(title) like 'aprobar%') limit 1""",
                            (sesion, creada)).fetchone():
        return None
    tarjetas = [r[0] for r in c.execute("select id from tasks where session_id = ? and created_at >= ?", (sesion, creada))]
    texto = informe_harvey(sesion, creada, tarjetas)
    if texto:
        texto = texto[7:].lstrip() if texto.startswith("Señor,") else texto  # el aviso ya empieza por «Señor,»
        return f"Encargo terminado: «{titulo}».\n\n{texto[:1].upper()}{texto[1:]}"
    if time.time() - p["t"] < ESPERA_INFORME:
        return None
    run = c.execute("select summary from task_runs where task_id = ? order by id desc limit 1", (p["tarjeta"],)).fetchone()
    return (f"Encargo terminado: «{titulo}» (tablero {p['tablero']}). {recorta(run and run[0])} "
            "Harvey tiene el resultado: pregúntele por él.")


def comentar(slug, tid, texto):
    try:
        subprocess.run([HERMES, "kanban", "--board", slug, "comment", tid, texto, "--author", "harvey"],
                       capture_output=True, text=True, timeout=90)
    except (OSError, subprocess.SubprocessError):
        pass


def largas(slug, db, vistas, corriendo, ahora=None):
    """Tarjetas cuyo turno lleva demasiado en marcha. `vistas` = {tarjeta: nivel ya dado}; apunta en `corriendo` las que
    siguen en marcha y devuelve los avisos al señor."""
    ahora = ahora or time.time()
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    out = []
    for tid, titulo, perfil, desde in c.execute(
            """select t.id, t.title, r.profile, r.started_at from task_runs r join tasks t on t.id = r.task_id
               where r.status = 'running' and r.started_at is not null"""):
        corriendo.add(tid)
        lleva, nivel = ahora - desde, vistas.get(tid, 0)
        if lleva >= AVISAR and nivel < 2:
            vistas[tid] = 2
            out.append(f"«{titulo}» lleva {int(lleva // 60)} minutos con @{perfil} (tablero {slug}). "
                       "Le he pedido que cierre lo esencial; pregúntele a Harvey cómo va.")
        elif lleva >= RECORDAR and nivel < 1:
            vistas[tid] = 1
            comentar(slug, tid, f"Llevas {int(lleva // 60)} minutos con esta tarjeta y el tope es una hora. Si algo se ha "
                                "atascado (capturas, pruebas, una web que no carga), déjalo como no verificado, termina lo "
                                "esencial y pide revisión.")
    return out


if __name__ == "__main__":
    try:
        estado = json.load(open(ESTADO))
    except (OSError, ValueError):
        estado = {}
    avisos, pendientes, vistas, corriendo = [], estado.pop("pendientes", []), estado.pop("largas", {}), set()
    for slug, db in sorted(TABLEROS.items()):
        if estado.get(slug) is not None:
            avisos += largas(slug, db, vistas, corriendo)
        estado[slug], nuevos = novedades(slug, db, estado.get(slug))
        avisos += [a for a in nuevos if isinstance(a, str)]
        pendientes += [a for a in nuevos if isinstance(a, dict)]
    quedan = []
    for p in pendientes:
        if p["tablero"] not in TABLEROS:
            continue
        a = fin_de_encargo(p)
        if a:
            avisos.append(a)
        else:
            quedan.append(p)
    estado["pendientes"] = quedan
    estado["largas"] = {t: n for t, n in vistas.items() if t in corriendo}
    json.dump(estado, open(ESTADO, "w"))
    if avisos:
        print("Señor, " + "\n\n".join(a[0].lower() + a[1:] if i == 0 else a for i, a in enumerate(avisos)))
