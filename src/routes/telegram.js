const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const TelegramBot = require('../services/telegramBot');

// Register Telegram user
router.post('/register', [
    body('telegramId').isNumeric(),
    body('username').optional().isString(),
    body('firstName').optional().isString(),
    body('lastName').optional().isString(),
    body('referralCode').optional().isString()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { telegramId, username, firstName, lastName, referralCode } = req.body;
        
        // Check if user exists
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            // Create new user
            user = new User({
                telegramId,
                username: username || `user_${telegramId}`,
                firstName,
                lastName,
                referralCode,
                balance: 100.00, // Welcome bonus
                referralCode: generateReferralCode(),
                source: 'telegram'
            });
            
            await user.save();
            
            // Process referral if any
            if (referralCode) {
                await processReferral(referralCode, user._id);
            }
            
            return res.json({
                success: true,
                message: 'User registered successfully',
                userId: user._id,
                referralCode: user.referralCode,
                balance: user.balance
            });
        } else {
            return res.json({
                success: true,
                message: 'User already exists',
                userId: user._id,
                referralCode: user.referralCode,
                balance: user.balance
            });
        }
        
    } catch (error) {
        console.error('Telegram registration error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Registration failed' 
        });
    }
});

// Get user by Telegram ID
router.get('/user/:telegramId', async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.telegramId });
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            user: {
                id: user._id,
                telegramId: user.telegramId,
                username: user.username,
                balance: user.balance,
                referralCode: user.referralCode
            }
        });
        
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Update Telegram chat ID
router.post('/update-chat', [
    body('telegramId').isNumeric(),
    body('chatId').isNumeric()
], async (req, res) => {
    try {
        const { telegramId, chatId } = req.body;
        
        const user = await User.findOneAndUpdate(
            { telegramId },
            { telegramChatId: chatId, lastActive: new Date() },
            { new: true }
        );
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Chat ID updated' 
        });
        
    } catch (error) {
        console.error('Update chat error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Update failed' 
        });
    }
});

// Send Telegram notification
router.post('/send-notification', [
    body('telegramId').isNumeric(),
    body('message').isString(),
    body('type').optional().isString()
], async (req, res) => {
    try {
        const { telegramId, message, type, options } = req.body;
        
        const user = await User.findOne({ telegramId });
        if (!user || !user.telegramChatId) {
            return res.status(404).json({ 
                success: false, 
                error: 'User or chat not found' 
            });
        }
        
        // Use Telegram bot service to send message
        await TelegramBot.sendNotification(user.telegramChatId, message, type, options);
        
        res.json({ 
            success: true, 
            message: 'Notification sent' 
        });
        
    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Notification failed' 
        });
    }
});

// Get Telegram bot info
router.get('/bot-info', async (req, res) => {
    try {
        const botInfo = await TelegramBot.getBotInfo();
        res.json({ 
            success: true, 
            botInfo 
        });
        
    } catch (error) {
        console.error('Get bot info error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get bot info' 
        });
    }
});

// Generate referral deep link
router.post('/generate-deep-link', [
    body('referralCode').isString()
], async (req, res) => {
    try {
        const { referralCode } = req.body;
        const botUsername = process.env.TELEGRAM_BOT_USERNAME;
        
        const deepLink = `https://t.me/${botUsername}?start=${referralCode}`;
        
        res.json({ 
            success: true, 
            deepLink,
            referralCode 
        });
        
    } catch (error) {
        console.error('Generate deep link error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate link' 
        });
    }
});

module.exports = router;
