#!/opt/hermes/.venv/bin/python
"""Maqueta el informe de prospección (skill prospeccion-comercial): datos.json → HTML → PDF (y a Drive con --drive).

  informe.py datos.json [--salida /opt/data/workspace/prospeccion/informe] [--drive] [--esperado web=10,ia=10]

Antes de maquetar COMPRUEBA cada ficha: si falta algo obligatorio (problema, ≥2 evidencias, oferta, precio, guion,
win-win, fuentes...) no genera nada y lista lo que falta. Las capturas y notas salen de la auditoría de cada prospecto
(campo "auditoria": ruta al JSON de auditar_web.py). Formato de datos.json: ver plantilla en ../plantilla_datos.json.
"""
import argparse, base64, html, io, json, os, re, subprocess, sys

# con «python script.py» (otro Python, sin requests/jinja2) se relanza con el de Hermes
VENV = "/opt/hermes/.venv/bin/python"
if sys.prefix != "/opt/hermes/.venv" and os.path.exists(VENV):
    os.execv(VENV, [VENV, *sys.argv])

import markdown
from jinja2 import Environment
from PIL import Image

CHROME = "/opt/hermes/tools/chromium-1208/chrome-linux64/chrome"
GAPI = "/opt/data/skills/productivity/google-workspace/scripts/google_api.py"
ENTREGABLES = "1lfpwEt3b3CwWDvH7YMEd4t69zgShKpS8"  # Drive: Harvey / Entregables de Harvey
OBLIGATORIO = ["nombre", "tipo", "sector", "municipio", "titular", "oferta_corta", "problema", "evidencias", "oferta", "precio", "argumento", "guion",
               "win_win", "objeciones", "tamano", "fuentes"]


def revisar(d, esperado):
    errores = []
    ps = d.get("prospectos") or []
    for i, p in enumerate(ps, 1):
        nombre = p.get("nombre") or f"#{i}"
        falta = [k for k in OBLIGATORIO if not p.get(k)]
        if len(p.get("evidencias") or []) < 2:
            falta.append("evidencias (mínimo 2, con dato concreto)")
        if p.get("tipo") not in ("web", "ia"):
            falta.append("tipo debe ser «web» o «ia»")
        if not (p.get("win_win") or {}).get("negocio") or not (p.get("win_win") or {}).get("tu"):
            falta.append("win_win.negocio y win_win.tu")
        if not (p.get("tamano") or {}).get("estimacion"):
            falta.append("tamano.estimacion (con su fuente o razonamiento)")
        if p.get("web") and not p.get("auditoria"):
            falta.append("auditoria (tiene web: pásale auditar_web.py y pon aquí la ruta del JSON)")
        if p.get("auditoria") and not os.path.exists(p["auditoria"]):
            falta.append(f"auditoria: no existe {p['auditoria']}")
        if falta:
            errores.append(f"{nombre}: falta {', '.join(dict.fromkeys(falta))}")
    for k, n in esperado.items():
        hay = sum(p.get("tipo") == k for p in ps)
        if hay != n:
            errores.append(f"Se esperaban {n} prospectos de tipo «{k}» y hay {hay}")
    for k in ("titulo", "resumen", "metodologia", "plan"):
        if not d.get(k):
            errores.append(f"Falta «{k}» en el informe")
    return errores


def imagen(ruta, ancho):
    """Imagen reducida e incrustada (el PDF va solo, sin archivos al lado)."""
    if not ruta or not os.path.exists(ruta):
        return None
    im = Image.open(ruta).convert("RGB")
    if im.width > ancho:
        im = im.resize((ancho, round(im.height * ancho / im.width)))
    im = im.crop((0, 0, im.width, min(im.height, round(ancho * 1.9))))  # solo la parte de arriba si es muy larga
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=72)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def md(t):
    return markdown.markdown(str(t or ""), extensions=["tables", "sane_lists"])


def color(n):
    return "#c62828" if n < 50 else "#ef6c00" if n < 90 else "#2e7d32"


