"""Autoprueba del filtro de avisos del Cartero: python /opt/data/scripts/prueba_cartero.py (no toca Gmail)."""
import sys
sys.path.insert(0, "/opt/data/scripts")
from cartero_vigila import no_avisar, limpio

c = lambda de, asunto, extracto="": {"from": de, "subject": asunto, "snippet": extracto}
callar = [
    c("Intra 42 <no-reply@42.fr>", "You have a new booking", "Your C Piscine code will be reviewed"),
    c("Sage <noreply@sage.com>", "Su suscripción"),
    c("Google <no-reply@accounts.google.com>", "Alerta de seguridad", "Nuevo inicio de sesión en Windows"),
    c("Antropiq Billing <billing@antropiq.com>", "Tu factura de octubre"),
    c("Bankinter <info@bankinter.com>", "¿Te lo perdiste? Revive Fórum Mercados y Bolsa"),
    c("AliExpress <x@aliexpress.com>", "Tu pedido"),
    c("Holded <news@holded.com>", "Novedades de otoño", "Versión online | Publicidad Holded ¿Hacia dónde va tu negocio?"),
    c("Fnac <info@fnac.es>", "Solo hoy", "Ver en el navegador. Ofertas para ti"),
    c("Canva <marketing@canva.com>", "New templates", "View this email in your browser"),
]
avisar = [
    c("Intra 42 <no-reply@42.fr>", "You have been graded by Moulinette"),
    c("Otro <otro@example.com>", "You have a new booking"),
    c("Iker Santos <iker@octantis.es>", "RE: Formación IA agentica", "Seguimos interesados"),
    c("Antropiq <hola@antropiq.com>", "Reunión del jueves"),
    c("Message Center <mc@banco.es>", "Usage report"),  # «message/usage» no es Sage
    c("Revolut <no-reply@revolut.com>", "Actualización sobre la interrupción del servicio"),
    c("Cliente Taller <taller@gmail.com>", "Campaña de publicidad", "Hola Álvaro, queremos hacer publicidad en Instagram"),
]
assert all(no_avisar(x) for x in callar), [x["subject"] for x in callar if not no_avisar(x)]
assert not any(no_avisar(x) for x in avisar), [x["subject"] for x in avisar if no_avisar(x)]
assert limpio("Hola‌ ‌﻿  mundo &amp; más͏") == "Hola mundo & más"
print("OK: filtro del Cartero")
