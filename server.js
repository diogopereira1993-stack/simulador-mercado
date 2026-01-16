const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- ESTADO DO JOGO ---
let gameState = {
    price: 50.00,          // O Preço que as pessoas veem
    intrinsicValue: 50.00, // O VALOR REAL (Invisível/Fundamentos)
    volatility: 0.05,      // Sensibilidade aos votos
    gravity: 0.03,         // Força que puxa o preço para o valor real (3% por tick)
    isPaused: true,
    currentNews: "MERCADO FECHADO - Aguarde o IPO",
    buyCount: 0,
    sellCount: 0
};

let priceHistory = [];

setInterval(() => {
    if (!gameState.isPaused) {
        // 1. Força dos Votos (Especulação)
        // Se houver muitos votos, empurra o preço
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        
        // 2. Força da Realidade (Gravidade)
        // Se o preço estiver longe do Valor Real, é puxado de volta
        let gap = gameState.intrinsicValue - gameState.price;
        let correction = gap * gameState.gravity;

        // 3. Atualizar Preço Final
        // O preço move-se pelos votos, mas é corrigido pela realidade
        gameState.price = gameState.price + voteEffect + correction;
        
        // Pequeno ruído aleatório para dar vida
        gameState.price += (Math.random() - 0.5) * 0.05;

        // Limites de segurança
        if (gameState.price < 0.01) gameState.price = 0.01;

        // Histórico
        const now = new Date();
        const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
        
        priceHistory.push({ time: timeLabel, price: gameState.price });
        if (priceHistory.length > 50) priceHistory.shift();

        // Resetar contadores de cliques
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
    socket.emit('market-update', {
        price: gameState.price.toFixed(2),
        history: priceHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused
    });

    socket.on('vote', (action) => {
        if (gameState.isPaused) return;
        if (action === 'BUY') gameState.buyCount++;
        if (action === 'SELL') gameState.sellCount++;
    });

    socket.on('admin-action', (data) => {
        if (data.command === 'START_STOP') {
            gameState.isPaused = !gameState.isPaused;
            gameState.currentNews = gameState.isPaused ? "MERCADO PAUSADO" : "MERCADO ABERTO";
        }
        // Notícias com impacto no Valor Real
        if (data.command === 'NEWS_UPDATE') {
            gameState.currentNews = data.text;
            // Se a notícia tiver impacto real, mudamos o intrinsicValue
            if (data.impact !== 0) {
                gameState.intrinsicValue += data.impact;
            }
        }
        if (data.command === 'RESET') {
            gameState.price = 50.00;
            gameState.intrinsicValue = 50.00;
            gameState.buyCount = 0;
            gameState.sellCount = 0;
            priceHistory = [];
            gameState.currentNews = "IPO LANÇADO - VALOR REAL: 50€";
            gameState.isPaused = true;
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
