"""Cartero de Harvey: vigilante de correo SIN IA (va en /opt/data/scripts/, lo ejecuta el cron de Hermes).

Imprime solo los correos no leídos que no había visto antes. Si no hay ninguno nuevo, repite EXACTAMENTE la
salida anterior: el vigilante de Hermes (--monitor-script) compara la salida y, si no cambia, no despierta a la IA.
Así cada revisión sin novedades cuesta 0 tokens.

Es la ÚNICA puerta de los avisos de correo (Telegram, iPhone y HUD del PC): lo que el señor no quiera que se le
avise se excluye aquí, en NO_AVISAR. El correo sigue intacto en Gmail.
"""
import html
import json
import re
import subprocess
import sys
from pathlib import Path

PY = "/opt/hermes/.venv/bin/python"
GAPI = "/opt/data/skills/productivity/google-workspace/scripts/google_api.py"
ESTADO = Path("/opt/data/hud/cartero_estado.json")
# Filtro gratis antes de la IA: promociones, redes sociales y TLDR (excluido por el señor) ni se miran
QUERY = "is:unread in:inbox newer_than:2d -category:promotions -category:social -from:tldrnewsletter.com"

# Los boletines rellenan el extracto con caracteres invisibles (U+200C, U+FEFF...): solo gastan tokens
INVISIBLES = re.compile(r"[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ﻿ﾠ]")
limpio = lambda s: " ".join(INVISIBLES.sub("", html.unescape(s or "")).split())

# Peticiones del señor (remitente / texto en minúsculas). Para añadir una: otra línea con su motivo.
NO_AVISAR = [
    # 21/10: «No me notifiques nunca más los correos de Sage». 31/10: Sage era un ejemplo, el señor no quiere avisos de
    # spam ni publicidad. Los envíos masivos se delatan en la cabecera del extracto («Versión online | Publicidad»,
    # «Ver en el navegador»), cosa que una persona no escribe; lo que Gmail ya manda a Spam nunca llega aquí (in:inbox)
    lambda de, txt: re.search(r"\bsage\b", de) or re.search(r"versi[oó]n (online|web)\b|ver (este (correo|email|mensaje) )?en (el|tu|su) navegador"
                                                            r"|view (this email |it )?in (your )?browser|\|\s*publicidad\b|^publicidad\b", txt),
    # Avisos de nuevos dispositivos, inicios de sesión y alertas de seguridad (memoria de Harvey, USER.md)
    lambda de, txt: re.search(r"nuevo dispositivo|new device|nuevo inicio de sesi|new sign.?in|inicio de sesi[oó]n (nuevo|detectado)"
                              r"|alerta de seguridad|security alert|actividad (sospechosa|inusual)|unusual activity", txt),
    # Facturas de Antropiq (el resto de correos de Antropiq sí se avisan)
    lambda de, txt: "antropiq" in txt and re.search(r"factura|invoice|billing", txt),
    # Publicidad evidente aunque Gmail la marque como importante (22/10, Bankinter «¿Te lo perdiste? Revive…»)
    lambda de, txt: "aliexpress" in de or any(s in txt for s in ("¿te lo perdiste?", "revive ", "descubre ", "oferta exclusiva",
                                                                  "última oportunidad", "nuevo nivel desbloqueado")),
]


def no_avisar(c):
    de = c["from"].casefold()
    txt = " ".join((c["from"], c["subject"], c["snippet"])).casefold()
    return any(regla(de, txt) for regla in NO_AVISAR)


if __name__ == "__main__":
    r = subprocess.run([PY, GAPI, "gmail", "search", QUERY, "--max", "30"], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        sys.exit(f"Gmail no responde: {r.stderr.strip()[:300]}")  # error: Hermes no lo cuenta como cambio
    correos = [{**c, "from": limpio(c.get("from")), "subject": limpio(c.get("subject")), "snippet": limpio(c.get("snippet"))}
               for c in json.loads(r.stdout or "[]")]

    primera_vez = not ESTADO.exists()
    estado = {"vistos": [], "salida": ""} if primera_vez else json.loads(ESTADO.read_text(encoding="utf-8"))
    vistos = set(estado["vistos"])
    nuevos = [c for c in correos if c["id"] not in vistos and not no_avisar(c)]

    if nuevos and not primera_vez:
        lineas = []
        for c in nuevos:
            de = c["from"].split("<")[0].strip(' "') or c["from"]
            marca = "[IMPORTANT de Gmail] " if "IMPORTANT" in c.get("labels", []) else ""
            lineas.append(f"- {marca}De: {de} | Asunto: {c['subject'] or '(sin asunto)'} | "
                          f"Fecha: {c['date']} | Extracto: {c['snippet'][:200]}")
        estado["salida"] = f"{len(nuevos)} correo(s) nuevo(s) sin leer:\n" + "\n".join(lineas)
    elif primera_vez:
        estado["salida"] = "Sin correos nuevos (vigilancia iniciada)."

    # Solo se recuerdan los ids que siguen en la búsqueda (2 días) más los últimos 300, para que el archivo no crezca
    estado["vistos"] = list(dict.fromkeys([c["id"] for c in correos] + estado["vistos"]))[:300]
    ESTADO.write_text(json.dumps(estado, ensure_ascii=False), encoding="utf-8")
    print(estado["salida"])
