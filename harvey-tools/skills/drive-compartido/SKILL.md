---
name: drive-compartido
description: "Carpeta de Google Drive compartida con el señor para intercambiar archivos: entrega ahí los documentos que produzcas (informes, documentos, hojas, imágenes; el código vive en GitHub) y recoge lo que él te deje. Úsala siempre que generes un archivo para él o te diga que te ha dejado algo."
version: 1.0.0
author: alvaro
metadata:
  hermes:
    tags: [Drive, Archivos, Entregables, Equipo]
    related_skills: [google-alvaro, programar-con-claude]
---

# Drive compartido con el señor

No puedes acceder a su ordenador: el punto de encuentro es la carpeta **Harvey** de su Google Drive.

| Carpeta | ID | Uso |
|-|-|-|
| Harvey (raíz) | `1LU_YWNRHeU_LZBHrN5S_iVrEp3v2uQJd` | https://drive.google.com/drive/folders/1LU_YWNRHeU_LZBHrN5S_iVrEp3v2uQJd |
| Entregables de Harvey | `1lfpwEt3b3CwWDvH7YMEd4t69zgShKpS8` | Lo que tú (o Claude Code) produces para él |
| Para Harvey | `1hVFWizRp0swMnScXOXV63hhVNrNRI1cu` | Lo que él te deja a ti |

Comandos (Python de Hermes, como en google-alvaro):

```bash
G="/opt/hermes/.venv/bin/python /opt/data/skills/productivity/google-workspace/scripts/google_api.py drive"
$G upload /ruta/archivo.pdf --parent 1lfpwEt3b3CwWDvH7YMEd4t69zgShKpS8          # entregar
$G create-folder "Nombre del proyecto" --parent 1lfpwEt3b3CwWDvH7YMEd4t69zgShKpS8  # subcarpeta por proyecto
$G search "'1hVFWizRp0swMnScXOXV63hhVNrNRI1cu' in parents and trashed = false" --raw-query --max 10  # ver lo que te ha dejado
$G download FILE_ID --output /opt/data/workspace/drive/NOMBRE                     # traerlo para trabajar
```

## Reglas

- **Entrega revisada del equipo**: cuando una tarjeta de trabajo quede aprobada por Lince, inspecciona personalmente el entregable principal y los adjuntos que describa; compáralos con lo que pidió el señor y con los límites y debilidades señalados en la revisión. Si no responde a la petición, no lo subas ni lo presentes como recomendación firme: devuélvelo al equipo conforme al flujo de revisión. Si está a la altura, dale al señor **primero el enlace de la app**, que se abre sin descargar (HTML interactivo, PDF, imágenes): `https://harvey.srv2061704.hstgr.cloud/entregas/<carpeta>/<archivo>` (la ruta tras `/opt/data/workspace/entregas/`). Súbelo además a «Entregables de Harvey» como copia y pon el `webViewLink` después. No sustituyas el archivo por un enlace a su código fuente o repositorio. Para informes con varios archivos, crea una subcarpeta clara y sube el informe, hojas de escenarios y adjuntos necesarios; no hace falta subir materiales internos de auditoría salvo que sean útiles para interpretar o reproducir la entrega. La aprobación formal de Lince no sustituye el juicio del jefe de gabinete.
- **Entregables propios**: cualquier documento o archivo que generes para el señor (informe, documento, imagen, hoja, HTML) súbelo también a «Entregables de Harvey». Si hay varios archivos o es un proyecto, usa una subcarpeta con nombre claro.
- **Una sola subida por entrega**: antes de subir, busca en la carpeta si ya está (`drive search` por nombre) o mira el Diario de la ficha del objetivo; si el señor vuelve a pedirla desde otra conversación, dale el mismo enlace.
- **Cierra el ciclo de entrega**: después de subir archivos, búscalos por el ID de carpeta padre con `drive search` y verifica nombre y enlace del archivo esperado; una respuesta de carga exitosa confirma el alta, pero la lectura de vuelta detecta entregas incompletas. Si aparecen duplicados con el mismo nombre, usa el `webViewLink` del ID recién subido, no uno antiguo.
- **Código**: no va a Drive. Vive en los repositorios privados de GitHub del señor y lo lleva Leonardo; al señor se le da el enlace del repositorio o de la rama.
- **Lo que deja el señor**: cuando diga que te ha dejado algo (o pregunte si lo has visto), busca en «Para Harvey», descárgalo a `/opt/data/workspace/drive/` y trabaja sobre la copia. No borres nada de su Drive.
- Nombres de archivo con fecha delante cuando sean versiones: `2026-10-14 Informe X.pdf`.
- Nunca compartas estas carpetas ni sus archivos con terceros sin confirmación del señor.
