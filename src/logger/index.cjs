// 📋 СИСТЕМА ЛОГГИРОВАНИЯ
// Структурированное логгирование с уровнями и форматированием

const Constants = require('../constants/Constants.cjs');

class Logger {
  constructor() {
    this.level = process.env.LOG_LEVEL || Constants.LOG_LEVELS.INFO;
    this.context = 'MCP-SERVER';
  }

  // Форматирование сообщения лога
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      context: this.context,
      message,
      ...meta
    };

    // В production можно использовать JSON формат
    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(logEntry);
    }

    // Для разработки - читаемый формат
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${this.context}] ${message}${metaStr}`;
  }

  // Проверка уровня логгирования
  shouldLog(level) {
    const levels = ['error', 'warn', 'info', 'debug'];
    return levels.indexOf(level) <= levels.indexOf(this.level);
  }

  // Методы логгирования
  error(message, meta = {}) {
    if (this.shouldLog(Constants.LOG_LEVELS.ERROR)) {
      process.stderr.write(this.formatMessage(Constants.LOG_LEVELS.ERROR, message, meta) + '\n');
    }
  }

  warn(message, meta = {}) {
    if (this.shouldLog(Constants.LOG_LEVELS.WARN)) {
      process.stderr.write(this.formatMessage(Constants.LOG_LEVELS.WARN, message, meta) + '\n');
    }
  }

  info(message, meta = {}) {
    if (this.shouldLog(Constants.LOG_LEVELS.INFO)) {
      process.stdout.write(this.formatMessage(Constants.LOG_LEVELS.INFO, message, meta) + '\n');
    }
  }

  debug(message, meta = {}) {
    if (this.shouldLog(Constants.LOG_LEVELS.DEBUG)) {
      process.stdout.write(this.formatMessage(Constants.LOG_LEVELS.DEBUG, message, meta) + '\n');
    }
  }

  // Специальные методы для контекста
  tool(toolName, action, meta = {}) {
    this.info(`Tool called: ${toolName}`, { action, ...meta });
  }

  connection(type, status, meta = {}) {
    this.info(`Connection ${status}`, { type, ...meta });
  }

  query(sql, duration, meta = {}) {
    this.debug(`Query executed`, { sql: sql.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH) + '...', duration, ...meta });
  }

  security(event, meta = {}) {
    this.warn(`Security event: ${event}`, meta);
  }

  performance(operation, duration, meta = {}) {
    this.info(`Performance: ${operation}`, { duration, ...meta });
  }

  // Изменение контекста
  setContext(context) {
    this.context = context;
  }

  // Создание дочернего логгера с префиксом
  child(prefix) {
    const childLogger = new Logger();
    childLogger.context = `${this.context}:${prefix}`;
    childLogger.level = this.level;
    return childLogger;
  }
}

// Создаем глобальный экземпляр логгера
const logger = new Logger();

module.exports = logger; 