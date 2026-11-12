#!/opt/hermes/.venv/bin/python
"""Auditoría de la web de un negocio con PRUEBAS medibles para venderle (skill prospeccion-comercial).

  auditar_web.py URL [--rapido] [--salida DIR]

--rapido: sin Lighthouse ni capturas (~3 s): para cribar muchos candidatos.
Completo: + nota Lighthouse en móvil (rendimiento, accesibilidad, SEO, buenas prácticas), LCP/CLS/TBT y capturas
de móvil y escritorio (PNG/JPG en DIR, por defecto /opt/data/workspace/prospeccion/<dominio>/).
Imprime JSON: datos, señales y «problemas» ya redactados con su prueba. Lighthouse va de uno en uno (flock): con
varios subagentes a la vez no se ahoga el VPS.
"""
import argparse, base64, datetime as dt, fcntl, json, os, re, socket, ssl, subprocess, sys, time
from urllib.parse import urljoin, urlparse

# con «python script.py» (otro Python, sin requests/jinja2) se relanza con el de Hermes
VENV = "/opt/hermes/.venv/bin/python"
if sys.prefix != "/opt/hermes/.venv" and os.path.exists(VENV):
    os.execv(VENV, [VENV, *sys.argv])

import requests

CHROME = "/opt/hermes/tools/chromium-1208/chrome-linux64/chrome"
LIGHTHOUSE = "/opt/data/.npm-global/bin/lighthouse"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
CHROME_FLAGS = "--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --hide-scrollbars"
AHORA = dt.date.today().year

SEÑALES = {  # nombre → regex sobre el HTML (minúsculas)
    "whatsapp": r"wa\.me/|api\.whatsapp\.com|whatsapp://",
    "telefono_clicable": r'href="tel:',
    "email_clicable": r'href="mailto:',
    "reservas_online": r"reserv|booking|calendly|bookitit|treatwell|covermanager|thefork|eltenedor|simplybook|cita previa|pedir cita|agenda",
    "tienda_online": r"woocommerce|shopify|prestashop|add[-_]to[-_]cart|carrito|/cart|/checkout",
    "chat_web": r"tawk\.to|crisp\.chat|intercom|tidio|zendesk|livechat|chatbot",
    "analitica": r"googletagmanager|google-analytics|gtag\(|fbq\(|matomo",
    "datos_estructurados_negocio": r'"@type"\s*:\s*"(localbusiness|autorepair|restaurant|store|dentist|beautysalon|hairsalon|medicalclinic|professionalservice)',
    "euskera": r'hreflang="eu|lang="eu|/eu/|euskara|euskaraz',
    "aviso_cookies": r"cookie",
    "instagram": r"instagram\.com/",
    "facebook": r"facebook\.com/",
    "google_maps": r"google\.[a-z.]+/maps|maps\.app\.goo\.gl|goo\.gl/maps",
}


def certificado(host):
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=8) as s, ctx.wrap_socket(s, server_hostname=host) as t:
            fin = dt.datetime.strptime(t.getpeercert()["notAfter"], "%b %d %H:%M:%S %Y %Z")
            return {"valido": True, "caduca": fin.date().isoformat(), "dias": (fin - dt.datetime.now(dt.UTC).replace(tzinfo=None)).days}
    except Exception as e:
        return {"valido": False, "error": str(e)[:120]}


