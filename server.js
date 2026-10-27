// Servidor do jogo da sessão MoneyFlix: o plano de cada pessoa até aos 10K.
//   /            telemóvel dos jogadores (é para aqui que aponta o QR code)
//   /ecra.html   ecrã grande
//   /admin.html  controlo e notas do apresentador (pede login)
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ws123';
if (!process.env.ADMIN_PASSWORD) console.warn('Atenção: ADMIN_PASSWORD não está definida; o admin usa a palavra-passe de teste.');

// O admin, a chave dos comandos e as respostas exportadas pedem login (Basic Auth)
function requireAdmin(req, res, next) {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === ADMIN_USER && password === ADMIN_PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="Admin do jogo"');
    res.status(401).send('Acesso negado.');
}

// Os comandos do admin pelo socket trazem esta chave, que só é entregue a quem passou o login
const ADMIN_KEY = crypto.randomBytes(16).toString('hex');
const jogo = require('./game10k')(io, { adminKey: ADMIN_KEY });

app.use('/admin.html', requireAdmin);
app.get('/admin-key', requireAdmin, (req, res) => res.json({ key: ADMIN_KEY }));
app.get('/export.csv', requireAdmin, (req, res) => {
    // Data e hora de Lisboa no nome do ficheiro (o Render corre em UTC)
    const p = Object.fromEntries(new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date()).map(x => [x.type, x.value]));
    res.type('text/csv; charset=utf-8');
    res.attachment(`jogo-moneyflix_${p.year}-${p.month}-${p.day}_${p.hour}h${p.minute}.csv`);
    res.send(jogo.exportCsv());
});

// Os endereços da versão anterior (/10k/...) continuam a levar ao sítio certo
app.use('/10k', (req, res) => res.redirect(301, req.url));

app.use(express.static(path.join(__dirname, 'public')));

http.listen(PORT, () => console.log(`Jogo a correr na porta ${PORT}`));
