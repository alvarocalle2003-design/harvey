---
name: prospeccion-comercial
description: "Buscar clientes potenciales (negocios, pymes, autónomos) para venderles webs, apps o herramientas de IA, con auditoría medible de su web (Lighthouse, capturas), fichas de venta y PDF maquetado. Úsala SIEMPRE que el señor pida clientes potenciales, prospectos, leads, a quién vender o un informe comercial."
version: 1.0.0
metadata:
  hermes:
    tags: [ventas, prospeccion, clientes, leads, auditoria-web, lighthouse, informe, pdf]
    category: productivity
    requires_toolsets: [terminal]
---

# Prospección comercial


El señor vende webs y herramientas de IA a negocios pequeños. Un encargo de prospección termina en un PDF con
N negocios a los que **puede llamar mañana**: para cada uno, qué le falla (con pruebas), qué le ofrece, por cuánto,
qué le dice en la llamada y qué responde a sus pegas. No es un estudio de mercado ni un documento legal.

## Reglas que mandan

1. **Rigor = datos, no avisos.** Cada problema lleva una prueba concreta: nota de Lighthouse, segundos de carga,
   captura, año del copyright, botón que no existe, reseña citada, comparación con un competidor. Prohibido rellenar
   con cautelas genéricas («hipótesis a validar», «no prometer ROI», privacidad, alérgenos, «no se ha contactado»).
   Lo que de verdad falte va en `por_confirmar`, máximo 2 líneas.
2. **Si no hay problema demostrable, el negocio NO entra.** Se descarta y se busca otro. Nunca se mete un negocio
   «con cautelas» para llegar al número pedido. Una web moderna, rápida y con reservas no es un prospecto de web.
3. **Primero el problema, luego el negocio.** No partas de un directorio cómodo: busca señales de dolor
   (sin web, web lenta o antigua, sin móvil, todo por teléfono, reseñas quejándose de que no contestan, competidor
   de al lado mucho mejor) y después mira quién las tiene.
4. **Reparto real.** Si el ámbito es una provincia (p. ej. Bizkaia), como máximo el 40 % en la capital y como
   máximo el 30 % de una misma fuente o directorio. Variedad de sectores (máx. 4 del mismo).
5. **Tono comercial**, directo, en segunda persona para el señor («le ofreces…», «en la llamada dile…»). Concreto
   para ESTE negocio: si un párrafo valdría para cualquier otro, está mal.
6. **Tiempo y profundidad.** Un encargo así lleva horas, no minutos. Cada prospecto finalista merece al menos
   15-20 consultas (web, auditoría, reseñas, competidor, tamaño, decisor).

## Encargos de 10 o más negocios: lo dirige Claude Code (Opus)

Tus subagentes no aguantan una investigación de horas (el 28/10 trabajaron 1 minuto y te rendiste con 2 de 20).
Para estos encargos NO hagas tú el proceso: lánzalo con `prospectar.sh`, que pone a Claude Code con Opus a dirigir todo
el método con sus propios subagentes, sube el PDF a Drive y avisa al señor en el iPhone y el HUD al terminar.

```bash
/opt/data/skills/productivity/prospeccion-comercial/scripts/prospectar.sh <nombre-corto> "<encargo completo del señor, con todos sus requisitos>"
```
- Ejecútalo con la herramienta terminal **en segundo plano** (background=true): tarda de 1 a 3 horas. No lo esperes.
- Al señor: dile en una frase que está en marcha, que lo dirige Claude Code con Opus y que le llegará el aviso con el
  enlace al terminar. Seguimiento: `<carpeta>/prospectar.log` y `<carpeta>/claude-respuesta.md`
  (carpeta: /opt/data/workspace/proyectos/prospeccion-<nombre-corto>).
- Gasta del límite de la suscripción de Claude del señor: úsalo solo para encargos de prospección de verdad.
- Para 1-9 negocios o una auditoría suelta, sigue tú el proceso de abajo.

## Herramientas (rutas absolutas; también para subagentes)

```bash
P=/opt/data/skills/productivity/prospeccion-comercial
$P/scripts/auditar_web.py URL --rapido            # ~3 s: https, móvil, copyright, WhatsApp, reservas, tienda… + «problemas»
$P/scripts/auditar_web.py URL --salida DIR > DIR/auditoria.json   # ~40 s: + Lighthouse móvil y capturas móvil/escritorio
$P/scripts/informe.py datos.json --salida DIR/informe --esperado web=10,ia=10   # valida y maqueta el PDF
$P/scripts/informe.py datos.json --salida DIR/informe --esperado web=10,ia=10 --drive   # y lo sube a Entregables
```
- `auditar_web.py` devuelve JSON con `problemas` ya redactados con su dato: úsalos como evidencias.
  Lighthouse va de uno en uno en todo el VPS (cola automática): lánzalo solo a los que pasan la criba.
