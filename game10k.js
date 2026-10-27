// ==================================================
// O JOGO DA SESSÃO — consegues prever o mercado?
// Em cada ronda aparece uma notícia e a sala vota: nos próximos meses o mercado sobe ou desce?
// Por trás, o plano de cada jogador (1.000€ + o reforço que escolheu, no seu perfil) cresce sozinho até aos 10K.
// Entre rondas, um exemplo histórico real; na crise, cada um decide o que faz ao seu plano.
// ==================================================

const INITIAL = 1000;
const REF_MONTHLY = 150;            // o plano de referência do ecrã grande
const MONTHLY_OPTIONS = [50, 100, 150, 300];
const GOAL = 10000;
const TOTAL_MONTHS = 84;            // 7 anos
const VOTE_SECONDS = 25;            // por omissão; a ronda 1 tem mais tempo (seconds)
const DECIDE_SECONDS = 30;
const FAST_MS = 650;                // o mercado até à ronda seguinte (por mês), devagar para a sala acompanhar
const WINDOW_MS = 1250;             // meses da pergunta, mais devagar ainda (por mês)
const CASH_RATE = 0.01;             // depósito: onde fica o dinheiro de quem para ou vende
const DECISION_MONTHS = 12;         // quem para ou vende volta ao plano um ano depois
const PICKS_BETA = 1.3;             // simulação: as ações escolhidas oscilam 1,3 vezes o índice
const PICKS_NOISE = 0.015;          // e têm uma parte própria, que soma zero ao longo dos 7 anos
const PROJECTION_RATE = 0.07;       // para estimar quando chega aos 10K quem não chegou em 7 anos

// Todos os perfis são 100% ações; muda a parte num ETF de índice e a parte em ações escolhidas
const PROFILES = {
    indice:     { label: 'Índice',                    index: 1,    picks: 0 },
    misto:      { label: 'Índice + ações escolhidas', index: 0.7,  picks: 0.3 },
    escolhidas: { label: 'Ações escolhidas',          index: 0.35, picks: 0.65 }
};

const DECISIONS = {
    MANTENHO: 'Mantive o plano',
    PARO: 'Parei os reforços durante um ano',
    VENDO: 'Vendi tudo e esperei um ano'
};

// --- O MERCADO (7 anos) ---
// Por ano: troços [retorno total do índice, nº de meses, ruído mensal]. O ruído soma zero em cada troço,
// por isso cada troço fecha sempre no valor do guião.
const MARKET = [
    [[0.10, 12, 0.020]],                                        // Ano 1: calmo
    [[0.10, 6, 0.025], [0.09, 6, 0.025]],                        // Ano 2: euforia
    [[0.03, 3, 0.020], [-0.34, 6, 0.050], [0.04, 3, 0.040]],     // Ano 3: crise financeira
    [[0.28, 12, 0.040]],                                        // Ano 4: recuperação
    [[0.03, 4, 0.015], [-0.06, 2, 0.015], [0.09, 6, 0.015]],     // Ano 5: subida de juros
    [[0.06, 5, 0.020], [-0.17, 3, 0.040], [0.22, 4, 0.030]],     // Ano 6: choque sanitário
    [[0.08, 6, 0.020], [-0.04, 1, 0], [0.11, 5, 0.020]]          // Ano 7: expectativas
];

// Faixas sombreadas no gráfico do ecrã grande, quando o mercado lá chega
const BANDS = [
    { from: 27, to: 33, label: 'Crise financeira' },
    { from: 65, to: 68, label: 'Pandemia' }
];

