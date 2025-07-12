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
    this.stats = {
      encryptions: 0,
      decryptions: 0,
      validations: 0
    };
  }

  generateSecretKey() {
    // Генерация безопасного ключа
    const key = crypto.randomBytes(32);
    this.logger.warn('Using generated encryption key. Set ENCRYPTION_KEY environment variable for production.');
    return key;
  }

  // Шифрование данных
  encrypt(text) {
    try {
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

  // Хеширование пароля
  hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512');
    return salt.toString('hex') + ':' + hash.toString('hex');
  }

  // Проверка пароля
  verifyPassword(password, hashedPassword) {
    const parts = hashedPassword.split(':');
    if (parts.length !== 2) {
      return false;
    }
    
    const salt = Buffer.from(parts[0], 'hex');
    const hash = Buffer.from(parts[1], 'hex');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512');
    
    return crypto.timingSafeEqual(hash, verifyHash);
  }

  // Валидация URL (защита от SSRF)
  validateUrl(url) {
    this.stats.validations++;
    
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
      
      return true;
    } catch (error) {
      this.logger.warn('URL validation failed', { url, error: error.message });
      return false;
    }
  }

  // Санитизация SQL (базовая защита)
  sanitizeSql(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    // Удаление опасных символов
    return input.replace(/[;'"`\\]/g, '');
  }

  // Санитизация команд shell
  sanitizeCommand(command) {
    if (typeof command !== 'string') {
      return command;
    }
    
    // Удаление опасных символов
    const dangerous = /[;&|`$(){}[\]<>]/g;
    return command.replace(dangerous, '');
  }

  // Проверка имени таблицы
  validateTableName(tableName) {
    if (typeof tableName !== 'string') {
      return false;
    }
    
    // Только буквы, цифры и подчеркивания
    const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    return validPattern.test(tableName) && tableName.length <= 63;
  }

  getStats() {
    return { ...this.stats };
  }

  async cleanup() {
    // Очистка чувствительных данных
    if (this.secretKey) {
      this.secretKey.fill(0);
    }
  }
}

function createSecurity(logger) {
  return new Security(logger);
}

module.exports = { createSecurity, Security }; 