"""Manda un mensaje o un archivo al Telegram del señor (su chat con Harvey). Desde el HUD, el móvil o Siri Harvey no
tiene herramienta de mensajería: cuando el señor dice «mándamelo por Telegram», usa esto.
  /opt/hermes/.venv/bin/python /opt/data/hud/telegram.py "texto"
  /opt/hermes/.venv/bin/python /opt/data/hud/telegram.py --archivo /opt/data/workspace/informe.pdf ["pie del archivo"]
Solo escribe al chat del señor (TELEGRAM_HOME_CHANNEL); el token nunca se imprime."""
import argparse, os, re, sys, time
import httpx


def env(name):
    for line in open("/opt/data/.env", encoding="utf-8"):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip("'\"")


def enviar(metodo, token, **kw):
    """3 intentos: la ruta IPv4 del VPS a Telegram falla a ratos (ver gateway.log)."""
    for intento in range(3):
        try:
            r = httpx.post(f"https://api.telegram.org/bot{token}/{metodo}", timeout=60, **kw)
            j = r.json()
            if j.get("ok"):
                return
            error = j.get("description") or f"HTTP {r.status_code}"
            if r.status_code < 500 and r.status_code != 429:
                sys.exit(f"Telegram rechazó el envío: {error}")
        except (httpx.HTTPError, ValueError) as e:
            error = f"{type(e).__name__}: {str(e).replace(token, '<token>')[:200]}"
        time.sleep(3 * (intento + 1))
    sys.exit(f"No pude enviarlo por Telegram: {error}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("texto", nargs="?", default="")
    ap.add_argument("--archivo")
    a = ap.parse_args()
    token, chat = env("TELEGRAM_BOT_TOKEN"), re.sub(r"[^\d-]", "", env("TELEGRAM_HOME_CHANNEL") or "")
    if not token or not chat:
        sys.exit("Falta TELEGRAM_BOT_TOKEN o TELEGRAM_HOME_CHANNEL en /opt/data/.env")
    if a.archivo:
        if not os.path.isfile(a.archivo) or os.path.getsize(a.archivo) > 49e6:
            sys.exit("El archivo no existe o supera los 49 MB que admite Telegram")
        with open(a.archivo, "rb") as f:
            enviar("sendDocument", token, data={"chat_id": chat, "caption": a.texto[:1024]},
                   files={"document": (os.path.basename(a.archivo), f)})
    elif a.texto.strip():
        for i in range(0, len(a.texto), 4000):  # Telegram corta a 4096 caracteres por mensaje
            enviar("sendMessage", token, data={"chat_id": chat, "text": a.texto[i:i + 4000]})
    else:
        sys.exit("Nada que enviar: pase un texto o --archivo")
    print("Enviado al Telegram del señor.")