// --- AS 8 RONDAS ---
// at = meses já decorridos quando a notícia sai; horizon = meses da pergunta.
// A resposta segue o que historicamente costuma acontecer naquela situação.
// historia = o exemplo real mostrado entre rondas. Números confirmados a 27 out 2026 com Yahoo Finance, FRED,
// os dados de Damodaran (NYU), o BLS e as notícias da época.
const ROUNDS = [
    {
        at: 0, horizon: 12, answer: 'SOBE',
        news: 'A economia cresce de forma estável.',
        context: 'As empresas estão a vender mais e os lucros sobem. O desemprego está baixo e os juros estáveis. É o primeiro mês do teu plano: 1.000€ investidos e um reforço todos os meses.',
        intro: 'Como jogar: lê a notícia e vota no telemóvel. Acertas se o mercado fizer o que disseste nos meses da pergunta.',
        seconds: 35,
        usual: 'Contando com os dividendos, a bolsa americana teve ganhos em cerca de 3 de cada 4 anos.',
        lesson: 'Os lucros das empresas crescem com a economia, e a prazo o preço das ações acompanha os lucros.',
        historia: {
            titulo: 'Quase um século de bolsa',
            texto: [
                'Desde 1928, contando com os dividendos, o S&P 500 (as 500 maiores empresas americanas) teve ganhos em cerca de 3 de cada 4 anos.',
                'Com os dividendos, rendeu em média perto de 10% ao ano, antes da inflação, com anos muito bons e anos muito maus pelo meio.',
                'Repara na década de 2000: duas crises, e o índice acabou mais baixo do que começou.'
            ],
            serie: { nome: 'S&P 500 no fim de cada década', pontos: [['1950', 20], ['1960', 58], ['1970', 92], ['1980', 136], ['1990', 330], ['2000', 1320], ['2010', 1258], ['2020', 3756]] }
        }
    },
    {
        at: 12, horizon: 6, answer: 'SOBE',
        news: 'A bolsa subiu 10% no último ano e toda a gente fala de investir.',
        context: 'Nas redes sociais só se fala de ganhos. Um amigo diz que ficou rico com uma só ação e pergunta porque é que ainda não puseste tudo nela. Os lucros das empresas continuam a crescer, mas os preços sobem mais depressa.',
        usual: 'Desde 1928, depois de um semestre a subir, o semestre seguinte também subiu em cerca de 7 de cada 10 vezes; depois de um semestre a descer, só em pouco mais de metade.',
        lesson: 'No curto prazo as tendências tendem a continuar (momentum). Mas na euforia os preços sobem mais depressa do que os lucros.',
        historia: {
            titulo: '1999: a bolha da internet',
            texto: [
                'Em 1999, com toda a gente a falar de empresas da internet, o Nasdaq subiu cerca de 86% num só ano, e continuou a subir até março de 2000.',
                'Depois caiu cerca de 78% até 2002, e só voltou ao máximo em 2015.',
                'A euforia pode durar mais do que parece, e acabar pior do que se espera.'
            ],
            serie: { nome: 'Nasdaq', pontos: [['dez 1998', 2193], ['dez 1999', 4069], ['mar 2000', 5049], ['out 2002', 1114], ['abr 2015', 5056]] }
        }
    },
    {
        at: 18, horizon: 6, answer: 'SOBE',
        news: 'Comentador famoso garante: "vem aí um crash".',
        context: 'Um comentador conhecido, que diz ter previsto a última crise, anuncia na televisão uma queda de 50% para breve. Entretanto, a economia continua a crescer e as empresas apresentam bons resultados.',
        usual: 'Desde 1950, a bolsa americana subiu em cerca de 7 de cada 10 períodos de 6 meses.',
        lesson: 'Há previsões de crash todos os anos. Uma acaba por acertar, mas quase nunca no momento; quem sai à espera perde as subidas.',
        historia: {
            titulo: '2010 a 2019: um crash anunciado todos os anos',
            texto: [
                'Depois da crise de 2008, não faltaram previsões de um novo crash, ano após ano.',
                'Entre 2010 e 2019, com os dividendos, o S&P 500 só teve um ano negativo: 2018, com cerca de −4%.',
                'Quem saiu à espera da queda perdeu uma década em que o investimento mais do que triplicou.'
            ],
            serie: { nome: 'S&P 500 no fim do ano', pontos: [['2009', 1115], ['2012', 1426], ['2015', 2044], ['2018', 2507], ['2019', 3231]] }
        }
    },
    {
        at: 27, horizon: 6, answer: 'DESCE',
        news: 'A economia entra em recessão e um grande banco entra em falência.',
        context: 'Os bancos emprestaram demasiado a quem não conseguia pagar. Um dos maiores bancos do mundo declara falência, o crédito seca e as empresas começam a despedir. A economia entra oficialmente em recessão.',
        usual: 'Nas recessões com crise financeira, a bolsa costuma cair muito: em média, cerca de metade do valor, numa descida que pode durar mais de um ano.',
        lesson: 'O mercado desconta lucros futuros mais baixos, e o pânico leva muita gente a vender ao mesmo tempo.',
        historia: {
            titulo: 'Setembro de 2008: a falência do Lehman Brothers',
            texto: [
                'O Lehman Brothers, um dos maiores bancos de investimento dos EUA, faliu a 15 de setembro de 2008.',
                'Entre outubro de 2007 e março de 2009, o S&P 500 caiu cerca de 57%.',
                'Quem estava investido viu a carteira cair para menos de metade. A pergunta é o que fazer a seguir.'
            ],
            serie: { nome: 'S&P 500', pontos: [['out 2007', 1565], ['set 2008', 1193], ['nov 2008', 752], ['mar 2009', 677]] }
        }
    },
    {
        at: 33, horizon: 12, answer: 'SOBE', decisao: true,   // antes desta notícia, cada um decide o que faz ao plano
        news: 'A bolsa já caiu mais de 30%. O desemprego continua a subir e na televisão dizem que "é o fim".',
        context: 'As notícias são todas más e muitos investidores já venderam tudo. Os bancos centrais cortaram os juros para perto de zero e os governos anunciam planos de apoio, mas a economia ainda não melhorou.',
        usual: 'Depois de quedas de mais de 30%, a bolsa costuma recuperar antes de a economia melhorar, muitas vezes com subidas fortes.',
        lesson: 'A bolsa antecipa: costuma recuperar meses antes de a economia e o desemprego melhorarem. Quando as notícias parecem as piores, o preço já reflete o pior.',
        historia: {
            titulo: 'Março de 2009: o fundo chegou com as piores notícias',
            texto: [
                'A bolsa tocou no fundo a 9 de março de 2009. O desemprego nos EUA só atingiu o máximo, 10%, em outubro, sete meses depois.',
                'Nos 12 meses seguintes, o S&P 500 subiu cerca de 68%, e em 2013 já estava acima do máximo de 2007.',
                'Em 2020 repetiu-se: a bolsa recuperou a partir de 23 de março, e o desemprego só atingiu o máximo em abril.'
            ],
            serie: { nome: 'S&P 500', pontos: [['mar 2009', 677], ['set 2009', 1057], ['mar 2010', 1140], ['mar 2013', 1569]] }
        }
    },
    {
        at: 65, horizon: 1, answer: 'DESCE',
        news: 'Nova ameaça sanitária global. Países fecham fronteiras.',
        context: 'Um novo vírus espalha-se rapidamente. Vários países fecham fronteiras e lojas, fábricas param e ninguém sabe quanto tempo isto vai durar.',
        usual: 'Choques súbitos costumam provocar uma queda rápida logo a seguir à notícia.',
        lesson: 'Com incerteza máxima, os investidores vendem primeiro e analisam depois.',
        historia: {
            titulo: 'Fevereiro e março de 2020: a pandemia',
            texto: [
                'Entre 19 de fevereiro e 23 de março de 2020, o S&P 500 caiu cerca de 34%: a queda de 30% mais rápida da história.',
                'Ninguém sabia quanto tempo ia durar, e muita gente vendeu perto do pior momento.'
            ],
            serie: { nome: 'S&P 500 em 2020', pontos: [['2 jan', 3258], ['19 fev', 3386], ['23 mar', 2237]] }
        }
    },
    {
        at: 68, horizon: 4, answer: 'SOBE',
        news: 'Tratamento aprovado. A economia reabre.',
        context: 'Foi aprovado um tratamento eficaz. Os países começam a reabrir, as pessoas voltam a viajar e a consumir, e as empresas retomam a produção.',
        usual: 'Depois de choques que não destroem a economia, a bolsa costuma recuperar em poucos meses.',
        lesson: 'O choque era temporário: os lucros a prazo mudaram muito menos do que o pânico fez parecer.',
        historia: {
            titulo: 'Novembro de 2020: a primeira vacina',
            texto: [
                'Em agosto de 2020, cinco meses depois do fundo, o S&P 500 já tinha voltado ao máximo de antes da pandemia.',
                'A 9 de novembro foi anunciada a primeira vacina eficaz. Nesse mês, o S&P 500 subiu cerca de 11%.',
                'O ano da pandemia acabou com a bolsa em máximos históricos.'
            ],
            serie: { nome: 'S&P 500 em 2020', pontos: [['23 mar', 2237], ['18 ago', 3390], ['30 out', 3270], ['31 dez', 3756]] }
        }
    },
    {
        at: 78, horizon: 1, answer: 'DESCE',
        news: 'Empresas apresentam lucros recorde, mas abaixo do que os analistas esperavam.',
        context: 'As empresas ganharam mais dinheiro do que nunca. Mas os analistas esperavam lucros ainda maiores, e o preço das ações já contava com isso.',
        usual: 'Resultados abaixo das expectativas costumam fazer o preço cair, mesmo com lucros recorde.',
        lesson: 'O preço já incluía o que se esperava. O que mexe o mercado é a surpresa, não a notícia em si.',
        historia: {
            titulo: 'Fevereiro de 2022: a Meta cai 26% num dia',
            texto: [
                'A Meta (Facebook) apresentou receitas recorde, mas previsões abaixo do esperado e, pela primeira vez, uma descida dos utilizadores diários do Facebook.',
                'A ação caiu cerca de 26% num só dia e, em novembro de 2022, já tinha perdido mais de três quartos do valor face ao máximo de 2021.',
                'Numa carteira só com essa empresa, é um desastre. Numa carteira com várias empresas e um índice por baixo, é uma entre muitas.'
            ],
            serie: { nome: 'Meta (ação, em dólares)', pontos: [['set 2021', 382], ['2 fev 2022', 323], ['3 fev 2022', 238], ['nov 2022', 89], ['2 fev 2024', 475]] }
        }
    }
];

