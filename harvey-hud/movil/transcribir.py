# Transcribe audios del móvil con el Whisper local de Harvey (misma configuración stt: que Telegram).
#   python transcribir.py <archivo>  → imprime el JSON del resultado
#   python transcribir.py            → modo servicio: lee una ruta por línea y responde "@@<json>" por línea
#                                      (el modelo se queda cargado: ~1-2 s por audio en vez de ~7 s)
import json, sys
sys.path.insert(0, "/opt/hermes")
from tools.transcription_tools import transcribe_audio


def run(path):
    try:
        return transcribe_audio(path)
    except Exception as e:  # un audio raro no debe tumbar el servicio
        return {"success": False, "error": str(e)}


if len(sys.argv) > 1:
    print(json.dumps(run(sys.argv[1]), ensure_ascii=False))
else:
    for line in sys.stdin:
        print("@@" + json.dumps(run(line.strip()), ensure_ascii=False), flush=True)
