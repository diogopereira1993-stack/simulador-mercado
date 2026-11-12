// Fase 2 no ecrã grande: o que a sala está a escolher. Usa o `socket` do ecra.html.
(function () {
    if (typeof socket === 'undefined') return;
    const $ = id => document.getElementById(id);
    const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const grupo = n => String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const eur = v => grupo(Math.round(v)) + ' €';
    const CORES = ['#5E5CE6', '#FF9F0A', '#1FA84F', '#E5484D', '#0E9AA7', '#AF52DE', '#B45309', '#D63384', '#3A8F5C', '#6E6E73', '#8E5A2B', '#C2410C'];
    function cor(t) { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; }
    const TIPOS = { defensiva: 'Defensiva', crescimento: 'Crescimento', ciclica: 'Cíclica' };
    const NOMES = { SETORES: 'Setores', EMPRESAS: 'Empresas', CARTEIRA: 'Carteira', PLANO: 'Plano mensal', EMAIL: 'O teu plano por email' };

    const root = document.createElement('div');
    root.id = 'pf-ecra';
    document.body.appendChild(root);

    let cat = null, est = null;
    const ola = () => socket.emit('pf-hello', {});
    socket.on('connect', ola);
    if (socket.connected) ola();
    socket.on('pf-catalogo', c => { cat = c; render(); });
    socket.on('pf-state', s => { est = s; render(); });

    function render() {
        const on = !!(cat && est && est.etapa);
        root.classList.toggle('show', on);
        if (!on) return;
        const s = est.stats, i = est.etapas.indexOf(est.etapa) + 1;
        const topo = `<div class="top"><img src="logo-moneyflix.png" alt="MoneyFlix"><span class="k">Monta a tua carteira · Passo ${i} de 5 · ${NOMES[est.etapa]}</span><span class="n">Entra em ${esc(location.host)}</span></div>`;
        root.innerHTML = topo + ({ SETORES: setores, EMPRESAS: empresas, CARTEIRA: carteira, PLANO: plano, EMAIL: email }[est.etapa])(s)
            + (est.etapa === 'EMAIL' ? f24() : '');
        if (est.etapa === 'EMAIL') desenharQR();
    }

    function setores(s) {
        const lista = cat.setores.map(x => ({ ...x, n: s.setores[x.id] || 0 })).sort((a, b) => b.n - a.n);
        const max = Math.max(1, ...lista.map(x => x.n));
        return `<div><h2>De que setores gostas?</h2><p class="sub">Escolhe no telemóvel os que te interessam ou de que gostavas de saber mais. Podes escolher vários.</p></div>
            <div class="body"><div class="pfe-bars">${lista.map((x, k) => `<div class="pfe-bar ${k === 0 && x.n ? 'lead' : ''}"><span>${esc(x.nome)}</span><div class="track"><div class="fill" style="width:${(x.n / max * 100).toFixed(1)}%"></div></div><b>${x.n}</b></div>`).join('')}</div></div>
            <p class="sub">${s.comSetores} de ${s.pessoas} já ${s.comSetores === 1 ? 'escolheu' : 'escolheram'}.</p>`;
    }

    function empresas(s) {
        const setor = cat.setores.find(x => x.id === est.setorAtual);
        if (!setor) return '';
        const lista = cat.empresas.filter(e => e.setor === setor.id);
        const n = lista.length;
        // Até 6 empresas, cartões com a descrição; mais do que isso, só o essencial para caber no ecrã
        const cols = n <= 3 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 5;
        const compacto = n > 6;
        const pos = est.ordem.indexOf(setor.id) + 1;
        return `<div><h2>${esc(setor.nome)}</h2><p class="sub">${esc(setor.descricao)} <span style="color:var(--muted)">· Setor ${pos} de ${est.ordem.length}</span></p></div>
            <div class="body"><div class="pfe-grid ${compacto ? 'compacto' : ''}" style="grid-template-columns:repeat(${cols},1fr)">${lista.map(e => `<div class="pfe-co">
                <div class="hd"><span class="pf-logo" style="background:${cor(e.ticker)}">${esc(e.ticker.slice(0, 4))}${e.logo ? `<img src="${esc(e.logo)}" alt="" onerror="this.remove()">` : ''}</span><div><div class="tk">${esc(e.ticker)}</div><div class="nm">${esc(e.nome)}</div></div></div>
                ${!compacto && e.descricao ? `<p>${esc(e.descricao.split(/(?<=\.)\s/)[0])}</p>` : ''}
                <div class="ft">${e.tipo ? `<span class="pf-tipo ${e.tipo}">${TIPOS[e.tipo]}</span>` : '<span></span>'}<span>${eur(e.preco_eur)}</span></div>
                <div class="ft"><span class="likes">${s.empresas[e.ticker] ? `+ ${s.empresas[e.ticker]} na carteira` : ''}</span></div>
            </div>`).join('')}</div></div>`;
    }

    function carteira(s) {
        const top = Object.entries(s.empresas).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const max = Math.max(1, ...top.map(x => x[1]));
        const porT = Object.fromEntries(cat.empresas.map(e => [e.ticker, e]));
        return `<div><h2>Monta a tua carteira</h2><p class="sub">Quanto pões para começar e como divides. Compras ações inteiras: se uma custa mais do que tens, fica para o plano mensal.</p></div>
            <div class="body" style="gap:4vh">
                <div class="pfe-stats">
                    <div class="pfe-stat"><b>${s.carteiras}</b><span>${s.carteiras === 1 ? 'carteira montada' : 'carteiras montadas'}</span></div>
                    <div class="pfe-stat"><b>${s.carteiras ? eur(s.montanteMedio) : '—'}</b><span>para começar, em média</span></div>
                    <div class="pfe-stat"><b>${s.carteiras ? Math.round(s.etfMedio * 100) + ' %' : '—'}</b><span>no ETF de índice, em média${s.porEtf && Object.keys(s.porEtf).length > 1 ? `<br>${Object.entries(s.porEtf).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}` : ''}</span></div>
                </div>
                ${top.length ? `<div><div class="sub" style="margin:0 0 1.6vh;font-weight:700">As empresas mais escolhidas</div><div class="pfe-bars">${top.map(([t, n]) => `<div class="pfe-bar"><span>${esc(t)} · ${esc(porT[t] ? porT[t].nome : '')}</span><div class="track"><div class="fill" style="width:${(n / max * 100).toFixed(1)}%;background:${cor(t)}"></div></div><b>${n}</b></div>`).join('')}</div></div>` : ''}
            </div>`;
    }

    // O exemplo da sala: 50 € por mês e uma ação de 100 €
    function plano() {
        const meses = ['Mês 1', 'Mês 2', 'Mês 3', 'Mês 4', 'Mês 5', 'Mês 6'];
        const cal = meses.map((m, k) => k % 2 === 0
            ? `<div class="pf-mo wait"><div class="mh"><span>${m}</span></div><div class="save">50 € guardados</div><div class="bar"><i style="width:50%"></i></div></div>`
            : `<div class="pf-mo"><div class="mh"><span>${m}</span></div><div class="buys"><span class="buy" style="background:var(--accent)">Compras 1 ação</span></div></div>`).join('');
        return `<div><h2>Pões 50 € por mês e a ação custa 100 €?</h2><p class="sub">Não é impossível: juntas 2 meses e compras. No telemóvel tens o teu calendário, com o teu reforço e as tuas empresas.</p></div>
            <div class="body" style="gap:5vh"><div class="pfe-cal">${cal}</div>
            <div class="pfe-big">Não importa por onde começas.<br><span>O importante é começar.</span></div></div>`;
    }

    function email(s) {
        return `<div><h2>Queres receber o teu plano por email?</h2><p class="sub">No telemóvel: escreve o email e marca a caixa do consentimento. Recebes a tua carteira e o calendário de compras.</p></div>
            <div class="body"><div class="pfe-stats" style="grid-template-columns:repeat(2,1fr)">
                <div class="pfe-stat"><b>${s.emails}</b><span>${s.emails === 1 ? 'plano pedido' : 'planos pedidos'} por email</span></div>
                <div class="pfe-stat"><b>${s.carteiras}</b><span>${s.carteiras === 1 ? 'carteira montada' : 'carteiras montadas'}</span></div>
            </div></div>
            <div class="pfe-big" style="font-size:5.4vh">Não importa por onde começas. <span>O importante é começar.</span></div>`;
    }

    // Depois do email: o QR grande para abrir conta na Freedom24 (link de afiliado; enquanto não houver, mostra o marcador)
    function f24() {
        const f = cat.f24;
        if (!f) return '';
        const pronto = /^https?:\/\//.test(f.link);
        return `<div class="pfe-f24"><div><h2>${esc(f.titulo)}</h2>
                <ul>${f.vantagens.map(v => `<li>${esc(v)}</li>`).join('')}</ul></div>
            <div class="pfe-qr" id="pfe-qr">${pronto ? '' : esc(f.link)}</div></div>`;
    }
    function desenharQR() {
        const el = document.getElementById('pfe-qr');
        if (!el || !cat.f24 || !/^https?:\/\//.test(cat.f24.link) || typeof QRCode === 'undefined') return;
        el.innerHTML = '';
        new QRCode(el, { text: cat.f24.link, width: 400, height: 400, colorDark: '#1D1D1F', colorLight: '#ffffff' });
    }
})();
