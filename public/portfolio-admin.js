// Fase 2 no admin: o apresentador guia a sala setor a setor. Usa o `socket` do admin.html.
(function () {
    if (typeof socket === 'undefined') return;
    const $ = id => document.getElementById(id);
    const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ETAPAS = ['SETORES', 'EMPRESAS', 'CARTEIRA', 'PLANO', 'EMAIL'];
    const NOMES = { SETORES: 'Setores', EMPRESAS: 'Empresas', CARTEIRA: 'Carteira', PLANO: 'Plano', EMAIL: 'Email' };
    const NOTAS = {
        null: 'Quando o jogo acabar, abre esta fase: os telemóveis passam para «A tua carteira de exercício», com o perfil e o reforço do check-in. O jogo fica guardado; «Voltar ao jogo» mostra-o outra vez.',
        SETORES: 'Pede a cada um que escolha no telemóvel os setores de que gosta ou de que gostava de saber mais. O ecrã mostra os mais escolhidos. Quando a maioria tiver escolhido, avança: os setores aparecem do mais escolhido para o menos escolhido.',
        EMPRESAS: 'Apresenta o setor e 2 ou 3 empresas. Cada um toca nas empresas para ver a ficha e adiciona com o + as que quiser. É um exercício com as MoneyFlix Picks, não uma recomendação. O botão principal passa ao setor seguinte; também podes tocar num setor da lista.',
        CARTEIRA: 'Cada um escolhe quanto põe para começar (1.000 €, 1.500 € ou outro) e a parte no ETF de índice (começa na do perfil do jogo). As ações são inteiras: se uma custa mais do que sobra, fica para o plano mensal.',
        PLANO: 'O reforço é o do check-in (podem mudá-lo). Mostra o calendário: se pões 50 € por mês e a ação custa 100 €, juntas 2 meses e compras. Fecha com: não importa por onde começas, o importante é começar.',
        EMAIL: 'Quem quiser recebe o plano por email: escreve o email e marca a caixa do consentimento. Ninguém é obrigado. No fim, cada um confirma o email («Sim, está certo»). Antes de exportar, vê aqui quantos faltam confirmar e pede à sala; depois exporta o JSON e o CSV antes de reiniciar o jogo.'
    };

    const card = document.createElement('div');
    card.className = 'card'; card.id = 'pf-card';
    card.innerHTML = `
        <h2>Fase 2 · Monta a tua carteira <span class="pill pill-wait" id="pfa-pill">Fechada</span></h2>
        <div class="pfa-grid">
            <div>
                <div class="controls" style="margin-top:0">
                    <button class="btn btn-primary" id="pfa-next">▶</button>
                    <button class="btn btn-secondary" id="pfa-prev">◀ Passo anterior</button>
                    <button class="btn btn-secondary" id="pfa-off">↩ Voltar ao jogo</button>
                </div>
                <div class="pfa-steps" id="pfa-steps"></div>
                <div class="notes" id="pfa-notes"></div>
                <div id="pfa-sectors-box" style="margin-top:12px"></div>
            </div>
            <div>
                <div class="stats">
                    <div><b id="pfa-s1">0</b><span>escolheram setores</span></div>
                    <div><b id="pfa-s2">0</b><span>carteiras montadas</span></div>
                    <div><b id="pfa-s3">0</b><span id="pfa-s3l">emails confirmados</span></div>
                </div>
                <div id="pfa-cat" style="margin-top:10px;font-size:0.85rem;color:var(--sub);line-height:1.5"></div>
                <div class="controls" style="margin-top:8px">
                    <button class="btn btn-secondary" style="height:40px;font-size:0.85rem" id="pfa-reload">↻ Recarregar catálogo</button>
                    <a class="btn btn-secondary export-btn" style="margin-top:0;height:40px" href="export.json" download onclick="exported = true">⬇ Exportar tudo (JSON)</a>
                </div>
                <div class="pfa-copia" id="pfa-copia">
                    <b>Cópia neste portátil</b>
                    <span id="pfa-copia-txt">Ainda sem cópia.</span>
                    <div class="controls" style="margin-top:6px">
                        <button class="btn btn-secondary" style="height:40px;font-size:0.85rem" id="pfa-copia-json">⬇ Cópia local (JSON)</button>
                        <button class="btn btn-secondary" style="height:40px;font-size:0.85rem" id="pfa-copia-csv">⬇ Cópia local (CSV)</button>
                    </div>
                </div>
                <table style="margin-top:12px"><thead><tr><th>Nome</th><th>Setores</th><th>Empresas</th><th>Início</th><th>Passo</th><th>Email</th></tr></thead><tbody id="pfa-roster"></tbody></table>
            </div>
        </div>`;
    const grid = document.querySelector('.wrap .grid');
    grid.parentNode.insertBefore(card, grid.nextSibling);

    let cat = null, est = null, info = null;
    const cmd = (command, extra = {}) => socket.emit('pf-admin', { command, ...extra });
    $('pfa-next').onclick = () => cmd('NEXT');
    $('pfa-prev').onclick = () => cmd('PREV');
    $('pfa-off').onclick = () => cmd('ETAPA', { etapa: null });
    $('pfa-reload').onclick = () => cmd('RELOAD');

    // O admin.html regista-se com a chave; quando o servidor responde (evento 'admin'), pede os dados da fase
    let pedido = false;
    socket.on('connect', () => { pedido = false; });
    socket.on('admin', () => { if (!pedido) { pedido = true; socket.emit('pf-admin-hello'); } });
    socket.on('pf-catalogo-admin', c => { cat = c; render(); });
    socket.on('pf-state', s => { est = s; render(); });
    socket.on('pf-admin', a => { info = a; render(); });

    // ── Cópia de segurança no browser do apresentador ──
    // A cada minuto puxa o export.json e o export.csv (com o login que este separador já tem) e guarda o último aqui.
    // Se o servidor cair, os botões descarregam a última cópia na mesma.
    const CHAVE = 'mf-copia-export';
    const lerCopia = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; } };
    function mostrarCopia(erro) {
        const c = lerCopia();
        const el = $('pfa-copia-txt');
        if (!c) { el.innerText = erro ? `Ainda sem cópia (${erro}).` : 'Ainda sem cópia.'; return; }
        const hora = new Date(c.em).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
        el.innerHTML = `Última cópia às <b>${hora}</b>: ${c.pessoas} ${c.pessoas === 1 ? 'pessoa' : 'pessoas'}, ${c.emails} ${c.emails === 1 ? 'email' : 'emails'} (${c.confirmados} ${c.confirmados === 1 ? 'confirmado' : 'confirmados'}).${erro ? ` <span style="color:var(--red-ink)">Última tentativa falhou: ${esc(erro)}.</span>` : ''}`;
    }
    async function fazerCopia() {
        try {
            const [rj, rc] = await Promise.all([fetch('export.json', { cache: 'no-store' }), fetch('export.csv', { cache: 'no-store' })]);
            if (!rj.ok || !rc.ok) throw new Error(`servidor respondeu ${rj.status}`);
            const json = await rj.text(), csv = await rc.text();
            const j = JSON.parse(json);
            if (!j.jogadores.length && lerCopia() && lerCopia().pessoas) { mostrarCopia('o servidor está vazio; mantive a cópia anterior'); return; }
            const c = { em: Date.now(), pessoas: j.jogadores.length, emails: j.jogadores.filter(x => x.email).length,
                confirmados: j.jogadores.filter(x => x.email_confirmado).length, json, csv };
            try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch (e) { throw new Error('o browser não deixou guardar'); }
            mostrarCopia();
        } catch (err) { mostrarCopia(err.message === 'Failed to fetch' ? 'sem ligação ao servidor' : err.message); }
    }
    function descarregar(tipo) {
        const c = lerCopia();
        if (!c) return alert('Ainda não há cópia neste portátil.');
        // O browser tira o BOM ao ler o CSV; volta a pô-lo, para o Excel em português abrir os acentos bem
        const conteudo = tipo === 'csv' && !c.csv.startsWith('\uFEFF') ? '\uFEFF' + c.csv : c[tipo];
        const blob = new Blob([conteudo], { type: tipo === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
        const a = document.createElement('a');
        const d = new Date(c.em), z = n => String(n).padStart(2, '0');
        a.href = URL.createObjectURL(blob);
        a.download = `copia-local_${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}h${z(d.getMinutes())}.${tipo}`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    $('pfa-copia-json').onclick = () => descarregar('json');
    $('pfa-copia-csv').onclick = () => descarregar('csv');
    mostrarCopia();
    setTimeout(fazerCopia, 3000);
    setInterval(fazerCopia, 60000);

    function nomeSetor(id) { const s = cat && cat.setores.find(x => x.id === id); return s ? s.nome : id; }

    function proximo() {
        const e = est.etapa;
        if (!e) return '▶ Abrir a fase: escolher setores';
        if (e === 'SETORES') return '▶ Mostrar as empresas (setor mais escolhido)';
        if (e === 'EMPRESAS') {
            const i = est.ordem.indexOf(est.setorAtual);
            return i < est.ordem.length - 1 ? `▶ Setor seguinte: ${nomeSetor(est.ordem[i + 1])}` : '▶ Carteira: montante e divisão';
        }
        if (e === 'CARTEIRA') return '▶ Plano de todos os meses';
        if (e === 'PLANO') return '▶ Pedir o email';
        return 'Último passo';
    }

    function render() {
        if (!est) return;
        const s = est.stats, e = est.etapa;
        $('pfa-pill').innerText = e ? `${NOMES[e]}${e === 'EMPRESAS' && cat ? ' · ' + nomeSetor(est.setorAtual) : ''}` : 'Fechada';
        $('pfa-pill').className = 'pill ' + (e ? 'pill-live' : 'pill-wait');
        $('pfa-next').innerText = proximo();
        $('pfa-next').disabled = e === 'EMAIL';
        $('pfa-prev').disabled = !e;
        $('pfa-off').disabled = !e;
        $('pfa-steps').innerHTML = [null, ...ETAPAS].map(x => `<button class="${x === e ? 'on' : ''}" data-e="${x || ''}">${x ? NOMES[x] : 'Jogo'}</button>`).join('');
        $('pfa-steps').querySelectorAll('button').forEach(b => b.onclick = () => cmd('ETAPA', { etapa: b.dataset.e || null }));
        $('pfa-notes').innerHTML = `<b>${e ? NOMES[e] : 'Antes de abrir'}</b>${esc(NOTAS[e])}`;
        $('pfa-s1').innerText = `${s.comSetores}/${s.pessoas}`;
        $('pfa-s2').innerText = s.carteiras;
        $('pfa-s3').innerText = `${s.confirmados}/${s.emails}`;
        $('pfa-s3l').innerText = s.emails > s.confirmados ? `emails confirmados (faltam ${s.emails - s.confirmados})` : 'emails confirmados';

        // Os setores pela ordem em que vão ser mostrados, com as notas das empresas do setor atual
        const box = $('pfa-sectors-box');
        if (cat && (e === 'EMPRESAS' || e === 'SETORES')) {
            const ordem = e === 'SETORES' ? [...cat.setores].sort((a, b) => (s.setores[b.id] || 0) - (s.setores[a.id] || 0)).map(x => x.id) : est.ordem;
            const atual = e === 'EMPRESAS' ? cat.empresas.filter(x => x.setor === est.setorAtual) : [];
            box.innerHTML = `<div style="font-size:0.72rem;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${e === 'SETORES' ? 'Mais escolhidos até agora' : 'Setores (toca para mostrar)'}</div>
                <ol class="pfa-sectors">${ordem.map(id => `<li data-id="${esc(id)}" class="${id === est.setorAtual && e === 'EMPRESAS' ? 'on' : (est.mostrados.includes(id) && e === 'EMPRESAS' ? 'seen' : '')}"><b>${esc(nomeSetor(id))}</b><span>${s.setores[id] || 0} escolheram</span></li>`).join('')}</ol>
                ${atual.length ? `<div class="pfa-cos">${atual.map(x => `<div><b>${esc(x.ticker)} · ${esc(x.nome)}</b> ${s.empresas[x.ticker] ? `(${s.empresas[x.ticker]} na carteira)` : ''}<small>${esc(x.descricao)}</small>${x.nota_apresentador ? `<small><b>Nota:</b> ${esc(x.nota_apresentador)}</small>` : ''}</div>`).join('')}</div>` : ''}`;
            if (e === 'EMPRESAS') box.querySelectorAll('li').forEach(li => li.onclick = () => cmd('SETOR', { setor: li.dataset.id }));
        } else box.innerHTML = '';

        if (info) {
            const c = info.catalogo;
            const etfsTxt = est && est.stats.porEtf && Object.keys(est.stats.porEtf).length ? ` · ETF escolhido: ${esc(Object.entries(est.stats.porEtf).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '))}` : '';
            $('pfa-cat').innerHTML = `Catálogo: <b>${esc(c.ficheiro)}</b> · ${c.setores} setores, ${c.empresas} empresas${c.atualizado ? ` · preços de ${esc(c.atualizado)}` : ''}${etfsTxt}${c.exemplo ? '<div class="pfa-warn">Ainda é o catálogo de EXEMPLO. Quando o verdadeiro estiver em tour-lisboa/dados/picks-catalogo.json (ou em dados/ dentro do projeto), carrega em «Recarregar catálogo».</div>' : ''}`;
            const PASSO = { SETORES: '1 Setores', EMPRESAS: '2 Empresas', CARTEIRA: '3 Carteira', PLANO: '4 Plano', EMAIL: '5 Email' };
            $('pfa-roster').innerHTML = info.roster.length
                ? info.roster.map(p => `<tr><td>${esc(p.nome)}</td><td>${p.setores}</td><td>${p.empresas}</td><td>${p.montante ? p.montante + ' €' : '—'}</td><td>${p.etapa ? PASSO[p.etapa] : '—'}</td><td>${p.email === 'confirmado' ? '✓ confirmado' : p.email === 'por confirmar' ? 'por confirmar' : p.email === 'não' ? 'não' : '—'}</td></tr>`).join('')
                : '<tr><td colspan="6" style="color:var(--sub)">À espera de jogadores…</td></tr>';
        }
    }
})();
