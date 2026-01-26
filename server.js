const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

// --- PROTEÇÃO DE PASSWORD (BASIC AUTH) ---
// Colar isto ANTES da linha: app.use(express.static(...))
app.use('/admin.html', (req, res, next) => {
    // 1. CONFIGURA AQUI O TEU LOGIN
    const auth = { login: 'admin', password: '123' }; // <--- MUDA A PASSWORD AQUI

    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === auth.login && password === auth.password) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Area Restrita"');
    res.status(401).send('Acesso Negado: Password incorreta.');
});

app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO FINANCEIRA INICIAL (Narrativa Start-up) ---
const INITIAL_SHARES = 10000000; // 10 Milhões de ações
const INITIAL_EPS = -1.50;       // COMEÇA COM PREJUÍZO (Start-up)
const INITIAL_REVENUE = "5M";    // Receita inicial

// --- ESTADO DO JOGO ---
let gameState = {
    price: 50.00,
    intrinsicValue: 50.00,
    volatility: 0.05,
    gravity: 0.02,      
    isPaused: true,
    currentNews: "MERCADO FECHADO - Aguarde o IPO",
    
    // Variáveis Fundamentais Dinâmicas
    currentEPS: INITIAL_EPS,
    currentRevenue: INITIAL_REVENUE,
    
    // Simulação de Tempo
    simulatedDate: new Date("2024-01-01"),

    // Multiplicador de Votos
    voteMultiplier: 1, 

    // Contadores
    buyCount: 0,
    sellCount: 0,
    
    // Stats Globais
    totalVotesEver: 0,
    totalBuys: 0,
    totalSells: 0,
    totalHolds: 0
};

// Históricos
let liveHistory = []; 
let fullHistory = []; 
let eventLog = [];    
let lastVoteTime = new Map(); 

