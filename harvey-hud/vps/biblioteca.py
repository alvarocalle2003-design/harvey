# Biblioteca del HUD (/opt/data/hud/biblioteca.py): la wiki del equipo (/opt/data/wiki) para leer, buscar y ver qué ha
# cambiado, y los únicos tres formularios que la escriben: un objetivo, la ficha de un cliente y la voz de LinkedIn.
#   biblioteca.py indice    -> JSON: todas las notas (ruta, título, texto, último cambio) y los últimos cambios de git
#   biblioteca.py guardar   -> JSON por stdin {ruta, base, campos}: git pull, cambia SOLO esos campos, commit y push
# Nada de editor completo: si la nota cambió desde que el señor la abrió (Obsidian, un agente), no se pisa: se avisa.
import hashlib, json, os, re, subprocess, sys
from datetime import datetime

WIKI = "/opt/data/wiki"
ESTADOS_CLIENTE = ["prospecto", "propuesta preparada", "contactado", "en conversación", "cliente", "no interesado", "no contactar"]
ESTADOS_OBJETIVO = ["activo", "en pausa", "terminado"]
TITULOS = {"negocio/linkedin/voice.md": "Su voz de LinkedIn"}  # la plantilla de las skills de Eco se titula «voice.md»
EDITABLES = {"objetivo": r"objetivos/(?!_|README)[\w-]+\.md", "cliente": r"negocio/clientes/(?!README)[\w-]+\.md",
             "voz": r"negocio/linkedin/voice\.md"}


def tipo_de(ruta):
    return next((t for t, rx in EDITABLES.items() if re.fullmatch(rx, ruta or "")), None)


def git(*args, wiki=WIKI, **kw):
    return subprocess.run(["git", "-C", wiki, *args], capture_output=True, text=True, timeout=60, **kw)


def huella(txt):
    return hashlib.sha1(txt.encode()).hexdigest()


def leer(wiki, ruta):
    return open(os.path.join(wiki, ruta), encoding="utf-8").read().replace("\r\n", "\n")


def quien(autor, mensaje):
    """Quién hizo el cambio, para la frase «Tomo archivó ayer…»."""
    if autor.startswith("Álvaro"):
        return "hud" if mensaje.startswith("HUD:") else "obsidian" if mensaje == "Cambios desde Obsidian" else "senor"
    if mensaje.startswith("Archivar"):
        return "tomo"  # Tomo es el único que archiva (EQUIPO.md)
    return "servidor" if mensaje == "Cambios del servidor sin guardar" else "equipo"


def indice(wiki=WIKI):
    log = git("log", "-60", "--format=\x1e%at\x1f%an\x1f%s", "--name-only", wiki=wiki).stdout
    cambios, ultimo = [], {}
    for bloque in log.split("\x1e")[1:]:
        cabeza, *archivos = bloque.strip("\n").split("\n")
        t, autor, mensaje = cabeza.split("\x1f", 2)
        archivos = [a for a in archivos if a.endswith(".md")]
        c = {"t": int(t), "quien": quien(autor, mensaje), "mensaje": mensaje, "archivos": archivos}
        for a in archivos:
            ultimo.setdefault(a, c)
        if archivos and len(cambios) < 20:
            cambios.append(c)
    notas = []
    for raiz, dirs, archivos in os.walk(wiki):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for a in sorted(archivos):
            if not a.endswith(".md"):
                continue
            ruta = os.path.relpath(os.path.join(raiz, a), wiki).replace(os.sep, "/")
            txt = leer(wiki, ruta)
            titulo = re.search(r"^# +(.+?)\s*$", txt, re.M)
            u = ultimo.get(ruta, {})
            notas.append({"ruta": ruta, "titulo": TITULOS.get(ruta) or (titulo.group(1) if titulo else a[:-3]), "texto": txt, "base": huella(txt),
                          "tipo": tipo_de(ruta), "t": u.get("t"), "quien": u.get("quien")})
    existe = {n["ruta"] for n in notas}
    for c in cambios:  # las notas borradas o renombradas no se pueden abrir
        c["archivos"] = [a for a in c["archivos"] if a in existe]
    return {"notas": notas, "cambios": cambios, "estados_cliente": ESTADOS_CLIENTE, "estados_objetivo": ESTADOS_OBJETIVO}


# ---------- Escritura: solo los campos de cada formulario ----------
def _sec(txt, nombre):
    """(inicio, fin) del contenido de «## nombre», hasta el siguiente «## » o el final; None si no está."""
    m = re.search(rf"^## +{re.escape(nombre)}[ \t]*\n?", txt, re.M)
    if not m:
        return None
    n = re.search(r"^## ", txt[m.end():], re.M)
    return m.end(), m.end() + n.start() if n else len(txt)


