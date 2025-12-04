const TelegramService = require('../services/telegramService');
const GameService = require('../services/gameService');
const UserService = require('../services/userService');

class HybridController {
    async handleTelegramWebhook(req, res) {
        const update = req.body;
        
        // Process different update types
        if (update.message) {
            await this.handleMessage(update.message);
        }
        
        if (update.callback_query) {
            await this.handleCallback(update.callback_query);
        }
        
        res.sendStatus(200);
    }
    
    async handleMessage(message) {
        const chatId = message.chat.id;
        const text = message.text;
        const user = message.from;
        
        // Register/update user
        await UserService.registerTelegramUser({
            telegramId: user.id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            chatId: chatId
        });
        
        // Process commands
        if (text.startsWith('/')) {
            await this.processCommand(chatId, text, user);
        } else {
            await this.processText(chatId, text, user);
        }
    }
    
    async processCommand(chatId, text, user) {
        const command = text.split(' ')[0].toLowerCase();
        
        switch (command) {
            case '/start':
                await this.sendWelcomeMessage(chatId, user);
                break;
                
            case '/play':
                await this.handlePlayCommand(chatId, user);
                break;
                
            case '/balance':
                await this.showBalance(chatId, user);
                break;
                
            case '/deposit':
                await this.showDepositOptions(chatId, user);
                break;
                
            case '/cards':
                await this.showUserCards(chatId, user);
                break;
                
            default:
                await TelegramService.sendMessage(chatId, 
                    'Unknown command. Use /help for available commands.');
        }
    }
    
    async handlePlayCommand(chatId, user) {
        // Get current or create new game
        const game = await GameService.getCurrentGame();
        
        if (!game) {
            const newGame = await GameService.createNewGame();
            await this.sendGameInvitation(chatId, user, newGame);
        } else {
            await this.sendGameInvitation(chatId, user, game);
        }
    }
    
    async sendGameInvitation(chatId, user, game) {
        const message = `
🎮 <b>Join Game #${game.id.slice(0, 8)}</b>

Status: ${game.status}
Players: ${game.playerCount}
Pot: $${game.pot.toFixed(2)}
Time left: ${game.timeLeft} seconds

Choose how to play:
        `;
        
        const keyboard = {
            inline_keyboard: [
                [
                    {
                        text: '🌐 Open Web App',
                        web_app: { url: `${process.env.WEB_APP_URL}/game/${game.id}` }
                    },
                    {
                        text: '📱 Telegram Cards',
                        callback_data: `show_cards_${game.id}`
                    }
                ],
                [
                    {
                        text: '🎲 Buy Random Card ($10)',
                        callback_data: `buy_random_${game.id}`
                    }
                ]
            ]
        };
        
        await TelegramService.sendMessage(chatId, message, { reply_markup: keyboard });
    }
    
    async sendWelcomeMessage(chatId, user) {
        const referralCode = await UserService.generateReferralCode(user.id);
        const deepLink = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${referralCode}`;
        
        const message = `
🎉 <b>Welcome to Geez Bingo, ${user.first_name}!</b>

💰 <b>Get $100 welcome bonus!</b>
🔑 <b>Your referral code:</b> <code>${referralCode}</code>

🎮 <b>How to play:</b>
1. Join a game with /play
2. Buy cards ($10 each)
3. Watch numbers called automatically
4. Win 95% of the pot!

📱 <b>Quick actions:</b>
        `;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🎮 Play Now', callback_data: 'play_now' },
                    { text: '💰 Check Balance', callback_data: 'check_balance' }
                ],
                [
                    { text: '👥 Invite Friends', url: `https://t.me/share/url?url=${encodeURIComponent(`Join Geez Bingo! Use my code: ${referralCode}`)}` },
                    { text: '📊 Statistics', callback_data: 'view_stats' }
                ],
                [
                    { text: '🌐 Open Web App', web_app: { url: process.env.WEB_APP_URL } }
                ]
            ]
        };
        
        await TelegramService.sendMessage(chatId, message, { reply_markup: keyboard });
    }
}

module.exports = new HybridController();
