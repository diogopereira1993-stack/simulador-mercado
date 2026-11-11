// ==================================================
// FASE 2 — CONSTRÓI O TEU PORTFÓLIO
// Continua o jogo no mesmo telemóvel: o perfil e o reforço mensal do check-in passam para aqui.
// O apresentador guia pelo admin: setores → empresas (setor a setor) → carteira → plano mensal → email.
// É um exercício educativo com as MF Picks: nada aqui é uma recomendação.
// ==================================================
const fs = require('fs');
const path = require('path');
const Plano = require('./public/portfolio-plano');

const ETAPAS = ['SETORES', 'EMPRESAS', 'CARTEIRA', 'PLANO', 'EMAIL'];
const CAMBIO_PADRAO = { EUR: 1, USD: 0.86, CAD: 0.62, GBP: 1.15 };   // euros por unidade; o catálogo pode trazer o seu ("cambio")
const ETF_PADRAO = {
    ticker: 'ETF', nome: 'ETF de índice (S&P 500)', preco: 100, moeda: 'EUR', ilustrativo: true,
    descricao: 'Um só produto que compra as 500 maiores empresas americanas de uma vez. É a base mais simples de uma carteira: não tens de escolher empresas.'
};
// A parte no ETF com que cada pessoa começa: a mesma do jogo, mas quem jogou só com o índice fica com 80% para experimentar
const ETF_POR_PERFIL = { indice: 0.8, misto: 0.7, escolhidas: 0.35 };
const MAX_EMPRESAS = 12;
const CONSENTIMENTO_TEXTO = 'Aceito que a MoneyFlix me envie este plano por email e guarde o meu email para esse fim. Posso pedir para o apagar a qualquer momento.';
const RAIZ = path.join(__dirname, '..');

// ── O CARTÃO DA FREEDOM24 no fim da fase (depois do email) ──
// Trocar aqui o link de afiliado e os valores quando estiverem definidos (ou definir F24_LINK no servidor).
// Se o link não começar por https://, o botão e o QR mostram o texto em vez de abrir alguma coisa.
const F24 = {
    titulo: 'Queres abrir conta na Freedom24? Nós ajudamos',
    // Link de afiliado da MoneyFlix (sessão de Lisboa); F24_LINK no servidor substitui-o
    link: process.env.F24_LINK || 'https://lp.freedom24.com/pt/etf-investment-plan?utm_source=4647&utm_medium=affiliates&utm_campaign=mc_inaff_3174&utm_term=4647&s_id=lisboa14',
    botao: 'Abrir conta na Freedom24',
    vantagens: [
        'Oferta de boas-vindas em ações para novos clientes, segundo os patamares e as condições da Freedom24',
        'Planos recorrentes sem comissão de compra (podem aplicar-se outros custos)',
        'Ações inteiras, registadas em teu nome',
        'A MoneyFlix tem uma relação comercial com a Freedom24'
    ]
};

const r2 = Plano.r2;
const semAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// --- O CATÁLOGO DAS MF PICKS ---
// Ordem: PICKS_FILE; uma cópia dentro do projeto (para o Render); o da pasta do Tour; senão o exemplo.
function caminhosCatalogo() {
    return [process.env.PICKS_FILE, path.join(__dirname, 'dados', 'picks-catalogo.json'), path.join(RAIZ, 'tour-lisboa', 'dados', 'picks-catalogo.json')].filter(Boolean);
}

// O câmbio pode vir em euros por unidade ({ USD: 0.896 }) ou em unidades por euro ({ USD_por_EUR: 1.1165 }, como o do BCE)
function lerCambio(c) {
    const out = { ...CAMBIO_PADRAO };
    Object.entries(c || {}).forEach(([k, v]) => {
        const n = Number(v);
        if (!(n > 0)) return;
        const m = k.match(/^([A-Z]{3})_por_EUR$/i);
        if (m) out[m[1].toUpperCase()] = 1 / n;
        else if (/^[A-Z]{3}$/i.test(k)) out[k.toUpperCase()] = n;
    });
    return out;
}

