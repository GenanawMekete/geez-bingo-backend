const sequelize = require('../config/database');
const User = require('./User');
const Game = require('./Game');
const Card = require('./Card');
const Transaction = require('./Transaction');

// Define associations
User.hasMany(Game, { foreignKey: 'winner_id', as: 'won_games' });
Game.belongsTo(User, { foreignKey: 'winner_id', as: 'winner' });

User.hasMany(Card, { foreignKey: 'user_id', as: 'cards' });
Card.belongsTo(User, { foreignKey: 'user_id', as: 'owner' });

Game.hasMany(Card, { foreignKey: 'game_id', as: 'game_cards' });
Card.belongsTo(Game, { foreignKey: 'game_id', as: 'game' });

User.hasMany(Transaction, { foreignKey: 'user_id', as: 'transactions' });
Transaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Self-referral relationship
User.belongsTo(User, { foreignKey: 'referred_by', as: 'referrer' });
User.hasMany(User, { foreignKey: 'referred_by', as: 'referrals' });

const models = {
  User,
  Game,
  Card,
  Transaction,
  sequelize
};

module.exports = models;