def poner_seccion(txt, nombre, cuerpo):
    s = _sec(txt, nombre)
    if not s:
        return txt.rstrip() + f"\n\n## {nombre}\n{cuerpo.strip()}\n"
    return txt[:s[0]] + cuerpo.strip() + "\n\n" + txt[s[1]:].lstrip("\n")


def anadir_a_seccion(txt, nombre, linea):
    s = _sec(txt, nombre)
    return poner_seccion(txt, nombre, (txt[s[0]:s[1]] if s else "").rstrip() + "\n" + linea)


def poner_campo(txt, clave, valor):
    """«clave: valor» de la cabecera (entre --- o, en las fichas de cliente, las primeras líneas sueltas)."""
    valor = " ".join(str(valor).split())
    if re.search(rf"^{clave}:.*$", txt, re.M):
        return re.sub(rf"^{clave}:.*$", lambda m: f"{clave}: {valor}", txt, count=1, flags=re.M)
    if txt.startswith("---\n"):
        return txt.replace("\n---\n", f"\n{clave}: {valor}\n---\n", 1)
    return f"{clave}: {valor}\n" + txt


def campo(txt, clave):
    m = re.search(rf"^{clave}:[ \t]*(.*)$", txt, re.M)
    return m.group(1).strip() if m else ""


def cambiar_objetivo(txt, c, ahora):
    hecho = []
    for clave, nombre in (("estado", "estado"), ("fecha_limite", "plazo"), ("cupo_maximo", "cupo máximo")):
        if clave in c and str(c[clave]).strip() != campo(txt, clave):
            if clave == "estado" and c[clave] not in ESTADOS_OBJETIVO:
                sys.exit("Estado de objetivo no válido")
            if clave == "fecha_limite" and not re.fullmatch(r"\d{4}-\d\d-\d\d", c[clave]):
                sys.exit("Fecha no válida")
            txt = poner_campo(txt, clave, c[clave])
            hecho.append(f"{nombre} → {c[clave]}")
    if "hitos" in c:
        s = _sec(txt, "Hitos")
        antes = re.findall(r"^\s*[-*] \[([ xX])\] (.+)$", txt[s[0]:s[1]] if s else "", re.M)
        antes = {t.strip(): x.lower() == "x" for x, t in antes}
        nuevos = [(" ".join(str(h["texto"]).split()), bool(h["hecho"])) for h in c["hitos"] if str(h.get("texto", "")).strip()]
        if nuevos != list(antes.items()):
            txt = poner_seccion(txt, "Hitos", "\n".join(f"- [{'x' if h else ' '}] {t}" for t, h in nuevos))
            for t, h in nuevos:
                if t not in antes:
                    hecho.append(f"nuevo hito «{t}»")
                elif h != antes[t]:
                    hecho.append(f"hito «{t}» {'hecho' if h else 'pendiente'}")
            hecho += [f"quita el hito «{t}»" for t in antes if t not in dict(nuevos)]
    if "siguiente" in c:
        s = _sec(txt, "Siguiente paso")
        if c["siguiente"].strip() != (txt[s[0]:s[1]].strip() if s else ""):
            txt = poner_seccion(txt, "Siguiente paso", c["siguiente"])
            hecho.append("siguiente paso")
    if hecho:  # que Harvey lo vea en la siguiente reunión de dirección
        txt = anadir_a_seccion(txt, "Diario", f"- {ahora:%Y-%m-%d %H:%M} · El señor lo cambia desde el HUD: {'; '.join(hecho)}")
    return txt, hecho


def cambiar_cliente(txt, c, ahora):
    hecho = []
    if c.get("estado") and c["estado"] != campo(txt, "estado"):
        if c["estado"] not in ESTADOS_CLIENTE:
            sys.exit("Estado de cliente no válido")
        txt = poner_campo(txt, "estado", c["estado"])
        hecho.append(f"estado → {c['estado']}")
    if "ultimo_contacto" in c:
        u = c["ultimo_contacto"].strip() or "nunca"
        if u != "nunca" and not re.fullmatch(r"\d{4}-\d\d-\d\d", u):
            sys.exit("Fecha no válida")
        if u != campo(txt, "ultimo_contacto"):
            txt = poner_campo(txt, "ultimo_contacto", u)
            hecho.append(f"último contacto → {u}")
    nota = " ".join(str(c.get("nota", "")).split())[:1000]
    if hecho or nota:
        txt = anadir_a_seccion(txt, "Historial", f"- {ahora:%Y-%m-%d} · El señor (desde el HUD): {'; '.join(hecho + [nota] if nota else hecho)}")
        if nota and not hecho:
            hecho.append("nota en el historial")
    return txt, hecho


