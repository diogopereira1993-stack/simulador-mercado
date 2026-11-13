// PROVA DE ROBUSTEZ: 60 jogadores simulados, o servidor é morto à força 2 vezes a meio, e no fim
// confirma que o export (JSON e CSV) tem toda a gente, sem duplicados, com os emails e as carteiras.
//
//   node testes/prova-60.js                 (usa este projeto; o estado vai para uma pasta temporária)
//   JOGO=/caminho/da/copia node testes/prova-60.js
//
// Não toca em nada real: porta 3200, palavra-passe de teste, DATA_DIR temporário. Grava export.json/csv em testes/saida/.
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const JOGO = path.resolve(process.env.JOGO || path.join(__dirname, '..'));
const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'prova-jogo-'));
const SAIDA = path.join(__dirname, 'saida');
const io = require(path.join(JOGO, 'node_modules/socket.io/client-dist/socket.io.js'));
const URL = 'http://localhost:3200', PW = 'prova-segura';
const auth = 'Basic ' + Buffer.from('admin:' + PW).toString('base64');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NOMES = ['João Gonçalves', 'Inês Araújo', 'Sofia Conceição', 'Tomás Simões', 'Ana Brás', 'Zé "Tó"; Silva', '=SOMA(1;2)', '+351 Rita', '-Pedro', '@Marta', 'Mónica Ângelo', 'Rúben Antão'];
let srv;
function arrancar() {
  srv = spawn(process.execPath, ['server.js'], { cwd: JOGO, env: { ...process.env, PORT: '3200', ADMIN_PASSWORD: PW, DATA_DIR: DADOS } });
  srv.stdout.on('data', d => { if (process.env.VERBOSO) process.stdout.write('   [servidor] ' + d); });
  srv.stderr.on('data', d => process.stdout.write('   [servidor] ' + d));
  return sleep(1500);
}
const matar = () => { srv.kill('SIGKILL'); return sleep(300); };   // à força: sem tempo para gravar à saída
const exportJson = async () => (await fetch(URL + '/export.json', { headers: { authorization: auth } })).json();
async function admin(cmds) {
  const key = (await (await fetch(URL + '/admin-key', { headers: { authorization: auth } })).json()).key;
  const a = io(URL, { transports: ['websocket'], forceNew: true });
  await new Promise(r => a.on('connect', r));
  await new Promise(r => a.emit('register-admin', key, r));
  for (const c of cmds) { c === 'FINISH' ? a.emit('admin', { command: 'FINISH' }) : a.emit('pf-admin', { command: 'ETAPA', etapa: c }); await sleep(200); }
  a.close();
}