function normalizarCatalogo(raw, ficheiro, exemplo) {
    const cambio = lerCambio(raw.cambio);
    const emEuros = (preco, moeda) => {
        const m = String(moeda || 'USD').toUpperCase();
        if (!cambio[m]) console.warn(`Portfólio: moeda sem câmbio (${m}); a usar o do dólar.`);
        return r2(Number(preco) * (cambio[m] || cambio.USD));
    };
    const setores = (raw.setores || []).map(s => ({ id: String(s.id), nome: String(s.nome || s.id), descricao: String(s.descricao || ''), emoji: String(s.emoji || '') }));
    const ids = new Set(setores.map(s => s.id));
    // Só as Picks ativas e que se podem comprar na Freedom24. Se nenhuma vier com disponivel_f24 = true,
    // o campo ainda não foi verificado e não se usa (senão o catálogo ficava vazio).
    const f24Verificado = (raw.empresas || []).some(e => e && e.disponivel_f24 === true);
    if (!f24Verificado && (raw.empresas || []).some(e => e && e.disponivel_f24 === false)) console.warn('Portfólio: disponivel_f24 ainda não verificado no catálogo; a mostrar todas as Picks ativas.');
    let empresas = (raw.empresas || []).filter(e => e && e.ticker && e.ativa !== false && !(f24Verificado && e.disponivel_f24 === false) && ids.has(String(e.setor)) && Number(e.preco) > 0);
    // «retorno_desde_pick» em fração (3.51 = +351%) ou em percentagem (351): se algum passa de 20, está em percentagem
    const emPct = empresas.some(e => Math.abs(Number(e.retorno_desde_pick)) > 20);
    const vistos = new Set();
    empresas = empresas.filter(e => !vistos.has(String(e.ticker).toUpperCase()) && vistos.add(String(e.ticker).toUpperCase())).map((e, i) => {
        const tipo = semAcentos(e.tipo);
        const ret = e.retorno_desde_pick === null || e.retorno_desde_pick === undefined || e.retorno_desde_pick === '' ? null : Number(String(e.retorno_desde_pick).replace('%', '').replace(',', '.'));
        return {
            ticker: String(e.ticker).toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 10),
            nome: String(e.nome || e.ticker), setor: String(e.setor), descricao: String(e.descricao || ''),
            conhecida: !!e.conhecida,
            tipo: ['defensiva', 'crescimento', 'ciclica'].includes(tipo) ? tipo : null,
            preco: Number(e.preco), moeda: String(e.moeda || 'USD').toUpperCase(), preco_eur: emEuros(e.preco, e.moeda),
            data_pick: e.data_pick ? String(e.data_pick) : null,
            retorno_desde_pick: ret === null || isNaN(ret) ? null : (emPct || String(e.retorno_desde_pick).includes('%') ? ret / 100 : ret),
            nota_apresentador: String(e.nota_apresentador || ''), ordem: i,
            // O logótipo (ficheiro ao lado do catálogo, em logos/) é servido pelo jogo em /logos/
            logo: e.logo && /^[\w.\-]+\.(png|jpe?g|svg|webp)$/i.test(path.basename(String(e.logo))) && fs.existsSync(path.join(path.dirname(ficheiro), String(e.logo)))
                ? 'logos/' + path.basename(String(e.logo)) : null
        };
    });
    // Em cada setor, as que as pessoas conhecem primeiro
    empresas.sort((a, b) => (b.conhecida - a.conhecida) || a.ordem - b.ordem);
    const etfRaw = { ...ETF_PADRAO, ...(raw.etf || {}) };
    // Por dentro o ETF tem sempre a chave 'ETF'; «codigo» é o ticker verdadeiro (ex.: VUAA), que aparece no ecrã e no export
    const codigo = String(etfRaw.ticker || 'ETF').toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12) || 'ETF';
    const etf = { ticker: 'ETF', codigo, nome: String(etfRaw.nome), descricao: String(etfRaw.descricao), preco: Number(etfRaw.preco), moeda: String(etfRaw.moeda || 'EUR').toUpperCase(),
        ilustrativo: etfRaw.ilustrativo === true || (!raw.etf && etfRaw.ilustrativo !== false),
        isin: etfRaw.isin ? String(etfRaw.isin) : null, bolsa: etfRaw.bolsa ? String(etfRaw.bolsa) : null,
        preco_data: etfRaw.preco_data ? String(etfRaw.preco_data) : null, preco_fonte: etfRaw.preco_fonte ? String(etfRaw.preco_fonte) : null };
    etf.preco_eur = emEuros(etf.preco, etf.moeda);
    let atualizado = raw.atualizado || raw.data || null;
    if (!atualizado) { try { atualizado = fs.statSync(ficheiro).mtime.toISOString().slice(0, 10); } catch (e) { atualizado = null; } }
    return {
        ficheiro: path.relative(RAIZ, ficheiro), pasta: path.dirname(ficheiro), exemplo, atualizado, cambio, etf,
        setores: setores.filter(s => empresas.some(e => e.setor === s.id)),
        empresas, porTicker: new Map(empresas.map(e => [e.ticker, e]))
    };
}

