#!/usr/bin/env node

/**
 * 🔐 SECURITY SERVICE
 * Система безопасности с шифрованием и валидацией
 */

const crypto = require('crypto');
const Constants = require('../constants/Constants.cjs');
const NetworkUtils = require('../utils/NetworkUtils.cjs');

class Security {
  constructor(logger) {
    this.logger = logger;
    this.algorithm = Constants.CRYPTO.ALGORITHM;
    this.secretKey = process.env.ENCRYPTION_KEY || this.generateSecretKey();
    
    // Строгие лимиты безопасности
    this.limits = {
      maxDataSize: Constants.LIMITS.MAX_DATA_SIZE,
      maxPasswordLength: Constants.LIMITS.MAX_PASSWORD_LENGTH,
      maxUrlLength: Constants.LIMITS.MAX_URL_LENGTH,
      maxTableNameLength: Constants.LIMITS.MAX_TABLE_NAME_LENGTH,
      maxCommandLength: Constants.LIMITS.MAX_COMMAND_LENGTH,
      pbkdf2Iterations: Constants.CRYPTO.PBKDF2_ITERATIONS,
      rateLimitWindow: Constants.RATE_LIMIT.WINDOW_MS,
      rateLimitMaxRequests: Constants.RATE_LIMIT.MAX_REQUESTS
    };
    
    // Rate limiting с защитой от race conditions
    this.rateLimiter = new Map();
    this.rateLimiterLocks = new Map(); // Мьютексы для rate limiting
    
    this.stats = {
      encryptions: 0,
      decryptions: 0,
      validations: 0,
      rateLimitHits: 0,
      sizeLimitHits: 0
    };
  }

  generateSecretKey() {
    // Генерация безопасного ключа
    const key = crypto.randomBytes(Constants.BUFFERS.CRYPTO_KEY_SIZE);
    this.logger.warn('Using generated encryption key. Set ENCRYPTION_KEY environment variable for production.');
    return key;
  }

  // Получение лока для rate limiting с улучшенной синхронизацией
  async acquireRateLimitLock(identifier) {
    return new Promise((resolve, reject) => {
      // Атомарная инициализация лока
      if (!this.rateLimiterLocks.has(identifier)) {
        this.rateLimiterLocks.set(identifier, { 
          locked: false, 
          queue: [],
          timeout: null
        });
      }
      
      const lock = this.rateLimiterLocks.get(identifier);
      
      if (!lock.locked) {
        lock.locked = true;
        
        // Таймаут для предотвращения deadlock
        const timeoutId = setTimeout(() => {
          this.logger.warn('Rate limit lock timeout', { identifier });
          this.releaseRateLimitLock(identifier);
        }, Constants.TIMEOUTS.BUFFER_FLUSH);
        
        resolve(() => {
          clearTimeout(timeoutId);
          this.releaseRateLimitLock(identifier);
        });
        return;
      }
      
      // Добавляем в очередь с таймаутом
      const timeoutId = setTimeout(() => {
        reject(new Error(`Rate limit lock timeout for ${identifier}`));
      }, Constants.NETWORK.TIMEOUT_SSH_READY);
      
      lock.queue.push(() => {
        clearTimeout(timeoutId);
        resolve(() => this.releaseRateLimitLock(identifier));
      });
    });
  }

  // Освобождение лока для rate limiting
  releaseRateLimitLock(identifier) {
    const lock = this.rateLimiterLocks.get(identifier);
    if (!lock) return;
    
    if (lock.queue.length > 0) {
      const next = lock.queue.shift();
      // Отложенный вызов для предотвращения переполнения стека
      setImmediate(() => next());
    } else {
      lock.locked = false;
    }
  }

  // Атомарная проверка rate limiting
  async checkRateLimit(identifier = 'default') {
    const release = await this.acquireRateLimitLock(identifier);
    
    try {
      const now = Date.now();
      const windowStart = now - this.limits.rateLimitWindow;
      
      if (!this.rateLimiter.has(identifier)) {
        this.rateLimiter.set(identifier, []);
      }
      
      const requests = this.rateLimiter.get(identifier);
      
      // Атомарная очистка старых запросов
      while (requests.length > 0 && requests[0] < windowStart) {
        requests.shift();
      }
      
      // Атомарная проверка лимита
      if (requests.length >= this.limits.rateLimitMaxRequests) {
        this.stats.rateLimitHits++;
        throw new Error('Rate limit exceeded');
      }
      
      // Атомарное добавление нового запроса
      requests.push(now);
      return true;
    } finally {
      release();
    }
  }

  // Проверка размера данных
  validateDataSize(data, maxSize = this.limits.maxDataSize) {
    const size = Buffer.byteLength(data, 'utf8');
    if (size > maxSize) {
      this.stats.sizeLimitHits++;
      throw new Error(`Data size limit exceeded: ${size} > ${maxSize}`);
    }
    return true;
  }

