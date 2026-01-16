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
    volatility: 0.05,       // 5 cêntimos por voto
    gravity: 0.05,          // <--- ALTERADO: 5% (Corrige em ~2 mins)
    isPaused: true,
    currentNews: "MERCADO FECHADO - Aguarde o IPO",
    
    // Contadores Instantâneos (Para o cálculo do preço a cada 2s)
    buyCount: 0,
    sellCount: 0,
    
    // ESTATÍSTICAS GLOBAIS (Para o Relatório/Admin)
    totalVotesEver: 0,
    totalBuys: 0,
    totalSells: 0,
    totalHolds: 0
};

// Históricos
let liveHistory = []; // Janela deslizante (Direto)
let fullHistory = []; // Histórico completo (Relatório)
let eventLog = [];    // Notícias marcadas

setInterval(() => {
    if (!gameState.isPaused) {
        // 1. Força dos Votos (Especulação)
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        
        // 2. Força da Realidade (Gravidade Ajustada)
        let gap = gameState.intrinsicValue - gameState.price;
        let correction = gap * gameState.gravity;

        // 3. Atualizar Preço
        gameState.price = gameState.price + voteEffect + correction;
        gameState.price += (Math.random() - 0.5) * 0.05; // Pequeno ruído

        if (gameState.price < 0.01) gameState.price = 0.01;

        // 4. Gestão de Histórico (Sincronizado)
        const now = new Date();
        const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
        const dataPoint = { time: timeLabel, price: gameState.price };

        fullHistory.push(dataPoint);
        liveHistory.push(dataPoint);
        // Janela deslizante de ~5 minutos (150 pontos x 2s = 300s)
        if (liveHistory.length > 150) liveHistory.shift();

        // Resetar apenas os contadores do intervalo (instantâneos)
        gameState.buyCount = 0;
        gameState.sellCount = 0;
    }

    // Enviar updates para toda a gente
    io.emit('market-update', {
        price: gameState.price.toFixed(2),
        history: liveHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        // Enviar Stats para o Admin ver os Bots a funcionar
        totalVotes: gameState.totalVotesEver,
        stats: {
            buys: gameState.totalBuys,
            sells: gameState.totalSells,
            holds: gameState.totalHolds
        },
        mode: 'LIVE'
    });

}, 2000); // Ticks de 2 segundos

io.on('connection', (socket) => {
    // Enviar estado inicial a quem entra
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
        
        // Atualizar contadores globais e instantâneos
        if (action === 'BUY') {
            gameState.buyCount++;   // Afeta preço
            gameState.totalBuys++;  // Afeta estatística
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
            
            // LÓGICA DE SINCRONIZAÇÃO DAS BOLINHAS (Mantida)
            // Usa a hora do gráfico para garantir que a bola aparece na linha
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
            // Reset Stats
            gameState.totalVotesEver = 0;
            gameState.totalBuys = 0; gameState.totalSells = 0; gameState.totalHolds = 0;
            liveHistory = [];
            fullHistory = [];
            eventLog = [];
            gameState.currentNews = "IPO LANÇADO - VALOR REAL: 50€";
            gameState.isPaused = true;
        }

        if (data.command === 'SHOW_FINAL_CHART') {
            gameState.isPaused = true;
            gameState.currentNews = "SESSÃO ENCERRADA";
            
            // Envia TUDO (Histórico, Bolinhas e Stats Finais para Relatório)
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
        
        // Update forçado para o Admin ver a mudança imediata
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
