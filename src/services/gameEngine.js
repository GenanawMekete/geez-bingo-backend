const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const RedisClient = require('../config/redis');
const { Game, Card, User } = require('../models');

class GameEngine extends EventEmitter {
  constructor() {
    super();
    this.activeGames = new Map();
    this.waitingGames = new Map();
    this.gameTimers = new Map();
    this.cardGenerators = new Map();
  }
  
  async initialize() {
    console.log('🎮 Game Engine Initialized');
    
    // Load active games from database on restart
    await this.loadActiveGames();
    
    // Start game scheduler
    this.startScheduler();
    
    // Start cleanup job
    this.startCleanupJob();
  }
  
  async loadActiveGames() {
    try {
      const activeGames = await Game.findAll({
        where: { status: ['waiting', 'active'] },
        include: [{ model: Card, as: 'game_cards' }]
      });
      
      for (const game of activeGames) {
        const gameData = game.toJSON();
        
        if (gameData.status === 'waiting') {
          this.waitingGames.set(gameData.id, gameData);
          this.startCountdown(gameData.id);
        } else if (gameData.status === 'active') {
          this.activeGames.set(gameData.id, gameData);
          this.resumeGame(gameData.id);
        }
      }
      
      console.log(`✅ Loaded ${activeGames.length} active games`);
    } catch (error) {
      console.error('Error loading active games:', error);
    }
  }
  
  startScheduler() {
    // Check for new games every 5 seconds
    setInterval(async () => {
      if (this.waitingGames.size < 5) {
        await this.createNewGame();
      }
    }, 5000);
  }
  
