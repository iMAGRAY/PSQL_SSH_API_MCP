// 🔐 БЕЗОПАСНАЯ СИСТЕМА РАБОТЫ С CREDENTIALS
// Шифрование паролей в памяти и безопасное хранение

const crypto = require('crypto');
const { SECURITY_LIMITS } = require('../constants/index.cjs');
const logger = require('../logger/index.cjs');

class SecurityManager {
  constructor() {
    // Генерируем ключ шифрования при запуске
    this.encryptionKey = crypto.randomBytes(32);
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
        iv: iv.toString('hex')
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
    
    // Сохраняем профиль
    const profileKey = `${type}:${profileName}`;
    this.connections.set(profileKey, {
      type,
      config: secureConfig,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    });
    
    this.connectionCount++;
    
    logger.info('Profile saved', { type, profileName, host: config.host });
    
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

  // Валидация пароля
  validatePassword(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('Пароль обязателен');
    }
    
    if (password.length < SECURITY_LIMITS.PASSWORD_MIN_LENGTH) {
      throw new Error(`Пароль должен содержать минимум ${SECURITY_LIMITS.PASSWORD_MIN_LENGTH} символов`);
    }
    
    return true;
  }

  // Валидация хоста
  validateHost(host) {
    if (!host || typeof host !== 'string') {
      throw new Error('Хост обязателен');
    }
    
    // Проверка на недопустимые символы
    if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
      throw new Error('Недопустимые символы в имени хоста');
    }
    
    return true;
  }

  // Очистка всех профилей
  clearProfiles() {
    const count = this.connections.size;
    this.connections.clear();
    this.connectionCount = 0;
    
    logger.info('All profiles cleared', { count });
    return count;
  }

  // Уничтожение менеджера безопасности
  destroy() {
    this.clearProfiles();
    this.encryptionKey = null;
    logger.info('Security manager destroyed');
  }
}

// Создаем глобальный экземпляр менеджера безопасности
const securityManager = new SecurityManager();

module.exports = securityManager; 