  // Шифрование данных
  async encrypt(text) {
    try {
      await this.checkRateLimit('encrypt');
      this.validateDataSize(text);
      
      this.stats.encryptions++;
      const iv = crypto.randomBytes(Constants.BUFFERS.CRYPTO_IV_SIZE);
      const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      this.logger.error('Encryption failed', { error: error.message });
      throw new Error('Encryption failed');
    }
  }

  // Расшифровка данных
  async decrypt(encryptedText) {
    try {
      await this.checkRateLimit('decrypt');
      this.validateDataSize(encryptedText);
      
      this.stats.decryptions++;
      const parts = encryptedText.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted text format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed', { error: error.message });
      throw new Error('Decryption failed');
    }
  }

  // Хеширование пароля с усиленными параметрами
  hashPassword(password) {
    if (password.length > this.limits.maxPasswordLength) {
      throw new Error('Password too long');
    }
    
    const salt = crypto.randomBytes(Constants.BUFFERS.CRYPTO_SALT_SIZE); // Увеличенный размер соли
    const hash = crypto.pbkdf2Sync(password, salt, this.limits.pbkdf2Iterations, Constants.CRYPTO.HASH_LENGTH, Constants.CRYPTO.HASH_ALGORITHM);
    return salt.toString('hex') + ':' + hash.toString('hex');
  }

  // Проверка пароля с защитой от timing attacks
  verifyPassword(password, hashedPassword) {
    if (password.length > this.limits.maxPasswordLength) {
      return false;
    }
    
    const parts = hashedPassword.split(':');
    if (parts.length !== 2) {
      return false;
    }
    
    const salt = Buffer.from(parts[0], 'hex');
    const hash = Buffer.from(parts[1], 'hex');
    const verifyHash = crypto.pbkdf2Sync(password, salt, this.limits.pbkdf2Iterations, Constants.CRYPTO.HASH_LENGTH, Constants.CRYPTO.HASH_ALGORITHM);
    
    return crypto.timingSafeEqual(hash, verifyHash);
  }

  // Валидация URL (защита от SSRF) с усиленными проверками
  validateUrl(url) {
    this.stats.validations++;
    
    const validation = NetworkUtils.validateUrl(url);
    
    if (!validation.valid) {
      this.logger.warn('URL validation failed', { url, error: validation.error });
      throw new Error(validation.error);
    }
    
    // Проверка на localhost и private IP
    if (validation.isLocal) {
      throw new Error('Private IP addresses not allowed');
    }
    
    // Проверка на опасные порты
    if (validation.isDangerous) {
      throw new Error('Dangerous port not allowed');
    }
    
    return true;
  }

  // Санитизация SQL (усиленная защита)
  sanitizeSql(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    if (input.length > this.limits.maxDataSize) {
      throw new Error('SQL input too long');
    }
    
    // Удаление опасных символов и SQL ключевых слов
    let sanitized = input.replace(/[;'"`\\]/g, '');
    
    // Проверка на SQL injection keywords
    const sqlKeywords = /\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|UNION|SELECT)\b/gi;
    if (sqlKeywords.test(sanitized)) {
      throw new Error('SQL keywords not allowed');
    }
    
    return sanitized;
  }

  // Санитизация команд shell (усиленная защита)
  sanitizeCommand(command) {
    if (typeof command !== 'string') {
      return command;
    }
    
    if (command.length > this.limits.maxCommandLength) {
      throw new Error('Command too long');
    }
    
    // Удаление опасных символов
    const dangerous = /[;&|`$(){}[\]<>]/g;
    let sanitized = command.replace(dangerous, '');
    
    // Проверка на опасные команды
    const dangerousCommands = /\b(rm|del|format|fdisk|mkfs|dd|wget|curl|nc|netcat|telnet|ssh|ftp|tftp)\b/gi;
    if (dangerousCommands.test(sanitized)) {
      throw new Error('Dangerous command not allowed');
    }
    
    return sanitized;
  }

  // Валидация имени таблицы
  validateTableName(tableName) {
    if (typeof tableName !== 'string') {
      throw new Error('Table name must be a string');
    }
    
    if (tableName.length > this.limits.maxTableNameLength) {
      throw new Error('Table name too long');
    }
    
    // Проверка на допустимые символы
    const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!validPattern.test(tableName)) {
      throw new Error('Invalid table name format');
    }
    
    return tableName;
  }

  // Очистка старых записей rate limiting
  async cleanupRateLimiter() {
    const now = Date.now();
    const windowStart = now - this.limits.rateLimitWindow;
    
    for (const [identifier, requests] of this.rateLimiter) {
      const release = await this.acquireRateLimitLock(identifier);
      
      try {
        // Очистка старых записей
        while (requests.length > 0 && requests[0] < windowStart) {
          requests.shift();
        }
        
        // Удаление пустых записей
        if (requests.length === 0) {
          this.rateLimiter.delete(identifier);
        }
      } finally {
        release();
      }
    }
  }

  // Статистика
  getStats() {
    return {
      ...this.stats,
      rateLimiterSize: this.rateLimiter.size,
      activeLocks: Array.from(this.rateLimiterLocks.values()).filter(lock => lock.locked).length
    };
  }
}

module.exports = Security; 