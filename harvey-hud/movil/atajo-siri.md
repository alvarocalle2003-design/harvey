# 🎙 «Oye Siri, Harvey» y 🔔 avisos en el iPhone

## Antes de empezar (una sola vez, en el PC)

1. Abre PowerShell y pega esto (crea una llave secreta para Siri; no tienes que escribir nada):

   ```
   powershell -ExecutionPolicy Bypass -File "C:\Users\alvar\OneDrive\Escritorio\Antigravity\Claude\harvey-hud\movil\clave-siri.ps1"
   ```

2. Espera a que diga **Listo** (Harvey se reinicia unos segundos).

## 🔔 Activar los avisos (iPhone)

1. Abre **Harvey** desde su icono de la pantalla de inicio (no desde Safari).
2. Toca el botón del **altavoz** (arriba a la derecha).
3. Toca **🔔 ACTIVAR AVISOS** → **Permitir**.
4. Te llega un aviso de prueba: «Avisos activados». ✅

Te avisará con la app cerrada cuando Harvey termine una orden, te pida permiso o llegue correo importante (de 22:00 a 8:00, solo los permisos).
Al tocar un aviso de Harvey (idea, seguimiento, correo, hábitos), la app se abre con el aviso en la conversación y el micro latiendo: un toque y le contestas.

## 🎙 El atajo de Siri: conversación sin tocar el teléfono (coche)

**«Oye Siri, Harvey»** → hablas → Harvey contesta con su voz, **entera** → vuelve a escucharte solo → … hasta que digas **«gracias»** (o «eso es todo», «nada más», «adiós») o te quedes callado.

- Si Harvey tarda más de 10 s, dice «Un momento, señor» y sigue esperando (unos 3 minutos como mucho), avisándote de vez en cuando.
- Si Siri se cierra antes de que acabe, la respuesta te llega como aviso al móvil.
- Si Harvey necesita tu permiso para algo (enviar un correo…), te lo pregunta y le contestas en el siguiente turno.

### Cómo debe quedar

```
Repetir 10 veces
   Dictar texto (Español (España), tras pausa)
   Si se cumple CUALQUIERA:  Texto dictado no tiene ningún valor
                             Texto dictado empieza por «Gracias» / «Muchas gracias» / «Eso es todo»
      Detener este atajo
   Fin del si
   Obtener contenido de …/api/siri?voz        (POST, llave en Authorization, JSON text = Texto dictado)
   Reproducir sonido (Contenido de la URL)
   Repetir 4 veces
      Obtener contenido de …/api/siri/sigue?voz   (GET, llave en Authorization)
      Reproducir sonido (el contenido de ESTA URL)
   Fin de la repetición
Fin de la repetición
```

### Montarlo partiendo del atajo antiguo (Dictar texto → Obtener contenido → Reproducir sonido)

Las acciones nuevas aparecen siempre al final: hay que **mantenerlas pulsadas y arrastrarlas** a su sitio.
Lo de dentro de un Repetir o un Si se ve **con sangría** (más a la derecha).

| Paso | Qué haces |
|---|---|
| 1 | Busca **Repetir** → tócalo. Cambia «1 vez» por **10**. Arrastra **Dictar texto**, **Obtener contenido de** y **Reproducir sonido**, en ese orden, **dentro** del Repetir |
| 2 | Busca **Si** → tócalo y arrástralo justo **debajo de Dictar texto** (dentro del Repetir). Entrada: **Texto dictado** · condición: **no tiene ningún valor** |
| 3 | En ese Si: **Añadir condición** → **Texto dictado · empieza por · Gracias**. Repite con **Muchas gracias** y **Eso es todo**. Arriba cambia **todas** por **cualquiera** |
| 4 | Busca **Detener este atajo** → arrástralo **dentro del Si** (entre «Si» y «De lo contrario») |
| 5 | Busca **Repetir** otra vez → arrástralo **debajo de Reproducir sonido** (dentro del primer Repetir). Cambia «1 vez» por **4** |
| 6 | Mantén pulsado **Obtener contenido de** → **Duplicar**. Arrastra la copia **dentro del Repetir de 4**. En la copia cambia el final de la URL `siri?voz` por `siri/sigue?voz` y en la flechita **›** pon Método **GET** (la llave ya viene copiada) |
| 7 | Busca **Reproducir sonido** → arrástralo **debajo de la copia**, dentro del Repetir de 4. Toca su entrada → **Seleccionar variable** → toca la copia (la de `sigue`) |
| 8 | Toca **▶** | Di «¿Qué tengo hoy en la agenda?», escucha y luego di «gracias» |

> Si al callarte el atajo da un error en vez de cerrarse, no pasa nada: es Siri diciendo que no ha oído nada.
