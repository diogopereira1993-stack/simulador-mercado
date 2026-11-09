#!/bin/sh
# Copia o catálogo das MF Picks (e os logótipos) da pasta do Tour para dentro deste projeto.
# Correr antes de publicar no GitHub/Render, sempre que o catálogo mudar.
set -e
cd "$(dirname "$0")"
ORIGEM="../tour-lisboa/dados"
cp "$ORIGEM/picks-catalogo.json" dados/picks-catalogo.json
mkdir -p dados/logos
cp "$ORIGEM"/logos/*.png dados/logos/ 2>/dev/null || true
echo "Catálogo copiado para dados/ ($(ls dados/logos | wc -l | tr -d ' ') logótipos)."
