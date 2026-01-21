const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO FINANCEIRA INICIAL (Realista) ---
const INITIAL_SHARES = 10000000; // 10 Milhões de ações (Market Cap ~500M)
const INITIAL_EPS = 2.50;        // Lucro por ação inicial (P/E = 20)
const INITIAL_REVENUE = "150M";  // Receita Trimestral base

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
    simulatedDate: new Date("2024-01-01"), // Data de início

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

// Função auxiliar para formatar data (DD/MM/AAAA)
function formatDate(date) {
    return date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ==================================================
// 1. LOOP PRINCIPAL (TICK) - 1 Tick = 1 Dia
// ==================================================
setInterval(() => {
    if (!gameState.isPaused) {
        // --- A. AVANÇAR NO TEMPO ---
        // Avança 1 dia por cada tick de 2 segundos
        gameState.simulatedDate.setDate(gameState.simulatedDate.getDate() + 1);

        // --- B. FÍSICA DO MERCADO ---
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        
        // Força da Gravidade
        let gap = gameState.intrinsicValue - gameState.price;
        let correction = gap * gameState.gravity; 
        
        // Fator Caos
        let chaosLevel = 0.1 + (Math.abs(gap) * 0.15);
        let randomFluctuation = (Math.random() - 0.5) * chaosLevel;

        gameState.price = gameState.price + voteEffect + correction + randomFluctuation;
        if (gameState.price < 0.01) gameState.price = 0.01;

        // --- C. HISTÓRICO (Com Data Simulada) ---
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
    
    // Cálculos Financeiros
    let marketCap = currentPrice * INITIAL_SHARES;
    
    // Formatação Market Cap (Ex: 500.5M)
    let marketCapFormatted = marketCap > 1000000000 
        ? (marketCap/1000000000).toFixed(2) + "B" // Bilhões
        : (marketCap/1000000).toFixed(1) + "M";   // Milhões

    // P/E Ratio Real (Baseado no EPS atual definido pelos Earnings)
    // Se o EPS for negativo ou zero, o P/E é tecnicamente N/A, mas mostramos traço ou numero alto
    let peRatio = gameState.currentEPS > 0 
        ? (currentPrice / gameState.currentEPS).toFixed(1) 
        : "N/A";

    // Dados base para todos
    const commonData = {
        price: currentPrice.toFixed(2),
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        marketCap: marketCapFormatted,
        peRatio: peRatio,
        eps: gameState.currentEPS.toFixed(2),
        revenue: gameState.currentRevenue,
        shares: "10M", // Estático para simplificar visualização
        date: formatDate(gameState.simulatedDate)
    };

    // CANAL 1: Mobile (Leve)
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

    // CANAL 2: Dashboard (Pesado - Com Gráfico)
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
        broadcastMarketUpdate(); // Atualiza logo ao entrar
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

        // Notícias Normais (Rumores, CEO, etc)
        if (data.command === 'NEWS_UPDATE') {
            gameState.currentNews = data.text;
            if (data.impact !== 0) gameState.intrinsicValue += data.impact;
            
            let eventTime = fullHistory.length > 0 ? fullHistory[fullHistory.length - 1].time : formatDate(gameState.simulatedDate);
            eventLog.push({ time: eventTime, price: gameState.price, text: data.text, impact: data.impact });
        }

        // --- NOVO: EARNINGS REPORTS (Atualiza Fundamentos) ---
        if (data.command === 'EARNINGS_UPDATE') {
            gameState.currentNews = data.text;
            // Atualiza o Valor Intrínseco
            if (data.impact !== 0) gameState.intrinsicValue += data.impact;
            // Atualiza o EPS (Fundamental)
            if (data.newEPS !== null) gameState.currentEPS = data.newEPS;
            // Atualiza Receita (Texto)
            if (data.newRevenue !== null) gameState.currentRevenue = data.newRevenue;

            let eventTime = fullHistory.length > 0 ? fullHistory[fullHistory.length - 1].time : formatDate(gameState.simulatedDate);
            // Marcamos como evento especial com ícone 📊
            eventLog.push({ 
                time: eventTime, 
                price: gameState.price, 
                text: "📊 " + data.text, 
                impact: data.impact 
            });
        }

        if (data.command === 'RESET') {
            gameState.price = 50.00;
            gameState.intrinsicValue = 50.00;
            gameState.currentEPS = INITIAL_EPS;
            gameState.currentRevenue = INITIAL_REVENUE;
            gameState.simulatedDate = new Date("2024-01-01"); // Reset Data

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
    console.log(`Servidor MoneyFlix a correr na porta ${PORT}`);
});
