// Grava o estado do jogo e do portfólio em disco, para um reinício do servidor não apagar a sessão.
// - Escrita atómica: escreve num ficheiro temporário, faz fsync e só depois troca (rename) pelo verdadeiro.
// - Antes de trocar, o ficheiro anterior passa a cópia (estado.anterior.json): se o principal se estragar, recupera-se desse.
// - A pasta vem de DATA_DIR (no Render, o caminho do disco persistente); por omissão ./estado (fora de public/).
const fs = require('fs');
const path = require('path');

const PASTA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'estado'));
const PRINCIPAL = path.join(PASTA, 'estado.json');
const ANTERIOR = path.join(PASTA, 'estado.anterior.json');
const TMP = path.join(PASTA, 'estado.tmp');

function gravarJa(dados) {
    fs.mkdirSync(PASTA, { recursive: true });
    const texto = JSON.stringify({ gravado_em: new Date().toISOString(), ...dados });
    const fd = fs.openSync(TMP, 'w');
    try { fs.writeSync(fd, texto); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (fs.existsSync(PRINCIPAL)) fs.copyFileSync(PRINCIPAL, ANTERIOR);
    fs.renameSync(TMP, PRINCIPAL);
}

function ler() {
    for (const f of [PRINCIPAL, ANTERIOR]) {
        try {
            if (!fs.existsSync(f)) continue;
            const d = JSON.parse(fs.readFileSync(f, 'utf8'));
            console.log(`Estado recuperado de ${f} (gravado ${d.gravado_em}).`);
            return d;
        } catch (err) {
            console.error(`Não consegui ler ${f}: ${err.message}. A tentar a cópia.`);
        }
    }
    return null;
}

// Junta as alterações: grava no máximo uma vez por segundo, e de imediato quando se pede (agora = true)
function criar(obterEstado) {
    let pendente = null;
    const gravar = () => {
        pendente = null;
        try { gravarJa(obterEstado()); } catch (err) { console.error('ERRO a gravar o estado:', err.message); }
    };
    const marcar = (agora) => {
        if (agora) { if (pendente) clearTimeout(pendente); return gravar(); }
        if (!pendente) pendente = setTimeout(gravar, 1000);
    };
    // Ao desligar (deploy, reinício), grava o que faltar antes de sair
    const sair = () => { if (pendente) { clearTimeout(pendente); } try { gravarJa(obterEstado()); } catch (e) {} process.exit(0); };
    process.on('SIGTERM', sair);
    process.on('SIGINT', sair);
    return { marcar, pasta: PASTA };
}

// Guarda uma cópia com data e hora (ex.: antes de o apresentador reiniciar o jogo). Estas cópias nunca são apagadas.
function arquivar(dados, motivo) {
    try {
        fs.mkdirSync(PASTA, { recursive: true });
        const quando = new Date().toISOString().replace(/[:.]/g, '-');
        const f = path.join(PASTA, `arquivo-${motivo}-${quando}.json`);
        fs.writeFileSync(f, JSON.stringify({ gravado_em: new Date().toISOString(), ...dados }));
        console.log(`Sessão arquivada em ${f}`);
    } catch (err) { console.error('ERRO a arquivar:', err.message); }
}

module.exports = { ler, criar, arquivar, PASTA };
