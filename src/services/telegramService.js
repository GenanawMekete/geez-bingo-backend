const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

class TelegramService {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.bot = new TelegramBot(this.token);
        this.notificationQueue = [];
        this.isProcessing = false;
    }
    
    async sendMessage(chatId, message, options = {}) {
        try {
            // Rate limiting: max 30 messages per second
            await this.rateLimit();
            
            const messageOptions = {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options
            };
            
            await this.bot.sendMessage(chatId, message, messageOptions);
            return true;
            
        } catch (error) {
            console.error(`Telegram send error to ${chatId}:`, error.message);
            
            // Handle rate limiting
            if (error.response && error.response.statusCode === 429) {
                const retryAfter = error.response.parameters.retry_after || 1;
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return this.sendMessage(chatId, message, options);
            }
            
            return false;
        }
    }
    
    async sendGameNotification(gameId, type, data) {
        // Get all players in the game
        const players = await this.getGamePlayers(gameId);
        
        const notifications = players.map(player => ({
            chatId: player.telegramChatId,
            type,
            data,
            gameId
        }));
        
        // Add to queue for batch processing
        this.notificationQueue.push(...notifications);
        
        if (!this.isProcessing) {
            this.processNotificationQueue();
        }
    }
    
    async processNotificationQueue() {
        this.isProcessing = true;
        
        while (this.notificationQueue.length > 0) {
            const batch = this.notificationQueue.splice(0, 10); // Process 10 at a time
            
            await Promise.allSettled(
                batch.map(notification => this.sendIndividualNotification(notification))
            );
            
            // Rate limiting delay
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        this.isProcessing = false;
    }
    
    async sendIndividualNotification(notification) {
        const { chatId, type, data, gameId } = notification;
        
        if (!chatId) return;
        
        let message = '';
        let keyboard = [];
        
        switch (type) {
            case 'GAME_STARTING':
                message = this.formatGameStartingMessage(gameId, data);
                keyboard = [[
                    { text: '🎮 Join Game', url: `${process.env.WEB_APP_URL}/game/${gameId}` }
                ]];
                break;
                
            case 'NUMBER_CALLED':
                message = this.formatNumberCalledMessage(data);
                break;
                
            case 'PLAYER_JOINED':
                message = this.formatPlayerJoinedMessage(data);
                break;
                
            case 'CARD_SOLD':
                message = this.formatCardSoldMessage(data);
                break;
                
            case 'WINNER':
                message = this.formatWinnerMessage(data);
                if (data.isWinner) {
                    keyboard = [[
                        { text: '💰 Claim Prize', callback_data: `claim_${gameId}` }
                    ]];
                }
                break;
                
            case 'GAME_ENDING':
                message = this.formatGameEndingMessage(gameId, data);
                keyboard = [[
                    { text: '🏆 Claim Bingo', callback_data: `claim_${gameId}` }
                ]];
                break;
        }
        
        if (message) {
            const options = keyboard.length > 0 ? {
                reply_markup: { inline_keyboard: keyboard }
            } : {};
            
            await this.sendMessage(chatId, message, options);
        }
    }
    
    formatGameStartingMessage(gameId, data) {
        return `
🎮 <b>Game Starting Soon!</b>

Game ID: <code>${gameId.slice(0, 8)}</code>
Players: ${data.playerCount}
Pot: $${data.pot.toFixed(2)}

Game starts in ${data.timeLeft} seconds!
        `;
    }
    
    formatNumberCalledMessage(data) {
        const currentCalls = data.currentCalls.map(n => `<b>${n.letter}${n.number}</b>`).join(' | ');
        return `
📢 <b>${data.letter}${data.number}</b> called!

Current calls: ${currentCalls}

Called numbers: ${data.totalCalled}/75
        `;
    }
    
    formatWinnerMessage(data) {
        if (data.isWinner) {
            return `
🏆 <b>BINGO! YOU WON!</b>

Congratulations! You won <b>$${data.amount.toFixed(2)}</b>!

Game: <code>${data.gameId.slice(0, 8)}</code>
Winning card: #${data.winningCard}

Your new balance: $${data.newBalance.toFixed(2)}
            `;
        } else {
            return `
🎉 <b>Game Winner!</b>

<b>${data.winnerName}</b> won <b>$${data.amount.toFixed(2)}</b>!

Better luck next time! 🍀
            `;
        }
    }
    
    async rateLimit() {
        // Simple rate limiting: ensure at least 100ms between messages
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    async getGamePlayers(gameId) {
        // Fetch players from database
        try {
            const response = await axios.get(`${process.env.BACKEND_URL}/api/games/${gameId}/players`);
            return response.data.players || [];
        } catch (error) {
            console.error('Error fetching game players:', error);
            return [];
        }
    }
    
    // Broadcast to all users
    async broadcastToAll(message, options = {}) {
        // Get all active users from database
        const users = await this.getAllActiveUsers();
        
        for (const user of users) {
            if (user.telegramChatId) {
                await this.sendMessage(user.telegramChatId, message, options);
                await this.rateLimit();
            }
        }
    }
    
    async getAllActiveUsers() {
        // Fetch from database
        return []; // Placeholder
    }
}

module.exports = new TelegramService();
