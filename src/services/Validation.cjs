#!/usr/bin/env node

/**
 * ✅ VALIDATION SERVICE
 * Система валидации входных данных и параметров
 */

class Validation {
  constructor(logger) {
    this.logger = logger;
    this.stats = {
      validations: 0,
      errors: 0,
      warnings: 0
    };
  }

  // Валидация профиля подключения
  validateConnectionProfile(profile) {
    this.stats.validations++;
    
    const errors = [];
    
    if (!profile || typeof profile !== 'object') {
      errors.push('Profile must be an object');
      return { valid: false, errors };
    }

    // Проверка обязательных полей
    if (!profile.host || typeof profile.host !== 'string') {
      errors.push('Host is required and must be a string');
    }

    if (!profile.username || typeof profile.username !== 'string') {
      errors.push('Username is required and must be a string');
    }

    if (!profile.password || typeof profile.password !== 'string') {
      errors.push('Password is required and must be a string');
    }

    // Проверка порта
    if (profile.port !== undefined) {
      if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) {
        errors.push('Port must be an integer between 1 and 65535');
      }
    }

    // Проверка базы данных (для PostgreSQL)
    if (profile.database !== undefined && typeof profile.database !== 'string') {
      errors.push('Database must be a string');
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.stats.errors++;
      this.logger.warn('Profile validation failed', { errors });
    }

    return { valid, errors };
  }

  // Валидация SQL запроса
  validateSqlQuery(sql) {
    this.stats.validations++;
    
    const errors = [];
    
    if (!sql || typeof sql !== 'string') {
      errors.push('SQL query must be a non-empty string');
      return { valid: false, errors };
    }

    // Проверка на опасные команды
    const dangerousCommands = [
      'DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'
    ];
    
    const upperSql = sql.toUpperCase();
    for (const cmd of dangerousCommands) {
      if (upperSql.includes(cmd)) {
        this.stats.warnings++;
        this.logger.warn('Potentially dangerous SQL command detected', { command: cmd });
      }
    }

    // Проверка на множественные команды
    if (sql.includes(';') && sql.trim().split(';').length > 2) {
      errors.push('Multiple SQL commands not allowed');
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.stats.errors++;
    }

    return { valid, errors };
  }

  // Валидация SSH команды
  validateSshCommand(command) {
    this.stats.validations++;
    
    const errors = [];
    
    if (!command || typeof command !== 'string') {
      errors.push('Command must be a non-empty string');
      return { valid: false, errors };
    }

    // Проверка на опасные команды
    const dangerousCommands = [
      'rm -rf', 'format', 'dd if=', 'mkfs', 'fdisk', 'shutdown', 'reboot',
      'passwd', 'useradd', 'userdel', 'chmod 777', 'chown root'
    ];
    
    const lowerCommand = command.toLowerCase();
    for (const cmd of dangerousCommands) {
      if (lowerCommand.includes(cmd)) {
        this.stats.warnings++;
        this.logger.warn('Potentially dangerous SSH command detected', { command: cmd });
      }
    }

    // Проверка на множественные команды
    if (command.includes('&&') || command.includes('||') || command.includes(';')) {
      this.stats.warnings++;
      this.logger.warn('Multiple SSH commands detected');
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.stats.errors++;
    }

    return { valid, errors };
  }

  // Валидация HTTP URL
  validateHttpUrl(url) {
    this.stats.validations++;
    
    const errors = [];
    
    if (!url || typeof url !== 'string') {
      errors.push('URL must be a non-empty string');
      return { valid: false, errors };
    }

    try {
      const parsed = new URL(url);
      
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push('Only HTTP and HTTPS protocols are allowed');
      }
      
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        this.stats.warnings++;
        this.logger.warn('Local URL detected', { url });
      }
      
    } catch (error) {
      errors.push('Invalid URL format');
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.stats.errors++;
    }

    return { valid, errors };
  }

  // Валидация данных для вставки
  validateInsertData(data) {
    this.stats.validations++;
    
    const errors = [];
    
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      errors.push('Data must be an object');
      return { valid: false, errors };
    }

    // Проверка на пустой объект
    if (Object.keys(data).length === 0) {
      errors.push('Data object cannot be empty');
    }

    // Проверка имен полей
    for (const key of Object.keys(data)) {
      if (typeof key !== 'string' || key.length === 0) {
        errors.push(`Invalid field name: ${key}`);
      }
      
      // Проверка на SQL injection в именах полей
      if (key.includes("'") || key.includes('"') || key.includes(';')) {
        errors.push(`Potentially dangerous field name: ${key}`);
      }
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.stats.errors++;
    }

    return { valid, errors };
  }

  // Валидация имени таблицы
  validateTableName(tableName) {
    this.stats.validations++;
    
    const errors = [];
    
    if (!tableName || typeof tableName !== 'string') {
      errors.push('Table name must be a non-empty string');
      return { valid: false, errors };
    }

    // Проверка формата имени таблицы
    const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!validPattern.test(tableName)) {
      errors.push('Table name must start with letter or underscore and contain only letters, numbers, and underscores');
    }

    // Проверка длины
    if (tableName.length > 63) {
      errors.push('Table name must be 63 characters or less');
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.stats.errors++;
    }

    return { valid, errors };
  }

  // Валидация лимита записей
  validateLimit(limit) {
    this.stats.validations++;
    
    const errors = [];
    
    if (limit !== undefined) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
        errors.push('Limit must be an integer between 1 and 10000');
      }
    }

    const valid = errors.length === 0;
    if (!valid) {
      this.stats.errors++;
    }

    return { valid, errors };
  }

  getStats() {
    return { ...this.stats };
  }

  async cleanup() {
    // Validation service не требует cleanup
    return;
  }
}

function createValidation(logger) {
  return new Validation(logger);
}

module.exports = { createValidation, Validation }; 