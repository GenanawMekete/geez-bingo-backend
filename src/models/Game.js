const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Game = sequelize.define('Game', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  game_id: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('waiting', 'active', 'completed', 'cancelled'),
    defaultValue: 'waiting'
  },
  pot: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  called_numbers: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  current_calls: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  winner_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  winning_card: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  start_time: {
    type: DataTypes.DATE,
    allowNull: false
  },
  end_time: {
    type: DataTypes.DATE,
    allowNull: true
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {
      bet_amount: 10.00,
      house_fee: 0.05,
      game_duration: 180,
      max_cards_per_player: 5,
      min_players: 1
    }
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'games',
  timestamps: true
});

module.exports = Game;
