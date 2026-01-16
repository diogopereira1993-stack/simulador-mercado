const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Estado do Jogo
let gameState = {
    price: 100.00,
    volatility: 0.15,
    isPaused: true,
    currentNews: "MERCADO FECHADO - Aguarde o início",
    totalVotes: 0,
    buyCount: 0,
    sellCount: 0
};

let priceHistory = [];

// Loop do Mercado (0.5 segundos)
setInterval(() => {
    if (!gameState.isPaused) {
        let netPressure = gameState.buyCount - gameState.sellCount;
        let change = netPressure * gameState.volatility;
        let noise = (Math.random() - 0.5) * 0.05; 
        
        gameState.price = gameState.price + change + noise;
        if (gameState.price < 0.01) gameState.price = 0.01;

        const now = new Date();
        const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
        
        priceHistory.push({ time: timeLabel, price: gameState.price });
        if (priceHistory.length > 50) priceHistory.shift();

        // Resetar contadores
        gameState.buyCount = 0;
        gameState.sellCount = 0;

        io.emit('market-update', {
            price: gameState.price.toFixed(2),
            history: priceHistory,
            news: gameState.currentNews,
            isPaused: gameState.isPaused
        });
    }
}, 500);

io.on('connection', (socket) => {
    // Enviar estado inicial
    socket.emit('market-update', {
        price: gameState.price.toFixed(2),
        history: priceHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused
    });

    socket.on('vote', (action) => {
        if (gameState.isPaused) return;
        gameState.totalVotes++;
        if (action === 'BUY') gameState.buyCount++;
        if (action === 'SELL') gameState.sellCount++;
    });

    socket.on('admin-action', (data) => {
        if (data.command === 'START_STOP') {
            gameState.isPaused = !gameState.isPaused;
            gameState.currentNews = gameState.isPaused ? "MERCADO PAUSADO" : "MERCADO ABERTO";
        }
        if (data.command === 'NEWS') {
            gameState.currentNews = data.payload;
        }
        if (data.command === 'RESET') {
            gameState.price = 100.00;
            gameState.buyCount = 0;
            gameState.sellCount = 0;
            gameState.totalVotes = 0;
            priceHistory = [];
            gameState.currentNews = "MERCADO REINICIADO";
            gameState.isPaused = true;
        }
        if (data.command === 'MANIPULATE') {
            gameState.price += data.payload; 
        }
        io.emit('market-update', {
            price: gameState.price.toFixed(2),
            history: priceHistory,
            news: gameState.currentNews,
            isPaused: gameState.isPaused
        });
    });
});

http.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
