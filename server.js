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
    gravity: 0.005,
    isPaused: true,
    currentNews: "MERCADO FECHADO - Aguarde o IPO",
    
    // Contadores Instantâneos (Para o cálculo do preço)
    buyCount: 0,
    sellCount: 0,
    
    // ESTATÍSTICAS GLOBAIS (Para o Admin)
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
        // Lógica de Preço
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        let gap = gameState.intrinsicValue - gameState.price;
        let correction = gap * gameState.gravity;

        gameState.price = gameState.price + voteEffect + correction;
        gameState.price += (Math.random() - 0.5) * 0.05; 

        if (gameState.price < 0.01) gameState.price = 0.01;

        // Gestão de Histórico
        const now = new Date();
        const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
        const dataPoint = { time: timeLabel, price: gameState.price };

        fullHistory.push(dataPoint);
        liveHistory.push(dataPoint);
        if (liveHistory.length > 150) liveHistory.shift();

        // Resetar apenas os contadores do tick (instantâneos)
        gameState.buyCount = 0;
        gameState.sellCount = 0;
    }

    io.emit('market-update', {
        price: gameState.price.toFixed(2),
        history: liveHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        // Enviar estatísticas detalhadas
        totalVotes: gameState.totalVotesEver,
        stats: {
            buys: gameState.totalBuys,
            sells: gameState.totalSells,
            holds: gameState.totalHolds
        },
        mode: 'LIVE'
    });

}, 2000);

io.on('connection', (socket) => {
    // Enviar estado inicial
    socket.emit('market-update', {
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

    socket.on('vote', (action) => {
        if (gameState.isPaused) return;
        
        gameState.totalVotesEver++;
        
        // Atualizar estatísticas globais
        if (action === 'BUY') {
            gameState.buyCount++;   // Para o preço
            gameState.totalBuys++;  // Para a estatística
        }
        if (action === 'SELL') {
            gameState.sellCount++;
            gameState.totalSells++;
        }
        if (action === 'HOLD') {
            gameState.totalHolds++;
        }
    });

    socket.on('admin-action', (data) => {
        if (data.command === 'START_STOP') {
            gameState.isPaused = !gameState.isPaused;
            gameState.currentNews = gameState.isPaused ? "MERCADO PAUSADO" : "MERCADO ABERTO";
        }
        
        if (data.command === 'NEWS_UPDATE') {
            gameState.currentNews = data.text;
            if (data.impact !== 0) gameState.intrinsicValue += data.impact;
            
            const now = new Date();
            const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
            
            eventLog.push({ 
                time: timeLabel, 
                price: gameState.price,
                text: data.text,
                impact: data.impact
            });
        }

        if (data.command === 'RESET') {
            gameState.price = 50.00;
            gameState.intrinsicValue = 50.00;
            gameState.buyCount = 0;
            gameState.sellCount = 0;
            // Resetar estatísticas globais
            gameState.totalVotesEver = 0;
            gameState.totalBuys = 0;
            gameState.totalSells = 0;
            gameState.totalHolds = 0;
            
            liveHistory = [];
            fullHistory = [];
            eventLog = [];
            gameState.currentNews = "IPO LANÇADO - VALOR REAL: 50€";
            gameState.isPaused = true;
        }

        if (data.command === 'SHOW_FINAL_CHART') {
            gameState.isPaused = true;
            gameState.currentNews = "SESSÃO ENCERRADA";
            io.emit('market-finish', { fullHistory: fullHistory, events: eventLog });
            return;
        }
        
        // Forçar update
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
    });
});

http.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
