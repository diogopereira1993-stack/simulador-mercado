const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO FINANCEIRA ---
const TOTAL_SHARES = 1000000; // 1 Milhão de ações
const ANNUAL_EARNINGS = 2500000; // Lucro Base: 2.5M
const EPS = ANNUAL_EARNINGS / TOTAL_SHARES; // 2.5€ por ação

// --- ESTADO DO JOGO ---
let gameState = {
    price: 50.00,
    intrinsicValue: 50.00,
    volatility: 0.05,
    gravity: 0.02,      
    isPaused: true,
    currentNews: "MERCADO FECHADO - Aguarde o IPO",
    
    // NOVO: Multiplicador Dinâmico (Começa sempre em 1 para segurança)
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

let liveHistory = []; 
let fullHistory = []; 
let eventLog = [];    
// Cooldown no servidor para evitar spam (Map de SocketID -> Timestamp)
let lastVoteTime = new Map(); 

// --- LOOP DO MERCADO (TICK) ---
setInterval(() => {
    if (!gameState.isPaused) {
        // 1. Lógica de Mercado
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        
        let gap = gameState.intrinsicValue - gameState.price;
        let correction = gap * gameState.gravity; 
        
        // Fator Caos (aumenta se o preço estiver muito longe do valor real)
        let chaosLevel = 0.1 + (Math.abs(gap) * 0.15);
        let randomFluctuation = (Math.random() - 0.5) * chaosLevel;

        // Atualização do Preço
        gameState.price = gameState.price + voteEffect + correction + randomFluctuation;
        
        // Proteção Preço Mínimo
        if (gameState.price < 0.01) gameState.price = 0.01;

        // 2. Histórico
        const now = new Date();
        const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
        const dataPoint = { time: timeLabel, price: gameState.price };

        fullHistory.push(dataPoint);
        liveHistory.push(dataPoint);
        // Mantém apenas os últimos 150 pontos para o gráfico live
        if (liveHistory.length > 150) liveHistory.shift();

        // Resetar contadores do tick
        gameState.buyCount = 0;
        gameState.sellCount = 0;
    }

    // --- CÁLCULOS FUNDAMENTAIS ---
    let currentPrice = gameState.price;
    let marketCap = (currentPrice * TOTAL_SHARES);
    let peRatio = (currentPrice / EPS).toFixed(1); // Preço / 2.5

    // --- CANAL 1: PACOTE LEVE (Para telemóveis e Admin) ---
    // Envia estatísticas e o multiplicador atual para o Admin ver
    io.emit('market-update-light', {
        price: currentPrice.toFixed(2),
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        // Dados Fundamentais
        marketCap: marketCap > 1000000 ? (marketCap/1000000).toFixed(1) + "M" : marketCap.toFixed(0),
        peRatio: peRatio,
        fairValue: gameState.intrinsicValue.toFixed(2),
        // Estatísticas para o Admin
        stats: {
            buys: gameState.totalBuys,
            sells: gameState.totalSells,
            holds: gameState.totalHolds,
            multiplier: gameState.voteMultiplier // Envia o estado atual
        }
    });

    // --- CANAL 2: PACOTE PESADO (Só para o Dashboard) ---
    io.to('dashboard-room').emit('market-update-full', {
        price: currentPrice.toFixed(2),
        history: liveHistory, // Gráfico pesado vai aqui
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        mode: 'LIVE'
    });

}, 2000); // Tick de 2 segundos

// --- GESTÃO DE SOCKETS ---
io.on('connection', (socket) => {
    
    // O Dashboard regista-se numa sala separada
    socket.on('register-dashboard', () => {
        socket.join('dashboard-room');
        // Envia estado imediato
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

        // APLICA O MULTIPLICADOR DINÂMICO
        let voteWeight = gameState.voteMultiplier;

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

    // --- COMANDOS DE ADMIN ---
    socket.on('admin-action', (data) => {
        
        // Pausar / Iniciar
        if (data.command === 'START_STOP') {
            gameState.isPaused = !gameState.isPaused;
            gameState.currentNews = gameState.isPaused ? "MERCADO PAUSADO" : "MERCADO ABERTO";
        }
        
        // Mudar Multiplicador (NOVO)
        if (data.command === 'SET_MULTIPLIER') {
            gameState.voteMultiplier = parseInt(data.value);
            console.log(`[ADMIN] Multiplicador alterado para x${gameState.voteMultiplier}`);
        }

        // Enviar Notícia
        if (data.command === 'NEWS_UPDATE') {
            gameState.currentNews = data.text;
            if (data.impact !== 0) gameState.intrinsicValue += data.impact;
            
            // Regista evento para as "bolas" no gráfico final
            let eventTime = fullHistory.length > 0 ? fullHistory[fullHistory.length - 1].time : new Date().toISOString().split('T')[1].split('.')[0];
            eventLog.push({ 
                time: eventTime, 
                price: gameState.price, 
                text: data.text, 
                impact: data.impact 
            });
        }

        // Reset Total
        if (data.command === 'RESET') {
            gameState.price = 50.00;
            gameState.intrinsicValue = 50.00;
            gameState.buyCount = 0; gameState.sellCount = 0;
            gameState.totalVotesEver = 0; gameState.totalBuys = 0; gameState.totalSells = 0; gameState.totalHolds = 0;
            liveHistory = []; fullHistory = []; eventLog = [];
            
            gameState.voteMultiplier = 1; // IMPORTANTE: Reset volta a x1
            
            gameState.currentNews = "IPO LANÇADO - VALOR REAL: 50€";
            gameState.isPaused = true;
        }

        // Mostrar Gráfico Final
        if (data.command === 'SHOW_FINAL_CHART') {
            gameState.isPaused = true;
            gameState.currentNews = "SESSÃO ENCERRADA";
            io.emit('market-finish', {
                fullHistory: fullHistory,
                events: eventLog,
                stats: { 
                    buys: gameState.totalBuys, 
                    sells: gameState.totalSells, 
                    total: gameState.totalVotesEver 
                }
            });
            return;
        }
        
        // Feedback imediato para o admin não esperar pelo tick
        io.emit('market-update-light', { 
            price: gameState.price.toFixed(2), 
            news: gameState.currentNews, 
            isPaused: gameState.isPaused, 
            online: io.engine.clientsCount, 
            marketCap: "---", peRatio: "---", fairValue: gameState.intrinsicValue,
            stats: { 
                buys: gameState.totalBuys, 
                sells: gameState.totalSells, 
                holds: gameState.totalHolds, 
                multiplier: gameState.voteMultiplier 
            }
        });
    });
});

http.listen(PORT, () => {
    console.log(`Servidor MoneyFlix a correr na porta ${PORT}`);
});
