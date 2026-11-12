---
name: informe-matutino
description: "Informe matutino del señor. Úsala SOLO cuando el señor te salude con «buenos días» (con o sin «Harvey»). Nunca lo des por iniciativa propia ni por ser la primera conversación del día."
version: 1.0.0
author: alvaro
metadata:
  hermes:
    tags: [Resumen, Mañana, Ahorro]
    related_skills: [foto-rapida]
---

# Informe matutino

El cron «Informe matutino» lo prepara cada día a las 08:00 y lo guarda sin enviarlo. Tú solo lo entregas cuando el señor dice «buenos días».

1. Ejecuta `/opt/hermes/.venv/bin/python /opt/data/hud/informe_hoy.py`.
2. Si devuelve el informe: entrégalo tal cual (párrafo hablado, línea `---`, detalle). Si ya es más de las 10:00, usa además la skill `foto-rapida` y añade al párrafo hablado SOLO lo nuevo desde las 08:00 (correos importantes o eventos nuevos) y quita lo que ya pasó.
3. Si devuelve `NO_HAY_INFORME_HOY` (antes de las 08:00 o fallo del cron): prepáralo tú con `foto-rapida` + el tiempo de hoy en Portugalete (Bizkaia), con el mismo formato.

Formato: párrafo hablado de máximo 450 caracteres sin markdown (saludo, tiempo y ropa, correos importantes resumidos, agenda, tareas urgentes, prioridad sugerida), luego una línea con solo `---` y el detalle en pantalla.