// Ronda 1: vota-se, volta-se da votação para a notícia 3 vezes (com alguns a trocar de voto), fecha-se, e volta-se
// da história para a resposta 3 vezes. Esperado (resposta da ronda 1 = SOBE): acertos = quem tem SOBE no fim.
async function rondaComVoltas(jog) {
  const key = (await (await fetch(URL + '/admin-key', { headers: { authorization: auth } })).json()).key;
  const a = io(URL, { transports: ['websocket'], forceNew: true }); let st = null; a.on('state', x => st = x);
  await new Promise(r => a.on('connect', r)); await new Promise(r => a.emit('register-admin', key, r)); await sleep(200);
  const cmd = async c => { a.emit('admin', { command: c }); await sleep(250); };
  const ate = async f => { for (let i = 0; i < 400 && !(st && f(st)); i++) await sleep(100); };
  await cmd('NEXT'); await ate(x => x.status === 'NEWS');
  const final = {};                                      // o voto final de cada um (null = não votou)
  for (let volta = 0; volta < 3; volta++) {
    await cmd('NEXT'); await ate(x => x.status === 'VOTING');
    jog.forEach((p, i) => {
      if (i % 5 === 4) return;                           // 1 em cada 5 nunca vota
      const v = volta === 0 ? (i % 2 ? 'DESCE' : 'SOBE') : (i % 7 === 0 ? (final[p.id] === 'SOBE' ? 'DESCE' : 'SOBE') : null);
      if (v) { p.s.emit('vote', { choice: v, playerId: p.id }); final[p.id] = v; }
    });
    await sleep(400);
    if (volta < 2) { await cmd('BACK'); await ate(x => x.status === 'NEWS'); }
  }
  const votos = st.voted;
  await cmd('NEXT'); await ate(x => x.status === 'REVEAL');
  const r1 = JSON.stringify(st.result);
  for (let volta = 0; volta < 3; volta++) { await cmd('NEXT'); await ate(x => x.status === 'HISTORY'); await cmd('BACK'); await ate(x => x.status === 'REVEAL'); }
  const r2 = JSON.stringify(st.result);
  await cmd('NEXT'); await ate(x => x.status === 'HISTORY');
  a.close();
  const sobe = Object.values(final).filter(v => v === 'SOBE').length, desce = Object.values(final).filter(v => v === 'DESCE').length;
  return { final, sobe, desce, votos, r1, r2, result: JSON.parse(r2) };
}
(async () => {
  await arrancar();
  const cat = JSON.parse(fs.readFileSync(process.env.PICKS_FILE || path.join(JOGO, 'dados/picks-catalogo.json'), 'utf8'));
  const ETFS = (cat.etfs || []).map(e => String(e.ticker).toUpperCase());
  const N = 60, jog = [];
  for (let i = 0; i < N; i++) {
    const id = 'p' + i, nome = NOMES[i % NOMES.length] + ' ' + (i + 1);
    const s = io(URL, { transports: ['websocket'], forceNew: true, reconnectionDelay: 300, reconnectionDelayMax: 1000 });
    s.on('connect', () => {
      s.emit('join', { playerId: id, name: nome, profile: ['indice', 'misto', 'escolhidas'][i % 3], monthly: ['50', '100', '150', '300'][i % 4],
        answers: { horizon: 'GT7', drop: ['VENDO', 'ESPERO', 'REFORCO'][i % 3], interest: 'AJUDA', monthly: ['50', '100', '150', '300'][i % 4], emergency: i % 5 ? 'SIM' : 'NAO', experience: 'NUNCA' } });
      s.emit('pf-hello', { playerId: id });
      const p = jog.find(x => x.id === id); if (p && p.pendente) s.emit(p.pendente.ev, p.pendente.dados);   // como o telemóvel: reenvia o que não teve resposta
    });
    s.on('pf-me', m => { const p = jog.find(x => x.id === id); if (!p || !p.pendente) return;
      const q = p.pendente.dados;
      if (p.pendente.ev === 'pf-email-confirmar' ? m.confirmado : (q.quer === true ? m.quer === true && m.email === q.email : m.quer === false)) p.pendente = null; });
    jog.push({ id, nome, s, email: null, confirmado: false, pendente: null });
    await sleep(15);
  }
  await sleep(1500);
  // ── Ronda 1 com «◀ Voltar» repetido: os votos e os acertos têm de ficar iguais a um jogo sem voltar atrás ──
  const voltas = await rondaComVoltas(jog);
  await admin(['FINISH', 'SETORES', 'EMPRESAS', 'CARTEIRA']);
  const emp = ['MU', 'GOOGL', 'JPM', 'CVX', 'APH', 'AMZN', 'BAC', 'EQNR'];
  jog.forEach((p, i) => p.s.emit('pf-save', { playerId: p.id, dados: { setores: ['tecnologia', 'energia'], empresas: [emp[i % 8], emp[(i + 3) % 8]], montante: [1000, 1500, 750][i % 3],
    etfPct: i % 5 === 0 ? 0 : 0.6, ...(ETFS.length > 1 && i % 4 ? { etf: ETFS[i % ETFS.length] } : {}), etapa: 'CARTEIRA' } }));
  await sleep(1600);
  console.log('1) A matar o servidor à força (SIGKILL) depois das carteiras…');
  await matar(); await arrancar(); await sleep(3000);
  let j = await exportJson();
  console.log(`   Depois do 1.º reinício: ${j.jogadores.length} jogadores, ${j.jogadores.filter(x => x.montante_inicial).length} com carteira.`);
  await admin(['PLANO', 'EMAIL']);
  jog.slice(0, 30).forEach((p, i) => { if (i % 2 === 0) { p.email = `participante${i + 1}@exemplo.pt`; p.pendente = { ev: 'pf-email', dados: { playerId: p.id, quer: true, email: p.email, consentimento: true } }; p.s.emit(p.pendente.ev, p.pendente.dados); } });
  await sleep(50);
  console.log('2) A matar o servidor à força 50 ms depois de 15 pessoas darem o email…');
  await matar(); await arrancar(); await sleep(3000);
  j = await exportJson();
  console.log(`   Depois do 2.º reinício: ${j.jogadores.length} jogadores, ${j.jogadores.filter(x => x.email).length} emails guardados.`);
  jog.forEach((p, i) => {
    if (p.email) { p.pendente = { ev: 'pf-email-confirmar', dados: { playerId: p.id, email: p.email } }; p.s.emit(p.pendente.ev, p.pendente.dados); p.confirmado = true; return; }
    if (i < 30) return;
    if (i % 4 === 2) { p.s.emit('pf-email', { playerId: p.id, quer: false }); return; }
    p.email = `pessoa.${i + 1}@exemplo.pt`;
    p.s.emit('pf-email', { playerId: p.id, quer: true, email: p.email, consentimento: true });
    if (i % 4 !== 3) { setTimeout(() => p.s.emit('pf-email-confirmar', { playerId: p.id, email: p.email }), 300); p.confirmado = true; }
  });
  await sleep(2000);
  j = await exportJson();
  fs.mkdirSync(SAIDA, { recursive: true });
  fs.writeFileSync(path.join(SAIDA, 'export.json'), JSON.stringify(j));
  const ids = j.jogadores.map(x => x.id), esperadoEmails = jog.filter(p => p.email).length, esperadoConf = jog.filter(p => p.confirmado).length;
  const ok = (cond, txt) => { console.log(`${cond ? '   OK ' : '   FALHOU'}  ${txt}`); if (!cond) process.exitCode = 1; };
  console.log('3) Verificações finais');
  ok(j.jogadores.length === N, `export.json tem ${j.jogadores.length} de ${N} pessoas`);
  ok(new Set(ids).size === ids.length, `sem duplicados (${new Set(ids).size} ids únicos)`);
  ok(jog.every(p => j.jogadores.find(x => x.id === p.id && x.nome === p.nome)), 'todos os nomes com acentos e aspas iguais ao que foi escrito');
  ok(j.jogadores.filter(x => x.email).length === esperadoEmails, `${j.jogadores.filter(x => x.email).length} emails (esperados ${esperadoEmails})`);
  ok(j.jogadores.filter(x => x.email_confirmado).length === esperadoConf, `${j.jogadores.filter(x => x.email_confirmado).length} confirmados (esperados ${esperadoConf})`);
  ok(j.jogadores.every(x => !x.email || (x.consentimento && x.consentimento_em)), 'todos os emails com consentimento e hora');
  ok(j.jogadores.every(x => x.montante_inicial && x.plano.length === 12), 'todos com carteira e plano de 12 meses');
  // «◀ Voltar» na ronda 1: um só voto por pessoa e acertos contados uma só vez
  ok(voltas.votos === voltas.sobe + voltas.desce && voltas.result.votes.SOBE === voltas.sobe && voltas.result.votes.DESCE === voltas.desce,
    `ronda 1 com 3 voltas à notícia: ${voltas.sobe} Sobe + ${voltas.desce} Desce, um voto por pessoa (contagem no ecrã ${voltas.votos})`);
  ok(voltas.r1 === voltas.r2 && voltas.result.correct === voltas.sobe, `3 voltas da história à resposta: resultado igual e ${voltas.result.correct} acertos (= quem disse Sobe)`);
  ok(j.jogadores.every(x => x.resultado_jogo.previsoes_certas === (voltas.final[x.id] === 'SOBE' ? 1 : 0)), 'previsões certas de cada pessoa iguais às de um jogo sem voltar atrás');
  const etfTickers = new Set([j.etf.ticker, ...(j.etfs || []).map(e => e.ticker)]);
  const zero = j.jogadores.filter(x => x.etf_percentagem === 0);
  ok(zero.length === 12 && zero.every(x => x.portfolio.length && x.portfolio.every(p => p.tipo !== 'indice') && x.plano.every(m => m.compras.every(c => !etfTickers.has(c.ticker)))), `${zero.length} pessoas com 0 % no índice: carteira e plano só com empresas`);
  ok(j.etf.ticker !== 'ETF' && !JSON.stringify(j.jogadores).includes('"ticker":"ETF"'), `ETF no export com o ticker real (${[...etfTickers].join(', ')}), nunca «ETF»`);
  if (ETFS.length > 1) {
    const esperado = i => i % 5 === 0 ? null : (i % 4 ? ETFS[i % ETFS.length] : ETFS[0]);
    const mal = j.jogadores.filter(x => { const e = esperado(Number(x.id.slice(1))); const l = x.portfolio.find(p => p.tipo === 'indice');
      return x.etf_escolhido !== e || (e && (!l || l.ticker !== e)) || x.plano.some(m => m.compras.some(c => etfTickers.has(c.ticker) && c.ticker !== e)); });
    const cont = {}; j.jogadores.forEach(x => { if (x.etf_escolhido) cont[x.etf_escolhido] = (cont[x.etf_escolhido] || 0) + 1; });
    ok(mal.length === 0, `ETF de cada pessoa certo no export e no plano (${JSON.stringify(cont)})`);
  }
  const bytes = Buffer.from(await (await fetch(URL + '/export.csv', { headers: { authorization: auth } })).arrayBuffer());
  fs.writeFileSync(path.join(SAIDA, 'export.csv'), bytes);
  ok(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, 'CSV em UTF-8 com BOM (verificado nos bytes)');
  const semLogin = await fetch(URL + '/export.json'), comTeste = await fetch(URL + '/export.json', { headers: { authorization: 'Basic ' + Buffer.from('admin:ws123').toString('base64') } });
  ok(semLogin.status === 401 && comTeste.status === 401, `sem login: ${semLogin.status}; com a palavra-passe de teste: ${comTeste.status}`);
  ok((await fetch(URL + '/estado/estado.json')).status === 404 && (await fetch(URL + '/estado.json')).status === 404, 'o ficheiro de estado não é acessível pela web');
  jog.forEach(p => p.s.close());
  srv.kill('SIGTERM'); await sleep(300);
  fs.rmSync(DADOS, { recursive: true, force: true });
  process.exit();
})().catch(e => { console.error(e); srv && srv.kill('SIGKILL'); process.exit(1); });
