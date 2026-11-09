// A conta da carteira e do plano mensal, igual no servidor (require) e no telemóvel (window.PlanoMF).
// Tudo em ações inteiras, aos preços do catálogo (em euros).
//
// Regra: cada ativo tem uma parte-alvo (o ETF na percentagem escolhida, o resto dividido por igual pelas empresas).
// Compra-se sempre 1 ação do ativo que está mais abaixo da sua parte. No plano mensal, se ainda não chega,
// junta-se o reforço para o mês seguinte; empresas que levariam mais de MAX_ESPERA meses a juntar ficam para depois.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PlanoMF = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const MAX_ESPERA = 6;
    const MESES_PLANO = 12;
    const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const r2 = v => Math.round(v * 100) / 100;

    // Partes-alvo: { ETF: 0.7, JPM: 0.15, MU: 0.15 }. Sem empresas, tudo no ETF.
    function pesos(empresas, etfPct) {
        const w = {};
        const etf = empresas.length ? Math.min(1, Math.max(0, etfPct)) : 1;
        if (etf > 0) w.ETF = etf;
        empresas.forEach(t => { w[t] = (w[t] || 0) + (1 - etf) / empresas.length; });
        return w;
    }

    // Os ativos ordenados do que está mais abaixo da sua parte para o que está mais acima
    function ordenar(w, precos, acoes, caixa) {
        const tickers = Object.keys(w);
        const investido = tickers.reduce((s, t) => s + (acoes[t] || 0) * precos[t], 0);
        const total = investido + caixa;
        return tickers.map((t, i) => ({ t, i, falta: w[t] * total - (acoes[t] || 0) * precos[t] }))
            .sort((a, b) => b.falta - a.falta || a.i - b.i);
    }

    // A compra inicial automática: só compra enquanto a ação aproxima o ativo da sua parte (falta ≥ meia ação);
    // depois, com o que sobrar, 1 ação das empresas escolhidas que ainda não tenham nenhuma.
    // O resto fica por investir e entra no primeiro mês do plano.
    function encher(montante, w, precos) {
        const acoes = {};
        let caixa = montante;
        for (let guarda = 0; guarda < 5000; guarda++) {
            const c = ordenar(w, precos, acoes, caixa).find(x => precos[x.t] > 0 && precos[x.t] <= caixa + 1e-9 && x.falta >= precos[x.t] / 2);
            if (!c) break;
            acoes[c.t] = (acoes[c.t] || 0) + 1;
            caixa -= precos[c.t];
        }
        // Se sobrou dinheiro para 1 ação de uma empresa escolhida que ainda não tem nenhuma, compra-a:
        // quem escolheu empresas quer ver pelo menos uma na carteira (mesmo que passe um pouco da parte-alvo)
        for (let guarda = 0; guarda < 100; guarda++) {
            const c = ordenar(w, precos, acoes, caixa).find(x => x.t !== 'ETF' && !acoes[x.t] && x.falta > 0 && precos[x.t] > 0 && precos[x.t] <= caixa + 1e-9);
            if (!c) break;
            acoes[c.t] = 1;
            caixa -= precos[c.t];
        }
        return { acoes, sobra: r2(Math.max(0, caixa)) };
    }

    const custo = (acoes, precos) => r2(Object.keys(acoes).reduce((s, t) => s + (acoes[t] || 0) * (precos[t] || 0), 0));

    // Quantos meses de reforço para juntar 1 ação
    const mesesPara = (preco, reforco) => reforco > 0 ? Math.ceil(preco / reforco - 1e-9) : Infinity;

    // O plano mês a mês. inicio = { ano, mes } com mes de 0 a 11 (o primeiro mês do plano).
    function plano({ w, precos, acoes, caixa, reforco, inicio, meses = MESES_PLANO }) {
        const tenho = { ...acoes };
        let pote = caixa;
        const lista = [];
        for (let m = 0; m < meses; m++) {
            pote += reforco;
            const compras = {};
            let juntar = null;
            for (let guarda = 0; guarda < 500; guarda++) {
                // As empresas que levariam demasiado tempo a juntar ficam de fora do plano
                const c = ordenar(w, precos, tenho, pote).find(x => precos[x.t] > 0 && mesesPara(precos[x.t], reforco) <= MAX_ESPERA);
                if (!c) break;
                if (precos[c.t] > pote + 1e-9) { juntar = c.t; break; }
                tenho[c.t] = (tenho[c.t] || 0) + 1;
                compras[c.t] = (compras[c.t] || 0) + 1;
                pote -= precos[c.t];
            }
            const mesAbs = inicio.mes + m;
            lista.push({
                mes: m + 1,
                mes_texto: `${NOMES_MES[mesAbs % 12]} ${inicio.ano + Math.floor(mesAbs / 12)}`,
                reforco,
                compras: Object.keys(compras).map(t => ({ ticker: t, acoes: compras[t], valor: r2(compras[t] * precos[t]) })),
                a_juntar_para: juntar,   // a ação para que ficou dinheiro guardado (null se não ficou à espera de nenhuma)
                por_investir: r2(Math.max(0, pote))
            });
        }
        return { meses: lista, acoes: tenho, por_investir: r2(Math.max(0, pote)) };
    }

    // O mês a seguir a uma data (o plano começa no mês depois da sessão)
    function mesSeguinte(data) {
        const d = data || new Date();
        const m = d.getMonth() + 1;
        return { ano: d.getFullYear() + Math.floor(m / 12), mes: m % 12 };
    }

    return { MAX_ESPERA, MESES_PLANO, NOMES_MES, r2, pesos, ordenar, encher, custo, mesesPara, plano, mesSeguinte };
});