def lighthouse(url, carpeta):
    """Nota de Google Lighthouse en móvil + captura final. Un análisis a la vez en todo el VPS."""
    out = os.path.join(carpeta, "lighthouse.json")
    with open("/tmp/lighthouse.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        r = subprocess.run([LIGHTHOUSE, url, "--quiet", "--output=json", f"--output-path={out}", "--form-factor=mobile",
                            "--only-categories=performance,accessibility,best-practices,seo", "--max-wait-for-load=45000", "--locale=es",
                            f"--chrome-flags={CHROME_FLAGS}"], capture_output=True, text=True, timeout=180,
                           env={**os.environ, "CHROME_PATH": CHROME})
    if r.returncode or not os.path.exists(out):
        return {"error": (r.stderr or "lighthouse falló").strip().splitlines()[-1][:200]}
    d = json.load(open(out))
    a = d.get("audits", {})
    num = lambda k: a.get(k, {}).get("numericValue")
    res = {"notas": {k: round((v.get("score") or 0) * 100) for k, v in d["categories"].items()},
           "lcp_s": round(num("largest-contentful-paint") / 1000, 1) if num("largest-contentful-paint") else None,
           "cls": round(num("cumulative-layout-shift"), 3) if num("cumulative-layout-shift") is not None else None,
           "tbt_ms": round(num("total-blocking-time")) if num("total-blocking-time") is not None else None,
           "peso_kb": round(num("total-byte-weight") / 1024) if num("total-byte-weight") else None,
           "fallos_seo": [a[x["id"]]["title"] for x in d["categories"]["seo"]["auditRefs"]
                          if a.get(x["id"], {}).get("score") == 0][:8]}
    shot = a.get("final-screenshot", {}).get("details", {}).get("data", "")
    if shot.startswith("data:image"):
        p = os.path.join(carpeta, "movil.jpg")
        open(p, "wb").write(base64.b64decode(shot.split(",", 1)[1]))
        res["captura_movil"] = p
    os.remove(out)  # pesa varios MB; lo útil ya está arriba
    return res


def captura(url, carpeta, ancho, alto, nombre):
    p = os.path.join(carpeta, nombre)
    subprocess.run([CHROME, *CHROME_FLAGS.split(), f"--window-size={ancho},{alto}", f"--screenshot={p}",
                    "--virtual-time-budget=8000", url], capture_output=True, timeout=60)
    return p if os.path.exists(p) else None


def problemas(r):
    """Fallos con su prueba, redactados para la ficha comercial (de más a menos grave)."""
    p, s, lh = [], r["señales"], r.get("lighthouse") or {}
    if not r["https"]:
        p.append("La web no usa HTTPS: Chrome la marca como «No seguro» al entrar.")
    elif not r["certificado"].get("valido"):
        p.append(f"El certificado de seguridad falla ({r['certificado'].get('error', '')[:60]}): el navegador avisa de web insegura.")
    if not r["viewport_movil"]:
        p.append("No está adaptada al móvil (sin etiqueta viewport): en el teléfono se ve en miniatura.")
    n = lh.get("notas", {})
    if (n.get("performance") is not None and n["performance"] < 70) or (lh.get("lcp_s") or 0) > 4:
        p.append(f"Google Lighthouse le da {n.get('performance')}/100 de rendimiento en móvil"
                 + (f"; tarda {str(lh['lcp_s']).replace('.', ',')} s en mostrar el contenido principal (Google recomienda menos de 2,5 s)." if lh.get("lcp_s") else "."))
    if (lh.get("peso_kb") or 0) > 2500:
        p.append(f"La portada pesa {f'{lh["peso_kb"] / 1024:.1f}'.replace('.', ',')} MB: con datos móviles tarda y gasta.")
    if n.get("seo") is not None and n["seo"] < 80:
        p.append(f"SEO técnico {n['seo']}/100 en Lighthouse" + (f": {'; '.join(lh['fallos_seo'][:3])}." if lh.get("fallos_seo") else "."))
    if n.get("accessibility") is not None and n["accessibility"] < 70:
        p.append(f"Accesibilidad {n['accessibility']}/100 en Lighthouse (contraste, textos alternativos, botones sin nombre).")
    if r["copyright"] and r["copyright"] < AHORA - 2:
        p.append(f"El pie de página dice © {r['copyright']}: la web no se actualiza desde hace {AHORA - r['copyright']} años o lo parece.")
    if r["tiempo_respuesta_s"] and r["tiempo_respuesta_s"] > 3:
        p.append(f"El servidor tarda {r['tiempo_respuesta_s']} s solo en responder.")
    if not s["whatsapp"] and not s["telefono_clicable"]:
        p.append("Desde el móvil no se puede llamar ni escribir por WhatsApp con un toque (ni tel: ni WhatsApp).")
    elif not s["whatsapp"]:
        p.append("No tiene botón de WhatsApp.")
    if not s["reservas_online"] and not s["tienda_online"]:
        p.append("No permite reservar, pedir cita ni comprar online: todo pasa por teléfono o visita.")
    if not r["meta_descripcion"]:
        p.append("Sin meta descripción: Google improvisa el texto que sale en los resultados.")
    if not s["datos_estructurados_negocio"]:
        p.append("Sin datos estructurados de negocio local (schema.org): pierde fuerza en búsquedas «cerca de mí».")
    if r["contenido_mixto"]:
        p.append(f"Carga {r['contenido_mixto']} recursos sin cifrar (http://) en una página https.")
    return p