// --- CHECK-IN: as 6 perguntas e as respostas válidas (os textos estão no telemóvel) ---
// horizon, drop e interest decidem o perfil sugerido; monthly é o reforço do plano; o resto serve para conhecer a sala.
const SURVEY = {
    horizon:    ['LT3', '3A7', 'GT7'],
    drop:       ['VENDO', 'ESPERO', 'REFORCO'],
    interest:   ['SIMPLES', 'AJUDA', 'GOSTO'],
    monthly:    MONTHLY_OPTIONS.map(String),
    emergency:  ['SIM', 'MAIS_MENOS', 'NAO'],
    experience: ['NUNCA', 'EXPERIMENTEI', 'REGULAR']
};

function cleanAnswers(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const out = {};
    for (const [k, options] of Object.entries(SURVEY)) {
        if (!options.includes(String(raw[k]))) return null;
        out[k] = String(raw[k]);
    }
    return out;
}

// --- CONCLUSÃO: o mesmo plano de referência com rentabilidades médias constantes (cenários hipotéticos) ---
const SCENARIO_RATES = [0.07, 0.10, 0.15];   // 7% = referência da média do mercado
const SCENARIO_YEARS = [7, 10, 15, 30];
const CONCLUSION_MONTHLY = [150, 300];   // a conclusão mostra primeiro 150€ por mês e depois 300€
function buildScenarios(monthly) {
    const rates = SCENARIO_RATES.map(R => {
        const r = Math.pow(1 + R, 1 / 12) - 1;
        let v = INITIAL, hitMonth = null;
        const byYear = {};
        for (let m = 1; m <= 30 * 12; m++) {
            v = v * (1 + r) + monthly;
            if (hitMonth === null && v >= GOAL) hitMonth = m;
            if (m % 12 === 0 && SCENARIO_YEARS.includes(m / 12)) byYear[m / 12] = Math.round(v);
        }
        return { rate: R, byYear, hitMonth };
    });
    const pocket = Object.fromEntries(SCENARIO_YEARS.map(y => [y, INITIAL + monthly * 12 * y]));
    return { monthly, years: SCENARIO_YEARS, pocket, pocketHit: Math.ceil((GOAL - INITIAL) / monthly), rates };
}
const SCENARIOS = Object.fromEntries(CONCLUSION_MONTHLY.map(m => [m, buildScenarios(m)]));

function gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function windowReturn(path, from, months) {
    let c = 1;
    for (let m = from; m < from + months; m++) c *= 1 + path[m];
    return c - 1;
}

// 84 retornos mensais do índice. Se o ruído trocar a resposta de alguma ronda, gera outra vez.
function buildIndexPath() {
    for (let attempt = 0; attempt < 200; attempt++) {
        const path = [];
        MARKET.forEach(year => year.forEach(([total, months, noise]) => {
            const base = Math.log(1 + total) / months;
            const shocks = Array.from({ length: months }, () => gaussian() * noise);
            const mean = shocks.reduce((a, b) => a + b, 0) / months;
            shocks.forEach(s => path.push(Math.exp(base + s - mean) - 1));
        }));
        const ok = ROUNDS.every(r => (windowReturn(path, r.at, r.horizon) > 0) === (r.answer === 'SOBE'));
        if (ok) return path;
    }
    throw new Error('Guião do mercado incoerente com as respostas das rondas');
}

// As ações escolhidas: 1,3 vezes o índice, mais uma parte própria que soma zero nos 7 anos
function buildPicksPath(index) {
    const own = index.map(() => gaussian() * PICKS_NOISE);
    const mean = own.reduce((a, b) => a + b, 0) / own.length;
    return index.map((r, m) => Math.max(-0.9, PICKS_BETA * r + own[m] - mean));
}

// Quanto tempo demorou, em anos e meses
function duracao(meses) {
    const a = Math.floor(meses / 12), m = meses % 12;
    const anos = a ? `${a} ${a === 1 ? 'ano' : 'anos'}` : '', ms = m ? `${m} ${m === 1 ? 'mês' : 'meses'}` : '';
    return anos && ms ? `${anos} e ${ms}` : (anos || ms);
}

function monthsToGoal(value, monthly) {
    // Quantos meses faltam para os 10K a uma média de 7% ao ano (para quem não chegou nos 7 anos do jogo)
    const r = Math.pow(1 + PROJECTION_RATE, 1 / 12) - 1;
    let v = value, m = 0;
    while (v < GOAL && m < 600) { v = v * (1 + r) + monthly; m++; }
    return m;
}

