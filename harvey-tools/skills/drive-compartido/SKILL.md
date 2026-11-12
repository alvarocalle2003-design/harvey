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

- **Entregar siempre en Drive**: cualquier documento que generes para el señor (informe, documento, imagen, hoja) súbelo a «Entregables de Harvey» y dale el enlace (`webViewLink`) en tu respuesta. Si hay varios archivos o es un proyecto, crea una subcarpeta con nombre claro.
- **Código**: no va a Drive. Vive en los repositorios privados de GitHub del señor y lo lleva Leonardo; al señor se le da el enlace del repositorio o de la rama.
- **Lo que deja el señor**: cuando diga que te ha dejado algo (o pregunte si lo has visto), busca en «Para Harvey», descárgalo a `/opt/data/workspace/drive/` y trabaja sobre la copia. No borres nada de su Drive.
- Nombres de archivo con fecha delante cuando sean versiones: `2026-10-14 Informe X.pdf`.
- Nunca compartas estas carpetas ni sus archivos con terceros sin confirmación del señor.
