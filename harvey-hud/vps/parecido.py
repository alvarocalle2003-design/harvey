# Lo que comparten tareas.py y agenda.py: encontrar «lo de la lotera» entre títulos y entender «mañana», «el sábado 18:00»...
import re, unicodedata
from datetime import date, datetime, time, timedelta
from difflib import SequenceMatcher
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Madrid")
DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
DIAS_CORTO = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
VACIAS = {"el", "la", "los", "las", "de", "del", "a", "al", "en", "y", "que", "lo", "un", "una", "con", "para", "por",
          "tarea", "evento", "cita", "mi", "me"}


def hoy():
    return datetime.now(TZ).date()


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def tokens(s):
    return [w for w in norm(s).split() if w not in VACIAS]


def _suena(w):
    # el dictado confunde letras que suenan igual: «hordules» por «Urduliz»
    return re.sub(r"[zc]", "s", w.replace("h", "").replace("v", "b").replace("ll", "y"))


def _igual(x, y):
    """0..1 entre dos palabras: exacta o prefijo = 1; si no, cuánto suenan parecido."""
    if x == y or (min(len(x), len(y)) >= 4 and (x.startswith(y) or y.startswith(x))):
        return 1.0
    r = SequenceMatcher(None, _suena(x), _suena(y)).ratio()
    return r if r >= 0.6 else 0.0


def parecido(q, titulo):
    """0..1: cuánto se parece lo que dice el señor al título guardado."""
    a, b = norm(q), norm(titulo)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    tq, tt = tokens(q) or a.split(), tokens(titulo) or b.split()
    cobertura = sum(max(_igual(x, y) for y in tt) for x in tq) / len(tq)
    s = 0.65 * cobertura + 0.35 * SequenceMatcher(None, a, b).ratio()
    return max(s, 0.95 if len(a) >= 4 and a in b else 0.0)


def elegir(q, items, titulo=lambda x: x["titulo"], detalle=lambda x: ""):
    """(item, None) si hay uno claro; (None, mensaje para el señor) si no hay o hay duda."""
    if not items:
        return None, f"No encuentro «{q}»: no hay nada donde buscar."
    sc = sorted(((parecido(q, titulo(x)), x) for x in items), key=lambda t: -t[0])
    (s1, x1), resto = sc[0], sc[1:]
    cerca = lambda n: "; ".join(f"«{titulo(x)}»{detalle(x)}" for _, x in sc[:n])
    if s1 < 0.55:
        return None, f"No encuentro «{q}». Lo más parecido: {cerca(3)}."
    rivales = [x for s, x in resto if s >= s1 - 0.08]
    if rivales and s1 < 0.99:
        return None, f"«{q}» puede ser varias: {cerca(len(rivales) + 1)}. Dime cuál con el título exacto."
    if rivales and any(norm(titulo(x)) == norm(titulo(x1)) for x in rivales):
        return None, f"Hay varias que se llaman «{titulo(x1)}»: {cerca(len(rivales) + 1)}. Añade la fecha (--fecha)."
    return x1, None


MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
# la hora va al final: «18:00», «18.30», «18h», «a las 18», «a las 9:30»
HORA = re.compile(r"(?:\s*a las)?\s*(\d{1,2})(?:[:.](\d{2})|\s*h(?:oras)?)\s*$|(?:^|\s)a las\s+(\d{1,2})\s*$")
RELLENO = {"el", "este", "esta", "proximo", "proxima", "que", "viene", "de", "del", "dia"}


def fecha(texto, ref=None):
    """'mañana', 'sábado 18:00', '31/10', '15 de octubre de 2027', '2026-11-03T09:30' -> date (sin hora) o datetime de Madrid."""
    ref = ref or hoy()
    s = (texto or "").strip().lower()
    iso = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})(?:[t ](\d{1,2}):(\d{2}))?", s)
    if iso:
        y, m, d, hh, mm = iso.groups()
        dia = date(int(y), int(m), int(d))
        return dia if hh is None else datetime.combine(dia, time(int(hh), int(mm)), TZ)
    hora, m = None, HORA.search(s)
    if m:
        hh, mm = int(m.group(1) or m.group(3)), int(m.group(2) or 0)
        if hh < 24 and mm < 60:
            hora, s = time(hh, mm), s[:m.start()]
    resto = " ".join(p for p in norm(s).replace("pasado manana", "pasadomanana").split() if p not in RELLENO)
    for i, mes in enumerate(MESES):  # «15 octubre 2027» -> «15 10 2027»
        resto = re.sub(rf"\b{mes}\b", str(i + 1), resto)
    if resto in ("", "hoy"):
        dia = ref
    elif resto == "manana":
        dia = ref + timedelta(days=1)
    elif resto == "pasadomanana":
        dia = ref + timedelta(days=2)
    elif resto in DIAS:  # siempre el siguiente: «el jueves» dicho un jueves es el de la semana que viene
        dia = ref + timedelta(days=(DIAS.index(resto) - ref.weekday() - 1) % 7 + 1)
    elif (m := re.fullmatch(r"(\d{1,2}) (\d{1,2})(?: (\d{2,4}))?", resto)):
        d, mes, y = int(m.group(1)), int(m.group(2)), m.group(3)
        y = int(y) + (2000 if y and len(y) == 2 else 0) if y else ref.year
        dia = date(y, mes, d)
        if not m.group(3) and dia < ref - timedelta(days=30):  # «el 5/1» dicho en otoño es el año que viene
            dia = date(y + 1, mes, d)
    else:
        raise ValueError(f"No entiendo la fecha «{texto}». Usa AAAA-MM-DD, DD/MM, hoy, mañana o un día de la semana, y la hora HH:MM.")
    return datetime.combine(dia, hora, TZ) if hora else dia


def bonita(v):
    """'sáb 31/10' o 'sáb 31/10 18:00' a partir de date, datetime o texto ISO de Notion/Google."""
    if not v:
        return "sin fecha"
    if isinstance(v, str):
        v = datetime.fromisoformat(v) if "T" in v else date.fromisoformat(v[:10])
    d = v.date() if isinstance(v, datetime) else v
    s = f"{DIAS_CORTO[d.weekday()]} {d:%d/%m}" + (f"/{d.year}" if d.year != hoy().year else "")
    return s + (f" {v.astimezone(TZ):%H:%M}" if isinstance(v, datetime) else "")
