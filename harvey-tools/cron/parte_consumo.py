"""Parte semanal de consumo de Harvey (sin IA): cuota de ChatGPT, gasto real por modelo y conversaciones más pesadas."""
import sqlite3, subprocess, time

DIAS = 7
desde = time.time() - DIAS * 86400
c = sqlite3.connect("file:/opt/data/state.db?mode=ro", uri=True)
L = [f"📊 Consumo de Harvey - últimos {DIAS} días", ""]

try:
    u = subprocess.run(["hermes", "usage"], capture_output=True, text=True, timeout=60).stdout
    cuota = next((l.split(":", 1)[1].strip() for l in u.splitlines() if l.startswith("Session:")), "sin datos")
except Exception:
    cuota = "sin datos"
cuota = cuota.replace("remaining", "libre").replace("used", "usado").replace("resets in", "se renueva en")
L.append(f"ChatGPT (suscripción, 0 € extra): {cuota}")

filas = c.execute("""select model, sum(api_call_count), sum(input_tokens + cache_read_tokens), sum(estimated_cost_usd)
                     from session_model_usage where last_seen >= ? group by model order by 3 desc""", (desde,)).fetchall()
gasto = 0.0
for modelo, llamadas, tokens, coste in filas:
    gasto += coste or 0
    euros = f"{coste:.2f} $" if coste else "incluido"
    L.append(f"- {modelo}: {llamadas} llamadas, {tokens / 1e6:.1f} M tokens, {euros}")
if not filas:
    L.append("- Sin actividad")
L += ["", f"💶 Gasto real estimado (Gemini + OpenRouter): {gasto:.2f} $"]

pesadas = c.execute("""select coalesce(nullif(title, ''), session_key, id), message_count, input_tokens + cache_read_tokens
                       from sessions where last_activity_at >= ? order by 3 desc limit 3""", (desde,)).fetchall()
if pesadas:
    L += ["", "Conversaciones más pesadas:"]
    L += [f"- {(t or '')[:50]}: {m} mensajes, {tok / 1e6:.1f} M tokens" for t, m, tok in pesadas]
print("\n".join(L))