- `informe.py` NO genera nada si falta algo obligatorio y te dice qué: corrige y repite hasta que pase.
  Formato completo de datos.json con un ejemplo: `$P/plantilla_datos.json`.
- Candidatos: `web_search` («talleres mecánicos Barakaldo», «clínica dental Getxo», «academia de inglés Durango»…),
  directorios (Páginas Amarillas, bilbaodendak, cámaras de comercio, asociaciones de comerciantes), la skill `maps`
  (OpenStreetMap, `nearby`/`area`; sus servidores a veces fallan: reintenta o sigue sin ella).
- Tamaño: einforma / infoempresa / axesor / empresia («<nombre> empleados»), LinkedIn, «quiénes somos». Si no hay
  dato, estimación razonada (nº de profesionales en la web, local, horario) indicando que es estimación.
- Reseñas: `web_search` «<nombre> <municipio> opiniones» (Google, TripAdvisor, Treatwell, Doctoralia…); cita la frase.

## Proceso

Carpeta del proyecto: `/opt/data/workspace/prospeccion/<proyecto>/` (fichas en `fichas/`, auditorías en `<dominio>/`).

1. **Criterios** (si el señor no los dio, usa estos): negocio local o pyme < 30 personas, con capacidad de pago
   (ticket medio o recurrente alto), problema digital visible y decisor accesible. Sectores que suelen encajar:
   talleres, clínicas dentales/fisio/estética/veterinarias, academias, inmobiliarias, gestorías y despachos, reformas
   e instaladores, gimnasios y estudios, hostelería con reservas, comercio especializado, alojamientos rurales.
2. **Embudo amplio**: ≥ 6 candidatos por plaza pedida (20 plazas → 120+), repartidos por municipios y sectores.
   Lánzalo en paralelo: un subagente por zona o sector (hasta 10), cada uno devuelve una lista JSON
   {nombre, sector, municipio, web o null, telefono, fuente}.
3. **Criba rápida**: `auditar_web.py --rapido` a todos los que tienen web; sin web = señal fuerte para oferta web.
   Quédate con los ~2× plazas con más problemas y más capacidad de pago.
4. **Auditoría profunda** (subagentes, 3-5 negocios cada uno, en paralelo): auditoría completa, reseñas, 1 competidor
   directo del mismo municipio auditado con `--rapido` para comparar, tamaño, decisor, canales (Instagram, reservas,
   WhatsApp Business). Cada subagente guarda una ficha JSON por negocio en `fichas/<slug>.json` con los campos de la
   plantilla y devuelve solo la lista de rutas + una línea por negocio.
   - Prospecto **IA**: identifica un proceso repetitivo concreto y visible (citas solo por teléfono en horario
     partido, presupuestos por formulario genérico, reseñas sin responder, carta o catálogo en PDF desactualizado,
     preguntas que se repiten en reseñas) y una herramienta concreta (asistente de WhatsApp para citas,
     presupuestador, respuestas a reseñas, buscador de catálogo…). Nada de «chatbot genérico».
5. **Selección y puntuación** (0-100): dolor visible y medible 35 · capacidad de pago 25 · facilidad de venta
   (decisor, cercanía, competidor mejor que él) 20 · encaje de tamaño 15 · rapidez de entrega 5. Prioridad A ≥ 75,
   B 60-74, C < 60. Si tras auditar no hay suficientes buenos, vuelve al paso 2: no rellenes.
6. **Redacción**: une las fichas en `datos.json`. Para un informe importante encarga la redacción de los textos
   (problema, oferta, argumento, guion, win-win, objeciones, resumen, plan) a Claude Code con Opus (skill
   `programar-con-claude`, `--model claude-opus-5-5`): dale la ruta de datos.json, estas reglas y que solo reescriba
   los textos sin inventar datos. Revisa el resultado.
7. **Maquetar y comprobar**: `informe.py … --esperado …` hasta que pase; mira el PDF (skill `pdf` o capturas) y
   repasa 3 fichas al azar como si fueras el señor llamando. Después `--drive` y entrega el enlace. Sube a Drive solo
   el PDF final (los borradores quedan en la carpeta del proyecto).

## Precios orientativos (Bizkaia, autónomo; ajústalos si el señor da su tarifa)

| Oferta | Precio |
|---|---|
| Web corporativa 4-6 páginas, móvil, SEO local, WhatsApp | 700-1.500 € + 25-40 €/mes |
| Web con reservas/citas o catálogo | 1.200-2.500 € + 35-60 €/mes |
| Tienda online pequeña | 1.800-3.500 € + 50-90 €/mes |
| Rediseño/optimización de web existente (velocidad, móvil, SEO) | 400-900 € |
| Asistente IA de WhatsApp/web para citas y preguntas | 600-1.500 € + 40-120 €/mes |
| Automatización (presupuestos, reseñas, facturas, avisos) | 500-2.000 € + 30-100 €/mes |
