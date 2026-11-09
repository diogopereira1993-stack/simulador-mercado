# Jogo da sessão MoneyFlix

Jogo ao vivo para as sessões presenciais. Cada pessoa faz um check-in de 6 perguntas no telemóvel e recebe um perfil e um plano: 1.000€ para começar e o reforço que escolheu (50, 100, 150 ou 300€ por mês). O plano corre sozinho durante 7 anos de mercado simulado.

- Os perfis são todos 100% ações: **Índice** (um ETF de índice), **Índice + ações escolhidas** (70/30) e **Ações escolhidas** (35/65; na simulação oscilam 1,3 vezes o índice).
- Em 8 rondas aparece uma notícia; o apresentador lê-a e abre a votação, e a sala vota se o mercado sobe ou desce nos meses seguintes. As respostas seguem o que historicamente costuma acontecer.
- Depois de cada resposta há um exemplo histórico real, com gráfico, no ecrã grande e nos telemóveis.
- Na crise, cada pessoa decide se mantém o plano, se para os reforços um ano ou se vende tudo. O final mostra o que cada escolha mudou.

## Fase 2: constrói o teu portfólio

Depois do jogo, no mesmo telemóvel e sem a pessoa fazer nada: o perfil e o reforço mensal do check-in passam para «A tua carteira de exercício», com as MF Picks. O apresentador guia pelo cartão **Fase 2** do admin:

1. **Setores** — cada um escolhe os de que gosta ou de que gostava de saber mais; o ecrã mostra os mais escolhidos.
2. **Empresas** — setor a setor (do mais escolhido para o menos), lista de empresas com ficha (o que faz, setor, tipo, preço, desde quando está nas Picks); o + põe na carteira.
3. **Carteira** — 1.000€, 1.500€ ou outro; parte no ETF de índice (começa na do perfil do jogo); ações inteiras, com − e +.
4. **Plano** — o reforço mensal e um calendário de 12 meses: se a ação custa mais do que o reforço, junta meses e compra.
5. **Email** — «Queres receber o teu plano por email?», com caixa de consentimento.

«Voltar ao jogo» no admin mostra outra vez o jogo; reiniciar o jogo também recomeça esta fase. É um exercício educativo: nada aqui é uma recomendação.

Código: `portfolio.js` (servidor), `public/portfolio-plano.js` (as contas, iguais no servidor e no telemóvel), `public/portfolio-telemovel.js`, `public/portfolio-ecra.js`, `public/portfolio-admin.js`, `public/portfolio.css`.

**Catálogo das Picks.** O servidor lê, por esta ordem: `PICKS_FILE`, `dados/picks-catalogo.json` (dentro deste projeto) e `../tour-lisboa/dados/picks-catalogo.json`; se nenhum existir, usa o exemplo `dados/picks-exemplo.json` e o admin avisa. Os logótipos vêm da pasta `logos/` ao lado do catálogo e são servidos em `/logos/`. Depois de atualizar o catálogo, carrega em «Recarregar catálogo» no admin. **Para o Render:** copiar `tour-lisboa/dados/picks-catalogo.json` e a pasta `tour-lisboa/dados/logos/` para `dados/` dentro deste projeto antes de publicar.

## Endereços

- `/` — telemóvel dos jogadores (é para aqui que aponta o QR code do ecrã grande)
- `/ecra.html` — ecrã grande, para o projetor
- `/admin.html` — controlo e notas do apresentador, com login: utilizador `admin`, palavra-passe na variável `ADMIN_PASSWORD`
- `/export.csv` — as respostas da sessão (também no botão do admin), com o mesmo login; inclui o email e a carteira
- `/export.json` — tudo (jogo, portfólio, plano, email) para o relatório por email; formato em `EXPORT.md`

Os endereços antigos em `/10k/...` redirecionam para estes.

## Como correr

```
npm install
ADMIN_PASSWORD=uma-palavra-passe npm start
```

Sem `ADMIN_PASSWORD`, o admin usa a palavra-passe de teste `ws123` e o servidor avisa no arranque. A porta vem de `PORT` (3000 por omissão).

## No dia da sessão

1. Servidor num plano pago (o gratuito do Render adormece) e sem deploys nesse dia: o jogo guarda tudo em memória e um reinício apaga a sessão.
2. `ADMIN_PASSWORD` definida.
3. Abrir o servidor 30 minutos antes; no portátil do projetor, `/ecra.html` em ecrã inteiro; no telemóvel ou tablet do apresentador, `/admin.html`.
4. Testar a rede da sala com alguns telemóveis; levar um hotspot 4G de reserva.
5. No admin, o botão principal faz sempre o passo seguinte: abrir a votação, mostrar a história, avançar para a decisão na crise, e por aí fora.
6. No fim, **Exportar respostas (CSV)** e **Exportar tudo (JSON)** antes de reiniciar o jogo.

## Onde mudar o conteúdo

Tudo está no topo de `game10k.js`: os perfis, o mercado dos 7 anos, as 8 rondas (notícia, contexto, resposta, o que costuma acontecer, porquê) e o exemplo histórico de cada ronda (texto e pontos do gráfico).
