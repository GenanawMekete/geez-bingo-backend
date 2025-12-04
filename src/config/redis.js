const Redis = require('redis');
require('dotenv').config();

class RedisClient {
  constructor() {
    this.client = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || null
    });
    
    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    this.client.on('connect', () => {
      console.log('✅ Redis connected');
    });
    
    this.client.connect();
  }
  
  async get(key) {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }
  
  async set(key, value, expire = null) {
    try {
      if (expire) {
        await this.client.setEx(key, expire, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  }
  
  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Redis delete error:', error);
      return false;
    }
  }
  
  async publish(channel, message) {
    try {
      await this.client.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Redis publish error:', error);
      return false;
    }
  }
  
  async subscribe(channel, callback) {
    try {
      const subscriber = this.client.duplicate();
      await subscriber.connect();
      await subscriber.subscribe(channel, (message) => {
        callback(JSON.parse(message));
      });
      return subscriber;
    } catch (error) {
      console.error('Redis subscribe error:', error);
      return null;
    }
  }
  
  async lpush(key, value) {
    try {
      await this.client.lPush(key, value);
      return true;
    } catch (error) {
      console.error('Redis lpush error:', error);
      return false;
    }
  }
  
  async lrange(key, start, stop) {
    try {
      return await this.client.lRange(key, start, stop);
    } catch (error) {
      console.error('Redis lrange error:', error);
      return [];
    }
  }
  
  async incr(key) {
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error('Redis incr error:', error);
      return null;
    }
  }
}

module.exports = new RedisClient();
