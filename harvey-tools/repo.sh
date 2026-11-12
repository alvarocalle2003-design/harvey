#!/bin/sh
# Git del repositorio privado «harvey» (harvey-hud/ + harvey-tools/). Su carpeta interna vive FUERA de OneDrive
# (C:\Users\alvar\HarveyGit\harvey.git): OneDrive corrompe repositorios, y lo que la app de Claude escribe en AppData
# acaba en su carpeta privada. La wiki igual: harvey-wiki/.git es un archivo que apunta a HarveyGit\harvey-wiki.git.
# Uso: sh harvey-tools/repo.sh status | log | commit ...
exec git --git-dir="$USERPROFILE/HarveyGit/harvey.git" "$@"
