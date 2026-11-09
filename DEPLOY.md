# Publicar o jogo no GitHub e no Render

Esta pasta funciona sozinha: o jogo, a fase do portfólio, o catálogo das MF Picks e os logótipos estão todos cá dentro (`dados/`). Não precisa de mais nada da pasta `mf`.

## 0. Antes de publicar

Se o catálogo das Picks mudou em `tour-lisboa/dados/`, copia-o para dentro do projeto:

```bash
./atualizar-catalogo.sh
```

E a apresentação da sessão (slides), de `tour-lisboa/apresentacao/` para `apresentacao/`:

```bash
./atualizar-apresentacao.sh
```

Copia só `index.html`, `dados-slides.js`, o logótipo e os logótipos das empresas; o plano B sem internet e os scripts de construção ficam de fora.

## 1. Criar o repositório no GitHub

Opção A, pelo site (mais simples):
1. Em github.com → **New repository**, por exemplo `jogo-moneyflix`, **Private**. Não acrescentes README nem .gitignore (já existem).
2. Na página do repositório vazio → **uploading an existing file** → arrasta o conteúdo desta pasta **sem** a pasta `node_modules` → **Commit changes**.

Opção B, pelo terminal (dentro desta pasta):

```bash
git init && git add . && git commit -m "Jogo da sessão + fase do portfólio"
```

```bash
git branch -M main && git remote add origin https://github.com/<a-tua-conta>/jogo-moneyflix.git && git push -u origin main
```

O `.gitignore` já deixa de fora `node_modules`, `.DS_Store` e as exportações (CSV/JSON com emails).

## 2. Ligar ao Render

1. render.com → **New** → **Web Service** → liga a conta do GitHub e escolhe o repositório.
   (Alternativa: **New → Blueprint**, que lê o `render.yaml` e preenche quase tudo.)
2. Configuração:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Auto-Deploy:** desligado (um deploy reinicia o jogo e apaga a sessão em curso)
3. **Environment** (variáveis):
   - `ADMIN_PASSWORD` — obrigatória. É a palavra-passe do `/admin.html` e das exportações (utilizador `admin`). Sem ela o admin fica com a palavra-passe de teste.
   - `F24_LINK` — opcional. Só se quiseres trocar o link de afiliado que já está no código.
   - `DATA_DIR` — `/var/data` (o caminho do disco persistente; ver 2b).
4. **Plano:**
   - **Grátis:** serve para ensaiar, mas o serviço adormece ao fim de ~15 min sem visitas e demora quase 1 minuto a acordar. E ao adormecer perde a sessão (está tudo em memória).
   - **Pago (Starter):** usar no dia da sessão. Passa para pago na véspera e volta ao grátis depois.
5. Depois do deploy, o endereço fica tipo `https://jogo-moneyflix.onrender.com`. É esse que vai para o QR da apresentação (`[URL DO JOGO]`).

## 2b. Não perder a sessão (importante: os emails de sábado dependem disto)

O servidor grava tudo em disco a cada alteração (check-in, votos, carteira, email), num ficheiro `estado.json` com uma cópia `estado.anterior.json`. Ao arrancar, recupera desse ficheiro: quem estava ligado volta ao mesmo sítio sem fazer nada, sem duplicados. Antes de «Reiniciar jogo» no admin, a sessão inteira (com o export) é arquivada num `arquivo-antes-de-reiniciar-<data>.json` que nunca é apagado.

O que acontece em cada plano do Render:

| | Grátis | Pago (Starter) **sem** disco | Pago (Starter) **com** disco persistente |
|---|---|---|---|
| Adormece sem visitas | Sim, ao fim de ~15 min | Não | Não |
| Reinício ou deploy | **Perde a sessão** (o disco é apagado) | **Perde a sessão** (o disco é apagado) | **Recupera tudo** |
| Para sábado | Não usar | Arriscado | **Usar este** |

Como pôr o disco persistente:
1. O serviço tem de estar num plano pago (Starter).
2. No serviço → **Disks** → **Add Disk**: nome `estado`, **Mount Path** `/var/data`, 1 GB (custa cêntimos por mês).
3. Em **Environment**, acrescentar `DATA_DIR` = `/var/data`.
4. Se usares o **Blueprint** (`render.yaml`), isto já vem preenchido.

Com o disco, um deploy demora uns segundos a mais (o Render para o antigo antes de arrancar o novo). Durante esses segundos os telemóveis mostram «a ligar» e voltam sozinhos.

**Segunda rede de segurança, no portátil do apresentador:** o `admin.html` puxa o `export.json` e o `export.csv` a cada minuto e guarda o último no próprio browser. O cartão «Fase 2» mostra «Última cópia às HH:MM, N pessoas, N emails» e tem os botões **Cópia local (JSON)** e **Cópia local (CSV)**, que funcionam mesmo com o servidor em baixo. Deixa o admin aberto nesse portátil durante toda a sessão.

**No fim da sessão, por esta ordem:**
1. Pedir à sala que confirme o email (o admin mostra quantos faltam).
2. **Exportar tudo (JSON)** e **Exportar respostas (CSV)** no admin, e guardar os dois ficheiros fora da pasta partilhada.
3. Só depois disso reiniciar o jogo ou mudar o plano do Render.

## 3. Verificar

- `https://<endereço>/` — telemóvel
- `https://<endereço>/ecra.html` — ecrã de sala (o QR para entrar aparece sozinho)
- `https://<endereço>/admin.html` — admin (pede `admin` + `ADMIN_PASSWORD`)
- `https://<endereço>/apresentacao/` — os slides da sessão (pede o mesmo login). Os QR do jogo nos slides devem apontar para este mesmo endereço.
- No admin, o cartão «Fase 2» deve dizer `Catálogo: simulador-mercado-main2/dados/picks-catalogo.json` (ou só `dados/...`) e **não** «EXEMPLO».

## No dia

- Abrir o serviço 30 min antes e não fazer deploys durante a sessão.
- No fim: **Exportar respostas (CSV)** e **Exportar tudo (JSON)** no admin, antes de reiniciar o jogo ou de mudar o plano do Render.
