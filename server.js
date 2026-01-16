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
    buyCount: 0,
    sellCount: 0,
    totalVotesEver: 0
};

// HISTÓRICOS
let liveHistory = []; // Janela curta (Direto)
let fullHistory = []; // Viagem completa (Final)
let eventLog = [];    // As "Bolinhas" (Eventos marcados)

setInterval(() => {
    if (!gameState.isPaused) {
        // Lógica de Preço
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        let gap = gameState.intrinsicValue - gameState.price;
        let correction = gap * gameState.gravity;

        gameState.price = gameState.price + voteEffect + correction;
        gameState.price += (Math.random() - 0.5) * 0.05; // Ruído

        if (gameState.price < 0.01) gameState.price = 0.01;

        // Gestão de Tempo e Histórico
        const now = new Date();
        const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
        
        const dataPoint = { time: timeLabel, price: gameState.price };

        fullHistory.push(dataPoint);
        liveHistory.push(dataPoint);
        if (liveHistory.length > 150) liveHistory.shift(); // Janela deslizante

        gameState.buyCount = 0;
        gameState.sellCount = 0;
    }

    io.emit('market-update', {
        price: gameState.price.toFixed(2),
        history: liveHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        totalVotes: gameState.totalVotesEver,
        mode: 'LIVE'
    });

}, 2000);

io.on('connection', (socket) => {
    socket.emit('market-update', {
        price: gameState.price.toFixed(2),
        history: liveHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        totalVotes: gameState.totalVotesEver,
        mode: 'LIVE'
    });

    socket.on('vote', (action) => {
        if (gameState.isPaused) return;
        gameState.totalVotesEver++;
        if (action === 'BUY') gameState.buyCount++;
        if (action === 'SELL') gameState.sellCount++;
    });

    socket.on('admin-action', (data) => {
        if (data.command === 'START_STOP') {
            gameState.isPaused = !gameState.isPaused;
            gameState.currentNews = gameState.isPaused ? "MERCADO PAUSADO" : "MERCADO ABERTO";
        }
        
        if (data.command === 'NEWS_UPDATE') {
            gameState.currentNews = data.text;
            if (data.impact !== 0) gameState.intrinsicValue += data.impact;
            
            // --- AQUI ESTÁ A MUDANÇA: REGISTAR O EVENTO COM PREÇO ---
            const now = new Date();
            const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
            
            eventLog.push({ 
                time: timeLabel, 
                price: gameState.price, // Guardamos o preço exato do momento
                text: data.text,        // O texto da notícia
                impact: data.impact     // Para sabermos a cor (positivo/negativo)
            });
        }

        if (data.command === 'RESET') {
            gameState.price = 50.00;
            gameState.intrinsicValue = 50.00;
            gameState.buyCount = 0;
            gameState.sellCount = 0;
            gameState.totalVotesEver = 0;
            liveHistory = [];
            fullHistory = [];
            eventLog = []; // Limpa as bolinhas
            gameState.currentNews = "IPO LANÇADO - VALOR REAL: 50€";
            gameState.isPaused = true;
        }

        // COMANDO FINAL
        if (data.command === 'SHOW_FINAL_CHART') {
            gameState.isPaused = true;
            gameState.currentNews = "SESSÃO ENCERRADA";
            
            // Envia TUDO (Histórico + Eventos)
            io.emit('market-finish', {
                fullHistory: fullHistory,
                events: eventLog
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
            mode: 'LIVE'
        });
    });
});

http.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
