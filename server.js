const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO DO CENÁRIO ---
// Ajusta aqui para o teste de equipa (ex: 100) ou evento real (1)
const VOTE_MULTIPLIER = 1; 

const TOTAL_SHARES = 1000000; // 1 Milhão de ações
const ANNUAL_EARNINGS = 2500000; // Lucro Base
const EPS = ANNUAL_EARNINGS / TOTAL_SHARES; // 2.5€ por ação

let gameState = {
    price: 50.00,
    intrinsicValue: 50.00,
    volatility: 0.05,
    gravity: 0.02,      
    isPaused: true,
    currentNews: "MERCADO FECHADO - Aguarde o IPO",
    buyCount: 0,
    sellCount: 0,
    totalVotesEver: 0,
    totalBuys: 0,
    totalSells: 0,
    totalHolds: 0
};

let liveHistory = []; 
let fullHistory = []; 
let eventLog = [];    
// Cooldown no servidor para evitar spam (Map de SocketID -> Timestamp)
let lastVoteTime = new Map(); 

// --- LOOP DO MERCADO ---
setInterval(() => {
    if (!gameState.isPaused) {
        // 1. Lógica de Mercado
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        
        let gap = gameState.intrinsicValue - gameState.price;
        let correction = gap * gameState.gravity; 
        let chaosLevel = 0.1 + (Math.abs(gap) * 0.15);
        let randomFluctuation = (Math.random() - 0.5) * chaosLevel;

        gameState.price = gameState.price + voteEffect + correction + randomFluctuation;
        if (gameState.price < 0.01) gameState.price = 0.01;

        // 2. Histórico
        const now = new Date();
        const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
        const dataPoint = { time: timeLabel, price: gameState.price };

        fullHistory.push(dataPoint);
        liveHistory.push(dataPoint);
        if (liveHistory.length > 150) liveHistory.shift();

        // Reset contadores
        gameState.buyCount = 0;
        gameState.sellCount = 0;
    }

    // --- CÁLCULOS FUNDAMENTAIS ---
    let currentPrice = gameState.price;
    let marketCap = (currentPrice * TOTAL_SHARES);
    let peRatio = (currentPrice / EPS).toFixed(1); // Preço / 2.5

    // --- PACOTE LEVE (Para os 500 telemóveis) ---
    // NÃO enviamos o histórico aqui para poupar internet
    io.emit('market-update-light', {
        price: currentPrice.toFixed(2),
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        // Novos dados fundamentais
        marketCap: marketCap > 1000000 ? (marketCap/1000000).toFixed(1) + "M" : marketCap.toFixed(0),
        peRatio: peRatio,
        fairValue: gameState.intrinsicValue.toFixed(2)
    });

    // --- PACOTE PESADO (Só para o Dashboard) ---
    io.to('dashboard-room').emit('market-update-full', {
        price: currentPrice.toFixed(2),
        history: liveHistory, // Só o dashboard recebe o gráfico
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        mode: 'LIVE'
    });

}, 2000);

// --- SOCKETS ---
io.on('connection', (socket) => {
    
    // Identificar quem é o Dashboard
    socket.on('register-dashboard', () => {
        socket.join('dashboard-room');
        // Envia estado inicial imediato
        socket.emit('market-update-full', {
            price: gameState.price.toFixed(2),
            history: liveHistory,
            news: gameState.currentNews,
            isPaused: gameState.isPaused,
            mode: 'LIVE'
        });
    });

    socket.on('vote', (action) => {
        if (gameState.isPaused) return;

        // Proteção Anti-Spam (Server Side) - 500ms min entre votos
        const now = Date.now();
        const lastTime = lastVoteTime.get(socket.id) || 0;
        if (now - lastTime < 500) return; 
        lastVoteTime.set(socket.id, now);

        // Aplica o Multiplicador (1 para evento, 100 para teste)
        let voteWeight = VOTE_MULTIPLIER;

        gameState.totalVotesEver += voteWeight;
        if (action === 'BUY') { 
            gameState.buyCount += voteWeight; 
            gameState.totalBuys += voteWeight; 
        }
        if (action === 'SELL') { 
            gameState.sellCount += voteWeight; 
            gameState.totalSells += voteWeight; 
        }
        if (action === 'HOLD') { 
            gameState.totalHolds += voteWeight; 
        }
    });

    // Admin e Comandos (Mantido igual, mas envia updates para canais certos)
    socket.on('admin-action', (data) => {
        if (data.command === 'START_STOP') {
            gameState.isPaused = !gameState.isPaused;
            gameState.currentNews = gameState.isPaused ? "MERCADO PAUSADO" : "MERCADO ABERTO";
        }
        
        if (data.command === 'NEWS_UPDATE') {
            gameState.currentNews = data.text;
            if (data.impact !== 0) gameState.intrinsicValue += data.impact;
            
            let eventTime = fullHistory.length > 0 ? fullHistory[fullHistory.length - 1].time : new Date().toISOString().split('T')[1].split('.')[0];
            eventLog.push({ time: eventTime, price: gameState.price, text: data.text, impact: data.impact });
        }

        if (data.command === 'RESET') {
            gameState.price = 50.00;
            gameState.intrinsicValue = 50.00;
            gameState.buyCount = 0; gameState.sellCount = 0;
            gameState.totalVotesEver = 0; gameState.totalBuys = 0; gameState.totalSells = 0; gameState.totalHolds = 0;
            liveHistory = []; fullHistory = []; eventLog = [];
            gameState.currentNews = "IPO LANÇADO - VALOR REAL: 50€";
            gameState.isPaused = true;
        }

        if (data.command === 'SHOW_FINAL_CHART') {
            gameState.isPaused = true;
            gameState.currentNews = "SESSÃO ENCERRADA";
            // Emite para TODOS para saberem que acabou
            io.emit('market-finish', {
                fullHistory: fullHistory,
                events: eventLog,
                stats: { buys: gameState.totalBuys, sells: gameState.totalSells, total: gameState.totalVotesEver }
            });
            return;
        }
        
        // Update imediato para Admin não esperar 2s
        io.emit('market-update-light', { 
            price: gameState.price.toFixed(2), news: gameState.currentNews, isPaused: gameState.isPaused, 
            online: io.engine.clientsCount, marketCap: "---", peRatio: "---", fairValue: gameState.intrinsicValue 
        });
    });
});

http.listen(PORT, () => {
    console.log(`Servidor MoneyFlix a correr na porta ${PORT}`);
    console.log(`Multiplicador de Votos: x${VOTE_MULTIPLIER}`);
});
