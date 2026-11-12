"""Imprime el informe matutino de hoy (cron «Informe matutino», 08:00) o NO_HAY_INFORME_HOY si aún no existe."""
import datetime, pathlib, zoneinfo
hoy = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/Madrid")).strftime("%Y-%m-%d")
informes = sorted(pathlib.Path("/opt/data/cron/output/6a0c57478b16").glob(f"{hoy}_*.md"))
texto = informes[-1].read_text(encoding="utf-8") if informes else ""
print(texto.split("## Response", 1)[1].strip() if "## Response" in texto else "NO_HAY_INFORME_HOY")
