#!/bin/sh
# Copia o catálogo das MF Picks (e os logótipos) da pasta do Tour para dentro deste projeto.
# Correr antes de publicar no GitHub/Render, sempre que o catálogo mudar.
# Se o catálogo do Tour ainda não tiver o campo "etf", mantém o ETF que já estava aqui.
set -e
cd "$(dirname "$0")"
ORIGEM="../tour-lisboa/dados"
python3 - "$ORIGEM/picks-catalogo.json" dados/picks-catalogo.json <<'PY'
import json, sys
novo = json.load(open(sys.argv[1], encoding='utf-8'))
try:
    antigo = json.load(open(sys.argv[2], encoding='utf-8'))
except Exception:
    antigo = {}
if 'etf' not in novo and 'etf' in antigo:
    novo['etf'] = antigo['etf']
    print('O catálogo do Tour não tem "etf": mantive o ETF que já estava (' + str(antigo['etf'].get('ticker')) + ').')
open(sys.argv[2], 'w', encoding='utf-8').write(json.dumps(novo, ensure_ascii=False, indent=2) + '\n')
PY
mkdir -p dados/logos
cp "$ORIGEM"/logos/*.png dados/logos/ 2>/dev/null || true
echo "Catálogo copiado para dados/ ($(ls dados/logos | wc -l | tr -d ' ') logótipos)."
