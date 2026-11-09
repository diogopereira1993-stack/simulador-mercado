#!/bin/sh
# Copia a apresentação única da pasta do Tour para dentro deste projeto (servida em /apresentacao/, com o login do admin).
# Só copia o que os slides usam: index.html, dados-slides.js, o logótipo e os logótipos das empresas.
# NÃO copia o plano B sem internet nem os scripts de construção.
set -e
cd "$(dirname "$0")"
ORIGEM="../tour-lisboa/apresentacao"
rm -rf apresentacao
mkdir -p apresentacao/logos
cp "$ORIGEM/index.html" "$ORIGEM/dados-slides.js" "$ORIGEM/logo-moneyflix.png" apresentacao/
cp "$ORIGEM"/logos/* apresentacao/logos/ 2>/dev/null || true
echo "Apresentação copiada para apresentacao/ ($(ls apresentacao/logos | wc -l | tr -d ' ') logótipos)."
