const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  telegram_id: {
    type: DataTypes.BIGINT,
    unique: true,
    allowNull: true
  },
  username: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(100),
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
  avatar: {
    type: DataTypes.STRING,
    defaultValue: 'https://ui-avatars.com/api/?name=User&background=random&size=128'
  },
  balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  total_won: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  total_deposited: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  total_withdrawn: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  games_played: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  games_won: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  referral_code: {
    type: DataTypes.STRING(10),
    unique: true
  },
  referred_by: {
    type: DataTypes.UUID,
    allowNull: true
  },
  wallet_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_banned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {
      notifications: true,
      sounds: true,
      auto_claim: true,
      language: 'en'
    }
  }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
      if (!user.referral_code) {
        user.referral_code = generateReferralCode();
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

User.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password;
  return values;
};

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = User;
