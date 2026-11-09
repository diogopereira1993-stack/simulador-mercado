# Exportação do jogo e do portfólio

Dois endereços, os dois com o login do admin (utilizador `admin`, palavra-passe `ADMIN_PASSWORD`):

- `/export.csv` — uma linha por pessoa, para abrir no Excel (separador `;`, UTF-8 com BOM). As colunas do jogo ficam como estavam; no fim acrescentam-se as do portfólio (Email, Consentimento, Montante inicial, Reforço mensal, % no ETF, Empresas).
- `/export.json` — tudo, para gerar o relatório por email. Formato abaixo.

Exemplo de pedido:

```
curl -u admin:$ADMIN_PASSWORD https://<servidor>/export.json -o sessao.json
```

## `/export.json`

Valores em euros são números (não texto) e arredondados ao cêntimo. Datas em ISO 8601 (UTC). Um campo que a pessoa ainda não preencheu vem a `null` (ou `[]` nas listas); nada é omitido.

```jsonc
{
  "versao": 1,                            // 9 nov: + resultado_jogo.historico e chegou_10k_meses_se_mantivesse (aditivo)
  "exportado_em": "2026-11-14T12:31:05.000Z",
  "jogo_id": "k3j9x2ab",                  // muda quando o jogo é reiniciado
  "consentimento_texto": "Aceito que a MoneyFlix me envie este plano por email e guarde o meu email para esse fim. Posso pedir para o apagar a qualquer momento.",
  "catalogo": { "ficheiro": "tour-lisboa/dados/picks-catalogo.json", "exemplo": false },
  "cambio": { "EUR": 1, "USD": 0.8957, "CAD": 0.6367, "GBP": 1.15 },   // euros por unidade de cada moeda (do câmbio do catálogo), usado em preco_eur
  "etf": { "ticker": "ETF", "nome": "ETF de índice (S&P 500)", "preco_eur": 100, "ilustrativo": true },
  "jogadores": [
    {
      "id": "lq2k8f0x1m3n",                // identificador do telemóvel (não é dado pessoal)
      "nome": "Ana",
      "email": "ana@exemplo.pt",           // null se não pediu o plano ou não deu consentimento
      "consentimento": true,               // só true se marcou a caixa; sem consentimento, email é sempre null
      "consentimento_em": "2026-11-14T12:20:11.000Z",
      "quer_plano_por_email": true,        // true = pediu; false = disse que não; null = não chegou a responder
      "email_confirmado": true,            // confirmou no último ecrã («Sim, está certo»); volta a false se mudar o email
      "email_confirmado_em": "2026-11-14T12:21:40.000Z",

      "perfil": "misto",                   // "indice" | "misto" | "escolhidas"
      "perfil_nome": "Índice + ações escolhidas",

      "checkin": {                         // null se a pessoa entrou sem fazer o check-in
        "horizonte": "GT7",          "horizonte_texto": "Mais de 7 anos",
        "queda": "ESPERO",           "queda_texto": "Espero",
        "acompanhar": "AJUDA",       "acompanhar_texto": "Com ajuda",
        "reforco_mensal": 150,
        "fundo_emergencia": "SIM",   "fundo_emergencia_texto": "Sim",
        "experiencia": "NUNCA",      "experiencia_texto": "Nunca"
      },

      "resultado_jogo": {
        "valor_final": 14873.12,           // o plano no fim dos 7 anos simulados
        "do_bolso": 13600,                 // 1.000 € + reforços
        "do_mercado": 1273.12,
        "chegou_10k_em_meses": 61,         // null se não chegou nos 7 anos
        "chegou_10k_em_texto": "5 anos e 1 mês",
        "decisao_crise": "MANTENHO",       // "MANTENHO" | "PARO" | "VENDO" | null
        "decisao_crise_texto": "Mantive o plano",
        "valor_se_mantivesse": null,       // só para quem parou ou vendeu: o que teria se mantivesse
        "chegou_10k_meses_se_mantivesse": null,  // idem: em que mês chegaria aos 10K (null se não chegaria nos 7 anos)
        "historico": [1000, 1162, 1310],   // o valor do plano mês a mês, em euros inteiros (85 valores com o jogo terminado)
        "pior_queda": -0.31,               // maior queda desde um máximo (fração)
        "previsoes_certas": 5,
        "rondas": 8,
        "terminado": true                  // false se o jogo ainda não tinha acabado na exportação
      },

      "setores_escolhidos": [              // os setores que escolheu no primeiro passo
        { "id": "tecnologia", "nome": "Tecnologia" }
      ],
      "montante_inicial": 1000,
      "reforco_mensal": 150,               // o do portfólio (começa no do check-in; a pessoa pode mudar)
      "etf_percentagem": 0.7,              // a parte que quis no ETF de índice (0 a 1)

      "portfolio": [                       // a compra inicial, em ações inteiras; inclui o ETF se tiver unidades
        { "ticker": "ETF", "nome": "ETF de índice (S&P 500)", "setor": null, "setor_nome": null, "tipo": "indice",
          "acoes": 7, "preco": 100, "moeda": "EUR", "preco_eur": 100, "montante": 700 },
        { "ticker": "JPM", "nome": "JPMorgan Chase", "setor": "financeiro", "setor_nome": "Financeiro", "tipo": "defensiva",
          "acoes": 1, "preco": 335.19, "moeda": "USD", "preco_eur": 288.26, "montante": 288.26 }
      ],
      "empresas_escolhidas": [             // todas as que adicionou, mesmo as que ainda não deram para comprar
        { "ticker": "JPM", "nome": "JPMorgan Chase", "setor": "financeiro", "preco_eur": 288.26 },
        { "ticker": "MU", "nome": "Micron Technology", "setor": "tecnologia", "preco_eur": 785.76 }
      ],
      "por_investir": 11.74,               // o que sobrou da compra inicial; entra no primeiro mês do plano

      "plano": [                           // 12 meses, a começar no mês a seguir à sessão
        { "mes": 1, "mes_texto": "dez 2026", "reforco": 150,
          "compras": [ { "ticker": "ETF", "acoes": 1, "valor": 100 } ],
          "a_juntar_para": "MU",           // a ação para que ficou dinheiro guardado nesse mês (null se nenhuma)
          "por_investir": 61.74 },         // o que fica guardado para o mês seguinte
        { "mes": 2, "mes_texto": "jan 2027", "reforco": 150, "compras": [], "a_juntar_para": "MU", "por_investir": 211.74 }
      ],
      "juntar": [                          // empresas que custam mais do que o reforço: quantos meses junta para 1 ação
        { "ticker": "MU", "nome": "Micron Technology", "preco_eur": 785.76, "meses": 6, "no_plano": true }
      ],                                    // no_plano = false se demora mais de 6 meses e o plano deixa para depois

      "etapa": "EMAIL",                    // até onde chegou: SETORES | EMPRESAS | CARTEIRA | PLANO | EMAIL | null
      "atualizado_em": "2026-11-14T12:20:11.000Z"
    }
  ]
}
```

