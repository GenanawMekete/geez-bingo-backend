const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('deposit', 'withdraw', 'bet', 'win', 'refund', 'referral', 'bonus'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending'
  },
  tx_hash: {
    type: DataTypes.STRING,
    allowNull: true
  },
  wallet_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  network: {
    type: DataTypes.STRING,
    defaultValue: 'TRC20'
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'USDT'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'transactions',
  timestamps: true
});

module.exports = Transaction;
