const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO FINANCEIRA ---
const TOTAL_SHARES = 1000000; // 1 Milhão de ações

// --- ESTADO DO JOGO ---
let gameState = {
    price: 50.00,
    intrinsicValue: 50.00, // Define o "Valor Justo" (alterado por notícias)
    volatility: 0.05,
    gravity: 0.02,      
    isPaused: true,
    currentNews: "MERCADO FECHADO - Aguarde o IPO",
    
    // Multiplicador de Votos (Controlo de Admin)
    voteMultiplier: 1, 

    // Contadores da Ronda
    buyCount: 0,
    sellCount: 0,
    
    // Estatísticas Globais
    totalVotesEver: 0,
    totalBuys: 0,
    totalSells: 0,
    totalHolds: 0
};

// Históricos
let liveHistory = []; 
let fullHistory = []; 
let eventLog = [];    
// Anti-Spam (Map: SocketID -> Timestamp)
let lastVoteTime = new Map(); 

// ==================================================
// 1. LOOP PRINCIPAL (TICK) - Corre a cada 2 segundos
// ==================================================
setInterval(() => {
    if (!gameState.isPaused) {
        // --- A. FÍSICA DO MERCADO ---
        let netPressure = gameState.buyCount - gameState.sellCount;
        let voteEffect = netPressure * gameState.volatility;
        
        // Força da Gravidade (Puxa o preço para o Valor Intrínseco)
        let gap = gameState.intrinsicValue - gameState.price;
        let correction = gap * gameState.gravity; 
        
        // Fator Caos (Ruído de mercado)
        let chaosLevel = 0.1 + (Math.abs(gap) * 0.15);
        let randomFluctuation = (Math.random() - 0.5) * chaosLevel;

        // Atualizar Preço
        gameState.price = gameState.price + voteEffect + correction + randomFluctuation;
        if (gameState.price < 0.01) gameState.price = 0.01; // Preço mínimo

        // --- B. HISTÓRICO ---
        const now = new Date();
        const timeLabel = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0') + ":" + now.getSeconds().toString().padStart(2, '0');
        const dataPoint = { time: timeLabel, price: gameState.price };

        fullHistory.push(dataPoint);
        liveHistory.push(dataPoint);
        if (liveHistory.length > 150) liveHistory.shift(); // Janela deslizante

        // Resetar contadores do tick
        gameState.buyCount = 0;
        gameState.sellCount = 0;
    }

    // --- C. ENVIAR DADOS (BROADCAST) ---
    broadcastMarketUpdate();

}, 2000); 


// ==================================================
// 2. FUNÇÃO DE ENVIO DE DADOS (Centralizada)
// ==================================================
function broadcastMarketUpdate() {
    let currentPrice = gameState.price;
    
    // Cálculos Financeiros Dinâmicos
    let marketCap = currentPrice * TOTAL_SHARES;
    let marketCapFormatted = marketCap > 1000000 
        ? (marketCap/1000000).toFixed(1) + "M" 
        : marketCap.toFixed(0);

    // P/E Dinâmico: O "Lucro" ajusta-se ao Valor Intrínseco (Base P/E = 20)
    // Se o valor intrínseco sobe, o P/E baixa (fica barato), incentivando compra.
    let dynamicEPS = gameState.intrinsicValue / 20; 
    let peRatio = (currentPrice / dynamicEPS).toFixed(1);

    // PACOTE LEVE (Telemóveis + Admin)
    io.emit('market-update-light', {
        price: currentPrice.toFixed(2),
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        online: io.engine.clientsCount,
        
        // Dados Fundamentais Completos
        marketCap: marketCapFormatted,
        peRatio: peRatio,
        fairValue: gameState.intrinsicValue.toFixed(2),
        
        // Estatísticas
        stats: {
            buys: gameState.totalBuys,
            sells: gameState.totalSells,
            holds: gameState.totalHolds,
            multiplier: gameState.voteMultiplier
        }
    });

    // PACOTE PESADO (Dashboard - Gráfico)
    io.to('dashboard-room').emit('market-update-full', {
        price: currentPrice.toFixed(2),
        history: liveHistory,
        news: gameState.currentNews,
        isPaused: gameState.isPaused,
        mode: 'LIVE'
    });
}


// ==================================================
// 3. GESTÃO DE CONEXÕES (SOCKETS)
// ==================================================
io.on('connection', (socket) => {
    
    // Dashboard regista-se na sala VIP
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

    // Votos dos Utilizadores
    socket.on('vote', (action) => {
        if (gameState.isPaused) return;

        // Anti-Spam (500ms)
        const now = Date.now();
        const lastTime = lastVoteTime.get(socket.id) || 0;
        if (now - lastTime < 500) return; 
        lastVoteTime.set(socket.id, now);

        // Aplica o Multiplicador
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

    // Comandos de Admin
    socket.on('admin-action', (data) => {
        
        // Pausar / Continuar
        if (data.command === 'START_STOP') {
            gameState.isPaused = !gameState.isPaused;
            gameState.currentNews = gameState.isPaused ? "MERCADO PAUSADO" : "MERCADO ABERTO";
        }
        
        // Mudar Multiplicador
        if (data.command === 'SET_MULTIPLIER') {
            gameState.voteMultiplier = parseInt(data.value);
            console.log(`[ADMIN] Multiplicador alterado para x${gameState.voteMultiplier}`);
        }

        // Enviar Notícia
        if (data.command === 'NEWS_UPDATE') {
            gameState.currentNews = data.text;
            if (data.impact !== 0) gameState.intrinsicValue += data.impact;
            
            // Regista evento
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
            gameState.voteMultiplier = 1; // Reset volta a 1x
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
        
        // CORREÇÃO: Envia update imediato usando a função centralizada
        // Isto garante que o Market Cap e P/E são calculados corretamente
        // mesmo no update manual.
        broadcastMarketUpdate();
    });
});

http.listen(PORT, () => {
    console.log(`Servidor MoneyFlix a correr na porta ${PORT}`);
});
