# 📱 Harvey se entera solo: automatizaciones del iPhone

Cuatro automatizaciones de la app **Atajos** que avisan a Harvey sin que digas nada:

| Cuándo | Qué hace Harvey | Voz |
|---|---|---|
| ⏰ Apagas la alarma | Te da los buenos días con el informe del día | Voz de Harvey (~300 caracteres de saldo al día) |
| 🏋️ Llegas al gimnasio | Marca el gimnasio como hecho y te anima | Voz de Harvey (frase guardada: casi no gasta) |
| 🚪 Sales de casa por la mañana | Tiempo y tu próximo compromiso | Notificación (gratis) |
| 🏠 Llegas a casa por la tarde | Bienvenida y hábitos que te faltan | Notificación (gratis) |

Puedes montar solo las que quieras. Las cuatro se hacen igual; cambia lo que pone en la tabla de cada una.

## Antes de empezar

Copia la llave: app **Harvey** → botón del **altavoz** → **🎙 COPIAR LLAVE DE SIRI**.
(Es la misma llave del atajo «Harvey»; si cambias de llave, hay que volver a pegarla aquí.)

## Paso a paso (ejemplo: ⏰ alarma)

Abre **Atajos** → pestaña **Automatización** (abajo) → **＋** (arriba a la derecha).

| Paso | Qué tocas | Qué pones |
|---|---|---|
| 1 | **Alarma** | **Se detiene** · Elige tu alarma de despertarte (o **Cualquiera**) |
| 2 | **Ejecutar inmediatamente** | Y desactiva **Notificar al ejecutar** |
| 3 | **Siguiente** → **Nuevo atajo en blanco** | |
| 4 | **Añadir acción** → busca **Obtener contenido de URL** | URL: `https://harvey.srv2061704.hstgr.cloud/api/siri?disparador=alarma&voz` |
| 5 | En esa acción, toca la flechita **›** | Método: **POST** |
| 6 | **Cabeceras** → **Añadir nueva cabecera** | Clave: `Authorization` · Valor: **pega** la llave (empieza por `Bearer`) |
| 7 | Busca **Reproducir sonido** | Que reproduzca **Contenido de URL** |
| 8 | **OK** | Listo ✅ |

## Las otras tres

| | Paso 1 (disparador) | URL del paso 4 | Paso 7 |
|---|---|---|---|
| 🏋️ Gimnasio | **Llegar** → Ubicación: busca la dirección de tu gimnasio | `https://harvey.srv2061704.hstgr.cloud/api/siri?disparador=gimnasio&voz` | **Reproducir sonido** (Contenido de URL) |
| 🚪 Salir de casa | **Salir** → Ubicación: tu casa · **Rango horario**: 7:00 a 13:00 | `https://harvey.srv2061704.hstgr.cloud/api/siri?disparador=salir_casa` | **Obtener valor del diccionario** (clave `text`) y después **Mostrar notificación** con ese **Valor del diccionario** |
| 🏠 Llegar a casa | **Llegar** → Ubicación: tu casa · **Rango horario**: 17:00 a 22:00 | `https://harvey.srv2061704.hstgr.cloud/api/siri?disparador=llegar_casa` | Igual que «Salir de casa» |

> 💡 Según la versión de iOS, el «Rango horario» puede llamarse «Intervalo de tiempo» o «Franja horaria».
> 💡 En «Salir» y «Llegar», si iOS no ofrece **Ejecutar inmediatamente**, elige **Ejecutar tras confirmación**: te saldrá un aviso y lo tocas.
> 💡 Si prefieres que las notificaciones las lea Siri en voz alta, cambia **Mostrar notificación** por **Leer texto** (gratis, con la voz de Siri).
> 💡 Para probar sin moverte: abre la automatización y toca **▶**.

## Cambiar lo que dice Harvey

Las órdenes de cada disparador están en el archivo `disparadores.json` del servidor del móvil (en el PC: `harvey-hud/movil/disparadores.json`). Pídeselo a Claude y lo cambia en un momento.
