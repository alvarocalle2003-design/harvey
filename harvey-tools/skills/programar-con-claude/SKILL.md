---
name: programar-con-claude
description: "Delegar en Claude Code (el agente programador del señor) tareas de programación o técnicas complejas: scripts, webs, automatizaciones, depurar código, analizar repositorios. También explica cómo te habla Claude Code desde el PC del señor."
version: 1.0.0
author: alvaro
metadata:
  hermes:
    tags: [Claude-Code, Programación, Delegación, Equipo]
    related_skills: [claude-code]
---

# Equipo con Claude Code


Claude Code es tu compañero programador. Usa la suscripción de Claude del señor (sin coste por uso, pero comparte sus límites): delega en él lo que sea programación de verdad y quédate tú con la coordinación.

## Cuándo delegar

- Escribir o modificar código, scripts, webs, automatizaciones.
- Depurar errores técnicos o analizar un repositorio.
- Tareas largas de varios pasos técnicos.

No lo uses para consultas de agenda, correo o Notion: eso lo haces tú.

## Cómo

Trabaja siempre dentro de `/opt/data/workspace/proyectos/<nombre-del-proyecto>` (créalo si no existe). Modo no interactivo, con tope de turnos:

Elige SIEMPRE el modelo según el encargo (ahorra límite de la cuenta del señor):

| Encargo | Opciones |
|-|-|
| **Programación de software** (escribir, modificar o depurar código, scripts, webs, apps, automatizaciones) | `--model claude-opus-5-5 --effort medium` |
| **Cualquier otra cosa** (analizar o resumir documentos, redactar, investigar, revisar datos) | `--model sonnet` |

```bash
mkdir -p /opt/data/workspace/proyectos/NOMBRE && cd /opt/data/workspace/proyectos/NOMBRE && claude -p "ENCARGO DETALLADO" --model claude-opus-5-5 --effort medium --max-turns 30 --output-format text
```

- **Si puede tardar más de 5 minutos** (casi cualquier programación), NO lo lances así: el terminal corta a los 7 minutos y se pierde el trabajo. Escribe el encargo en un `ENCARGO.md` y usa `/opt/data/bin/claude-encargo lanzar <carpeta> <ENCARGO.md> programar|documentar|revisar` (segundo plano), luego `claude-encargo estado <ENCARGO.md>` cada pocos minutos y, si hay que corregir, `claude-encargo seguir <ENCARGO.md> "<qué>"` (sigue la misma conversación de Claude).
- Pon en el encargo: objetivo, archivos o carpeta, cómo comprobar que funciona y qué debe entregar.
- Para artefactos derivados de informes (PDF, DOCX o slides), congela primero el contenido y las citas, indica rutas de entrada y salida, y exige una comprobación estructural del archivo final. Si corriges fuentes después de maquetar, vuelve a generar el artefacto: el render anterior ya no representa el borrador verificado.
- Para tareas no interactivas que deban crear archivos, permite explícitamente solo las herramientas necesarias, por ejemplo `--permission-mode acceptEdits --allowedTools Read,Write,Bash`; el permiso interactivo no confirmado puede dejar el encargo sin artefacto aunque el proceso termine sin error visible. Verifica tú el archivo y su contenido con herramientas independientes antes de entregarlo.
- Si Claude agota los turnos, comprueba primero si creó el entregable; si no, reintenta con un encargo más acotado y un límite suficiente, en vez de dar la tarea por hecha por un código de salida cero.
- Para el resto de opciones (sesiones con tmux, revisión de código, JSON) consulta la skill `claude-code`.
- Cuando termine, entrega el resultado en Drive (skill drive-compartido) y resume al señor qué ha hecho Claude con el enlace.
- Pide confirmación al señor antes de delegar algo que publique, despliegue, borre o gaste dinero.

## Mensajes que te envía Claude Code

Claude Code también trabaja en el PC del señor y a veces te escribe (llegan con instrucciones que lo indican). Trátalo como a un colega: respuestas directas y técnicas. Puedes usar tus herramientas para ayudarle, con las mismas reglas de confirmación que con el señor.