PLANTILLA = r"""<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{{ d.titulo }}</title><style>
@page { size: A4; margin: 16mm 15mm 16mm 15mm; } @page :first { margin: 0; }
* { box-sizing: border-box; }
body { font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #1d2433; font-size: 10.2pt; line-height: 1.5; margin: 0; }
h1, h2, h3 { color: #0f1b3d; line-height: 1.2; margin: 0 0 6px; }
h2 { font-size: 17pt; } h3 { font-size: 11pt; text-transform: uppercase; letter-spacing: .06em; color: #3949ab; margin-top: 14px; }
p { margin: 0 0 7px; } ul { margin: 0 0 7px; padding-left: 18px; } a { color: #3949ab; text-decoration: none; word-break: break-all; }
.portada { height: 296mm; display: flex; flex-direction: column; justify-content: space-between; padding: 40mm 21mm 18mm;
  background: linear-gradient(160deg, #0f1b3d 0%, #283593 70%, #3949ab 100%); color: #fff; }
.portada h1 { color: #fff; font-size: 30pt; max-width: 150mm; } .portada .sub { font-size: 14pt; opacity: .85; margin-top: 10px; max-width: 150mm; }
.portada .cifras { display: flex; gap: 14px; } .portada .cifra { background: rgba(255,255,255,.1); border-radius: 10px; padding: 12px 16px; min-width: 34mm; }
.portada .cifra b { display: block; font-size: 22pt; } .portada .pie { font-size: 9.5pt; opacity: .8; }
.pagina { page-break-before: always; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 9pt; }
th { background: #0f1b3d; color: #fff; text-align: left; padding: 6px 7px; font-weight: 600; }
td { border-bottom: 1px solid #e3e6ef; padding: 6px 7px; vertical-align: top; }
tr:nth-child(even) td { background: #f6f7fb; }
.chip { display: inline-block; border-radius: 99px; padding: 1px 9px; font-size: 8pt; font-weight: 700; letter-spacing: .04em; }
.web { background: #e3f2fd; color: #1565c0; } .ia { background: #f3e5f5; color: #7b1fa2; }
.A { background: #2e7d32; color: #fff; } .B { background: #ef6c00; color: #fff; } .C { background: #9e9e9e; color: #fff; }
.cab { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #3949ab; padding-bottom: 8px; margin-bottom: 10px; }
.cab .num { font-size: 26pt; font-weight: 800; color: #c5cae9; margin-right: 10px; line-height: 1; }
.cab .meta { color: #5c6478; font-size: 9.5pt; } .punt { text-align: right; } .punt b { font-size: 20pt; color: #0f1b3d; display: block; line-height: 1; }
.datos { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 18px; font-size: 9pt; background: #f6f7fb; border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; }
.datos span { color: #5c6478; }
.notas { display: flex; gap: 8px; margin: 6px 0 8px; } .nota { flex: 1; border-radius: 8px; padding: 6px; text-align: center; color: #fff; }
.nota b { display: block; font-size: 16pt; } .nota small { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; }
.capturas { display: flex; gap: 10px; align-items: flex-start; margin: 4px 0 8px; }
.capturas figure { margin: 0; } .capturas img { border: 1px solid #d5d9e6; border-radius: 6px; display: block; }
.capturas figcaption { font-size: 7.5pt; color: #5c6478; margin-top: 2px; }
.evid li { margin-bottom: 3px; } .evid li::marker { content: "▸ "; color: #c62828; }
.oferta { border-left: 4px solid #2e7d32; background: #f1f8f2; padding: 8px 12px; border-radius: 0 8px 8px 0; margin: 6px 0; }
.precio { font-weight: 700; color: #2e7d32; }
.guion { border-left: 4px solid #3949ab; background: #f3f4fb; padding: 8px 12px; border-radius: 0 8px 8px 0; font-style: italic; }
.dos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .caja { border: 1px solid #e3e6ef; border-radius: 8px; padding: 8px 10px; }
.caja h4 { margin: 0 0 4px; font-size: 9pt; color: #0f1b3d; text-transform: uppercase; letter-spacing: .05em; }
.pend { font-size: 8.5pt; color: #8d6e00; background: #fff8e1; border-radius: 6px; padding: 5px 9px; margin-top: 6px; }
.fuentes { font-size: 7.5pt; color: #5c6478; margin-top: 8px; } .fuentes ol { padding-left: 16px; margin: 0; }
.evitar { page-break-inside: avoid; }
</style></head><body>

<section class="portada">
  <div><div style="font-size:10pt;letter-spacing:.2em;opacity:.7">INFORME DE PROSPECCIÓN</div>
    <h1>{{ d.titulo }}</h1><div class="sub">{{ d.subtitulo or '' }}</div></div>
  <div class="cifras">
    {% for n, t in d.cifras_portada %}<div class="cifra"><b>{{ n }}</b>{{ t }}</div>{% endfor %}
  </div>
  <div class="pie">{{ d.fecha }}{% if d.para %} · Preparado para {{ d.para }}{% endif %} · Harvey</div>
</section>

<section class="pagina">
  <h2>Resumen ejecutivo</h2>
  {{ md(d.resumen) }}
  <h3>Ranking</h3>
  <table><tr><th>#</th><th>Negocio</th><th>Tipo</th><th>Problema principal</th><th>Oferta</th><th>Precio</th><th>Prio.</th></tr>
  {% for p in ps %}<tr><td><b>{{ loop.index }}</b></td><td><b>{{ p.nombre }}</b><br><span style="color:#5c6478">{{ p.sector }} · {{ p.municipio }}</span></td>
    <td><span class="chip {{ p.tipo }}">{{ 'WEB' if p.tipo == 'web' else 'IA' }}</span></td><td>{{ p.titular or '' }}</td>
    <td>{{ p.oferta_corta or '' }}</td><td>{{ p.precio }}</td><td><span class="chip {{ p.prioridad or 'B' }}">{{ p.prioridad or 'B' }}</span></td></tr>{% endfor %}
  </table>

  <h3>Cómo se han elegido</h3>
  {{ md(d.metodologia) }}
</section>

{% for p in ps %}
<section class="pagina">
  <div class="cab"><div style="display:flex"><div class="num">{{ '%02d' % loop.index }}</div>
    <div><h2>{{ p.nombre }}</h2><div class="meta">{{ p.sector }} · {{ p.municipio }} &nbsp;
      <span class="chip {{ p.tipo }}">{{ 'WEB' if p.tipo == 'web' else 'HERRAMIENTA IA' }}</span>
      <span class="chip {{ p.prioridad or 'B' }}">PRIORIDAD {{ p.prioridad or 'B' }}</span></div></div></div>
    {% if p.puntuacion is not none %}<div class="punt"><b>{{ p.puntuacion }}</b><span class="meta">/100 encaje</span></div>{% endif %}</div>

  <div class="datos">
    <div><span>Dirección:</span> {{ p.direccion or '—' }}</div><div><span>Teléfono:</span> {{ p.telefono or '—' }}</div>
    <div><span>Web:</span> {{ p.web or 'no tiene' }}</div><div><span>Decisor:</span> {{ p.decisor or 'por identificar' }}</div>
    <div><span>Tamaño:</span> {{ p.tamano.estimacion }}{% if p.tamano.fuente %} ({{ p.tamano.fuente }}){% endif %}</div>
    <div><span>Presencia:</span> {{ p.presencia or '—' }}</div>
  </div>

  {% if p.a and p.a.lighthouse and p.a.lighthouse.notas %}<div class="notas">
    {% for k, t in [('performance','Velocidad móvil'),('seo','SEO'),('accessibility','Accesibilidad'),('best-practices','Buenas prácticas')] %}
    {% set n = p.a.lighthouse.notas[k] %}<div class="nota" style="background:{{ color(n) }}"><b>{{ n }}</b><small>{{ t }}</small></div>{% endfor %}
    {% if p.a.lighthouse.lcp_s %}<div class="nota" style="background:{{ color(100 if p.a.lighthouse.lcp_s <= 2.5 else 60 if p.a.lighthouse.lcp_s <= 4 else 20) }}"><b>{{ (p.a.lighthouse.lcp_s|string).replace(".", ",") }} s</b><small>Carga principal</small></div>{% endif %}
  </div>{% endif %}

  {% if p.img_movil or p.img_escritorio %}<div class="capturas">
    {% if p.img_movil %}<figure><img src="{{ p.img_movil }}" style="width:42mm"><figcaption>Móvil (390 px)</figcaption></figure>{% endif %}
    {% if p.img_escritorio %}<figure><img src="{{ p.img_escritorio }}" style="width:118mm"><figcaption>Escritorio · {{ p.web }} · {{ p.a.fecha[:10] if p.a else '' }}</figcaption></figure>{% endif %}
  </div>{% endif %}

  <h3>El problema</h3>{{ md(p.problema) }}
  <ul class="evid">{% for e in p.evidencias %}<li>{{ e }}</li>{% endfor %}</ul>

  <h3>Qué le ofreces</h3>
  <div class="oferta">{{ md(p.oferta) }}<div class="precio">Precio orientativo: {{ p.precio }}{% if p.plazo %} · Plazo: {{ p.plazo }}{% endif %}</div></div>

  <div class="evitar"><h3>Argumento de venta</h3>{{ md(p.argumento) }}
  <h3>Guion de la primera llamada</h3><div class="guion">{{ md(p.guion) }}</div></div>

  <div class="evitar"><h3>Win-win</h3><div class="dos">
    <div class="caja"><h4>Para el negocio</h4>{{ md(p.win_win.negocio) }}</div>
    <div class="caja"><h4>Para ti</h4>{{ md(p.win_win.tu) }}</div></div></div>

  <div class="evitar"><h3>Objeciones probables</h3><table><tr><th style="width:38%">Si te dice…</th><th>Respondes…</th></tr>
    {% for o in p.objeciones %}<tr><td>{{ o.objecion }}</td><td>{{ o.respuesta }}</td></tr>{% endfor %}</table></div>

  {% if p.por_confirmar %}<div class="pend"><b>Antes de llamar, confirma:</b> {{ p.por_confirmar }}</div>{% endif %}
  <div class="fuentes"><b>Fuentes</b><ol>{% for f in p.fuentes %}<li><a href="{{ f }}">{{ f }}</a></li>{% endfor %}</ol></div>
</section>
{% endfor %}

<section class="pagina"><h2>Plan de acción</h2>{{ md(d.plan) }}</section>
</body></html>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("datos")
    ap.add_argument("--salida", default="/opt/data/workspace/prospeccion/informe")
    ap.add_argument("--drive", action="store_true", help="subir el PDF a Drive (Entregables de Harvey)")
    ap.add_argument("--esperado", default="", help="p. ej. web=10,ia=10")
    a = ap.parse_args()
    d = json.load(open(a.datos, encoding="utf-8"))
    esperado = {k: int(v) for k, v in (x.split("=") for x in a.esperado.split(",") if x)}
    errores = revisar(d, esperado)
    if errores:
        print("NO SE HA GENERADO EL INFORME. Corrige esto en datos.json:\n- " + "\n- ".join(errores))
        sys.exit(2)
    for p in d["prospectos"]:
        p["a"] = json.load(open(p["auditoria"], encoding="utf-8")) if p.get("auditoria") else None
        p["img_movil"] = imagen((p["a"] or {}).get("captura_movil"), 330)
        p["img_escritorio"] = imagen((p["a"] or {}).get("captura_escritorio"), 900)
    ps = sorted(d["prospectos"], key=lambda p: -(p.get("puntuacion") or 0))
    d.setdefault("cifras_portada", [[len(ps), "prospectos"], [sum(p["tipo"] == "web" for p in ps), "web"],
                                     [sum(p["tipo"] == "ia" for p in ps), "herramientas IA"]])
    env = Environment(autoescape=True)
    env.globals.update(md=lambda t: __import__("markupsafe").Markup(md(t)), color=color)
    out_html = a.salida + ".html"
    os.makedirs(os.path.dirname(out_html), exist_ok=True)
    open(out_html, "w", encoding="utf-8").write(env.from_string(PLANTILLA).render(d=d, ps=ps))
    pdf = a.salida + ".pdf"
    subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-pdf-header-footer",
                    f"--print-to-pdf={pdf}", "file://" + os.path.abspath(out_html)], capture_output=True, timeout=180, check=True)
    res = {"html": out_html, "pdf": pdf, "kb": round(os.path.getsize(pdf) / 1024), "prospectos": len(ps)}
    if a.drive:
        nombre = re.sub(r"[^\w áéíóúñÁÉÍÓÚÑ.,-]", "", d["titulo"])[:90] + ".pdf"
        up = subprocess.run(["/opt/hermes/.venv/bin/python", GAPI, "drive", "upload", pdf, "--name", nombre, "--parent", ENTREGABLES],
                            capture_output=True, text=True, timeout=180)
        j = json.loads(up.stdout[up.stdout.find("{"):]) if "{" in up.stdout else {"error": up.stderr[-300:]}
        res["drive"] = f"https://drive.google.com/file/d/{j['id']}/view" if j.get("id") else j
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()