module.exports = function setupGame10k(io, opts = {}) {
    const nsp = io.of('/');
    const adminKey = opts.adminKey; // os pedidos de admin trazem esta chave (lida pela página protegida)
    const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    // --- Um plano: investimento + depósito, mês a mês ---
    function newPlan(profile, monthly, decision = 'MANTENHO') {
        return { profile, monthly, decision, inv: INITIAL, cash: 0, pocket: INITIAL, value: INITIAL, hitMonth: null,
            nav: 1, peakNav: 1, worstDrawdown: 0, history: [INITIAL], pocketHistory: [INITIAL] };
    }
    function profileReturn(profile, m) {
        const p = PROFILES[profile];
        return p.index * game.index[m] + p.picks * game.picks[m];
    }
    function sellAll(plan) { plan.cash += plan.inv; plan.inv = 0; }
    function stepPlan(plan, m) {
        const r = profileReturn(plan.profile, m);
        plan.inv *= 1 + r;
        plan.cash *= 1 + (Math.pow(1 + CASH_RATE, 1 / 12) - 1);
        plan.nav *= 1 + r;
        plan.peakNav = Math.max(plan.peakNav, plan.nav);
        plan.worstDrawdown = Math.min(plan.worstDrawdown, plan.nav / plan.peakNav - 1);
        // Quem parou ou vendeu põe os reforços no depósito durante um ano; quem vendeu volta a investir tudo no fim desse ano
        const d = game.decidedAt;
        const away = d !== null && plan.decision !== 'MANTENHO' && m >= d && m < d + DECISION_MONTHS;
        if (away) plan.cash += plan.monthly; else plan.inv += plan.monthly;
        if (d !== null && plan.decision === 'VENDO' && m + 1 === d + DECISION_MONTHS) { plan.inv += plan.cash; plan.cash = 0; }
        plan.pocket += plan.monthly;
        plan.value = plan.inv + plan.cash;
        if (plan.hitMonth === null && plan.value >= GOAL) plan.hitMonth = m + 1;
        plan.history.push(Math.round(plan.value));
        plan.pocketHistory.push(plan.pocket);
    }
    const drawdown = plan => plan.nav / plan.peakNav - 1;

    let game;
    let sound = true;   // sons do ecrã grande; liga e desliga no admin e sobrevive a reiniciar o jogo
    function resetGame() {
        const index = buildIndexPath();
        game = {
            id: Math.random().toString(36).slice(2, 10),
            // LOBBY | FAST | DECIDE | NEWS | VOTING | WINDOW | REVEAL | HISTORY | FINISHED | CONCLUSION   (+ paused)
            status: 'LOBBY',
            paused: false,
            month: 0,
            round: -1,                // índice da ronda atual
            target: 0,                // mês até onde o mercado está a correr
            voteEndsAt: null,
            decideEndsAt: null,
            decidedAt: null,          // mês em que a sala decidiu o que fazer na crise
            conclusion: null,         // o reforço mensal que a conclusão está a mostrar
            index,
            picks: buildPicksPath(index),
            news: 'O jogo vai começar. Faz o check-in e entra.',
            // Planos de referência (1.000€ + 150€/mês): os três perfis no ecrã grande e o Índice com cada decisão
            refs: {
                indice: newPlan('indice', REF_MONTHLY), misto: newPlan('misto', REF_MONTHLY), escolhidas: newPlan('escolhidas', REF_MONTHLY),
                parou: newPlan('indice', REF_MONTHLY, 'PARO'), vendeu: newPlan('indice', REF_MONTHLY, 'VENDO'),
                // o perfil equilibrado com cada reforço, para o gráfico do fim
                misto50: newPlan('misto', 50), misto100: newPlan('misto', 100), misto300: newPlan('misto', 300)
            },
            history: [{ month: 0, pocket: INITIAL, indice: INITIAL, misto: INITIAL, escolhidas: INITIAL }],
            results: [],              // por ronda: { answer, marketReturn, votes, correct }
            players: new Map()        // playerId -> { name, profile, monthly, answers, score, vote, votes, decision, plan, kept }
        };
    }
    resetGame();

    let timer = null;
    function stop() { if (timer) { clearTimeout(timer); clearInterval(timer); timer = null; } }

    // --- O mercado corre mês a mês até game.target ---
    function stepMonth() {
        const m = game.month;
        Object.values(game.refs).forEach(p => stepPlan(p, m));
        game.players.forEach(p => { stepPlan(p.plan, m); if (p.kept) stepPlan(p.kept, m); });
        game.month = m + 1;
        game.history.push({ month: game.month, pocket: game.refs.indice.pocket,
            indice: game.refs.indice.value, misto: game.refs.misto.value, escolhidas: game.refs.escolhidas.value });
    }

    function runTo(target, ms, onDone) {
        stop();
        game.target = target;
        if (game.month >= target) return onDone();
        timer = setInterval(() => {
            if (game.paused) return;
            stepMonth();
            if (game.month >= target) { stop(); onDone(); } else broadcast();
        }, ms);
    }

    // --- Fluxo: um só botão "Seguinte" no admin avança para o passo que vem a seguir ---
    // ronda: FAST → (DECIDE) → NEWS → VOTING → WINDOW → REVEAL → HISTORY → próxima ronda
    function next() {
        const s = game.status;
        if (s === 'LOBBY' || s === 'HISTORY') return goToRound(game.round + 1);
        if (s === 'REVEAL') return showHistory();
        if (s === 'NEWS') return openVote();
        if (s === 'VOTING') return closeVote();
        if (s === 'DECIDE') return closeDecision();
    }

    function goToRound(i) {
        if (i >= ROUNDS.length) {
            game.round = ROUNDS.length;   // depois da última ronda: só o plano até ao fim dos 7 anos
            game.status = 'FAST';
            game.news = 'Os últimos meses do teu plano.';
            runTo(TOTAL_MONTHS, FAST_MS, finish);
            return broadcast();
        }
        game.round = i;
        game.status = 'FAST';
        game.news = 'O tempo passa. O teu plano continua: um reforço todos os meses.';
        runTo(ROUNDS[i].at, FAST_MS, () => (ROUNDS[i].decisao && game.decidedAt === null ? openDecision() : showNews()));
        broadcast();
    }

    function openDecision() {
        stop();
        game.status = 'DECIDE';
        game.news = 'A tua carteira está a cair. O que fazes ao teu plano?';
        game.decideEndsAt = Date.now() + DECIDE_SECONDS * 1000;
        timer = setTimeout(closeDecision, DECIDE_SECONDS * 1000);
        broadcast();
    }

    function closeDecision() {
        if (game.status !== 'DECIDE') return;
        stop();
        game.decideEndsAt = null;
        game.decidedAt = game.month;
        // Quem não escolheu, mantém. Quem não mantém leva ao lado o plano que teria se mantivesse.
        game.players.forEach(p => {
            if (!p.decision) p.decision = 'MANTENHO';
            p.plan.decision = p.decision;
            if (p.decision !== 'MANTENHO') {
                p.kept = JSON.parse(JSON.stringify(p.plan));
                p.kept.decision = 'MANTENHO';
            }
            if (p.decision === 'VENDO') sellAll(p.plan);
        });
        sellAll(game.refs.vendeu);
        showNews();
    }

    function showNews() {
        stop();
        const r = ROUNDS[game.round];
        game.status = 'NEWS';
        game.news = r.news;
        game.players.forEach(p => { p.vote = null; });
        broadcast();
    }

    function openVote() {
        const r = ROUNDS[game.round];
        game.status = 'VOTING';
        const seconds = r.seconds || VOTE_SECONDS;
        game.voteEndsAt = Date.now() + seconds * 1000;
        stop();
        timer = setTimeout(closeVote, seconds * 1000);
        broadcast();
    }

    function closeVote() {
        if (game.status !== 'VOTING') return;
        stop();
        game.voteEndsAt = null;
        game.status = 'WINDOW';
        const r = ROUNDS[game.round];
        runTo(r.at + r.horizon, WINDOW_MS, reveal);
        broadcast();
    }

    function reveal() {
        const r = ROUNDS[game.round];
        const votes = voteCounts();
        let correct = 0;
        game.players.forEach(p => {
            const hit = p.vote === r.answer;
            p.votes[game.round] = { vote: p.vote, hit };
            if (hit) { p.score++; correct++; }
        });
        game.results[game.round] = { answer: r.answer, marketReturn: windowReturn(game.index, r.at, r.horizon), votes, correct };
        game.status = 'REVEAL';
        broadcast();
    }

    function showHistory() {
        stop();
        game.status = 'HISTORY';
        broadcast();
    }

    function finish() {
        stop();
        game.status = 'FINISHED';
        game.news = 'Fim do jogo. Olha para o teu telemóvel.';
        broadcast();
    }

    function voteCounts() {
        const c = { SOBE: 0, DESCE: 0, none: 0 };
        game.players.forEach(p => { if (p.vote) c[p.vote]++; else c.none++; });
        return c;
    }

    function decisionCounts() {
        const c = { MANTENHO: 0, PARO: 0, VENDO: 0, none: 0 };
        game.players.forEach(p => { if (p.decision) c[p.decision]++; else c.none++; });
        return c;
    }

    // O resultado real da sala, por reforço mensal: cada pessoa vê o seu no telemóvel, o ecrã mostra os grupos
    function byMonthly() {
        return MONTHLY_OPTIONS.map(monthly => {
            const plans = [...game.players.values()].filter(p => p.monthly === monthly).map(p => p.plan);
            if (!plans.length) return null;
            const value = plans.reduce((a, p) => a + p.value, 0) / plans.length;
            const hits = plans.map(p => p.hitMonth).filter(Boolean).sort((a, b) => a - b);
            const reached = hits.length * 2 >= plans.length;   // a maioria chegou: mostra o tempo do meio
            return { monthly, people: plans.length, value, pocket: INITIAL + monthly * TOTAL_MONTHS,
                hitMonth: reached ? hits[Math.floor((hits.length - 1) / 2)] : null,
                projectedMonth: reached ? null : TOTAL_MONTHS + monthsToGoal(value, monthly) };
        }).filter(Boolean);
    }

    function ranking() {
        const list = [];
        game.players.forEach((p, id) => list.push({ id, name: p.name, profile: PROFILES[p.profile].label, score: p.score }));
        return list.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    }

    // O retrato da sala a partir do check-in
    function surveyStats() {
        const s = { answered: 0, profiles: { indice: 0, misto: 0, escolhidas: 0 }, noEmergency: 0, wouldSell: 0, neverInvested: 0, monthlySum: 0 };
        game.players.forEach(p => {
            s.profiles[p.profile]++;
            s.monthlySum += p.monthly;
            if (!p.answers) return;
            s.answered++;
            if (p.answers.emergency === 'NAO') s.noEmergency++;
            if (p.answers.drop === 'VENDO') s.wouldSell++;
            if (p.answers.experience === 'NUNCA') s.neverInvested++;
        });
        s.avgMonthly = game.players.size ? Math.round(s.monthlySum / game.players.size) : 0;
        return s;
    }

    function dateOf(m) {
        // Mês em curso: com 0 meses decorridos estamos em janeiro do ano 1
        return { year: Math.min(Math.floor(m / 12) + 1, 7), monthLabel: monthNames[m % 12] };
    }

    const planSummary = p => ({ value: p.value, hitMonth: p.hitMonth, worstDrawdown: p.worstDrawdown, drawdown: drawdown(p), pocket: p.pocket });

    function publicState() {
        const r = ROUNDS[game.round];
        const d = dateOf(Math.min(game.month, TOTAL_MONTHS - 1));
        const s = game.status;
        const showRound = r && ['NEWS', 'VOTING', 'WINDOW', 'REVEAL', 'HISTORY'].includes(s);
        const result = s === 'REVEAL' ? game.results[game.round] : null;
        const ranked = ranking();
        const scores = ranked.map(p => p.score);
        const survey = surveyStats();
        const decided = game.decidedAt !== null;
        const over = s === 'FINISHED' || s === 'CONCLUSION';
        return {
            gameId: game.id,
            status: s,
            paused: game.paused,
            sound,
            month: game.month,
            year: d.year,
            monthLabel: d.monthLabel,
            totalRounds: ROUNDS.length,
            round: game.round,                       // índice da ronda atual (-1 antes da primeira)
            goal: GOAL,
            voteSeconds: VOTE_SECONDS,
            firstVoteSeconds: ROUNDS[0].seconds || VOTE_SECONDS,
            decideSeconds: DECIDE_SECONDS,
            afterDecision: !!(r && r.decisao && decided && showRound),   // a ronda que vem logo depois da decisão na crise
            news: game.news,
            question: showRound ? questionText(r) : null,
            context: showRound && s !== 'HISTORY' ? r.context : null,
            intro: showRound && (s === 'NEWS' || s === 'VOTING') ? (r.intro || null) : null,
            historia: s === 'HISTORY' && r ? r.historia : null,
            nextIsDecision: s === 'HISTORY' && ROUNDS[game.round + 1] && ROUNDS[game.round + 1].decisao && !decided,
            callback: s === 'DECIDE' && survey.answered
                ? `No check-in, ${Math.round(survey.wouldSell / survey.answered * 100)}% de vocês disseram que vendiam tudo se a carteira caísse 30%.`
                : null,
            survey,
            voteEndsAt: game.voteEndsAt,
            decideEndsAt: game.decideEndsAt,
            serverNow: Date.now(),
            voted: s === 'VOTING' ? voteCounts().SOBE + voteCounts().DESCE : null,
            // A divisão dos votos só aparece depois de a votação fechar, para ninguém ir atrás da maioria
            votes: s === 'WINDOW' || result ? voteCounts() : null,
            decisions: s === 'DECIDE' ? { answered: game.players.size - decisionCounts().none } : (decided ? decisionCounts() : null),
            result: result && { ...result, usual: r.usual, lesson: r.lesson, horizon: r.horizon },
            players: game.players.size,
            // O perfil equilibrado mês a mês com cada reforço, para o gráfico do fim
            monthlyLines: over ? { 50: game.refs.misto50.history, 100: game.refs.misto100.history, 150: game.refs.misto.history, 300: game.refs.misto300.history } : null,
            avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
            scenarios: over ? SCENARIOS[game.conclusion || CONCLUSION_MONTHLY[0]] : null,
            nextConclusion: s === 'CONCLUSION' ? CONCLUSION_MONTHLY[CONCLUSION_MONTHLY.indexOf(game.conclusion) + 1] || null : CONCLUSION_MONTHLY[0],
            byMonthly: over ? byMonthly() : null,
            refs: Object.fromEntries(Object.entries(game.refs).map(([k, p]) => [k, planSummary(p)])),
            bands: BANDS.filter(b => game.month >= b.from)
        };
    }

    function questionText(r) {
        return r.horizon === 1 ? 'No próximo mês, o mercado sobe ou desce?' : `Nos próximos ${r.horizon} meses, o mercado sobe ou desce?`;
    }

    function playerView(p, id) {
        const plan = p.plan;
        const over = game.status === 'FINISHED' || game.status === 'CONCLUSION';
        return {
            name: p.name,
            profile: p.profile,
            profileLabel: PROFILES[p.profile].label,
            monthly: p.monthly,
            value: plan.value,
            pocket: plan.pocket,
            market: plan.value - plan.pocket,
            cash: plan.cash,
            drawdown: drawdown(plan),
            hitMonth: plan.hitMonth,
            // Quem não chegou aos 10K nos 7 anos: em que mês chegaria a 7% ao ano
            projectedMonth: over && !plan.hitMonth ? TOTAL_MONTHS + monthsToGoal(plan.value, p.monthly) : null,
            score: p.score,
            vote: p.vote,
            decision: p.decision,
            decisionLabel: p.decision && game.decidedAt !== null ? DECISIONS[p.decision] : null,
            kept: p.kept ? { value: p.kept.value, hitMonth: p.kept.hitMonth } : null,
            lastHit: game.status === 'REVEAL' && p.votes[game.round] ? p.votes[game.round].hit : null,
            spark: plan.history,                     // o plano mês a mês, para o mini-gráfico
            sparkPocket: plan.pocketHistory
        };
    }

    function broadcast() {
        // A vista de cada jogador vai antes do estado geral, para o ecrã final já ter os números certos
        game.players.forEach((p, id) => nsp.to('p:' + id).emit('me', playerView(p, id)));
        nsp.emit('state', publicState());
        nsp.to('screen').emit('screen', { history: game.history });
        const roster = [];
        game.players.forEach(p => roster.push({ name: p.name, profile: PROFILES[p.profile].label, monthly: p.monthly, score: p.score, vote: p.vote, decision: p.decision }));
        roster.sort((a, b) => b.score - a.score);
        nsp.to('admin').emit('admin', { roster, rounds: ROUNDS.map(r => ({ ...r, question: questionText(r) })) });
    }

    // Votos e entradas não esperam pelo próximo mês, mas juntam-se para não inundar 50 telemóveis
    let pending = null;
    function broadcastSoon() {
        if (pending) return;
        pending = setTimeout(() => { pending = null; broadcast(); }, 300);
    }

    nsp.on('connection', socket => {
        socket.emit('state', publicState());

        socket.on('join', ({ playerId, name, profile, monthly, answers } = {}) => {
            if (!playerId || !PROFILES[profile]) return;
            const cleanName = String(name || '').trim().slice(0, 20) || 'Investidor';
            const cleanMonthly = MONTHLY_OPTIONS.includes(Number(monthly)) ? Number(monthly) : REF_MONTHLY;
            let p = game.players.get(playerId);
            if (!p) {
                // Quem entra a meio começa com o plano de referência do seu perfil, ajustado ao seu reforço
                const plan = newPlan(profile, cleanMonthly);
                for (let m = 0; m < game.month; m++) stepPlan(plan, m);
                p = { name: cleanName, profile, monthly: cleanMonthly, answers: cleanAnswers(answers), score: 0, vote: null, votes: [], decision: null, plan, kept: null };
                game.players.set(playerId, p);
            } else if (game.status === 'LOBBY') {
                // Antes da primeira ronda ainda se pode refazer o check-in ou mudar de perfil
                Object.assign(p, { name: cleanName, profile, monthly: cleanMonthly, answers: cleanAnswers(answers) || p.answers, plan: newPlan(profile, cleanMonthly) });
            }
            socket.data.playerId = playerId;
            socket.join('p:' + playerId);
            socket.emit('joined', { gameId: game.id });
            socket.emit('me', playerView(p, playerId));
            broadcastSoon();
        });

        // O voto e a decisão trazem o playerId: funcionam mesmo que a ligação tenha caído e voltado sem novo "join"
        function playerOf(payload) {
            if (payload && payload.playerId && !socket.data.playerId && game.players.has(payload.playerId)) {
                socket.data.playerId = payload.playerId;
                socket.join('p:' + payload.playerId);
            }
            return game.players.get(socket.data.playerId);
        }

        socket.on('vote', payload => {
            const choice = typeof payload === 'string' ? payload : payload && payload.choice;
            const p = playerOf(payload);
            if (!p || game.status !== 'VOTING' || !(choice === 'SOBE' || choice === 'DESCE')) return;
            p.vote = choice;
            socket.emit('me', playerView(p, socket.data.playerId));
            broadcastSoon();
        });

        socket.on('decide', payload => {
            const p = playerOf(payload);
            const choice = payload && payload.choice;
            if (!p || game.status !== 'DECIDE' || !DECISIONS[choice]) return;
            p.decision = choice;
            socket.emit('me', playerView(p, socket.data.playerId));
            broadcastSoon();
        });

        socket.on('register-screen', () => {
            socket.join('screen');
            socket.emit('screen', { history: game.history });
        });

        socket.on('register-admin', key => {
            if (adminKey && key !== adminKey) return;
            socket.data.isAdmin = true;
            socket.join('admin');
            broadcast();
        });

        socket.on('admin', ({ command } = {}) => {
            if (!socket.data.isAdmin) return;
            if (command === 'NEXT' || command === 'NEXT_ROUND') next();
            if (command === 'CLOSE_VOTE') closeVote();
            if (command === 'SOUND_ON') sound = true;
            if (command === 'SOUND_OFF') sound = false;
            if (command === 'PAUSE') game.paused = true;
            if (command === 'RESUME') game.paused = false;
            if (command === 'FINISH') finish();
            // A conclusão tem dois passos: primeiro com 150€ por mês, depois com 300€
            if (command === 'SHOW_CONCLUSION' && game.status === 'FINISHED') { game.status = 'CONCLUSION'; game.conclusion = CONCLUSION_MONTHLY[0]; }
            else if (command === 'SHOW_CONCLUSION' && game.status === 'CONCLUSION') game.conclusion = CONCLUSION_MONTHLY[CONCLUSION_MONTHLY.indexOf(game.conclusion) + 1] || game.conclusion;
            if (command === 'HIDE_CONCLUSION' && game.status === 'CONCLUSION') game.status = 'FINISHED';
            if (command === 'RESET') { stop(); resetGame(); }
            broadcast();
        });
    });

    // --- EXPORTAÇÃO CSV (check-in + jogo), para guardar no fim de cada sessão ---
    // Separador ";" e BOM UTF-8 para o Excel em português abrir com acentos e colunas certas.
    const LABELS = {
        horizon:    { LT3: 'Menos de 3 anos', '3A7': '3 a 7 anos', GT7: 'Mais de 7 anos' },
        drop:       { VENDO: 'Vendo tudo', ESPERO: 'Espero', REFORCO: 'Reforço' },
        interest:   { SIMPLES: 'Quer algo simples', AJUDA: 'Com ajuda', GOSTO: 'Gosta de analisar' },
        emergency:  { SIM: 'Sim', MAIS_MENOS: 'Mais ou menos', NAO: 'Não' },
        experience: { NUNCA: 'Nunca', EXPERIMENTEI: 'Já experimentei', REGULAR: 'Regularmente' }
    };
    function csvCell(v) {
        const s = v === null || v === undefined ? '' : String(v);
        return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }
    function exportCsv() {
        const header = ['Nome', 'Perfil', 'Reforço por mês', 'Quando precisa do dinheiro', 'Se cair 30%', 'Acompanhar empresas', 'Fundo de emergência', 'Experiência',
            'Na crise', 'Pontos', ...ROUNDS.map((_, i) => `Ronda ${i + 1}`), 'Valor do plano', 'Chegou aos 10K em'];
        const rows = [];
        game.players.forEach(p => {
            const a = p.answers || {};
            rows.push([
                p.name,
                PROFILES[p.profile].label,
                p.monthly,
                ...Object.keys(LABELS).map(k => (LABELS[k][a[k]] || '')),
                p.decision ? DECISIONS[p.decision] : '',
                p.score,
                ...ROUNDS.map((_, i) => {
                    const v = p.votes[i];
                    if (!v) return '';
                    if (!v.vote) return 'Não votou';
                    return `${v.vote === 'SOBE' ? 'Sobe' : 'Desce'} (${v.hit ? 'certo' : 'errado'})`;
                }),
                Math.round(p.plan.value),
                p.plan.hitMonth ? duracao(p.plan.hitMonth) : ''
            ]);
        });
        return '﻿' + [header, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
    }

    return { exportCsv, playerCount: () => game.players.size };
};
