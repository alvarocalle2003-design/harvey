---
name: panel-objetivos
description: "Panel de objetivos, tareas y hábitos de Álvaro en Notion (Harvey - Panel). Úsala para registrar hábitos diarios, crear o actualizar tareas, revisar objetivos, plazos y progreso."
version: 1.0.0
author: alvaro
metadata:
  hermes:
    tags: [Notion, Objetivos, Hábitos, Tareas, Productividad]
---

# Panel de objetivos de Álvaro (Notion)

Tareas y hábitos van SIEMPRE por sus scripts (abajo); los objetivos se leen con las herramientas MCP `mcp__notion__*`. Estos son los objetivos personales del señor; los del equipo están en `/opt/data/wiki/objetivos/`. Página raíz "Harvey - Panel": `3f903114-9f0e-80ed-a8e4-cc78de942621`.

## Bases de datos (data_source_id)

Están en la subpágina «Almacén de datos»; el «Panel de Harvey» (página raíz) solo muestra vistas visuales de ellas (tableros, calendarios, galería). Escribe siempre en las bases, nunca toques los bloques de la página raíz.

| Base | data_source_id | Título | Propiedades editables |
|-|-|-|-|
| Áreas | `6ccd04a4-1652-4069-9bf5-76b460398d69` | Área | Descripción |
| Objetivos | `ccc745cf-28fe-40be-850d-fa8cbc2bd958` | Objetivo | **Área** (select: `🏋️ Deporte`, `🩺 Salud`, `🌲 Ocio`, `⛺ AMET`, `📚 Formativo`, `💼 Laboral`), Área (enlace) (relación a Áreas, rellénala también), Tipo (Hito / Hábito), Estado (Pendiente / En curso / Hecho / En riesgo), Fecha límite, Notas |
| Tareas | `f57016ab-3737-4ab7-a68f-3590e6db8a6c` | Tarea | Objetivo (relación), Estado (**Por hacer** / En curso / Hecha; pon siempre uno), Prioridad (`🔥 Alta` / `Media` / `Baja`), Fecha, Notas |
| Hábitos diarios | `02b6956c-993d-4e4e-a547-720e077cfbc4` | Día (AAAA-MM-DD) | Fecha, **Gym** (Sí/No), **Lectura (min)**, **Instagram OK** (Sí = no pasó de 15 min). El resto de columnas (Gimnasio, Rutina, Horas de sueño, Puntos, Valoración...) son antiguas: no las uses ni las menciones |

Fórmulas automáticas (solo lectura, no las escribas): Objetivos.**Semáforo** (🔴 vencido, 🟠 <=14 días, 🟡 <=45, 🟢 con margen, ✅ conseguido), Tareas.**Cuándo**. Úsalas en tus resúmenes.

Áreas: Deporte, Salud, Ocio, AMET (Andra Mari Eskaut Taldea), Formativo, Laboral. Horizonte: noviembre 2027.

## Reglas