def cambiar_voz(txt, c, ahora):
    hecho = []
    for etiqueta, valor in (c.get("campos") or {}).items():
        valor = " ".join(str(valor).split())
        rx = rf"^(- \*\*{re.escape(etiqueta)}:\*\*)(.*)$"
        m = re.search(rx, txt, re.M)
        if m and m.group(2).strip() != valor and not (not valor and m.group(2).strip().startswith("(")):
            txt = re.sub(rx, lambda m: m.group(1) + (" " + valor if valor else ""), txt, count=1, flags=re.M)
            hecho.append(etiqueta)
    for nombre, lineas in (c.get("listas") or {}).items():
        s = _sec(txt, nombre)
        if not s:
            continue
        cuerpo = txt[s[0]:s[1]]
        m = re.search(r"(?:^(?:\d+\.|-)(?:[ \t].*)?\n?)+", cuerpo, re.M)
        lineas = [" ".join(str(x).split()) for x in lineas if str(x).strip()]
        viejas = [re.sub(r"^(?:\d+\.|-)\s*", "", x).strip() for x in (m.group(0).splitlines() if m else [])]
        if [x for x in viejas if x] == lineas:
            continue  # igual que estaba (los huecos vacíos de la plantilla se quedan)
        numerada = bool(m and m.group(0)[0].isdigit())
        nuevo = "\n".join(f"{i + 1}. {x}" if numerada else f"- {x}" for i, x in enumerate(lineas or [""])).replace(" \n", "\n").rstrip() + "\n"
        viejo = m.group(0) if m else ""
        if nuevo.strip() != viejo.strip():
            cuerpo = cuerpo.replace(viejo, nuevo, 1) if m else cuerpo.rstrip() + "\n\n" + nuevo
            txt = txt[:s[0]] + cuerpo + txt[s[1]:]
            hecho.append(nombre)
    return txt, hecho


def readme_clientes(wiki, ruta, estado):
    """La línea de la ficha en negocio/clientes/README.md lleva su estado: se mantiene igual."""
    p = os.path.join(wiki, "negocio/clientes/README.md")
    if not os.path.exists(p):
        return False
    txt = leer(wiki, "negocio/clientes/README.md")
    nuevo = re.sub(rf"^(- \[\[{re.escape(ruta[:-3])}\]\] · ).*$", lambda m: m.group(1) + estado, txt, count=1, flags=re.M)
    if nuevo != txt:
        open(p, "w", encoding="utf-8").write(nuevo)
        return True
    return False


def guardar(datos, wiki=WIKI, ahora=None, subir=True):
    ruta, tipo = datos.get("ruta", ""), tipo_de(datos.get("ruta", ""))
    if not tipo:
        sys.exit("Esa nota no se puede cambiar desde el HUD: ábrala en Obsidian")
    if subir:
        r = git("pull", "-q", "--rebase", "--autostash", wiki=wiki)
        if r.returncode:
            git("rebase", "--abort", wiki=wiki)
            sys.exit("No he podido traer la última versión de GitHub; pruebe en un rato")
    txt = leer(wiki, ruta)
    if huella(txt) != datos.get("base"):
        sys.exit("La nota ha cambiado desde que la abrió (en Obsidian o un agente). Vuelva a abrirla y repita el cambio")
    ahora = ahora or datetime.now()
    nuevo, hecho = {"objetivo": cambiar_objetivo, "cliente": cambiar_cliente, "voz": cambiar_voz}[tipo](txt, datos.get("campos") or {}, ahora)
    if not hecho:
        return {"ok": True, "cambios": [], "subida": True}
    nuevo = nuevo.rstrip() + "\n"
    open(os.path.join(wiki, ruta), "w", encoding="utf-8").write(nuevo)
    rutas = [ruta]
    if tipo == "cliente" and readme_clientes(wiki, ruta, campo(nuevo, "estado")):
        rutas.append("negocio/clientes/README.md")
    titulo = re.search(r"^# +(?:Objetivo:\s*)?(.+?)\s*$", nuevo, re.M)
    nombre = {"voz": "voz de LinkedIn"}.get(tipo) or (titulo.group(1) if titulo else ruta)
    mensaje = f"HUD: {nombre}: {'; '.join(hecho)}"[:200]
    subida = True
    if subir:
        git("add", "--", *rutas, wiki=wiki)
        r = git("-c", "user.name=Álvaro Calle", "commit", "-q", "-m", mensaje, "--", *rutas, wiki=wiki)
        if r.returncode:
            sys.exit("No he podido guardar el cambio en git: " + (r.stderr or r.stdout).strip()[-200:])
        subida = git("push", "-q", wiki=wiki).returncode == 0  # si falla, lo sube el cron «Biblioteca» en 15 min
    return {"ok": True, "cambios": hecho, "subida": subida, "texto": nuevo, "base": huella(nuevo)}


if __name__ == "__main__":
    accion = sys.argv[1:] and sys.argv[1]
    if accion == "indice":
        print(json.dumps(indice(), ensure_ascii=False))
    elif accion == "guardar":
        print(json.dumps(guardar(json.loads(sys.stdin.read() or "{}")), ensure_ascii=False))
    else:
        sys.exit("uso: biblioteca.py indice | guardar (JSON por stdin)")
