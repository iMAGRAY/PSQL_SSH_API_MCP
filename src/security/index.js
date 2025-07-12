// 🔐 БЕЗОПАСНАЯ СИСТЕМА РАБОТЫ С CREDENTIALS
// Шифрование паролей в памяти и безопасное хранение

import crypto from 'crypto';
import { SECURITY_LIMITS } from '../constants/index.js';
import logger from '../logger/index.js';

class SecurityManager {
  constructor() {
    // Генерируем ключ шифрования при запуске
    this.encryptionKey = crypto.randomBytes(32);
    this.algorithm = 'aes-256-gcm';
    this.connections = new Map();
    this.connectionCount = 0;
  }

  // Шифрование пароля
  encrypt(text) {
    if (!text) return null;
    
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: null // Не используем authTag для простоты
      };
    } catch (error) {
      logger.error('Encryption failed', { error: error.message });
      throw new Error('Не удалось зашифровать пароль');
    }
  }

  // Расшифровка пароля
  decrypt(encryptedData) {
    if (!encryptedData) return null;
    
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, Buffer.from(encryptedData.iv, 'hex'));
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', { error: error.message });
      throw new Error('Не удалось расшифровать пароль');
    }
  }

  // Генерация ключа для подключения
  generateConnectionKey(type, config) {
    const keyParts = [];
    
    switch (type) {
      case 'postgresql':
        keyParts.push(config.host, config.port, config.database, config.username);
        break;
      case 'ssh':
        keyParts.push(config.host, config.port, config.username);
        break;
      default:
        throw new Error(`Неизвестный тип подключения: ${type}`);
    }
    
    return crypto.createHash('sha256')
      .update(keyParts.join(':'))
      .digest('hex');
  }

  // Сохранение профиля подключения
  saveProfile(type, profileName, config) {
    // Проверяем лимит подключений
    if (this.connectionCount >= SECURITY_LIMITS.MAX_CONNECTIONS) {
      throw new Error(`Превышен лимит подключений: ${SECURITY_LIMITS.MAX_CONNECTIONS}`);
    }

    // Создаем безопасную копию конфигурации
    const secureConfig = { ...config };
    
    // Шифруем пароль
    if (secureConfig.password) {
      secureConfig.password = this.encrypt(secureConfig.password);
    }
    
    // Генерируем ключ подключения
    const connectionKey = this.generateConnectionKey(type, config);
    
    // Сохраняем профиль
    const profileKey = `${type}:${profileName}`;
    this.connections.set(profileKey, {
      type,
      config: secureConfig,
      connectionKey,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    });
    
    this.connectionCount++;
    
    logger.info('Profile saved', { 
      type, 
      profileName, 
      host: config.host,
      connectionKey: connectionKey.substring(0, 8) + '...' 
    });
    
    return profileKey;
  }

  // Получение профиля подключения
  getProfile(type, profileName) {
    const profileKey = `${type}:${profileName}`;
    const profile = this.connections.get(profileKey);
    
    if (!profile) {
      return null;
    }
    
    // Обновляем время последнего использования
    profile.lastUsed = new Date().toISOString();
    
    // Расшифровываем пароль
    const config = { ...profile.config };
    if (config.password) {
      config.password = this.decrypt(config.password);
    }
    
    return {
      ...profile,
      config
    };
  }

  // Получение всех профилей определенного типа
  getProfilesByType(type) {
    const profiles = [];
    
    for (const [key, profile] of this.connections) {
      if (profile.type === type) {
        const profileName = key.split(':')[1];
        profiles.push({
          name: profileName,
          type: profile.type,
          host: profile.config.host,
          port: profile.config.port,
          createdAt: profile.createdAt,
          lastUsed: profile.lastUsed
        });
      }
    }
    
    return profiles;
  }

  // Удаление профиля
  deleteProfile(type, profileName) {
    const profileKey = `${type}:${profileName}`;
    const deleted = this.connections.delete(profileKey);
    
    if (deleted) {
      this.connectionCount--;
      logger.info('Profile deleted', { type, profileName });
    }
    
    return deleted;
  }

  // Очистка всех профилей
  clearProfiles() {
    const count = this.connections.size;
    this.connections.clear();
    this.connectionCount = 0;
    
    logger.info('All profiles cleared', { count });
    return count;
  }

  // Очистка старых неиспользуемых профилей
  cleanupOldProfiles(maxAgeHours = 24) {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);
    
    let deletedCount = 0;
    
    for (const [key, profile] of this.connections) {
      const lastUsed = new Date(profile.lastUsed);
      if (lastUsed < cutoffTime) {
        this.connections.delete(key);
        deletedCount++;
        this.connectionCount--;
      }
    }
    
    if (deletedCount > 0) {
      logger.info('Old profiles cleaned up', { 
        deletedCount, 
        maxAgeHours,
        remainingCount: this.connections.size 
      });
    }
    
    return deletedCount;
  }

  // Валидация безопасности пароля
  validatePassword(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('Пароль обязателен');
    }

    if (password.length < SECURITY_LIMITS.PASSWORD_MIN_LENGTH) {
      throw new Error(`Пароль должен содержать минимум ${SECURITY_LIMITS.PASSWORD_MIN_LENGTH} символов`);
    }

    // Проверяем на простые пароли
    const weakPasswords = [
      'password', '123456', 'qwerty', 'admin', 'root', 
      'user', 'test', 'guest', 'demo', 'postgres'
    ];
    
    if (weakPasswords.includes(password.toLowerCase())) {
      logger.security('Weak password detected');
      throw new Error('Пароль слишком простой, используйте более сложный');
    }

    return true;
  }

  // Проверка безопасности хоста
  validateHost(host) {
    // Проверяем на localhost и приватные диапазоны
    const privateRanges = [
      /^127\./,           // localhost
      /^10\./,            // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
      /^192\.168\./,      // 192.168.0.0/16
      /^::1$/,            // IPv6 localhost
      /^fe80:/            // IPv6 link-local
    ];

    const isPrivate = privateRanges.some(range => range.test(host));
    
    if (isPrivate) {
      logger.security('Private network connection attempt', { host });
      // Не блокируем, но логируем
    }

    return true;
  }

  // Получение статистики безопасности
  getSecurityStats() {
    const stats = {
      totalProfiles: this.connections.size,
      connectionLimit: SECURITY_LIMITS.MAX_CONNECTIONS,
      profilesByType: {},
      oldestProfile: null,
      newestProfile: null
    };

    let oldest = null;
    let newest = null;

    for (const [key, profile] of this.connections) {
      // Счетчик по типам
      if (!stats.profilesByType[profile.type]) {
        stats.profilesByType[profile.type] = 0;
      }
      stats.profilesByType[profile.type]++;

      // Поиск самого старого и нового профиля
      const createdAt = new Date(profile.createdAt);
      if (!oldest || createdAt < oldest.date) {
        oldest = { date: createdAt, profile: key };
      }
      if (!newest || createdAt > newest.date) {
        newest = { date: createdAt, profile: key };
      }
    }

    stats.oldestProfile = oldest;
    stats.newestProfile = newest;

    return stats;
  }

  // Безопасное закрытие (очистка памяти)
  destroy() {
    this.connections.clear();
    this.connectionCount = 0;
    
    // Очищаем ключ шифрования
    this.encryptionKey.fill(0);
    
    logger.info('Security manager destroyed');
  }
}

// Создаем глобальный экземпляр
const securityManager = new SecurityManager();

// Автоматическая очистка старых профилей каждые 6 часов
setInterval(() => {
  securityManager.cleanupOldProfiles();
}, 6 * 60 * 60 * 1000);

export default securityManager; 