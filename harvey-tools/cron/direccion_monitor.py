# Vigía de la «Reunión de dirección» (monitor del cron «Equipo de Harvey · Reunión de dirección»).
# Hermes solo despierta a Harvey si esta salida cambia: sin objetivos activos no imprime nada (no gasta cupo);
# con objetivos, cambia cuando el señor toca un objetivo, cuando una tarjeta cambia de estado o al cambiar de día.
# Lo que escribe Harvey en cada reunión (Estado, Siguiente paso, Diario) no cuenta, para que no se despierte a sí mismo.
import glob, hashlib, os, re, sqlite3
from datetime import date

OBJ = "/opt/data/wiki/objetivos"
SUYO = re.compile(r"^## (Estado|Siguiente paso|Diario)\b.*?(?=^## |\Z)", re.M | re.S)


def activos():
    out = []
    for p in sorted(glob.glob(f"{OBJ}/*.md")):
        if os.path.basename(p) in ("README.md", "_plantilla.md"):
            continue
        txt = open(p, encoding="utf-8").read()
        if re.search(r"^estado:\s*activo\s*$", txt, re.M):
            out.append((os.path.basename(p), hashlib.sha1(SUYO.sub("", txt).encode()).hexdigest()[:12]))
    return out


def tarjetas():
    out = []
    for db in sorted(glob.glob("/opt/data/kanban/boards/*/kanban.db")):
        slug = os.path.basename(os.path.dirname(db))
        c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        out += [f"{slug} {i} {s}" for i, s in c.execute(
            "select id, status from tasks where status != 'archived' order by id")]
        c.close()
    return out


if __name__ == "__main__":
    obj = activos()
    if obj:  # sin objetivos activos, silencio: Hermes no despierta a Harvey
        print(f"día {date.today()}")
        print("\n".join(f"objetivo {n} {h}" for n, h in obj))
        print("\n".join(tarjetas()))
