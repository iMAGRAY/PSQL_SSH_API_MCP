#!/usr/bin/env node

/**
 * 🔐 SECURITY SERVICE
 * Система безопасности с шифрованием и валидацией
 */

const crypto = require('crypto');

class Security {
  constructor(logger) {
    this.logger = logger;
    this.algorithm = 'aes-256-cbc';
    this.secretKey = process.env.ENCRYPTION_KEY || this.generateSecretKey();
    
    // Строгие лимиты безопасности
    this.limits = {
      maxDataSize: 1024 * 1024, // 1MB максимальный размер данных
      maxPasswordLength: 128,    // Максимальная длина пароля
      maxUrlLength: 2048,        // Максимальная длина URL
      maxTableNameLength: 63,    // Максимальная длина имени таблицы
      maxCommandLength: 1024,    // Максимальная длина команды
      pbkdf2Iterations: 100000,  // Безопасное количество итераций
      rateLimitWindow: 60000,    // Окно для rate limiting (1 минута)
      rateLimitMaxRequests: 100  // Максимум запросов в окне
    };
    
    // Rate limiting
    this.rateLimiter = new Map();
    
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
    const key = crypto.randomBytes(32);
    this.logger.warn('Using generated encryption key. Set ENCRYPTION_KEY environment variable for production.');
    return key;
  }

  // Проверка rate limiting
  checkRateLimit(identifier = 'default') {
    const now = Date.now();
    const windowStart = now - this.limits.rateLimitWindow;
    
    if (!this.rateLimiter.has(identifier)) {
      this.rateLimiter.set(identifier, []);
    }
    
    const requests = this.rateLimiter.get(identifier);
    
    // Очистка старых запросов
    while (requests.length > 0 && requests[0] < windowStart) {
      requests.shift();
    }
    
    // Проверка лимита
    if (requests.length >= this.limits.rateLimitMaxRequests) {
      this.stats.rateLimitHits++;
      throw new Error('Rate limit exceeded');
    }
    
    requests.push(now);
    return true;
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
  encrypt(text) {
    try {
      this.checkRateLimit('encrypt');
      this.validateDataSize(text);
      
      this.stats.encryptions++;
      const iv = crypto.randomBytes(16);
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
  decrypt(encryptedText) {
    try {
      this.checkRateLimit('decrypt');
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
    
    const salt = crypto.randomBytes(32); // Увеличенный размер соли
    const hash = crypto.pbkdf2Sync(password, salt, this.limits.pbkdf2Iterations, 64, 'sha512');
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
    const verifyHash = crypto.pbkdf2Sync(password, salt, this.limits.pbkdf2Iterations, 64, 'sha512');
    
    return crypto.timingSafeEqual(hash, verifyHash);
  }

  // Валидация URL (защита от SSRF) с усиленными проверками
  validateUrl(url) {
    this.stats.validations++;
    
    if (url.length > this.limits.maxUrlLength) {
      throw new Error('URL too long');
    }
    
    try {
      const parsed = new URL(url);
      
      // Проверка протокола
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
      
      // Проверка на localhost и private IP
      const hostname = parsed.hostname;
      if (hostname === 'localhost' || 
          hostname === '127.0.0.1' || 
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)) {
        throw new Error('Private IP addresses not allowed');
      }
      
      // Проверка на опасные порты
      const dangerousPorts = [22, 23, 25, 53, 135, 139, 445, 593, 636, 993, 995];
      if (dangerousPorts.includes(parsed.port)) {
        throw new Error('Dangerous port not allowed');
      }
      
      return true;
    } catch (error) {
      this.logger.warn('URL validation failed', { url, error: error.message });
      return false;
    }
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

  // Проверка имени таблицы с усиленной валидацией
  validateTableName(tableName) {
    if (typeof tableName !== 'string') {
      return false;
    }
    
    if (tableName.length > this.limits.maxTableNameLength) {
      return false;
    }
    
    // Только буквы, цифры и подчеркивания
    const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    
    // Проверка на SQL ключевые слова
    const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TABLE', 'INDEX', 'VIEW'];
    const upperTableName = tableName.toUpperCase();
    
    return validPattern.test(tableName) && 
           !sqlKeywords.includes(upperTableName) &&
           tableName.length >= 1;
  }

  getStats() {
    return { 
      ...this.stats,
      rateLimiterSize: this.rateLimiter.size,
      limits: this.limits
    };
  }

  async cleanup() {
    // Очистка чувствительных данных
    if (this.secretKey) {
      this.secretKey.fill(0);
    }
    
    // Очистка rate limiter
    this.rateLimiter.clear();
  }
}

function createSecurity(logger) {
  return new Security(logger);
}

module.exports = { createSecurity, Security }; 