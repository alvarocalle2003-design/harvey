# Reglas de Álvaro para Claude Code (lanzado por el equipo de Harvey)

Te lanza Leonardo (o Harvey), del equipo de agentes de Álvaro ("el señor"), desde su servidor (VPS), en modo no interactivo: nadie puede contestar tus preguntas. Decide con criterio razonable y deja los supuestos por escrito en el informe final.

## Idioma y estilo
- Todo en español: respuestas, comentarios del código, documentación, mensajes de commit e interfaces.
- Nunca uses la raya larga (em dash); usa el guion "-".
- El señor no es técnico: si entregas una interfaz, un documento o instrucciones, que sean visuales, claros y con pasos numerados.

## Dónde trabajar
- Solo dentro de `/opt/data/workspace/proyectos/<proyecto>` (repositorios de GitHub del señor) o de la carpeta de entregas que diga el encargo (`/opt/data/workspace/entregas/<encargo>`).
- No toques nada fuera de esa carpeta: ni la configuración de Hermes (`/opt/data/config.yaml`, `.env`, `skills/`, `memories/`, `profiles/`, `state.db`, `cron/`) ni `/opt/hermes`.
- Nunca leas, muestres ni copies claves, tokens o contraseñas (`.env`, `*token*`, `*.json` de credenciales).
- Contexto del equipo y del señor, solo lectura: `/opt/data/wiki` (empieza por `index.md`; la nota del proyecto está en `proyectos/`). Antes de tocar un proyecto lee su `CONTEXTO.md` o README si existe.

## Entender el proyecto sin gastar
- Si existe `graphify-out/graph.json`, pregunta primero al mapa en vez de leer archivos a ciegas: `graphify query "<pregunta>" --budget 1500`, `graphify explain "<función o archivo>"`, `graphify path "A" "B"`. Lee después solo los archivos que señale.
- Si no existe y el proyecto es grande, créalo: `graphify update .` (solo código, sin coste).

## Git
- Al empezar: `git pull`. El repositorio es la copia de seguridad: no hagas `.bak` de archivos que están en git.
- Al terminar, si todo funciona: `git add` de lo tuyo, commit con un mensaje en castellano que explique el porqué, y `git push`.
- Nunca: `git push --force`, reescribir historial, borrar ramas o repositorios, ni subir `.env`, bases de datos o datos personales (respeta `.gitignore`).
- Fuera de git, copia de seguridad antes de modificar un archivo existente (`archivo.bak-<motivo>`) y bórrala cuando esté probado.

## Antes de cambiar
- La solución más simple que funcione: nada de funciones, opciones o dependencias que no se hayan pedido.

## Lo que NO haces (lo prepara y lo decide el señor a través de Harvey)
- Publicar o desplegar, enviar correos o mensajes, borrar datos fuera del proyecto, gastar dinero, crear servicios o tareas que se queden funcionando.
- Si el encargo lo necesita, déjalo todo listo y explica en el informe el paso que falta.

## Antes de terminar
- Prueba lo que has construido (ejecútalo, ábrelo, pasa los tests). No lo des por hecho sin comprobarlo.
- Informe final breve: qué has hecho, commit y archivos con ruta absoluta, cómo probarlo y qué NO has podido verificar.
