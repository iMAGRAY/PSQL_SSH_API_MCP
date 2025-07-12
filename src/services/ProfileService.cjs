// 👤 PROFILE SERVICE  
// Централизованное управление профилями подключений

const logger = require('../logger/index.cjs');

class ProfileService {
  constructor(securityService, validationService) {
    this.securityService = securityService;
    this.validationService = validationService;
    this.profiles = new Map();
    this.profileStats = {
      created: 0,
      accessed: 0,
      failed: 0
    };
  }

  // Создание профиля подключения
  async createProfile(type, name, config) {
    try {
      // Валидация конфигурации
      this._validateProfileConfig(type, config);
      
      // Проверка безопасности
      await this._validateSecurity(config);
      
      // Тестирование подключения
      await this._testConnection(type, config);
      
      // Шифрование чувствительных данных
      const encryptedConfig = await this._encryptSensitiveData(config);
      
      // Создание профиля
      const profile = {
        type,
        name,
        config: encryptedConfig,
        metadata: {
          createdAt: new Date(),
          lastUsed: null,
          accessCount: 0,
          host: config.host,
          port: config.port,
          username: config.username
        }
      };
      
      const profileKey = `${type}_${name}`;
      this.profiles.set(profileKey, profile);
      this.profileStats.created++;
      
      logger.info(`Profile created: ${type}/${name}`, { 
        host: config.host,
        username: config.username 
      });
      
      return {
        success: true,
        profile: {
          type,
          name,
          host: config.host,
          port: config.port,
          createdAt: profile.metadata.createdAt
        }
      };
    } catch (error) {
      this.profileStats.failed++;
      logger.error(`Failed to create profile: ${type}/${name}`, { error: error.message });
      throw error;
    }
  }

  // Получение профиля с расшифровкой
  async getProfile(type, name = 'default') {
    const profileKey = `${type}_${name}`;
    const profile = this.profiles.get(profileKey);
    
    if (!profile) {
      throw new Error(`Profile '${name}' not found for type '${type}'`);
    }
    
    try {
      // Расшифровка чувствительных данных
      const decryptedConfig = await this._decryptSensitiveData(profile.config);
      
      // Обновление метаданных
      profile.metadata.lastUsed = new Date();
      profile.metadata.accessCount++;
      this.profileStats.accessed++;
      
      return {
        type: profile.type,
        name: profile.name,
        config: decryptedConfig,
        metadata: profile.metadata
      };
    } catch (error) {
      this.profileStats.failed++;
      logger.error(`Failed to decrypt profile: ${type}/${name}`, { error: error.message });
      throw error;
    }
  }

  // Список профилей по типу
  listProfiles(type) {
    const profiles = [];
    
    for (const [key, profile] of this.profiles) {
      if (profile.type === type) {
        profiles.push({
          name: profile.name,
          host: profile.metadata.host,
          port: profile.metadata.port,
          username: profile.metadata.username,
          createdAt: profile.metadata.createdAt,
          lastUsed: profile.metadata.lastUsed,
          accessCount: profile.metadata.accessCount
        });
      }
    }
    
    return profiles.sort((a, b) => b.lastUsed - a.lastUsed);
  }

  // Удаление профиля
  deleteProfile(type, name) {
    const profileKey = `${type}_${name}`;
    const deleted = this.profiles.delete(profileKey);
    
    if (deleted) {
      logger.info(`Profile deleted: ${type}/${name}`);
    }
    
    return deleted;
  }

  // Обновление профиля
  async updateProfile(type, name, updates) {
    const profile = this.profiles.get(`${type}_${name}`);
    
    if (!profile) {
      throw new Error(`Profile '${name}' not found for type '${type}'`);
    }
    
    // Валидация обновлений
    if (updates.password) {
      await this._validateSecurity(updates);
    }
    
    // Обновление конфигурации
    const currentConfig = await this._decryptSensitiveData(profile.config);
    const updatedConfig = { ...currentConfig, ...updates };
    const encryptedConfig = await this._encryptSensitiveData(updatedConfig);
    
    profile.config = encryptedConfig;
    profile.metadata.updatedAt = new Date();
    
    logger.info(`Profile updated: ${type}/${name}`);
    
    return true;
  }

  // Валидация конфигурации профиля
  _validateProfileConfig(type, config) {
    const requiredFields = {
      postgresql: ['host', 'username', 'password', 'database'],
      ssh: ['host', 'username', 'password']
    };
    
    const required = requiredFields[type];
    if (!required) {
      throw new Error(`Unsupported profile type: ${type}`);
    }
    
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Дополнительная валидация через ValidationService
    if (this.validationService) {
      if (type === 'postgresql') {
        this.validationService.validatePostgreSQLConnection(config);
      } else if (type === 'ssh') {
        this.validationService.validateSSHConnection(config);
      }
    }
  }

  // Валидация безопасности
  async _validateSecurity(config) {
    if (this.securityService) {
      this.securityService.validatePassword(config.password);
      this.securityService.validateHost(config.host);
    }
  }

  // Тестирование подключения
  async _testConnection(type, config) {
    // Здесь будет интеграция с ConnectionService для тестирования
    // Временная заглушка
    logger.debug(`Testing connection: ${type} to ${config.host}`);
    return true;
  }

  // Шифрование чувствительных данных
  async _encryptSensitiveData(config) {
    if (!this.securityService) {
      return config; // Без шифрования если SecurityService недоступен
    }
    
    const encrypted = { ...config };
    
    if (config.password) {
      encrypted.password = this.securityService.encrypt(config.password);
    }
    
    return encrypted;
  }

  // Расшифровка чувствительных данных
  async _decryptSensitiveData(config) {
    if (!this.securityService) {
      return config; // Без расшифровки если SecurityService недоступен
    }
    
    const decrypted = { ...config };
    
    if (config.password && typeof config.password === 'object') {
      decrypted.password = this.securityService.decrypt(config.password);
    }
    
    return decrypted;
  }

  // Очистка старых профилей
  cleanupOldProfiles(maxAge = 2592000000) { // 30 дней
    const now = new Date();
    const toRemove = [];
    
    for (const [key, profile] of this.profiles) {
      const age = now - profile.metadata.createdAt;
      const lastUsedAge = profile.metadata.lastUsed ? 
        now - profile.metadata.lastUsed : age;
      
      if (lastUsedAge > maxAge) {
        toRemove.push(key);
      }
    }
    
    toRemove.forEach(key => {
      this.profiles.delete(key);
      logger.debug(`Cleaned up old profile: ${key}`);
    });
    
    return toRemove.length;
  }

  // Получение статистики
  getStats() {
    return {
      ...this.profileStats,
      totalProfiles: this.profiles.size,
      profilesByType: this._getProfilesByType()
    };
  }

  // Группировка профилей по типам
  _getProfilesByType() {
    const types = {};
    
    for (const profile of this.profiles.values()) {
      if (!types[profile.type]) {
        types[profile.type] = 0;
      }
      types[profile.type]++;
    }
    
    return types;
  }

  // Экспорт профилей (без чувствительных данных)
  exportProfiles() {
    const exported = [];
    
    for (const profile of this.profiles.values()) {
      exported.push({
        type: profile.type,
        name: profile.name,
        metadata: profile.metadata
      });
    }
    
    return exported;
  }
}

module.exports = ProfileService; 