  async createNewGame() {
    try {
      const gameId = `bingo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const game = await Game.create({
        game_id: gameId,
        status: 'waiting',
        pot: 0.00,
        start_time: new Date(Date.now() + 30000), // 30 seconds from now
        settings: {
          bet_amount: parseFloat(process.env.BET_AMOUNT || 10.00),
          house_fee: parseFloat(process.env.HOUSE_FEE || 0.05),
          game_duration: parseInt(process.env.GAME_DURATION || 180),
          max_cards_per_player: parseInt(process.env.MAX_CARDS_PER_PLAYER || 5),
          min_players: 1
        }
      });
      
      // Generate cards for this game
      await this.generateGameCards(game.id);
      
      const gameData = game.toJSON();
      this.waitingGames.set(game.id, gameData);
      
      // Store in Redis
      await RedisClient.set(`game:${game.id}`, JSON.stringify(gameData), 7200); // 2 hours
      
      // Start countdown
      this.startCountdown(game.id);
      
      this.emit('gameCreated', gameData);
      console.log(`🆕 Game Created: ${gameId} (${game.id})`);
      
      return gameData;
    } catch (error) {
      console.error('Error creating game:', error);
      throw error;
    }
  }
  
  async generateGameCards(gameId) {
    const cards = [];
    
    for (let cardNum = 1; cardNum <= 400; cardNum++) {
      const numbers = this.generateCardNumbers(cardNum, gameId);
      
      cards.push({
        game_id: gameId,
        card_number: cardNum,
        numbers: numbers
      });
    }
    
    // Bulk create cards
    await Card.bulkCreate(cards);
    console.log(`🃏 Generated 400 cards for game ${gameId}`);
  }
  
  generateCardNumbers(cardNumber, gameId) {
    const numbers = [];
    const ranges = {
      'B': [1, 15],
      'I': [16, 30],
      'N': [31, 45],
      'G': [46, 60],
      'O': [61, 75]
    };
    
    // Use deterministic seed
    const seed = cardNumber + gameId;
    const seededRandom = (index) => {
      const x = Math.sin(seed + index) * 10000;
      return x - Math.floor(x);
    };
    
    // Generate columns
    Object.entries(ranges).forEach(([letter, [min, max]], colIndex) => {
      const columnNumbers = [];
      for (let num = min; num <= max; num++) {
        columnNumbers.push(num);
      }
      
      // Shuffle using seeded random
      for (let i = columnNumbers.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(colIndex * 100 + i) * (i + 1));
        [columnNumbers[i], columnNumbers[j]] = [columnNumbers[j], columnNumbers[i]];
      }
      
      // Take first 5 for this column
      const selectedNumbers = columnNumbers.slice(0, 5);
      
      // Distribute across rows
      selectedNumbers.forEach((number, rowIndex) => {
        if (!numbers[rowIndex]) numbers[rowIndex] = [];
        numbers[rowIndex][colIndex] = {
          letter,
          number,
          called: false,
          row: rowIndex,
          col: colIndex
        };
      });
    });
    
    // Mark center as free
    numbers[2][2].called = true;
    numbers[2][2].free = true;
    
    return numbers;
  }
  
  startCountdown(gameId) {
    const game = this.waitingGames.get(gameId);
    if (!game) return;
    
    // Clear any existing timer
    if (this.gameTimers.has(gameId)) {
      clearTimeout(this.gameTimers.get(gameId));
    }
    
    const startTime = new Date(game.start_time).getTime();
    const now = Date.now();
    const timeUntilStart = startTime - now;
    
    if (timeUntilStart <= 0) {
      this.startGame(gameId);
      return;
    }
    
    const timer = setTimeout(() => {
      this.startGame(gameId);
    }, timeUntilStart);
    
    this.gameTimers.set(gameId, timer);
    
    // Start broadcasting countdown
    this.broadcastCountdown(gameId, Math.ceil(timeUntilStart / 1000));
  }
  
  async startGame(gameId) {
    try {
      const game = this.waitingGames.get(gameId);
      if (!game) return;
      
      // Check if enough players
      const cards = await Card.count({
        where: { 
          game_id: gameId,
          user_id: { $not: null }
        }
      });
      
      if (cards < 1) {
        console.log(`❌ Game ${gameId} cancelled - no cards purchased`);
        await this.cancelGame(gameId);
        return;
      }
      
      // Update game status
      await Game.update(
        { status: 'active', start_time: new Date() },
        { where: { id: gameId } }
      );
      
      game.status = 'active';
      game.start_time = new Date();
      
      this.waitingGames.delete(gameId);
      this.activeGames.set(gameId, game);
      
      // Update Redis
      await RedisClient.set(`game:${gameId}`, JSON.stringify(game), 7200);
      
      // Start calling numbers
      this.callNumbers(gameId);
      
      this.emit('gameStarted', game);
      console.log(`🚀 Game Started: ${gameId}`);
      
    } catch (error) {
      console.error('Error starting game:', error);
    }
  }
  
  async callNumbers(gameId) {
    const game = this.activeGames.get(gameId);
    if (!game) return;
    
    const allNumbers = [];
    const ranges = [
      { letter: 'B', start: 1, end: 15 },
      { letter: 'I', start: 16, end: 30 },
      { letter: 'N', start: 31, end: 45 },
      { letter: 'G', start: 46, end: 60 },
      { letter: 'O', start: 61, end: 75 }
    ];
    
    // Generate all 75 numbers
    ranges.forEach(({ letter, start, end }) => {
      for (let num = start; num <= end; num++) {
        allNumbers.push({ letter, number: num, called: false });
      }
    });
    
    // Shuffle
    for (let i = allNumbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
    }
    
    const startTime = Date.now();
    let numberIndex = 0;
    
    const callInterval = setInterval(async () => {
      // Check if game should end
      if (!this.activeGames.has(gameId)) {
        clearInterval(callInterval);
        return;
      }
      
      const elapsed = Date.now() - startTime;
      if (elapsed > game.settings.game_duration * 1000 || numberIndex >= allNumbers.length) {
        clearInterval(callInterval);
        await this.endGame(gameId);
        return;
      }
      
      // Call next number
      const number = allNumbers[numberIndex];
      number.called = true;
      numberIndex++;
      
      // Update game state
      game.called_numbers.push(number);
      game.current_calls = game.called_numbers.slice(-3);
      
      // Update in database
      await Game.update(
        {
          called_numbers: game.called_numbers,
          current_calls: game.current_calls
        },
        { where: { id: gameId } }
      );
      
      // Update Redis
      await RedisClient.set(`game:${gameId}`, JSON.stringify(game), 7200);
      
      // Mark on cards
      await this.markNumberOnCards(gameId, number);
      
      // Broadcast
      this.emit('numberCalled', {
        gameId,
        number,
        calledNumbers: game.called_numbers.length,
        currentCalls: game.current_calls
      });
      
      // Check for winners
      await this.checkForWinners(gameId);
      
    }, 3000); // Every 3 seconds
  }
  
  async markNumberOnCards(gameId, number) {
    try {
      // Update in database
      await Card.update(
        {
          marked_numbers: sequelize.fn('array_append', sequelize.col('marked_numbers'), `${number.letter}${number.number}`)
        },
        {
          where: {
            game_id: gameId,
            numbers: {
              [sequelize.Op.contains]: [
                {
                  letter: number.letter,
                  number: number.number
                }
              ]
            }
          }
        }
      );
      
    } catch (error) {
      console.error('Error marking number on cards:', error);
    }
  }
  
  async checkForWinners(gameId) {
    try {
      const game = this.activeGames.get(gameId);
      if (!game) return;
      
      // Get all cards for this game
      const cards = await Card.findAll({
        where: { 
          game_id: gameId,
          user_id: { $not: null }
        },
        include: [{ model: User, as: 'owner' }]
      });
      
      for (const card of cards) {
        if (this.checkCardForBingo(card.numbers, game.called_numbers)) {
          await this.declareWinner(gameId, card.user_id, card.card_number);
          return;
        }
      }
    } catch (error) {
      console.error('Error checking for winners:', error);
    }
  }
  
  checkCardForBingo(cardNumbers, calledNumbers) {
    const calledSet = new Set();
    calledNumbers.forEach(n => calledSet.add(`${n.letter}${n.number}`));
    
    // Check rows
    for (let row = 0; row < 5; row++) {
      let complete = true;
      for (let col = 0; col < 5; col++) {
        const cell = cardNumbers[row][col];
        if (cell.free) continue;
        if (!calledSet.has(`${cell.letter}${cell.number}`)) {
          complete = false;
          break;
        }
      }
      if (complete) return true;
    }
    
    // Check columns
    for (let col = 0; col < 5; col++) {
      let complete = true;
      for (let row = 0; row < 5; row++) {
        const cell = cardNumbers[row][col];
        if (cell.free) continue;
        if (!calledSet.has(`${cell.letter}${cell.number}`)) {
          complete = false;
          break;
        }
      }
      if (complete) return true;
    }
    
    // Check diagonals
    let diag1 = true;
    let diag2 = true;
    
    for (let i = 0; i < 5; i++) {
      // Main diagonal
      const cell1 = cardNumbers[i][i];
      if (!cell1.free && !calledSet.has(`${cell1.letter}${cell1.number}`)) {
        diag1 = false;
      }
      
      // Anti-diagonal
      const cell2 = cardNumbers[i][4 - i];
      if (!cell2.free && !calledSet.has(`${cell2.letter}${cell2.number}`)) {
        diag2 = false;
      }
    }
    
    return diag1 || diag2;
  }
  
  async declareWinner(gameId, userId, cardNumber) {
    try {
      const game = this.activeGames.get(gameId);
      if (!game || game.winner_id) return;
      
      // Calculate winnings
      const winnings = game.pot * (1 - game.settings.house_fee);
      
      // Update game
      await Game.update(
        {
          status: 'completed',
          winner_id: userId,
          winning_card: cardNumber,
          end_time: new Date()
        },
        { where: { id: gameId } }
      );
      
      // Update user balance
      await User.increment('balance', {
        by: winnings,
        where: { id: userId }
      });
      
      await User.increment('total_won', {
        by: winnings,
        where: { id: userId }
      });
      
      await User.increment('games_won', {
        by: 1,
        where: { id: userId }
      });
      
      // Mark winning card
      await Card.update(
        { is_winner: true },
        { where: { game_id: gameId, card_number: cardNumber } }
      );
      
      // Get winner info
      const winner = await User.findByPk(userId);
      
      // Create transaction
      await Transaction.create({
        user_id: userId,
        type: 'win',
        amount: winnings,
        status: 'completed',
        metadata: {
          game_id: gameId,
          card_number: cardNumber,
          pot: game.pot
        }
      });
      
      // Update game object
      game.status = 'completed';
      game.winner_id = userId;
      game.winning_card = cardNumber;
      game.end_time = new Date();
      
      // Remove from active games
      this.activeGames.delete(gameId);
      
      // Broadcast winner
      this.emit('winnerDeclared', {
        gameId,
        winner: {
          id: userId,
          username: winner.username,
          avatar: winner.avatar
        },
        winningCard: cardNumber,
        winnings,
        pot: game.pot
      });
      
      console.log(`🏆 Winner Declared: ${winner.username} won $${winnings} in game ${gameId}`);
      
      // Start new game after delay
      setTimeout(() => {
        this.createNewGame();
      }, 10000); // 10 seconds delay
      
    } catch (error) {
      console.error('Error declaring winner:', error);
    }
  }
  
  async endGame(gameId) {
    try {
      const game = this.activeGames.get(gameId);
      if (!game) return;
      
      // Update game status
      await Game.update(
        { status: 'completed', end_time: new Date() },
        { where: { id: gameId } }
      );
      
      // Remove from active games
      this.activeGames.delete(gameId);
      
      this.emit('gameEnded', {
        gameId,
        reason: 'timeout',
        pot: game.pot
      });
      
      console.log(`⏰ Game Ended: ${gameId} - No winner`);
      
      // Start new game
      setTimeout(() => {
        this.createNewGame();
      }, 5000);
      
    } catch (error) {
      console.error('Error ending game:', error);
    }
  }
  
  async cancelGame(gameId) {
    try {
      const game = this.waitingGames.get(gameId);
      if (!game) return;
      
      // Update game status
      await Game.update(
        { status: 'cancelled', end_time: new Date() },
        { where: { id: gameId } }
      );
      
      // Refund all card purchases
      const cards = await Card.findAll({
        where: { 
          game_id: gameId,
          user_id: { $not: null }
        }
      });
      
      for (const card of cards) {
        await User.increment('balance', {
          by: game.settings.bet_amount,
          where: { id: card.user_id }
        });
        
        await Transaction.create({
          user_id: card.user_id,
          type: 'refund',
          amount: game.settings.bet_amount,
          status: 'completed',
          metadata: { game_id: gameId, card_number: card.card_number }
        });
      }
      
      // Remove from waiting games
      this.waitingGames.delete(gameId);
      
      // Clear timer
      if (this.gameTimers.has(gameId)) {
        clearTimeout(this.gameTimers.get(gameId));
        this.gameTimers.delete(gameId);
      }
      
      console.log(`❌ Game Cancelled: ${gameId}`);
      
      // Start new game
      this.createNewGame();
      
    } catch (error) {
      console.error('Error cancelling game:', error);
    }
  }
  
  broadcastCountdown(gameId, secondsLeft) {
    this.emit('gameCountdown', {
      gameId,
      secondsLeft,
      status: 'waiting'
    });
  }
  
  startCleanupJob() {
    // Clean up old games every hour
    setInterval(async () => {
      try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        await Game.destroy({
          where: {
            status: 'completed',
            end_time: { $lt: oneDayAgo }
          }
        });
        
        console.log('🧹 Cleaned up old games');
      } catch (error) {
        console.error('Error cleaning up games:', error);
      }
    }, 60 * 60 * 1000); // Every hour
  }
  
  async getGameState(gameId) {
    const game = this.waitingGames.get(gameId) || this.activeGames.get(gameId);
    if (!game) {
      return await Game.findByPk(gameId);
    }
    return game;
  }
  
  async joinGame(gameId, userId) {
    try {
      const game = this.waitingGames.get(gameId);
      if (!game || game.status !== 'waiting') {
        throw new Error('Game not available for joining');
      }
      
      // Check if user already has max cards
      const userCardCount = await Card.count({
        where: {
          game_id: gameId,
          user_id: userId
        }
      });
      
      if (userCardCount >= game.settings.max_cards_per_player) {
        throw new Error('Maximum cards per player reached');
      }
      
      return game;
      
    } catch (error) {
      console.error('Error joining game:', error);
      throw error;
    }
  }
  
  async purchaseCard(gameId, userId, cardNumber) {
    try {
      const game = this.waitingGames.get(gameId);
      if (!game || game.status !== 'waiting') {
        throw new Error('Game not available for card purchase');
      }
      
      // Check if card is available
      const card = await Card.findOne({
        where: {
          game_id: gameId,
          card_number: cardNumber,
          user_id: null
        }
      });
      
      if (!card) {
        throw new Error('Card not available');
      }
      
      // Check user balance
      const user = await User.findByPk(userId);
      if (user.balance < game.settings.bet_amount) {
        throw new Error('Insufficient balance');
      }
      
      // Deduct balance
      await User.decrement('balance', {
        by: game.settings.bet_amount,
        where: { id: userId }
      });
      
      // Update card ownership
      card.user_id = userId;
      card.purchased_at = new Date();
      await card.save();
      
      // Update game pot
      game.pot += game.settings.bet_amount;
      await Game.update(
        { pot: game.pot },
        { where: { id: gameId } }
      );
      
      // Update in memory
      this.waitingGames.set(gameId, game);
      
      // Create transaction
      await Transaction.create({
        user_id: userId,
        type: 'bet',
        amount: game.settings.bet_amount,
        status: 'completed',
        metadata: { game_id: gameId, card_number: cardNumber }
      });
      
      // Increment user games played
      await User.increment('games_played', {
        by: 1,
        where: { id: userId }
      });
      
      this.emit('cardPurchased', {
        gameId,
        userId,
        cardNumber,
        pot: game.pot
      });
      
      return card;
      
    } catch (error) {
      console.error('Error purchasing card:', error);
      throw error;
    }
  }
}

module.exports = new GameEngine();