function carregarCatalogo(anterior, soExemplo) {
    let ficheiro = soExemplo ? null : caminhosCatalogo().find(f => fs.existsSync(f));
    const exemplo = !ficheiro;
    if (!ficheiro) ficheiro = path.join(__dirname, 'dados', 'picks-exemplo.json');
    try {
        const cat = normalizarCatalogo(JSON.parse(fs.readFileSync(ficheiro, 'utf8')), ficheiro, exemplo);
        if (!cat.empresas.length) throw new Error('sem empresas ativas');
        console.log(`Portfólio: catálogo ${cat.ficheiro}${exemplo ? ' (EXEMPLO)' : ''} — ${cat.setores.length} setores, ${cat.empresas.length} empresas.`);
        return cat;
    } catch (err) {
        console.error(`Portfólio: não consegui ler ${ficheiro}: ${err.message}`);
        if (anterior) return anterior;
        if (!exemplo) return carregarCatalogo(null, true);
        throw err;
    }
}

// O que vai para os telemóveis (sem as notas do apresentador)
function catalogoPublico(cat) {
    return {
        atualizado: cat.atualizado, exemplo: cat.exemplo, etf: cat.etf, setores: cat.setores,
        empresas: cat.empresas.map(({ nota_apresentador, ordem, ...e }) => e),
        maxEspera: Plano.MAX_ESPERA, maxEmpresas: MAX_EMPRESAS, consentimento: CONSENTIMENTO_TEXTO, f24: F24
    };
}

const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,}$/i;

