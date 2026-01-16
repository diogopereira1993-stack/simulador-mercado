const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- ESTADO DO JOGO ---
let gameState = {
    price: 50.00,
    intrinsicValue: 50.00,
    volatility: 0.05,
    gravity: 0.02,      
    isPaused: true,
    currentNews: "MERCADO FECHADO - Aguarde o IPO",
    
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

setInterval(() => {
    if (!gameState.isPaused) {
        // 1. Força dos Votos (Especulação dos utilizadores)
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        
        // 2. Força da Realidade (Cálculo Novo)
        let gap = gameState.intrinsicValue - gameState.price;
        
        // A. Correção Lenta (A Gravidade Base)
        let correction = gap * gameState.gravity; 

        // B. O Fator "Caos" (AQUI ESTÁ O SEGREDO)
        // Se o gap for grande (ex: preço a 80, valor a 50 -> gap 30), o caos aumenta.
        // Isto gera números aleatórios grandes que podem empurrar o preço PARA CIMA temporariamente mesmo durante a queda.
        let chaosLevel = 0.1 + (Math.abs(gap) * 0.15); // 15% do tamanho do erro vira ruído
        let randomFluctuation = (Math.random() - 0.5) * chaosLevel;

        // 3. Atualizar Preço (Votos + Gravidade + Caos)
        gameState.price = gameState.price + voteEffect + correction + randomFluctuation;

        // Proteção para não ir abaixo de zero
        if (gameState.price < 0.01) gameState.price = 0.01;

        // 4. Gestão de Histórico (Sincronizado)
        const now = new Date();
        const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
        const dataPoint = { time: timeLabel, price: gameState.price };

        fullHistory.push(dataPoint);
        liveHistory.push(dataPoint);
        // Janela deslizante
        if (liveHistory.length > 150) liveHistory.shift();

        // Resetar contadores do tick
        gameState.buyCount = 0;
        gameState.sellCount = 0;
    }

    // Enviar updates
    io.emit('market-update', {
        price: gameState.price.toFixed(2),
        history: liveHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        totalVotes: gameState.totalVotesEver,
        stats: {
            buys: gameState.totalBuys,
            sells: gameState.totalSells,
            holds: gameState.totalHolds
        },
        mode: 'LIVE'
    });

}, 2000); // Tick de 2 segundos

io.on('connection', (socket) => {
    socket.emit('market-update', {
        price: gameState.price.toFixed(2),
        history: liveHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        totalVotes: gameState.totalVotesEver,
        stats: { buys: gameState.totalBuys, sells: gameState.totalSells, holds: gameState.totalHolds },
        mode: 'LIVE'
    });

    socket.on('vote', (action) => {
        if (gameState.isPaused) return;
        gameState.totalVotesEver++;
        if (action === 'BUY') { gameState.buyCount++; gameState.totalBuys++; }
        if (action === 'SELL') { gameState.sellCount++; gameState.totalSells++; }
        if (action === 'HOLD') { gameState.totalHolds++; }
    });

    socket.on('admin-action', (data) => {
        if (data.command === 'START_STOP') {
            gameState.isPaused = !gameState.isPaused;
            gameState.currentNews = gameState.isPaused ? "MERCADO PAUSADO" : "MERCADO ABERTO";
        }
        
        if (data.command === 'NEWS_UPDATE') {
            gameState.currentNews = data.text;
            if (data.impact !== 0) gameState.intrinsicValue += data.impact;
            
            // Sincronização Perfeita da Bola
            let eventTime;
            if (fullHistory.length > 0) {
                eventTime = fullHistory[fullHistory.length - 1].time;
            } else {
                const now = new Date();
                eventTime = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
            }
            
            eventLog.push({ 
                time: eventTime, 
                price: gameState.price,
                text: data.text,
                impact: data.impact
            });
        }

        if (data.command === 'RESET') {
            gameState.price = 50.00;
            gameState.intrinsicValue = 50.00;
            gameState.buyCount = 0; gameState.sellCount = 0;
            gameState.totalVotesEver = 0; gameState.totalBuys = 0; gameState.totalSells = 0; gameState.totalHolds = 0;
            liveHistory = [];
            fullHistory = [];
            eventLog = [];
            gameState.currentNews = "IPO LANÇADO - VALOR REAL: 50€";
            gameState.isPaused = true;
        }

        if (data.command === 'SHOW_FINAL_CHART') {
            gameState.isPaused = true;
            gameState.currentNews = "SESSÃO ENCERRADA";
            io.emit('market-finish', {
                fullHistory: fullHistory,
                events: eventLog,
                stats: {
                    buys: gameState.totalBuys,
                    sells: gameState.totalSells,
                    holds: gameState.totalHolds,
                    total: gameState.totalVotesEver
                }
            });
            return;
        }
        
        io.emit('market-update', {
            price: gameState.price.toFixed(2),
            history: liveHistory,
            news: gameState.currentNews,
            isPaused: gameState.isPaused,
            online: io.engine.clientsCount,
            totalVotes: gameState.totalVotesEver,
            stats: { buys: gameState.totalBuys, sells: gameState.totalSells, holds: gameState.totalHolds },
            mode: 'LIVE'
        });
    });
});

http.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
