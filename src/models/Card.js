const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Card = sequelize.define('Card', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  game_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  card_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 400
    }
  },
  numbers: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  marked_numbers: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  is_winner: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  purchased_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'cards',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['game_id', 'card_number']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['game_id', 'user_id']
    }
  ]
});

module.exports = Card;
