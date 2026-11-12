# Autoprueba sin red ni git de los formularios de biblioteca.py: python prueba_biblioteca.py (en /opt/data/hud)
import os, tempfile
from datetime import datetime

import biblioteca as b

CLIENTE = """estado: propuesta preparada
ultimo_contacto: nunca

# Inmobiliaria Itsasalde (Santurtzi)
- **Problema visto**: textos de ejemplo.

## Historial
- 2026-10-29 · Jordan prepara propuesta.
"""
README = """# Clientes
## Fichas
- [[negocio/clientes/itsasalde]] · propuesta preparada
- [[negocio/clientes/otro]] · propuesta preparada
"""
OBJETIVO = """---
estado: activo
fecha_limite: 2026-11-30
---
# Objetivo: Tres reuniones

## Hitos
- [x] Lista de 20 talleres
- [ ] 10 propuestas

## Siguiente paso
Propuestas para los 5 primeros

## Diario
- 2026-11-01 10:00 · Arranque
"""
VOZ = """# voice.md

## Who I am

- **Name:**
- **What I sell:** (be specific)

## My positions

Three to five things.

1.
2.
3.

## Off limits

- **Topics I do not post about:**
"""
AHORA = datetime(2026, 11, 2, 9, 30)


def falla(fn):
    try:
        fn()
    except SystemExit as e:
        return str(e)
    raise AssertionError("debía fallar")


with tempfile.TemporaryDirectory() as w:
    for ruta, txt in {"negocio/clientes/itsasalde.md": CLIENTE, "negocio/clientes/README.md": README,
                      "objetivos/2026-11-reuniones.md": OBJETIVO, "negocio/linkedin/voice.md": VOZ, "senor.md": "# Señor\n"}.items():
        os.makedirs(os.path.dirname(os.path.join(w, ruta)), exist_ok=True)
        open(os.path.join(w, ruta), "w", encoding="utf-8").write(txt)
    g = lambda ruta, campos, base=None: b.guardar({"ruta": ruta, "base": base or b.huella(b.leer(w, ruta)), "campos": campos},
                                                    wiki=w, ahora=AHORA, subir=False)

    # cliente: «no contactar», nota al historial y la línea del README
    r = g("negocio/clientes/itsasalde.md", {"estado": "no contactar", "ultimo_contacto": "", "nota": "Me pidió que no le escribamos"})
    t = b.leer(w, "negocio/clientes/itsasalde.md")
    assert r["cambios"] == ["estado → no contactar"] and t.startswith("estado: no contactar\nultimo_contacto: nunca\n"), t
    assert t.rstrip().endswith("- 2026-11-02 · El señor (desde el HUD): estado → no contactar; Me pidió que no le escribamos"), t
    assert "- [[negocio/clientes/itsasalde]] · no contactar\n- [[negocio/clientes/otro]] · propuesta preparada" in b.leer(w, "negocio/clientes/README.md")
    assert falla(lambda: g("negocio/clientes/itsasalde.md", {"estado": "lo que sea"}))
    assert "ha cambiado" in falla(lambda: g("negocio/clientes/itsasalde.md", {"estado": "cliente"}, base="0" * 40))
    assert "Obsidian" in falla(lambda: g("senor.md", {}))

    # objetivo: marcar un hito, añadir otro, pausar; el diario lo apunta y el resto queda igual
    r = g("objetivos/2026-11-reuniones.md", {"estado": "en pausa", "fecha_limite": "2026-11-30", "siguiente": "Propuestas para los 5 primeros",
                                             "hitos": [{"texto": "Lista de 20 talleres", "hecho": True}, {"texto": "10 propuestas", "hecho": True},
                                                       {"texto": "3 reuniones", "hecho": False}]})
    t = b.leer(w, "objetivos/2026-11-reuniones.md")
    assert r["cambios"] == ["estado → en pausa", "hito «10 propuestas» hecho", "nuevo hito «3 reuniones»"], r["cambios"]
    assert "estado: en pausa\nfecha_limite: 2026-11-30\n---" in t and "- [x] 10 propuestas\n- [ ] 3 reuniones\n\n## Siguiente paso\nPropuestas" in t, t
    assert t.endswith("- 2026-11-01 10:00 · Arranque\n- 2026-11-02 09:30 · El señor lo cambia desde el HUD: estado → en pausa; "
                      "hito «10 propuestas» hecho; nuevo hito «3 reuniones»\n"), t
    assert g("objetivos/2026-11-reuniones.md", {"estado": "en pausa"})["cambios"] == []  # sin cambios, no se toca

    # voz: guardar sin tocar nada no cambia nada (ni compacta los huecos «1. 2. 3.» de la plantilla)
    assert g("negocio/linkedin/voice.md", {"campos": {"Name": "", "What I sell": ""}, "listas": {"My positions": [""]}})["cambios"] == []
    # voz: rellena campos (la pista entre paréntesis se va) y la lista numerada de posturas
    r = g("negocio/linkedin/voice.md", {"campos": {"Name": "Álvaro", "What I sell": "Webs para pymes", "Topics I do not post about": ""},
                                        "listas": {"My positions": ["La web es el escaparate", "", "Menos es más"]}})
    t = b.leer(w, "negocio/linkedin/voice.md")
    assert r["cambios"] == ["Name", "What I sell", "My positions"], r["cambios"]
    assert "- **Name:** Álvaro\n- **What I sell:** Webs para pymes\n" in t and "- **Topics I do not post about:**\n" in t, t
    assert "Three to five things.\n\n1. La web es el escaparate\n2. Menos es más\n\n## Off limits" in t, t

    assert b.quien("Equipo de Harvey", "Archivar prospección") == "tomo" and b.quien("Álvaro Calle", "HUD: x") == "hud"
    assert {n["ruta"]: n["tipo"] for n in b.indice(w)["notas"]}["negocio/clientes/README.md"] is None
print("biblioteca.py: formularios OK")
