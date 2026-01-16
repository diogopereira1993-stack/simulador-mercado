const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- ESTADO DO JOGO ---
let gameState = {
    price: 50.00,           // Começa nos 50€
    intrinsicValue: 50.00,  // Valor Real
    volatility: 0.05,       // Força do clique (5 cêntimos por voto)
    gravity: 0.005,         // <--- ALTERADO: Força da Gravidade MUITO MAIS SUAVE (0.5%)
    isPaused: true,
    currentNews: "MERCADO FECHADO - Aguarde o IPO",
    buyCount: 0,
    sellCount: 0,
    totalVotesEver: 0       // Mantém o contador de estatísticas
};

let priceHistory = [];

setInterval(() => {
    if (!gameState.isPaused) {
        // 1. Força dos Votos (Especulação)
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        
        // 2. Força da Realidade (Gravidade Suave)
        // Puxa o preço para o valor real muito devagarinho
        let gap = gameState.intrinsicValue - gameState.price;
        let correction = gap * gameState.gravity;

        // 3. Atualizar Preço Final
        gameState.price = gameState.price + voteEffect + correction;
        
        // Pequeno ruído para o gráfico parecer vivo
        gameState.price += (Math.random() - 0.5) * 0.05;

        // Limites de segurança (nunca chega a zero)
        if (gameState.price < 0.01) gameState.price = 0.01;

        // Histórico para o gráfico
        const now = new Date();
        const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
        
        priceHistory.push({ time: timeLabel, price: gameState.price });
        if (priceHistory.length > 50) priceHistory.shift();

        // Resetar contadores do tick (mas MANTÉM o totalVotesEver)
        gameState.buyCount = 0;
        gameState.sellCount = 0;
    }

    // Enviar dados a TODOS (Incluindo contadores para o Admin)
    io.emit('market-update', {
        price: gameState.price.toFixed(2),
        history: priceHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,    // Mantém contagem de pessoas online
        totalVotes: gameState.totalVotesEver // Mantém total de votos
    });

}, 500);

io.on('connection', (socket) => {
    // Enviar estado inicial quando alguém entra
    socket.emit('market-update', {
        price: gameState.price.toFixed(2),
        history: priceHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        totalVotes: gameState.totalVotesEver
    });

    socket.on('vote', (action) => {
        if (gameState.isPaused) return;
        
        gameState.totalVotesEver++; // Incrementa estatística global
        
        if (action === 'BUY') gameState.buyCount++;
        if (action === 'SELL') gameState.sellCount++;
    });

    socket.on('admin-action', (data) => {
        if (data.command === 'START_STOP') {
            gameState.isPaused = !gameState.isPaused;
            gameState.currentNews = gameState.isPaused ? "MERCADO PAUSADO" : "MERCADO ABERTO";
        }
        // Notícias que alteram o Valor Real (Fundamentos)
        if (data.command === 'NEWS_UPDATE') {
            gameState.currentNews = data.text;
            // Se tiver impacto, muda o íman (intrinsicValue)
            if (data.impact !== 0) {
                gameState.intrinsicValue += data.impact;
            }
        }
        if (data.command === 'RESET') {
            gameState.price = 50.00;
            gameState.intrinsicValue = 50.00;
            gameState.buyCount = 0;
            gameState.sellCount = 0;
            gameState.totalVotesEver = 0; // Zera as estatísticas no Reset
            priceHistory = [];
            gameState.currentNews = "IPO LANÇADO - VALOR REAL: 50€";
            gameState.isPaused = true;
        }
        
        // Atualiza toda a gente imediatamente
        io.emit('market-update', {
            price: gameState.price.toFixed(2),
            history: priceHistory,
            news: gameState.currentNews,
            isPaused: gameState.isPaused,
            online: io.engine.clientsCount,
            totalVotes: gameState.totalVotesEver
        });
    });
});

http.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});