// Formatação de Data
function formatDate(date) {
    return date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ==================================================
// 1. LOOP PRINCIPAL (TICK) - 1 Tick = 1 Dia
// ==================================================
setInterval(() => {
    if (!gameState.isPaused) {
        // --- A. AVANÇAR NO TEMPO ---
        gameState.simulatedDate.setDate(gameState.simulatedDate.getDate() + 1);

        // --- B. FÍSICA DO MERCADO ---
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        
        // Gravidade (Puxa para o Valor Intrínseco)
        let gap = gameState.intrinsicValue - gameState.price;
        let correction = gap * gameState.gravity; 
        
        // Caos
        let chaosLevel = 0.1 + (Math.abs(gap) * 0.15);
        let randomFluctuation = (Math.random() - 0.5) * chaosLevel;

        gameState.price = gameState.price + voteEffect + correction + randomFluctuation;
        if (gameState.price < 0.01) gameState.price = 0.01;

        // --- C. HISTÓRICO ---
        const dateLabel = formatDate(gameState.simulatedDate);
        const dataPoint = { time: dateLabel, price: gameState.price };

        fullHistory.push(dataPoint);
        liveHistory.push(dataPoint);
        if (liveHistory.length > 150) liveHistory.shift(); 

        gameState.buyCount = 0;
        gameState.sellCount = 0;
    }

    broadcastMarketUpdate();

}, 2000); 


// ==================================================
// 2. FUNÇÃO DE ENVIO DE DADOS
// ==================================================
function broadcastMarketUpdate() {
    let currentPrice = gameState.price;
    let marketCap = currentPrice * INITIAL_SHARES;
    
    let marketCapFormatted = marketCap > 1000000000 
        ? (marketCap/1000000000).toFixed(2) + "B" 
        : (marketCap/1000000).toFixed(1) + "M";

    // Lógica P/E Ratio: Se EPS <= 0, mostra "N/A"
    let peRatio = gameState.currentEPS > 0 
        ? (currentPrice / gameState.currentEPS).toFixed(1) 
        : "N/A";

    const commonData = {
        price: currentPrice.toFixed(2),
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        marketCap: marketCapFormatted,
        peRatio: peRatio,
        eps: gameState.currentEPS.toFixed(2),
        revenue: gameState.currentRevenue,
        shares: "10M",
        date: formatDate(gameState.simulatedDate)
    };

    // CANAL 1: Mobile
    io.emit('market-update-light', {
        ...commonData,
        intrinsicValue: gameState.intrinsicValue.toFixed(2),
        stats: {
            buys: gameState.totalBuys,
            sells: gameState.totalSells,
            holds: gameState.totalHolds,
            multiplier: gameState.voteMultiplier
        }
    });

    // CANAL 2: Dashboard
    io.to('dashboard-room').emit('market-update-full', {
        ...commonData,
        history: liveHistory,
        mode: 'LIVE'
    });
}


// ==================================================
// 3. GESTÃO DE CONEXÕES
// ==================================================
io.on('connection', (socket) => {
    
    socket.on('register-dashboard', () => {
        socket.join('dashboard-room');
        broadcastMarketUpdate();
    });

    socket.on('vote', (action) => {
        if (gameState.isPaused) return;
        const now = Date.now();
        const lastTime = lastVoteTime.get(socket.id) || 0;
        if (now - lastTime < 500) return; 
        lastVoteTime.set(socket.id, now);

        let voteWeight = gameState.voteMultiplier;
        gameState.totalVotesEver += voteWeight;
        if (action === 'BUY') { gameState.buyCount += voteWeight; gameState.totalBuys += voteWeight; }
        if (action === 'SELL') { gameState.sellCount += voteWeight; gameState.totalSells += voteWeight; }
        if (action === 'HOLD') { gameState.totalHolds += voteWeight; }
    });

    socket.on('admin-action', (data) => {
        if (data.command === 'START_STOP') {
            gameState.isPaused = !gameState.isPaused;
            gameState.currentNews = gameState.isPaused ? "MERCADO PAUSADO" : "MERCADO ABERTO";
        }
        
        if (data.command === 'SET_MULTIPLIER') {
            gameState.voteMultiplier = parseInt(data.value);
        }

        // NOTÍCIAS (INSIDERS, BOAS, MÁS)
        if (data.command === 'NEWS_UPDATE') {
            // Formata a notícia com a fonte recebida do Admin
            const fullText = `${data.text} (Fonte: ${data.source})`;
            gameState.currentNews = fullText;
            
            if (data.impact !== 0) gameState.intrinsicValue += data.impact;
            
            let eventTime = fullHistory.length > 0 ? fullHistory[fullHistory.length - 1].time : formatDate(gameState.simulatedDate);
            eventLog.push({ time: eventTime, price: gameState.price, text: fullText, impact: data.impact });
        }

        // EARNINGS (RESULTADOS)
        if (data.command === 'EARNINGS_UPDATE') {
            const fullText = `📊 ${data.text} (Fonte: ${data.source})`;
            gameState.currentNews = fullText;

            if (data.impact !== 0) gameState.intrinsicValue += data.impact;
            if (data.newEPS !== null) gameState.currentEPS = data.newEPS;
            if (data.newRevenue !== null) gameState.currentRevenue = data.newRevenue;

            let eventTime = fullHistory.length > 0 ? fullHistory[fullHistory.length - 1].time : formatDate(gameState.simulatedDate);
            eventLog.push({ 
                time: eventTime, 
                price: gameState.price, 
                text: fullText, 
                impact: data.impact 
            });
        }

        if (data.command === 'RESET') {
            gameState.price = 50.00;
            gameState.intrinsicValue = 50.00;
            gameState.currentEPS = INITIAL_EPS;
            gameState.currentRevenue = INITIAL_REVENUE;
            gameState.simulatedDate = new Date("2024-01-01");

            gameState.buyCount = 0; gameState.sellCount = 0;
            gameState.totalVotesEver = 0; gameState.totalBuys = 0; gameState.totalSells = 0; gameState.totalHolds = 0;
            liveHistory = []; fullHistory = []; eventLog = [];
            gameState.voteMultiplier = 1; 
            gameState.currentNews = "IPO LANÇADO - VALOR REAL: 50€";
            gameState.isPaused = true;
        }

        if (data.command === 'SHOW_FINAL_CHART') {
            gameState.isPaused = true;
            gameState.currentNews = "SESSÃO ENCERRADA";
            io.emit('market-finish', {
                fullHistory: fullHistory,
                events: eventLog,
                stats: { buys: gameState.totalBuys, sells: gameState.totalSells, total: gameState.totalVotesEver }
            });
            return;
        }
        
        broadcastMarketUpdate();
    });
});

http.listen(PORT, () => {
    console.log(`Servidor WallStreetLive a correr na porta ${PORT}`);
});
