const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcrypt');

const Player = sequelize.define('Player', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    validate: {
      len: [3, 30]
    }
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  balance: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  totalWon: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  gamesPlayed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  gamesWon: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  referralCode: {
    type: DataTypes.STRING,
    unique: true
  },
  referredBy: {
    type: DataTypes.UUID,
    allowNull: true
  },
  avatar: {
    type: DataTypes.STRING,
    defaultValue: 'https://ui-avatars.com/api/?name=User&background=random'
  },
  walletAddress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true,
  hooks: {
    beforeCreate: async (player) => {
      if (player.password) {
        player.password = await bcrypt.hash(player.password, 10);
      }
      if (!player.referralCode) {
        player.referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      }
    }
  }
});

Player.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = Player;