- **Hábitos**: NUNCA escribas la base Hábitos a mano. Usa SIEMPRE `/opt/hermes/.venv/bin/python /opt/data/hud/habitos.py marcar gym|instagram si|no|nada` o `... marcar lectura <minutos>|nada` (0 = no ha leído; opcional `--fecha AAAA-MM-DD`, solo desde el 16/10/2026 hasta hoy). Estado de la semana: `habitos.py --texto`. El HUD del PC y la app del móvil usan el mismo script. Registrar lo que el señor te cuente es acción libre: hazlo y confirma en una línea con cómo va la semana. Actitud de entrenador firme pero de apoyo: reconoce lo cumplido y, si falla, propón algo concreto para mañana.
- **Tareas**: NUNCA las escribas por el conector de Notion. Usa SIEMPRE, en una sola orden, `/opt/hermes/.venv/bin/python /opt/data/hud/tareas.py`:
  - Ver pendientes: `tareas.py --texto` (añade `--todas` para incluir las hechas).
  - Apuntar: `tareas.py crear "Escribir a la lotera" --fecha lunes [--objetivo "rol de economía"] [--prioridad alta|media|baja] [--notas "..."]`
  - Ya hecha (varias a la vez): `tareas.py hecha "lo de la lotera" "transferencia a Andoni"`
  - Aplazar o cambiar: `tareas.py editar "trauma" --fecha mañana` · `--titulo "Nuevo título"` · `--objetivo ...` · `--prioridad ...` · `--fecha nada` (quita la fecha)
  - Volver a pendiente: `tareas.py reabrir "texto"` · Borrar (papelera de Notion): `tareas.py borrar "texto"`
  - Fechas: `AAAA-MM-DD`, `31/10`, `"15 de octubre de 2027"`, `hoy`, `mañana`, `lunes`…`domingo`, con hora opcional (`"sábado 18:30"`).
  - Pasa las palabras del señor tal cual: el script busca por parecido. Si responde con dudas u opciones (código 2), pregunta al señor con esas opciones. Confirma solo lo que diga la línea «✓»: el script ya ha releído Notion para comprobarlo.
  - **Objetivo**: elige el objetivo concreto más cercano por su título (`--objetivo "galeón Argizari"`); si el señor solo nombra un área con varios objetivos, el script te los listará. Si no encaja con ninguno, omite `--objetivo`: va a «Genérico» (lo pidió el señor). Prioridad por defecto: Media.
  - Si el señor dicta una tarea para una fecha, esa es la Fecha de la tarea (no un evento de calendario). Si además dice para cuándo quiere el resultado, ponlo en `--notas`. Si pide «recuérdamelo», además de la tarea programa el aviso como siempre (cronjob «Recordatorio: …»).
  - Para un recordatorio repetido durante un solo día, usa `cronjob_manage` con avisos puntuales a intervalos razonables, desde la hora de inicio que indique hasta la última hora útil del día. No crees un ciclo indefinido. Si no especifica horas, empieza a las 09:00 y distribuye varios avisos durante la jornada, evitando las 22:00-09:00. En el texto de cada aviso, pide al señor que confirme cuando lo haya hecho.
  - Si el señor dice que ya completó algo sujeto a avisos repetidos, consulta primero `cronjob_manage` con `action: list`, identifica los avisos pendientes de ese asunto y elimínalos con `action: remove`; no dejes recordatorios obsoletos activos. No prometas cancelar avisos futuros automáticamente salvo que exista un flujo que pueda detectar esa confirmación.
  - Si el señor señala objetivos que deberían ser tareas, crea una tarea por objetivo con su título y fecha, y pide confirmación antes de tocar el objetivo.
- **Objetivos**: cambiar Estado o Fecha límite, o crear/borrar objetivos, requiere confirmación de Álvaro. Nunca borres páginas.
- **Metas de hábitos** (los únicos que se siguen desde el 16/10/2026; semana de lunes a domingo): gimnasio 5 días/semana, lectura 4 h/semana, Instagram máximo 15 min/día. A las 22:00 un cron le avisa al iPhone si falta algo por marcar o si lleva una mala racha.
- **Revisión**: al hacer resúmenes, señala objetivos con Fecha límite en los próximos 30 días que no estén "Hecho" y marca como riesgo los que no tengan tareas activas.

## Consultas eficientes (importante)

- Si un aviso automático de Kanban indica que una tarjeta terminó o pasó a revisión, primero consulta el tablero indicado para comprobar el estado actual y las tarjetas hijas ya existentes. Trata la notificación como estado, no como una petición de recrear trabajo; no dupliques tareas ni dependencias. Si no hay nada que el señor deba decidir y el flujo sigue correctamente, responde `[SILENT]`.

- Para recuentos o resúmenes de objetivos, tareas y hábitos usa primero la skill `foto-rapida`: recorre la base entera (con `page_size` ≤ 20 te faltarían filas y darías cifras erróneas).

Para leer **objetivos** (no tareas ni hábitos, que tienen sus scripts) usa las herramientas MCP `mcp__notion__*`. Las respuestas completas de Notion son enormes: **filtra siempre en la consulta** con `API-query-data-source` y pide pocas propiedades con `filter_properties` (lista de nombres o ids). Ejemplos de `filter` para Objetivos:

- Vencen antes de una fecha y no están hechos:
  `{"and":[{"property":"Fecha límite","date":{"on_or_before":"2026-11-30"}},{"property":"Estado","select":{"does_not_equal":"Hecho"}}]}`
- Por área: `{"property":"Área","relation":{"contains":"<page_id del área>"}}`

Ordena con `sorts: [{"property":"Fecha límite","direction":"ascending"}]` y usa `page_size` <= 20. No uses execute_code ni terminal para procesar resultados: razona directamente sobre la respuesta filtrada.
