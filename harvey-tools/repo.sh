#!/bin/sh
# Git del repositorio privado «harvey» (harvey-hud/ + harvey-tools/). Su carpeta interna vive FUERA de OneDrive
# (%LOCALAPPDATA%\HarveyGit\harvey.git): OneDrive corrompe repositorios. Uso: sh harvey-tools/repo.sh status | log | commit ...
exec git --git-dir="$LOCALAPPDATA/HarveyGit/harvey.git" "$@"