def auditar(url, rapido=False, salida=None):
    if not re.match(r"^https?://", url):
        url = "http://" + url
    r = {"url_pedida": url, "fecha": dt.datetime.now().isoformat(timespec="minutes")}
    t = time.time()
    try:
        resp = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9"}, timeout=25, allow_redirects=True)
    except requests.RequestException as e:
        return {**r, "accesible": False, "error": str(e)[:200],
                "problemas": ["La web no carga (caída, dominio caducado o error de servidor): el negocio está perdiendo a quien la busca."]}
    html = resp.text
    low = html.lower()
    final = resp.url
    host = urlparse(final).hostname or ""
    años = [int(y) for y in re.findall(r"(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d\d)", low)]
    r.update({
        "accesible": resp.ok, "estado_http": resp.status_code, "url_final": final, "https": final.startswith("https://"),
        "tiempo_respuesta_s": round(resp.elapsed.total_seconds(), 2), "tiempo_total_s": round(time.time() - t, 2),
        "peso_html_kb": round(len(resp.content) / 1024),
        "titulo": (re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I) or [None, ""])[1].strip()[:150],
        "meta_descripcion": bool(re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'][^"\']{20,}', html, re.I)),
        "viewport_movil": bool(re.search(r'<meta[^>]+name=["\']viewport', html, re.I)),
        "generador": (re.search(r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)', html, re.I) or [None, None])[1],
        "plataforma": next((n for n, rx in [("WordPress", "wp-content"), ("Wix", "wix.com|wixstatic"), ("Shopify", "cdn.shopify"),
                                            ("Squarespace", "squarespace"), ("Jimdo", "jimdo"), ("PrestaShop", "prestashop"),
                                            ("Joomla", "/media/jui/|joomla"), ("Webnode", "webnode")] if re.search(rx, low)), None),
        "copyright": max(años) if años else None,
        "formularios": low.count("<form"),
        "contenido_mixto": len(re.findall(r'(?:src|href)=["\']http://(?!localhost)', html)) if final.startswith("https://") else 0,
        "certificado": certificado(host) if final.startswith("https://") else {"valido": False, "error": "sin https"},
        "señales": {k: bool(re.search(rx, low)) for k, rx in SEÑALES.items()},
    })
    r["plataforma"] = r["generador"] or r["plataforma"]  # el generador declarado manda (IONOS sirve con piezas de Jimdo)
    if not resp.ok:
        r["problemas"] = [f"La web responde con error {resp.status_code}."]
        return r
    if not rapido:
        carpeta = salida or os.path.join("/opt/data/workspace/prospeccion", re.sub(r"[^\w.-]", "_", host) or "web")
        os.makedirs(carpeta, exist_ok=True)
        r["carpeta"] = carpeta
        try:
            r["lighthouse"] = lighthouse(final, carpeta)
        except subprocess.TimeoutExpired:
            r["lighthouse"] = {"error": "Lighthouse tardó más de 3 min (web muy lenta o colgada)"}
        r["captura_escritorio"] = captura(final, carpeta, 1366, 900, "escritorio.png")
        # la de Lighthouse es una miniatura: la buena es la de Chrome a 390 px (como un iPhone)
        r["captura_movil"] = captura(final, carpeta, 390, 844, "movil.png") or (r["lighthouse"] or {}).get("captura_movil")
    r["problemas"] = problemas(r)
    return r


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--rapido", action="store_true")
    ap.add_argument("--salida")
    a = ap.parse_args()
    print(json.dumps(auditar(a.url, a.rapido, a.salida), ensure_ascii=False, indent=1))
