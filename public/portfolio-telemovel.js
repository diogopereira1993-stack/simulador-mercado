// Fase 2 no telemóvel: constrói o teu portfólio. Usa o `socket` e o `playerId` do jogo (index.html)
// e as contas de portfolio-plano.js. Aparece por cima do jogo quando o apresentador abre a fase.
(function () {
    if (typeof socket === 'undefined' || !window.PlanoMF) return;
    const P = window.PlanoMF;
    const ETAPAS = ['SETORES', 'EMPRESAS', 'CARTEIRA', 'PLANO', 'EMAIL'];
    const NOMES_ETAPA = { SETORES: 'Setores', EMPRESAS: 'Empresas', CARTEIRA: 'Carteira', PLANO: 'Plano', EMAIL: 'Email' };
    const TIPOS = {
        defensiva: { nome: 'Defensiva', txt: 'Vende coisas de que as pessoas precisam em qualquer altura. Costuma oscilar menos nas crises.' },
        crescimento: { nome: 'Crescimento', txt: 'Está a crescer depressa e reinveste para crescer mais. O preço costuma oscilar mais.' },
        ciclica: { nome: 'Cíclica', txt: 'Acompanha a economia: ganha mais nos anos bons e sofre mais nas crises.' },
        indice: { nome: 'Índice', txt: 'Muitas empresas de uma vez. Se uma corre mal, pesa pouco no total.' }
    };
    const MONTANTES = [1000, 1500];
    const REFORCOS = [50, 100, 150, 300];
    const CORES = ['#5E5CE6', '#FF9F0A', '#1FA84F', '#E5484D', '#0E9AA7', '#AF52DE', '#B45309', '#D63384', '#3A8F5C', '#6E6E73', '#8E5A2B', '#C2410C'];

    // ── utilidades ──
    const $ = id => document.getElementById(id);
    const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const grupo = n => String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const eur = v => (Math.round(v) < 0 ? '−' : '') + grupo(Math.round(v)) + ' €';
    const dec = v => { const c = Math.round(Math.abs(v) * 100); return grupo(Math.floor(c / 100)) + ',' + String(c % 100).padStart(2, '0'); };
    const eur2 = v => (v < 0 ? '−' : '') + dec(v) + ' €';
    const SIMB = { USD: '$', CAD: 'C$', GBP: '£' };
    const precoNativo = (v, moeda) => moeda === 'EUR' ? dec(v) + ' €' : (SIMB[moeda] || moeda + ' ') + dec(v);
    const pctTxt = v => (v >= 0 ? '+' : '−') + String(Math.round(Math.abs(v) * 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' %';
    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    // «2026-11-10» → «10 nov»
    function dataCurta(s) { const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]}` : String(s || ''); }
    function dataTxt(s) {
        if (!s) return '';
        let m = String(s).match(/^(\d{4})-(\d{1,2})/);
        if (m) return `${MESES[Number(m[2]) - 1]} ${m[1]}`;
        m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        return m ? `${MESES[Number(m[2]) - 1]} ${m[3]}` : String(s);
    }
    function cor(t) { if (t === 'ETF') return '#0071E3';   // o ETF (a base) no azul do site
        let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; }
    // Logótipo da empresa quando o catálogo o tem; senão (ou se não carregar) as letras do ticker
    const logo = (t, cls = '') => {
        const e = porTicker[t];
        const img = e && e.logo ? `<img src="${esc(e.logo)}" alt="" loading="lazy" onerror="this.remove()">` : '';
        return `<span class="pf-logo ${cls}${img ? ' has-img' : ''}" ${t === 'ETF' ? 'style="background:var(--accent);color:#fff"' : ''}>${esc(t === 'ETF' ? nomeT('ETF').slice(0, 4) : t.slice(0, 4))}${img}</span>`;
    };
    // O ETF tem a chave interna 'ETF'; no ecrã aparece o ticker verdadeiro (ex.: VUAA)
    // O ETF que a pessoa escolheu (um por pessoa); sem escolha, o primeiro da lista do catálogo
    const listaEtfs = () => (cat && (cat.etfs && cat.etfs.length ? cat.etfs : [cat.etf])) || [];
    const etfAtual = () => listaEtfs().find(e => e.codigo === d.etf) || listaEtfs()[0];
    const nomeT = t => t === 'ETF' ? ((cat && etfAtual() && etfAtual().codigo) || 'ETF') : t;
    const tipoPill = t => t && TIPOS[t] ? `<span class="pf-tipo ${t}">${TIPOS[t].nome}</span>` : '';
    function toast(msg) { const el = $('pf-toast'); el.innerText = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }
    const vibrar = () => { if (navigator.vibrate) navigator.vibrate(20); };

    // ── a estrutura (uma vez) ──
    const root = document.createElement('div');
    root.id = 'pf'; root.className = 'pf';
    root.innerHTML = `
        <header class="pf-head">
            <div class="pf-brand"><img src="logo-moneyflix.png" alt="MoneyFlix"><span>Carteira de exercício</span></div>
            <nav class="pf-steps" id="pf-steps"></nav>
        </header>
        <main class="pf-main" id="pf-main"></main>
        <div class="pf-bar" id="pf-bar"></div>
        <div class="pf-sheet-bg" id="pf-sheet-bg"></div>
        <section class="pf-sheet" id="pf-sheet" aria-modal="true" role="dialog"></section>
        <div class="pf-toast" id="pf-toast"></div>`;
    document.body.appendChild(root);

    // ── estado ──
    let cat = null, porTicker = {}, est = null, eu = null, vista = null, setorVisto = null, carregado = false, erroEmail = '';
    let d = { setores: [], empresas: [], montante: 1000, etfPct: null, etf: null, acoes: null, reforco: null, quer: null, email: null, consentimento: false, confirmado: false };
    let montanteOutro = false, reforcoOutro = false;

    // ── ligação ao servidor ──
    const ola = () => socket.emit('pf-hello', { playerId });
    socket.on('connect', ola);

    // Pedidos de email que ainda não tiveram resposta do servidor: voltam a ser enviados quando a ligação volta
    // (se o servidor cair no momento em que alguém carrega no botão, o pedido não se perde)
    let pedidoEmail = null;
    function pedirEmail(evento, dados) {
        pedidoEmail = { evento, dados: { playerId, ...dados } };
        socket.emit(evento, pedidoEmail.dados);
    }
    socket.on('connect', () => {
        // Volta a mandar o que a pessoa já escolheu (o servidor guarda e ignora o que já tinha) e o pedido de email pendente
        if (carregado) socket.emit('pf-save', { playerId, dados: { setores: d.setores, empresas: d.empresas, montante: d.montante,
            etfPct: d.etfPct === null ? undefined : d.etfPct, etf: d.etf || undefined, acoes: d.acoes, reforco: d.reforco || undefined, etapa: vista || undefined } });
        if (pedidoEmail) socket.emit(pedidoEmail.evento, pedidoEmail.dados);
    });
    // O pedido fica respondido quando o servidor mostra o estado que se pediu
    function emailRespondido(m) {
        if (!pedidoEmail) return;
        const q = pedidoEmail.dados;
        const feito = pedidoEmail.evento === 'pf-email-confirmar' ? m.confirmado && m.email === q.email
            : q.quer === true ? m.quer === true && m.email === q.email : m.quer === (q.quer === false ? false : null);
        if (feito) pedidoEmail = null;
    }
    socket.on('joined', ola);
    if (socket.connected) ola();

    let pend = {}, tEnvio = null;
    function enviar(campos) { Object.assign(pend, campos); clearTimeout(tEnvio); tEnvio = setTimeout(flush, 350); }
    function flush() { if (!Object.keys(pend).length) return; socket.emit('pf-save', { playerId, dados: pend }); pend = {}; }

    socket.on('pf-catalogo', c => {
        cat = c;
        porTicker = Object.fromEntries(c.empresas.map(e => [e.ticker, e]));
        montar();
    });

    socket.on('pf-state', s => {
        const antes = est;
        est = s;
        if (!s.etapa) { mostrar(); return; }
        if (!antes || antes.etapa !== s.etapa) { setorVisto = s.setorAtual; ir(s.etapa); }
        else if (antes.setorAtual !== s.setorAtual) { setorVisto = s.setorAtual; if (vista === 'EMPRESAS') montar(true); }
        else if (vista === 'EMPRESAS' && antes.mostrados.length !== s.mostrados.length) montar();
        mostrar();
    });

    socket.on('pf-me', m => {
        eu = m;
        emailRespondido(m);
        if (!carregado) {
            // Na primeira vez (ou depois de recarregar a página), o servidor sabe o que a pessoa já tinha escolhido
            d = { setores: m.setores, empresas: m.empresas, montante: m.montante, etfPct: m.etfPct, etf: m.etf || null, acoes: m.acoes, reforco: m.reforco, quer: m.quer, email: m.email, consentimento: m.consentimento, confirmado: m.confirmado };
            montanteOutro = !MONTANTES.includes(d.montante);
            reforcoOutro = !REFORCOS.includes(d.reforco);
            carregado = true;
        } else Object.assign(d, { quer: m.quer, email: m.email, consentimento: m.consentimento, confirmado: m.confirmado });
        erroEmail = '';
        if (!vista && est && est.etapa) vista = est.etapa;
        if (vista && (!m.etapa || ETAPAS.indexOf(vista) > ETAPAS.indexOf(m.etapa))) enviar({ etapa: vista });
        montar();
        mostrar();
    });
    socket.on('pf-email-erro', msg => { erroEmail = msg; if (vista === 'EMAIL') montar(); });

    // A fase aparece quando o apresentador a abre e o servidor conhece este jogador
    function mostrar() {
        const on = !!(est && est.etapa && eu && cat);
        root.classList.toggle('show', on);
        document.body.classList.toggle('pf-on', on);
        if (!on) fecharFolha();
    }

    function ir(v) {
        if (!est || ETAPAS.indexOf(v) > ETAPAS.indexOf(est.etapa)) return;
        vista = v;
        if (eu) enviar({ etapa: v });
        fecharFolha();
        montar(true);
    }

    // ── as contas da carteira (as mesmas do servidor) ──
    function contas() {
        const empresas = d.empresas.filter(t => porTicker[t]);
        const etfPct = d.etfPct === null || d.etfPct === undefined ? eu.etfSugerido : d.etfPct;
        const reforco = d.reforco || eu.reforcoCheckin;
        const w = P.pesos(empresas, etfPct);
        const precos = { ETF: etfAtual().preco_eur };
        empresas.forEach(t => { precos[t] = porTicker[t].preco_eur; });
        let acoes = null;
        if (d.acoes) {
            acoes = {};
            Object.keys(w).forEach(t => { if (d.acoes[t] > 0) acoes[t] = d.acoes[t]; });
            if (P.custo(acoes, precos) > d.montante + 0.01) acoes = null;
        }
        const manual = !!acoes;
        if (!acoes) acoes = P.encher(d.montante, w, precos).acoes;
        const sobra = P.r2(d.montante - P.custo(acoes, precos));
        return { empresas, etfPct: empresas.length ? etfPct : 1, reforco, w, precos, acoes, sobra, manual };
    }

    // ── desenhar ──
    function montar(topo) {
        if (!cat || !eu || !est || !est.etapa) return;
        if (!vista) vista = est.etapa;
        const atual = ETAPAS.indexOf(est.etapa);
        $('pf-steps').innerHTML = ETAPAS.map((e, i) => `<button class="pf-step ${e === vista ? 'on' : (i <= atual ? 'open' : '')}" data-a="ir" data-v="${e}" ${i > atual ? 'disabled' : ''}><i></i><span>${NOMES_ETAPA[e]}</span></button>`).join('');
        const main = $('pf-main');
        const html = { SETORES: vSetores, EMPRESAS: vEmpresas, CARTEIRA: vCarteira, PLANO: vPlano, EMAIL: vEmail }[vista]() + (vista === 'EMAIL' ? cartaoGuardar() : '');
        main.innerHTML = `<div class="pf-wrap">${html}</div>`;
        if (vista === 'CARTEIRA') atualizarCarteira();
        if (vista === 'PLANO') atualizarPlano();
        if (vista === 'EMAIL') { atualizarEmail(); }
        barra();
        if (topo) main.scrollTop = 0;
    }
    const passo = v => `<div class="pf-kicker">Passo ${ETAPAS.indexOf(v) + 1} de 5${v === 'EMPRESAS' ? ' · MoneyFlix Picks' : ''}</div>`;
    const aEsperar = proxima => ETAPAS.indexOf(est.etapa) === ETAPAS.indexOf(vista) && proxima ? `<div class="pf-hint">${proxima}</div>` : '';

    function vSetores() {
        return `${passo('SETORES')}
            <h1 class="pf-h1">De que setores gostas?</h1>
            <p class="pf-lead">Escolhe os que te interessam ou de que gostavas de saber mais. Podes escolher vários.</p>
            <div class="pf-sectors">${cat.setores.map(s => `<button class="pf-sector ${d.setores.includes(s.id) ? 'on' : ''}" data-a="setor" data-id="${esc(s.id)}">
                <span class="txt"><b>${esc(s.nome)}</b><small>${esc(s.descricao)}</small></span><span class="ck">✓</span></button>`).join('')}</div>
            ${aEsperar(d.setores.length ? `Escolheste ${d.setores.length}. O apresentador vai mostrar as empresas de cada setor.` : 'Toca nos setores para os escolher.')}`;
    }

    function vEmpresas() {
        const mostrados = est.mostrados.filter(id => cat.setores.some(s => s.id === id));
        if (!setorVisto || !mostrados.includes(setorVisto)) setorVisto = mostrados.includes(est.setorAtual) ? est.setorAtual : mostrados[0];
        const s = cat.setores.find(x => x.id === setorVisto);
        if (!s) return `${passo('EMPRESAS')}<h1 class="pf-h1">As empresas vêm já a seguir.</h1>`;
        const lista = cat.empresas.filter(e => e.setor === s.id);
        return `${passo('EMPRESAS')}
            <div class="pf-chips">${mostrados.map(id => { const x = cat.setores.find(y => y.id === id); return `<button class="pf-chip ${id === setorVisto ? 'on' : ''}" data-a="ver-setor" data-id="${esc(id)}">${esc(x.nome)}${id === est.setorAtual && est.etapa === 'EMPRESAS' && id !== setorVisto ? '<span class="live"></span>' : ''}</button>`; }).join('')}</div>
            <p class="pf-sec-desc">${esc(s.descricao)}</p>
            <div class="pf-list"><div class="pf-list-head"><span>Empresa</span><span>Preço por ação</span></div>${lista.map(e => `<div class="pf-row" data-a="ficha" data-t="${esc(e.ticker)}">
                ${logo(e.ticker)}
                <div class="pf-row-mid"><div class="tk">${esc(e.ticker)}</div><div class="nm">${esc(e.nome)}</div></div>
                <div class="pf-row-end"><b>${eur2(e.preco_eur)}</b>${e.retorno_desde_pick !== null ? `<small class="${e.retorno_desde_pick >= 0 ? 'pos' : 'neg'}">${pctTxt(e.retorno_desde_pick)} desde a pick</small>` : ''}</div>
                <button class="pf-add ${d.empresas.includes(e.ticker) ? 'on' : ''}" data-a="add" data-t="${esc(e.ticker)}" aria-label="${d.empresas.includes(e.ticker) ? 'Tirar da carteira' : 'Adicionar à carteira'}">${d.empresas.includes(e.ticker) ? '✓' : '+'}</button>
            </div>`).join('')}</div>
            <div class="pf-hint">Toca numa empresa para saberes o que faz. Com o + fica na tua carteira.</div>`;
    }

    function vCarteira() {
        const sugestao = eu.perfil === 'indice'
            ? `No jogo, o teu perfil (${esc(eu.perfilNome)}) tinha tudo no índice. Aqui começa com ${Math.round(eu.etfSugerido * 100)} % para experimentares com uma parte pequena em empresas.`
            : `No jogo, o teu perfil (${esc(eu.perfilNome)}) tinha ${Math.round(eu.perfilIndice * 100)} % no índice. Começa igual e muda se quiseres.`;
        const jaTens = 'Já tens um ETF? Põe 0 % e usa isto só para as ações escolhidas.';
        return `${passo('CARTEIRA')}
            <h1 class="pf-h1">Monta a tua carteira</h1>
            <p class="pf-lead">Quanto pões para começar e como divides, aos preços de hoje. Compras ações inteiras: ficam registadas em teu nome.</p>
            <div class="pf-card">
                <div class="pf-card-t">Para começar</div>
                <div class="pf-amounts">${MONTANTES.map(v => `<button class="pf-amt" data-a="montante" data-v="${v}">${eur(v)}</button>`).join('')}<button class="pf-amt" data-a="montante" data-v="outro">Outro</button></div>
                <div class="pf-input-row" id="pf-mont-row"><input class="pf-input" id="pf-mont" type="number" inputmode="numeric" min="100" max="100000" step="50" placeholder="Ex.: 500"><span>€</span></div>
            </div>
            <div class="pf-card" id="pf-etf-card">
                <div class="pf-card-t">Base no ETF de índice <b id="pf-etf-lbl"></b></div>
                <input class="pf-range" id="pf-etf" type="range" min="0" max="100" step="5">
                <div class="pf-range-legend"><span>Só empresas</span><span>Só ETF</span></div>
                <p class="pf-note">${sugestao}</p>
                <p class="pf-note">${jaTens}</p>
            </div>
            <div class="pf-card" id="pf-etf-escolha"></div>
            <div id="pf-dyn"></div>
            ${aEsperar('O apresentador vai avançar para o plano de todos os meses.')}`;
    }

    function atualizarCarteira() {
        const c = contas();
        document.querySelectorAll('[data-a="montante"]').forEach(b => b.classList.toggle('on', b.dataset.v === 'outro' ? montanteOutro : (!montanteOutro && Number(b.dataset.v) === d.montante)));
        $('pf-mont-row').classList.toggle('show', montanteOutro);
        const mont = $('pf-mont');
        if (montanteOutro && document.activeElement !== mont) mont.value = d.montante;
        $('pf-etf-card').style.display = c.empresas.length ? '' : 'none';
        const rng = $('pf-etf');
        if (document.activeElement !== rng) rng.value = Math.round(c.etfPct * 100);
        $('pf-etf-lbl').innerText = `${Math.round(c.etfPct * 100)} %`;
        // A escolha do ETF: só aparece quando há parte no índice e mais do que um ETF no catálogo
        const escolha = $('pf-etf-escolha'), lista = listaEtfs(), atual = etfAtual();
        escolha.style.display = c.w.ETF && lista.length > 1 ? '' : 'none';
        escolha.innerHTML = `<div class="pf-card-t">Qual ETF? <span style="text-transform:none;letter-spacing:0;font-weight:500">um só</span></div>
            <div class="pf-etfs">${lista.map(e => `<div class="pf-etf ${e.codigo === atual.codigo ? 'on' : ''}" data-a="etf-ficha" data-c="${esc(e.codigo)}">
                <span class="radio"></span><div class="mid"><b>${esc(e.codigo)}</b><small>${esc(e.indice || e.nome)}</small></div><div class="end">${eur2(e.preco_eur)}</div></div>`).join('')}</div>
            <p class="pf-note">Toca num ETF para veres o que é e escolheres.</p>`;

        const ativos = Object.keys(c.w);
        const investido = d.montante - c.sobra;
        const linhas = ativos.map(t => {
            const e = t === 'ETF' ? etfAtual() : porTicker[t];
            const n = c.acoes[t] || 0;
            const preco = c.precos[t];
            const nota = t === 'ETF' && etfAtual().ilustrativo ? 'Preço ilustrativo' : t === 'ETF' && etfAtual().preco_data && n ? `Preço de ${esc(dataCurta(etfAtual().preco_data))}` : (n === 0 && preco > c.sobra ? 'Ainda não chega: fica para o plano mensal' : '');
            return `<div class="pf-pos">
                <div class="r1">${logo(t)}<div class="mid"><b>${esc(nomeT(t))}</b><small>${n ? `${n} ${t === 'ETF' ? (n === 1 ? 'unidade' : 'unidades') : (n === 1 ? 'ação' : 'ações')} a ${eur2(preco)}` : `${esc(e.nome)} · ${eur2(preco)}`}</small></div><div class="val">${eur(n * preco)}</div></div>
                <div class="r2"><em>${nota}</em><div class="pf-step-ctl"><button data-a="menos" data-t="${esc(t)}" ${n ? '' : 'disabled'} aria-label="Menos uma">−</button><span>${n}</span><button data-a="mais" data-t="${esc(t)}" ${preco <= c.sobra + 1e-9 ? '' : 'disabled'} aria-label="Mais uma">+</button></div></div>
            </div>`;
        }).join('');
        const barras = ativos.filter(t => c.acoes[t]).map(t => `<i style="width:${(c.acoes[t] * c.precos[t] / d.montante * 100).toFixed(2)}%;background:${cor(t)}"></i>`).join('');
        const legenda = ativos.filter(t => c.acoes[t]).map(t => `<span><i style="background:${cor(t)}"></i>${esc(nomeT(t))} ${Math.round(c.acoes[t] * c.precos[t] / d.montante * 100)} %</span>`).join('');
        $('pf-dyn').innerHTML = `
            <div class="pf-card">
                <div class="pf-card-t">A tua carteira</div>
                <div class="pf-total"><b>${Math.abs(investido - Math.round(investido)) < 0.005 ? eur(investido) : eur2(investido)}</b><span>investidos de ${eur(d.montante)}</span></div>
                <div class="pf-stack">${barras}</div>
                <div class="pf-legend">${legenda}</div>
            </div>
            ${c.empresas.length ? '' : `<div class="pf-lesson">Não escolheste empresas, por isso fica tudo no ETF. Podes voltar às <button class="pf-link" data-a="ir" data-v="EMPRESAS" style="padding:0">empresas</button> e escolher algumas.</div>`}
            <div class="pf-card"><div class="pf-card-t">Ações <span>quantas compras</span></div>${linhas}${c.sobra >= 1 ? `
                <div class="pf-pos"><div class="r1"><span class="pf-logo pf-logo-cash">€</span><div class="mid"><b>Por investir</b><small>Entra no primeiro mês do plano</small></div><div class="val">${eur2(c.sobra)}</div></div></div>` : ''}</div>
            ${c.manual ? '<button class="pf-link" data-a="auto">Repor a divisão automática</button>' : ''}`;
    }

    function vPlano() {
        return `${passo('PLANO')}
            <h1 class="pf-h1">O teu plano de todos os meses</h1>
            <div class="pf-card">
                <div class="pf-card-t">Quanto pões por mês</div>
                <div class="pf-amounts four">${REFORCOS.map(v => `<button class="pf-amt" data-a="reforco" data-v="${v}">${v} €</button>`).join('')}<button class="pf-amt" data-a="reforco" data-v="outro">Outro</button></div>
                <div class="pf-input-row" id="pf-ref-row"><input class="pf-input" id="pf-ref" type="number" inputmode="numeric" min="10" max="10000" step="10" placeholder="Ex.: 75"><span>€</span></div>
                <p class="pf-note">No check-in disseste ${eur(eu.reforcoCheckin)} por mês.</p>
            </div>
            <div id="pf-dyn"></div>`;
    }

    // A lição: se a ação custa mais do que o reforço, junta-se alguns meses e compra-se
    function licao(c) {
        const caras = c.empresas.map(t => porTicker[t]).filter(e => e.preco_eur > c.reforco).sort((a, b) => b.preco_eur - a.preco_eur);
        const alcance = caras.filter(e => P.mesesPara(e.preco_eur, c.reforco) <= P.MAX_ESPERA);
        const longe = caras.filter(e => P.mesesPara(e.preco_eur, c.reforco) > P.MAX_ESPERA);
        const partes = [];
        if (alcance.length) {
            const e = alcance[0], m = P.mesesPara(e.preco_eur, c.reforco);
            partes.push(`Uma ação da <b>${esc(e.nome)}</b> custa ${eur(e.preco_eur)} e tu pões ${eur(c.reforco)} por mês. Não é impossível: juntas ${m} meses e compras.`);
        } else if (!longe.length) {
            partes.push(`Se pões 50 € por mês e uma ação custa 100 €, não é impossível: juntas 2 meses e compras. Com ${eur(c.reforco)} por mês, todas as tuas empresas cabem num mês.`);
        }
        if (longe.length) {
            const e = longe[0];
            partes.push(`A <b>${esc(e.nome)}</b> custa ${eur(e.preco_eur)}: com ${eur(c.reforco)} por mês levavas ${P.mesesPara(e.preco_eur, c.reforco)} meses a juntar. Começa pelas outras e chega lá depois.`);
        }
        return partes.map(p => `<div class="pf-lesson">${p}</div>`).join('');
    }

    function calendario(meses, precos) {
        return meses.map(m => {
            const espera = !m.compras.length;
            const alvo = m.a_juntar_para;
            const progresso = alvo && precos[alvo] ? Math.min(100, m.por_investir / precos[alvo] * 100) : 0;
            return `<div class="pf-mo ${espera ? 'wait' : ''}">
                <div class="mh"><span>${esc(m.mes_texto)}</span></div>
                ${m.compras.length ? `<div class="buys">${m.compras.map(x => `<span class="buy" style="background:${cor(x.ticker)}">${esc(nomeT(x.ticker))}${x.acoes > 1 ? ' ×' + x.acoes : ''}</span>`).join('')}</div>` : ''}
                ${espera && alvo ? `<div class="save">A juntar para ${esc(nomeT(alvo))}</div>` : ''}
                ${!espera && alvo && m.por_investir >= 1 ? `<div class="save">${eur(m.por_investir)} guardados</div>` : ''}
                ${espera && !alvo ? '<div class="save">A juntar</div>' : ''}
                ${alvo ? `<div class="bar"><i style="width:${progresso.toFixed(0)}%"></i></div>` : `<div class="kept">${m.por_investir >= 1 ? eur(m.por_investir) + ' guardados' : ''}</div>`}
            </div>`;
        }).join('');
    }

    function atualizarPlano() {
        const c = contas();
        document.querySelectorAll('[data-a="reforco"]').forEach(b => b.classList.toggle('on', b.dataset.v === 'outro' ? reforcoOutro : (!reforcoOutro && Number(b.dataset.v) === c.reforco)));
        $('pf-ref-row').classList.toggle('show', reforcoOutro);
        const inp = $('pf-ref');
        if (reforcoOutro && document.activeElement !== inp) inp.value = c.reforco;
        const p = P.plano({ w: c.w, precos: c.precos, acoes: c.acoes, caixa: c.sobra, reforco: c.reforco, inicio: eu.inicio });
        const posto = d.montante + c.reforco * p.meses.length;
        const tenho = Object.keys(c.w).filter(t => p.acoes[t]).map(t => `<span>${esc(nomeT(t))} ×${p.acoes[t]}</span>`).join('');
        $('pf-dyn').innerHTML = `
            ${licao(c)}
            <div class="pf-card"><div class="pf-card-t">Os próximos 12 meses <span style="text-transform:none;letter-spacing:0;font-weight:500">aos preços de hoje</span></div>
                <div class="pf-cal">${calendario(p.meses, c.precos)}</div>
                <p class="pf-note">É um investimento recorrente: todos os meses entra o reforço. Compras a ação que está mais abaixo do que querias; se ainda não chega para uma ação inteira, juntas para o mês seguinte. Assim cada ação fica registada em teu nome.</p>
            </div>
            <div class="pf-card"><div class="pf-card-t">Daqui a um ano</div>
                <div class="pf-total"><b>${eur(posto)}</b><span>postos por ti (${eur(d.montante)} + 12 × ${eur(c.reforco)})</span></div>
                <div class="pf-hold">${tenho}</div>
                ${p.por_investir >= 1 ? `<p class="pf-note">E ${eur2(p.por_investir)} guardados para a próxima compra.</p>` : ''}
            </div>
            <div class="pf-big-msg">Não importa por onde começas.<br><span>O importante é começar.</span></div>
            ${aEsperar('O apresentador vai avançar para o último passo.')}`;
    }

    // Gralhas comuns no domínio do email: «Querias dizer ana@gmail.com?»
    const DOMINIOS = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.pt': 'gmail.com', 'gmail.con': 'gmail.com', 'gnail.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.om': 'gmail.com',
        'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.pt': 'hotmail.com',
        'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.con': 'outlook.com',
        'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com', 'sapo.com': 'sapo.pt', 'sapo.p': 'sapo.pt' };
    function sugerirDominio(email) {
        const m = String(email || '').toLowerCase().match(/^(.+)@(.+)$/);
        return m && DOMINIOS[m[2]] ? `${m[1]}@${DOMINIOS[m[2]]}` : null;
    }
    const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,}$/i;
    function vEmail() {
        const c = contas();
        const resumo = `${eur(d.montante)} para começar e ${eur(c.reforco)} por mês · ${c.empresas.length ? `${c.empresas.length} ${c.empresas.length === 1 ? 'empresa' : 'empresas'} e ${Math.round(c.etfPct * 100)} % no ETF` : 'tudo no ETF'}`;
        if (d.quer === true && !d.confirmado) {
            const sug = sugerirDominio(d.email);
            return `${passo('EMAIL')}
                <h1 class="pf-h1">Vamos enviar o teu plano para:</h1>
                <div class="pf-confirm">${esc(d.email)}</div>
                ${sug ? `<div class="pf-left"><span>Querias dizer <b>${esc(sug)}</b>?</span></div><button class="btn btn-secondary" data-a="email-sugestao" data-v="${esc(sug)}">Usar ${esc(sug)}</button>` : ''}
                <p class="pf-lead">Confirma que está bem escrito, para o plano chegar ao sítio certo.</p>
                <button class="btn btn-primary" data-a="email-confirmar">Sim, está certo</button>
                <button class="btn btn-secondary" data-a="email-corrigir">Corrigir</button>`;
        }
        if (d.quer === true) {
            return `${passo('EMAIL')}
                <h1 class="pf-h1">Combinado!</h1>
                <div class="pf-done">Vais receber o teu plano em<br><b>${esc(d.email)}</b></div>
                <div class="pf-card"><div class="pf-card-t">O teu plano</div><div class="pf-f-txt">${resumo}</div></div>
                <div class="pf-big-msg">Não importa por onde começas.<br><span>O importante é começar.</span></div>
                <button class="pf-link" data-a="email-mudar">Mudar o email</button>
                ${cartaoF24()}`;
        }
        if (d.quer === false) {
            return `${passo('EMAIL')}
                <h1 class="pf-h1">Sem problema.</h1>
                <p class="pf-lead">O teu plano fica aqui no telemóvel enquanto a sessão durar. Podes voltar atrás e ver tudo.</p>
                <div class="pf-card"><div class="pf-card-t">O teu plano</div><div class="pf-f-txt">${resumo}</div></div>
                <div class="pf-big-msg">Não importa por onde começas.<br><span>O importante é começar.</span></div>
                <button class="pf-link" data-a="email-mudar">Afinal quero receber por email</button>
                ${cartaoF24()}`;
        }
        return `${passo('EMAIL')}
            <h1 class="pf-h1">Queres receber o teu plano por email?</h1>
            <p class="pf-lead">Mandamos-te a tua carteira e o calendário de compras, para teres tudo à mão.</p>
            <div class="pf-card">
                <div class="pf-card-t">O teu plano</div><div class="pf-f-txt">${resumo}</div>
            </div>
            <div class="pf-card">
                <label class="pf-card-t" for="pf-email" style="margin-bottom:0">O teu email</label>
                <input class="pf-input" id="pf-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="nome@exemplo.pt" maxlength="254" value="${esc(d.email || '')}">
                <label class="pf-check"><input type="checkbox" id="pf-consent" ${d.consentimento ? 'checked' : ''}><span>${esc(cat.consentimento)}</span></label>
                ${erroEmail ? `<div class="pf-err">${esc(erroEmail)}</div>` : ''}
            </div>
            <button class="btn btn-primary" id="pf-email-btn" data-a="email-sim" disabled>Quero receber o plano</button>
            <button class="pf-link" data-a="email-nao">Não, obrigado</button>`;
    }
    // O passo seguinte, depois do email: abrir conta na Freedom24 (link de afiliado da MoneyFlix)
    function cartaoF24() {
        const f = cat.f24;
        if (!f) return '';
        const pronto = /^https?:\/\//.test(f.link);
        return `<div class="pf-card pf-f24">
            <div class="pf-f24-t">${esc(f.titulo)}</div>
            <ul>${f.vantagens.map(v => `<li>${esc(v)}</li>`).join('')}</ul>
            ${pronto ? `<a class="btn btn-primary" href="${esc(f.link)}" target="_blank" rel="noopener">${esc(f.botao)}</a>` : `<div class="btn btn-secondary pf-f24-falta">${esc(f.link)}</div>`}
        </div>`;
    }
    // O QR do link (a biblioteca só se carrega quando é preciso)
    function qrF24() {
        const el = $('pf-f24-qr');
        if (!el || !cat.f24) return;
        const desenhar = () => { el.innerHTML = ''; new QRCode(el, { text: cat.f24.link, width: 160, height: 160, colorDark: '#1D1D1F', colorLight: '#ffffff' }); };
        if (window.QRCode) return desenhar();
        if (!qrF24.pedido) {
            qrF24.pedido = true;
            const sc = document.createElement('script');
            sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
            sc.onload = () => qrF24();
            document.head.appendChild(sc);
        }
    }
    // «Guarda o teu plano»: o essencial em texto simples, para colar no Notas ou mandar a si próprio (se a rede ou o email falharem)
    function textoPlano() {
        const c = contas();
        const p = P.plano({ w: c.w, precos: c.precos, acoes: c.acoes, caixa: c.sobra, reforco: c.reforco, inicio: eu.inicio });
        const linhas = ['O meu plano MoneyFlix (exercício)', '', `Perfil: ${eu.perfilNome}`, `Para começar: ${eur(d.montante)}`, `Por mês: ${eur(c.reforco)}`, '', 'Compra inicial:'];
        Object.keys(c.w).filter(t => c.acoes[t]).forEach(t => {
            const n = c.acoes[t], nome = t === 'ETF' ? etfAtual().nome : porTicker[t].nome;
            linhas.push(`- ${nomeT(t)} (${nome}): ${n} ${t === 'ETF' ? (n === 1 ? 'unidade' : 'unidades') : (n === 1 ? 'ação' : 'ações')}`);
        });
        if (c.sobra >= 1) linhas.push(`- Por investir: ${eur(c.sobra)}`);
        const outras = c.empresas.filter(t => !c.acoes[t]);
        if (outras.length) linhas.push('', `A juntar para: ${outras.join(', ')}`);
        const meses = p.meses.filter(m => m.compras.length).slice(0, 3).map(m => `- ${m.mes_texto}: ${m.compras.map(x => `${nomeT(x.ticker)}${x.acoes > 1 ? ' x' + x.acoes : ''}`).join(', ')}`);
        if (meses.length) linhas.push('', 'Próximas compras:', ...meses);
        linhas.push('', 'Ações inteiras: ficam em meu nome.');
        if (cat.f24 && /^https?:\/\//.test(cat.f24.link)) linhas.push('', 'Próximo passo: abrir conta na Freedom24', cat.f24.link);
        return linhas.join('\n');
    }
    function cartaoGuardar() {
        const partilha = typeof navigator.share === 'function';
        return `<div class="pf-card pf-guardar">
            <div class="pf-f24-t">Guarda o teu plano</div>
            <p class="pf-note" style="margin:0">Copia e cola no bloco de notas, para o teres mesmo que o email falhe.</p>
            <pre class="pf-guardar-txt">${esc(textoPlano())}</pre>
            <div class="pf-guardar-btns"><button class="btn btn-primary" data-a="copiar">Copiar</button>${partilha ? '<button class="btn btn-secondary" data-a="partilhar">Partilhar</button>' : ''}</div>
        </div>`;
    }
    async function copiar(texto) {
        try { await navigator.clipboard.writeText(texto); return true; } catch (e) {}
        // Sem acesso à área de transferência (http ou browser antigo): copia por uma caixa de texto escondida
        const ta = document.createElement('textarea');
        ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, texto.length);
        let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
        ta.remove(); return ok;
    }
    function atualizarEmail() {
        const btn = $('pf-email-btn');
        if (!btn) return;
        btn.disabled = !(EMAIL_RE.test($('pf-email').value.trim()) && $('pf-consent').checked);
    }

    // A barra de baixo nas empresas: o que já está na carteira
    function barra() {
        const bar = $('pf-bar');
        const on = vista === 'EMPRESAS';
        bar.classList.toggle('show', on);
        if (!on) return;
        const n = d.empresas.length;
        bar.innerHTML = `<div class="pf-bar-in"><div class="pf-bar-txt"><b>${n ? `${n} ${n === 1 ? 'empresa' : 'empresas'} na tua carteira` : 'A tua carteira está vazia'}</b><span>${n ? d.empresas.map(esc).join(' · ') : 'Escolhe com o + as que quiseres'}</span></div>${n ? '<button class="btn btn-secondary" data-a="selecao">Ver</button>' : ''}</div>`;
    }

    // ── a ficha e a lista da carteira (folha que sobe de baixo) ──
    function abrirFolha(html) {
        $('pf-sheet').innerHTML = `<div class="pf-sheet-in"><div class="pf-grab"></div>${html}</div>`;
        $('pf-sheet').scrollTop = 0;
        $('pf-sheet').classList.add('show');
        $('pf-sheet-bg').classList.add('show');
    }
    function fecharFolha() { $('pf-sheet').classList.remove('show'); $('pf-sheet-bg').classList.remove('show'); folhaAberta = null; }
    let folhaAberta = null;
    // A ficha de um ETF, com o botão para o escolher
    function fichaEtf(codigo) {
        const e = listaEtfs().find(x => x.codigo === codigo);
        if (!e) return;
        folhaAberta = { tipo: 'etf', codigo };
        const escolhido = etfAtual().codigo === codigo;
        const cob = e.cobertura_cambial === true || /sim|eur/i.test(String(e.cobertura_cambial || '')) ? 'Sim (protege do câmbio euro/dólar)' : e.cobertura_cambial === false ? 'Não' : null;
        abrirFolha(`
            <div class="pf-f-top"><span class="pf-logo big" style="background:var(--accent);color:#fff">${esc(e.codigo.slice(0, 4))}</span><div><div class="tk">${esc(e.codigo)}</div><h3>${esc(e.nome_completo || e.nome)}</h3></div></div>
            <div class="pf-f-price"><b>${eur2(e.preco_eur)}</b><span>por unidade${e.moeda !== 'EUR' ? ` · ${precoNativo(e.preco, e.moeda)} na bolsa` : ''}</span></div>
            <div class="pf-kv"><div class="pf-f-sec">Informação</div>
                ${e.indice ? `<div><span>Índice</span><b>${esc(e.indice)}</b></div>` : ''}
                ${cob ? `<div><span>Cobertura cambial</span><b>${esc(cob)}</b></div>` : ''}
                ${e.isin ? `<div><span>ISIN</span><b>${esc(e.isin)}</b></div>` : ''}
                ${e.bolsa ? `<div><span>Bolsa</span><b>${esc(e.bolsa)}</b></div>` : ''}
                ${e.preco_data ? `<div><span>Preço de</span><b>${esc(dataCurta(e.preco_data))}${e.ilustrativo ? ' (ilustrativo)' : ''}</b></div>` : ''}
                <div><span>Compra mínima</span><b>1 unidade inteira</b></div></div>
            ${e.descricao ? `<div><div class="pf-f-sec">O que é</div><div class="pf-f-txt">${esc(e.descricao)}</div></div>` : ''}
            <div class="pf-sheet-cta"><button class="btn ${escolhido ? 'btn-secondary' : 'btn-primary'}" data-a="etf-escolher" data-c="${esc(e.codigo)}" ${escolhido ? 'disabled' : ''}>${escolhido ? 'É o teu ETF' : `Escolher o ${esc(e.codigo)}`}</button>
            <button class="pf-link" data-a="fechar">Fechar</button></div>`);
    }

    function ficha(t) {
        const e = porTicker[t];
        if (!e) return;
        folhaAberta = { tipo: 'ficha', t };
        const s = cat.setores.find(x => x.id === e.setor) || {};
        const na = d.empresas.includes(t);
        abrirFolha(`
            <div class="pf-f-top">${logo(t, 'big')}<div><div class="tk">${esc(t)}</div><h3>${esc(e.nome)}</h3></div></div>
            <div class="pf-f-price"><b>${eur2(e.preco_eur)}</b><span>por ação${e.moeda !== 'EUR' ? ` · ${precoNativo(e.preco, e.moeda)} na bolsa` : ''}${e.retorno_desde_pick !== null ? ` · <span class="${e.retorno_desde_pick >= 0 ? 'pos' : 'neg'}">${pctTxt(e.retorno_desde_pick)} desde a pick</span>` : ''}</span></div>
            <div class="pf-kv"><div class="pf-f-sec">Informação</div>
                <div><span>Setor</span><b>${esc(s.nome || e.setor)}</b></div>
                ${e.tipo && TIPOS[e.tipo] ? `<div><span>Tipo</span><b>${TIPOS[e.tipo].nome}</b></div>` : ''}
                ${e.data_pick ? `<div><span>Nas MoneyFlix Picks desde</span><b>${esc(dataTxt(e.data_pick))}</b></div>` : ''}
                <div><span>Compra mínima</span><b>1 ação inteira</b></div></div>
            ${e.descricao ? `<div><div class="pf-f-sec">O que faz</div><div class="pf-f-txt">${esc(e.descricao)}</div></div>` : ''}
            ${e.tipo && TIPOS[e.tipo] ? `<div><div class="pf-f-sec">${TIPOS[e.tipo].nome}</div><div class="pf-f-txt">${TIPOS[e.tipo].txt}</div></div>` : ''}
            <p class="pf-note">Compras ações inteiras: cada uma fica registada em teu nome.</p>
            <div class="pf-sheet-cta"><button class="btn ${na ? 'btn-secondary' : 'btn-primary'}" data-a="add" data-t="${esc(t)}" data-fechar="1">${na ? 'Tirar da minha carteira' : 'Adicionar à minha carteira'}</button>
            <button class="pf-link" data-a="fechar">Fechar</button></div>`);
    }
    function selecao() {
        folhaAberta = { tipo: 'selecao' };
        abrirFolha(`<h3 style="font-size:1.2rem">A tua carteira</h3>
            <div class="pf-list">${d.empresas.map(t => { const e = porTicker[t]; return e ? `<div class="pf-row" data-a="ficha" data-t="${esc(t)}">${logo(t)}<div class="pf-row-mid"><div class="tk">${esc(t)} ${tipoPill(e.tipo)}</div><div class="nm">${esc(e.nome)}</div></div><div class="pf-row-end"><b>${eur2(e.preco_eur)}</b></div><button class="pf-add on" data-a="add" data-t="${esc(t)}" aria-label="Tirar da carteira">✓</button></div>` : ''; }).join('')}</div>
            <button class="pf-link" data-a="fechar">Fechar</button>`);
    }

    function alternarEmpresa(t) {
        const i = d.empresas.indexOf(t);
        if (i >= 0) d.empresas.splice(i, 1);
        else if (d.empresas.length >= cat.maxEmpresas) { toast(`Máximo de ${cat.maxEmpresas} empresas. Tira uma para pores outra.`); return; }
        else d.empresas.push(t);
        d.acoes = null;
        vibrar();
        enviar({ empresas: d.empresas, acoes: null });
    }

    // ── toques ──
    root.addEventListener('click', ev => {
        const el = ev.target.closest('[data-a]');
        if (!el || el.disabled) return;
        const a = el.dataset.a;
        if (a === 'ir') return ir(el.dataset.v);
        if (a === 'setor') {
            const id = el.dataset.id, i = d.setores.indexOf(id);
            i >= 0 ? d.setores.splice(i, 1) : d.setores.push(id);
            vibrar(); enviar({ setores: d.setores });
            return montar();
        }
        if (a === 'ver-setor') { setorVisto = el.dataset.id; return montar(true); }
        if (a === 'ficha') return ficha(el.dataset.t);
        if (a === 'add') {
            alternarEmpresa(el.dataset.t);
            if (folhaAberta && folhaAberta.tipo === 'ficha') { el.dataset.fechar ? fecharFolha() : ficha(el.dataset.t); }
            else if (folhaAberta && folhaAberta.tipo === 'selecao') { d.empresas.length ? selecao() : fecharFolha(); }
            return montar();
        }
        if (a === 'selecao') return selecao();
        if (a === 'fechar') return fecharFolha();
        if (a === 'montante') {
            montanteOutro = el.dataset.v === 'outro';
            if (!montanteOutro) d.montante = Number(el.dataset.v);
            d.acoes = null; enviar({ montante: d.montante, acoes: null });
            atualizarCarteira();
            if (montanteOutro) { const m = $('pf-mont'); m.value = d.montante; m.focus(); m.select(); }
            return;
        }
        if (a === 'mais' || a === 'menos') {
            const c = contas();
            const acoes = { ...c.acoes };
            const t = el.dataset.t;
            acoes[t] = Math.max(0, (acoes[t] || 0) + (a === 'mais' ? 1 : -1));
            if (P.custo(acoes, c.precos) > d.montante + 0.01) return;
            d.acoes = acoes; vibrar(); enviar({ acoes });
            return atualizarCarteira();
        }
        if (a === 'etf-ficha') return fichaEtf(el.dataset.c);
        if (a === 'etf-escolher') {
            d.etf = el.dataset.c; d.acoes = null;   // muda o preço da unidade: a divisão volta a ser automática
            vibrar(); enviar({ etf: d.etf, acoes: null });
            fecharFolha();
            if (vista === 'CARTEIRA') atualizarCarteira(); else montar();
            return;
        }
        if (a === 'auto') { d.acoes = null; enviar({ acoes: null }); return atualizarCarteira(); }
        if (a === 'reforco') {
            reforcoOutro = el.dataset.v === 'outro';
            if (!reforcoOutro) { d.reforco = Number(el.dataset.v); enviar({ reforco: d.reforco }); }
            atualizarPlano();
            if (reforcoOutro) { const r = $('pf-ref'); r.value = contas().reforco; r.focus(); r.select(); }
            return;
        }
        if (a === 'email-sim') {
            const email = $('pf-email').value.trim(), consentimento = $('pf-consent').checked;
            if (!EMAIL_RE.test(email) || !consentimento) return;
            flush();
            pedirEmail('pf-email', { quer: true, email, consentimento });
            el.disabled = true; el.innerText = 'A guardar…';
            return;
        }
        if (a === 'email-nao') { flush(); pedirEmail('pf-email', { quer: false }); return; }
        if (a === 'email-mudar' || a === 'email-corrigir') {
            d.quer = null; d.confirmado = false; erroEmail = '';
            pedirEmail('pf-email', { quer: null });
            montar();
            const inp = $('pf-email'); if (inp) { inp.focus(); inp.select(); }
            return;
        }
        if (a === 'copiar') { copiar(textoPlano()).then(ok => toast(ok ? 'Copiado. Cola no bloco de notas.' : 'Não deu para copiar: seleciona o texto e copia à mão.')); return; }
        if (a === 'partilhar') { navigator.share({ title: 'O meu plano MoneyFlix', text: textoPlano() }).catch(() => {}); return; }
        if (a === 'email-confirmar') { pedirEmail('pf-email-confirmar', { email: d.email }); vibrar(); return; }
        if (a === 'email-sugestao') {
            const email = el.dataset.v;
            pedirEmail('pf-email', { quer: true, email, consentimento: true });
            d.email = email; return montar();
        }
    });
    $('pf-sheet-bg').addEventListener('click', fecharFolha);

    // Campos de texto: atualizam o resto sem redesenhar o próprio campo (para não fechar o teclado)
    root.addEventListener('input', ev => {
        const id = ev.target.id;
        if (id === 'pf-mont') {
            const v = Math.round(Number(ev.target.value));
            if (v >= 100 && v <= 100000) { d.montante = v; d.acoes = null; enviar({ montante: v, acoes: null }); atualizarCarteira(); }
        }
        if (id === 'pf-etf') {
            d.etfPct = Number(ev.target.value) / 100; d.acoes = null;
            enviar({ etfPct: d.etfPct, acoes: null }); atualizarCarteira();
        }
        if (id === 'pf-ref') {
            const v = Math.round(Number(ev.target.value));
            if (v >= 10 && v <= 10000) { d.reforco = v; enviar({ reforco: v }); atualizarPlano(); }
        }
        if (id === 'pf-email' || id === 'pf-consent') atualizarEmail();
    });
    root.addEventListener('change', ev => { if (ev.target.id === 'pf-consent') atualizarEmail(); });
})();