module.exports = function setupPortfolio(io, jogo) {
    const nsp = io.of('/');
    let catalogo = carregarCatalogo();
    let publico = catalogoPublico(catalogo);

    // Estado da fase: null = ainda não começou (os telemóveis mostram o jogo)
    let pf;
    function reset() {
        pf = { gameId: jogo.gameId(), etapa: null, ordem: catalogo.setores.map(s => s.id), setorAtual: null, mostrados: [], jogadores: new Map() };
    }
    reset();
    // Quando o jogo é reiniciado, a fase recomeça com ele
    function sync() { if (pf.gameId !== jogo.gameId()) reset(); }

    const novoJogador = () => ({ setores: [], empresas: [], montante: 1000, etfPct: null, acoes: null, reforco: null,
        quer: null, email: null, consentimento: false, consentimentoEm: null, confirmado: false, confirmadoEm: null, etapa: null, atualizadoEm: null });

    // --- A carteira e o plano de uma pessoa, já com os valores por omissão ---
    function resolver(id) {
        const info = jogo.playerInfo(id);
        if (!info) return null;
        const d = pf.jogadores.get(id) || novoJogador();
        const empresas = d.empresas.filter(t => catalogo.porTicker.has(t));
        const etfSugerido = ETF_POR_PERFIL[info.profile] ?? 0.7;
        const etfPct = d.etfPct === null ? etfSugerido : d.etfPct;
        const reforco = d.reforco || info.monthly;
        const w = Plano.pesos(empresas, etfPct);
        const precos = { ETF: catalogo.etf.preco_eur };
        empresas.forEach(t => { precos[t] = catalogo.porTicker.get(t).preco_eur; });
        // As ações que a pessoa acertou à mão, se ainda couberem no montante; senão a compra automática
        let acoes = null;
        if (d.acoes) {
            acoes = {};
            Object.keys(w).forEach(t => { if (d.acoes[t] > 0) acoes[t] = d.acoes[t]; });
            if (Plano.custo(acoes, precos) > d.montante + 0.01) acoes = null;
        }
        if (!acoes) acoes = Plano.encher(d.montante, w, precos).acoes;
        const sobra = r2(d.montante - Plano.custo(acoes, precos));
        return { info, d, empresas, etfSugerido, etfPct, reforco, w, precos, acoes, sobra };
    }

    function inicioDoPlano() {
        // O mês a seguir à sessão, em Lisboa
        const p = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Lisbon', year: 'numeric', month: 'numeric' }).formatToParts(new Date()).map(x => [x.type, x.value]));
        return Plano.mesSeguinte(new Date(Number(p.year), Number(p.month) - 1, 1));
    }

    // --- Validação do que chega dos telemóveis ---
    function guardar(id, dados) {
        const d = pf.jogadores.get(id) || novoJogador();
        if (Array.isArray(dados.setores)) d.setores = [...new Set(dados.setores.map(String))].filter(s => catalogo.setores.some(x => x.id === s));
        if (Array.isArray(dados.empresas)) d.empresas = [...new Set(dados.empresas.map(String))].filter(t => catalogo.porTicker.has(t)).slice(0, MAX_EMPRESAS);
        if (dados.montante !== undefined) {
            const m = Math.round(Number(dados.montante));
            if (m >= 100 && m <= 100000) d.montante = m;
        }
        if (dados.etfPct !== undefined) {
            const e = Number(dados.etfPct);
            if (e >= 0 && e <= 1) d.etfPct = Math.round(e * 20) / 20;
        }
        if (dados.acoes === null) d.acoes = null;
        else if (dados.acoes && typeof dados.acoes === 'object') {
            const a = {};
            Object.entries(dados.acoes).slice(0, MAX_EMPRESAS + 1).forEach(([t, n]) => {
                const k = Math.floor(Number(n));
                if ((t === 'ETF' || catalogo.porTicker.has(t)) && k > 0 && k <= 100000) a[t] = k;
            });
            d.acoes = a;
        }
        if (dados.reforco !== undefined) {
            const r = Math.round(Number(dados.reforco));
            if (r >= 10 && r <= 10000) d.reforco = r;
        }
        if (dados.etapa && ETAPAS.includes(dados.etapa) && ETAPAS.indexOf(dados.etapa) > ETAPAS.indexOf(d.etapa)) d.etapa = dados.etapa;
        d.atualizadoEm = new Date().toISOString();
        pf.jogadores.set(id, d);
        return d;
    }

    // O que a pessoa vê de si própria (o telemóvel faz as contas do plano com portfolio-plano.js)
    function vistaDe(id) {
        const r = resolver(id);
        if (!r) return null;
        const d = r.d;
        return {
            nome: r.info.name, perfil: r.info.profile, perfilNome: r.info.profileLabel, reforcoCheckin: r.info.monthly,
            etfSugerido: r.etfSugerido, perfilIndice: jogo.profileIndexShare(r.info.profile),
            setores: d.setores, empresas: r.empresas, montante: d.montante, etfPct: r.etfPct, acoes: d.acoes ? r.acoes : null,
            reforco: r.reforco, quer: d.quer, email: d.email, consentimento: d.consentimento, confirmado: d.confirmado, etapa: d.etapa,
            inicio: inicioDoPlano()
        };
    }

    // --- O que a sala está a escolher (ecrã grande e admin) ---
    function estatisticas() {
        const ids = new Set(jogo.playerIds());
        const setores = {}, empresas = {};
        let comSetores = 0, comEmpresas = 0, carteiras = 0, somaMontante = 0, somaEtf = 0, emails = 0, confirmados = 0, naoQuer = 0, porEtapa = {};
        pf.jogadores.forEach((d, id) => {
            if (!ids.has(id)) return;
            if (d.setores.length) comSetores++;
            d.setores.forEach(s => { setores[s] = (setores[s] || 0) + 1; });
            const emp = d.empresas.filter(t => catalogo.porTicker.has(t));
            if (emp.length) comEmpresas++;
            emp.forEach(t => { empresas[t] = (empresas[t] || 0) + 1; });
            if (d.etapa && ETAPAS.indexOf(d.etapa) >= 2) {
                const r = resolver(id);
                if (r) { carteiras++; somaMontante += d.montante; somaEtf += r.etfPct; }
            }
            if (d.quer === true && d.consentimento) { emails++; if (d.confirmado) confirmados++; }
            if (d.quer === false) naoQuer++;
            if (d.etapa) porEtapa[d.etapa] = (porEtapa[d.etapa] || 0) + 1;
        });
        return { pessoas: ids.size, comSetores, comEmpresas, setores, empresas, carteiras,
            montanteMedio: carteiras ? Math.round(somaMontante / carteiras) : 0, etfMedio: carteiras ? somaEtf / carteiras : 0,
            emails, confirmados, naoQuer, porEtapa };
    }

    function estadoPublico() {
        return { etapa: pf.etapa, etapas: ETAPAS, ordem: pf.ordem, setorAtual: pf.setorAtual, mostrados: pf.mostrados, stats: estatisticas() };
    }

    let aoMudar = () => {};
    function broadcast() {
        sync();
        aoMudar(false);
        nsp.emit('pf-state', estadoPublico());
        const roster = jogo.playerIds().map(id => {
            const info = jogo.playerInfo(id), d = pf.jogadores.get(id);
            return { nome: info.name, perfil: info.profileLabel, setores: d ? d.setores.length : 0, empresas: d ? d.empresas.length : 0,
                montante: d && d.etapa && ETAPAS.indexOf(d.etapa) >= 2 ? d.montante : null, etapa: d ? d.etapa : null,
                email: d ? (d.quer === true && d.consentimento ? (d.confirmado ? 'confirmado' : 'por confirmar') : d.quer === false ? 'não' : null) : null };
        });
        nsp.to('admin').emit('pf-admin', { roster, catalogo: { ficheiro: catalogo.ficheiro, exemplo: catalogo.exemplo, atualizado: catalogo.atualizado, setores: catalogo.setores.length, empresas: catalogo.empresas.length } });
    }
    // Com 50 telemóveis a mexer ao mesmo tempo, junta as atualizações (no máximo 2 por segundo)
    let pendente = null;
    function broadcastSoon() {
        if (pendente) return;
        pendente = setTimeout(() => { pendente = null; broadcast(); }, 500);
    }

    // --- Comandos do apresentador ---
    function ordenarSetoresPorEscolhas() {
        const c = estatisticas().setores;
        pf.ordem = catalogo.setores.map((s, i) => ({ id: s.id, n: c[s.id] || 0, i })).sort((a, b) => b.n - a.n || a.i - b.i).map(x => x.id);
    }
    function mostrarSetor(id) {
        if (!pf.ordem.includes(id)) return;
        pf.setorAtual = id;
        if (!pf.mostrados.includes(id)) pf.mostrados.push(id);
    }
    function irPara(etapa) {
        if (etapa === 'EMPRESAS' && pf.etapa !== 'EMPRESAS') {
            // Ao abrir as empresas pela primeira vez, os setores ficam pela ordem dos mais escolhidos
            if (!pf.mostrados.length) { ordenarSetoresPorEscolhas(); mostrarSetor(pf.ordem[0]); }
        }
        // Depois das empresas, todos os setores ficam à vista para quem quiser voltar atrás
        if (ETAPAS.indexOf(etapa) > ETAPAS.indexOf('EMPRESAS')) pf.ordem.forEach(id => { if (!pf.mostrados.includes(id)) pf.mostrados.push(id); });
        pf.etapa = etapa;
    }
    function seguinte() {
        if (pf.etapa === null) return irPara('SETORES');
        if (pf.etapa === 'EMPRESAS') {
            const i = pf.ordem.indexOf(pf.setorAtual);
            if (i < pf.ordem.length - 1) return mostrarSetor(pf.ordem[i + 1]);
        }
        const i = ETAPAS.indexOf(pf.etapa);
        if (i < ETAPAS.length - 1) irPara(ETAPAS[i + 1]);
    }
    function anterior() {
        if (pf.etapa === 'EMPRESAS') {
            const i = pf.ordem.indexOf(pf.setorAtual);
            if (i > 0) { pf.setorAtual = pf.ordem[i - 1]; return; }
        }
        const i = ETAPAS.indexOf(pf.etapa);
        if (i > 0) pf.etapa = ETAPAS[i - 1];
        else if (i === 0) pf.etapa = null;
    }

    nsp.on('connection', socket => {
        // O telemóvel apresenta-se com o playerId do jogo; o catálogo vai uma vez por ligação
        socket.on('pf-hello', ({ playerId } = {}) => {
            sync();
            if (!socket.data.pfCatalogo) { socket.emit('pf-catalogo', publico); socket.data.pfCatalogo = true; }
            socket.emit('pf-state', estadoPublico());
            if (playerId && jogo.playerInfo(String(playerId))) {
                socket.data.pfId = String(playerId);
                socket.emit('pf-me', vistaDe(socket.data.pfId));
            }
        });

        socket.on('pf-save', ({ playerId, dados } = {}) => {
            sync();
            const id = String(playerId || socket.data.pfId || '');
            if (!id || !jogo.playerInfo(id) || !dados || typeof dados !== 'object') return;
            socket.data.pfId = id;
            guardar(id, dados);
            broadcastSoon();
        });

        // O pedido do plano por email: só se guarda o email com o consentimento marcado
        socket.on('pf-email', ({ playerId, quer, email, consentimento } = {}) => {
            sync();
            const id = String(playerId || socket.data.pfId || '');
            if (!id || !jogo.playerInfo(id)) return;
            const d = pf.jogadores.get(id) || guardar(id, {});
            if (quer === true) {
                const e = String(email || '').trim().slice(0, 254);
                if (!EMAIL_RE.test(e) || consentimento !== true) return socket.emit('pf-email-erro', 'Confirma o email e marca a caixa do consentimento.');
                // Um email novo (ou mudado) tem de ser confirmado outra vez no fim
                if (d.email !== e) Object.assign(d, { confirmado: false, confirmadoEm: null });
                Object.assign(d, { quer: true, email: e, consentimento: true, consentimentoEm: new Date().toISOString() });
            } else if (quer === null) {
                // «Corrigir»: volta ao campo do email; a confirmação anterior deixa de valer
                Object.assign(d, { quer: null, confirmado: false, confirmadoEm: null });
            } else {
                Object.assign(d, { quer: false, email: null, consentimento: false, consentimentoEm: null, confirmado: false, confirmadoEm: null });
            }
            guardar(id, { etapa: 'EMAIL' });
            aoMudar(true);   // o email grava-se logo em disco
            socket.emit('pf-me', vistaDe(id));
            broadcastSoon();
        });

        // «Sim, está certo»: a pessoa confirma o email no fim, para ter a certeza de que o plano chega ao sítio certo
        socket.on('pf-email-confirmar', ({ playerId, email } = {}) => {
            sync();
            const id = String(playerId || socket.data.pfId || '');
            const d = pf.jogadores.get(id);
            if (!d || d.quer !== true || !d.consentimento || String(email || '') !== d.email) return;
            Object.assign(d, { confirmado: true, confirmadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() });
            aoMudar(true);
            socket.emit('pf-me', vistaDe(id));
            broadcastSoon();
        });

        // O admin já passou pelo login do jogo (register-admin) neste mesmo socket
        socket.on('pf-admin-hello', () => {
            if (!socket.data.isAdmin) return;
            socket.emit('pf-catalogo-admin', { ...publico, empresas: catalogo.empresas.map(({ ordem, ...e }) => e) });
            broadcast();
        });

        // Quando o apresentador reinicia o jogo (comando do game10k), a fase também recomeça já
        socket.on('admin', ({ command } = {}) => {
            if (socket.data.isAdmin && command === 'RESET') setImmediate(broadcast);
        });

        socket.on('pf-admin', ({ command, setor, etapa } = {}) => {
            if (!socket.data.isAdmin) return;
            sync();
            if (command === 'NEXT') seguinte();
            if (command === 'PREV') anterior();
            if (command === 'ETAPA' && (etapa === null || ETAPAS.includes(etapa))) etapa === null ? (pf.etapa = null) : irPara(etapa);
            if (command === 'SETOR' && pf.etapa === 'EMPRESAS') mostrarSetor(String(setor));
            if (command === 'REORDENAR' && pf.etapa === 'EMPRESAS') ordenarSetoresPorEscolhas();
            if (command === 'RELOAD') {
                catalogo = carregarCatalogo(catalogo);
                publico = catalogoPublico(catalogo);
                const ids = catalogo.setores.map(s => s.id);
                pf.ordem = [...pf.ordem.filter(id => ids.includes(id)), ...ids.filter(id => !pf.ordem.includes(id))];
                pf.mostrados = pf.mostrados.filter(id => ids.includes(id));
                if (!ids.includes(pf.setorAtual)) pf.setorAtual = pf.mostrados[0] || null;
                nsp.emit('pf-catalogo', publico);
                socket.emit('pf-catalogo-admin', { ...publico, empresas: catalogo.empresas.map(({ ordem, ...e }) => e) });
            }
            broadcast();
        });
    });

    // --- EXPORTAÇÃO (formato em EXPORT.md) ---
    function exportarJogador(id) {
        const base = jogo.exportPlayer(id);
        const r = resolver(id);
        const d = pf.jogadores.get(id);
        const tocou = !!(d && d.etapa);
        const linha = {
            id, nome: base.nome,
            email: d && d.quer === true && d.consentimento ? d.email : null,
            consentimento: !!(d && d.quer === true && d.consentimento),
            consentimento_em: d && d.quer === true && d.consentimento ? d.consentimentoEm : null,
            quer_plano_por_email: d ? d.quer : null,
            email_confirmado: !!(d && d.quer === true && d.consentimento && d.confirmado),
            email_confirmado_em: d && d.quer === true && d.consentimento && d.confirmado ? d.confirmadoEm : null,
            perfil: base.perfil, perfil_nome: base.perfil_nome,
            checkin: base.checkin, resultado_jogo: base.resultado_jogo,
            setores_escolhidos: d ? d.setores.map(s => ({ id: s, nome: (catalogo.setores.find(x => x.id === s) || {}).nome || s })) : [],
            montante_inicial: null, reforco_mensal: null, etf_percentagem: null,
            portfolio: [], empresas_escolhidas: [], por_investir: null, plano: [], juntar: [],
            etapa: d ? d.etapa : null, atualizado_em: d ? d.atualizadoEm : null
        };
        if (!r || !tocou) return linha;
        const setorNome = s => (catalogo.setores.find(x => x.id === s) || {}).nome || s;
        linha.empresas_escolhidas = r.empresas.map(t => { const e = catalogo.porTicker.get(t); return { ticker: t, nome: e.nome, setor: e.setor, preco_eur: e.preco_eur }; });
        // Só há carteira e plano para quem chegou ao passo da carteira
        if (ETAPAS.indexOf(r.d.etapa) < ETAPAS.indexOf('CARTEIRA')) return linha;
        linha.montante_inicial = r.d.montante;
        linha.reforco_mensal = r.reforco;
        linha.etf_percentagem = r.empresas.length ? r.etfPct : 1;
        // No export o ETF aparece com o ticker verdadeiro (ex.: VUAA), não com a chave interna 'ETF'
        const tk = t => t === 'ETF' ? catalogo.etf.codigo : t;
        linha.portfolio = Object.keys(r.w).filter(t => r.acoes[t] > 0).map(t => {
            const e = t === 'ETF' ? catalogo.etf : catalogo.porTicker.get(t);
            return { ticker: tk(t), nome: e.nome, setor: t === 'ETF' ? null : e.setor, setor_nome: t === 'ETF' ? null : setorNome(e.setor),
                tipo: t === 'ETF' ? 'indice' : e.tipo, acoes: r.acoes[t], preco: e.preco, moeda: e.moeda, preco_eur: e.preco_eur, montante: r2(r.acoes[t] * e.preco_eur) };
        });
        linha.por_investir = r.sobra;
        const p = Plano.plano({ w: r.w, precos: r.precos, acoes: r.acoes, caixa: r.sobra, reforco: r.reforco, inicio: inicioDoPlano() });
        linha.plano = p.meses.map(m => ({ ...m, compras: m.compras.map(c => ({ ...c, ticker: tk(c.ticker) })), a_juntar_para: m.a_juntar_para ? tk(m.a_juntar_para) : null }));
        linha.juntar = r.empresas.map(t => catalogo.porTicker.get(t)).filter(e => e.preco_eur > r.reforco).map(e => {
            const meses = Plano.mesesPara(e.preco_eur, r.reforco);
            return { ticker: e.ticker, nome: e.nome, preco_eur: e.preco_eur, meses, no_plano: meses <= Plano.MAX_ESPERA };
        });
        return linha;
    }

    function exportJson() {
        sync();
        return {
            versao: 1, exportado_em: new Date().toISOString(), jogo_id: jogo.gameId(),
            consentimento_texto: CONSENTIMENTO_TEXTO,
            catalogo: { ficheiro: catalogo.ficheiro, exemplo: catalogo.exemplo, atualizado: catalogo.atualizado },
            cambio: catalogo.cambio,
            etf: { ticker: catalogo.etf.codigo, nome: catalogo.etf.nome, isin: catalogo.etf.isin, preco: catalogo.etf.preco, moeda: catalogo.etf.moeda, preco_eur: catalogo.etf.preco_eur,
                preco_data: catalogo.etf.preco_data, preco_fonte: catalogo.etf.preco_fonte, ilustrativo: catalogo.etf.ilustrativo },
            jogadores: jogo.playerIds().map(exportarJogador)
        };
    }

    // Colunas que se juntam ao CSV do jogo
    const csvExtra = {
        get header() { return ['Email', 'Consentimento', 'Email confirmado', 'Montante inicial', 'Reforço no portfólio', '% no ETF', 'Empresas escolhidas', 'Carteira inicial']; },
        row(id) {
            sync();
            const x = exportarJogador(id);
            return [x.email || '', x.consentimento ? 'Sim' : (x.quer_plano_por_email === false ? 'Não quis' : ''), x.email ? (x.email_confirmado ? 'Sim' : 'Não') : '',
                x.montante_inicial ?? '', x.reforco_mensal ?? '', x.etf_percentagem === null ? '' : Math.round(x.etf_percentagem * 100) + '%',
                x.empresas_escolhidas.map(e => e.ticker).join(' '),
                x.portfolio.map(p => `${p.ticker} ×${p.acoes}`).join(' ')];
        }
    };

    // Os logótipos das empresas, da pasta logos/ ao lado do catálogo
    function servirLogo(req, res) {
        const nome = path.basename(req.path);
        if (!/^[\w.\-]+\.(png|jpe?g|svg|webp)$/i.test(nome)) return res.status(404).end();
        const f = path.join(catalogo.pasta, 'logos', nome);
        if (!fs.existsSync(f)) return res.status(404).end();
        res.set('Cache-Control', 'public, max-age=86400');
        res.sendFile(f);
    }

    // --- Gravação e recuperação (persistencia.js) ---
    function snapshot() { return { ...pf, jogadores: [...pf.jogadores.entries()] }; }
    function restaurar(dados) {
        if (!dados || !Array.isArray(dados.jogadores) || dados.gameId !== jogo.gameId()) return false;
        pf = { ...dados, jogadores: new Map(dados.jogadores) };
        console.log(`Portfólio recuperado: ${pf.jogadores.size} pessoas, etapa ${pf.etapa}.`);
        return true;
    }

    return { exportJson, csvExtra, servirLogo, snapshot, restaurar, aoMudar: fn => { aoMudar = fn; } };
};