## Notas para quem gera o relatório

- Mandar email só a quem tem `consentimento: true` (o `email` vem `null` em todos os outros) e, de preferência, `email_confirmado: true`. O admin mostra «X emails confirmados de Y» antes de exportar.
- No CSV, a coluna «Email confirmado» diz o mesmo (Sim/Não).
- Só entram no exercício as Picks com `ativa` diferente de `false` e, quando o catálogo já tem a verificação da F24 (alguma empresa com `disponivel_f24: true`), as que não têm `disponivel_f24: false`.
- Os preços são os do catálogo das MF Picks no dia (`preco` e `moeda`); `preco_eur` usa o `cambio` acima. São aproximados: o relatório deve dizer «aos preços de [data do catálogo]».
- O plano usa a regra: todos os meses entra o reforço; compra-se 1 ação de cada vez do ativo que está mais abaixo da parte que a pessoa queria (ETF na `etf_percentagem`, o resto dividido por igual pelas empresas escolhidas); se não chega, junta para o mês seguinte. Empresas que demorariam mais de 6 meses a juntar ficam de fora do plano (`juntar[].no_plano = false`).
- É um exercício educativo, nunca uma recomendação: o texto do email não deve dizer «recomendamos» nem «deves comprar».
- Pessoas que jogaram mas não chegaram ao portfólio aparecem na mesma, com os campos do portfólio a `null` ou `[]`.
