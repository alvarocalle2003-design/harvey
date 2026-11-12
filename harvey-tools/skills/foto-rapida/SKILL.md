---
name: foto-rapida
description: "Resumen instantáneo (2 s) del día del señor: agenda 7 días, correos no leídos recientes, objetivos contados por área, tareas pendientes y hábitos. Úsala SIEMPRE primero para resúmenes, «¿qué tengo hoy/pendiente?» y recuentos de correos, objetivos o tareas."
version: 1.0.0
author: alvaro
metadata:
  hermes:
    tags: [Resumen, Agenda, Correo, Notion, Productividad, Ahorro]
    related_skills: [google-alvaro, panel-objetivos]
---

# Foto rápida

Un solo comando que devuelve el estado del señor ya filtrado y contado (recorre Notion entero, no hace falta contar a mano):

```bash
/opt/hermes/.venv/bin/python /opt/data/hud/snapshot.py --texto
```

Opción: `--dias N` para los correos no leídos de los últimos N días (por defecto 3).

Es la misma fuente que usa el HUD del escritorio: lo que digas cuadrará con lo que el señor ve en pantalla.

## Cuándo usarla

- Resúmenes: «¿qué tengo hoy?», «resumen del día / de la semana», «¿cómo voy con mis objetivos?».
- Recuentos: cuántos correos sin leer, cuántos objetivos o tareas, cuántos hechos o en riesgo.
- Antes de profundizar: mira primero la foto y solo después abre lo concreto (un correo con `gmail get ID` usando el id que aparece en la foto, un objetivo concreto en Notion).

## Reglas de ahorro (importantes)

- No descargues listas largas de Gmail ni de Notion para contar o resumir: la foto ya lo hace.
- Correos: por defecto solo los de los últimos 3 días. Los no leídos antiguos (hay cientos) se ignoran a propósito; búscalos solo si el señor lo pide expresamente, y siempre con filtro de fecha (`newer_than:` / `after:`) y `--max` de 10 como mucho.
- Nunca vuelques salidas enormes a archivos para leerlas después ni las proceses con jq.
- Si un bloque sale como «SIN DATOS», dilo y usa la skill específica (google-alvaro o panel-objetivos) solo para ese bloque.
