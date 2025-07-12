// ⚠️ СИСТЕМА ОБРАБОТКИ ОШИБОК
// Централизованная обработка и классификация ошибок

const { LOG_LEVELS } = require('../constants/index.cjs');
const logger = require('../logger/index.cjs');

// Базовый класс ошибки приложения
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Ошибка подключения
class ConnectionError extends AppError {
  constructor(message, details = {}) {
    super(message, 503);
    this.type = 'CONNECTION_ERROR';
    this.details = details;
  }
}

// Ошибка валидации
class ValidationError extends AppError {
  constructor(message, field = null, value = null) {
    super(message, 400);
    this.type = 'VALIDATION_ERROR';
    this.field = field;
    this.value = value;
  }
}

// Ошибка безопасности
class SecurityError extends AppError {
  constructor(message, details = {}) {
    super(message, 403);
    this.type = 'SECURITY_ERROR';
    this.details = details;
  }
}

// Ошибка конфигурации
class ConfigurationError extends AppError {
  constructor(message, config = null) {
    super(message, 500);
    this.type = 'CONFIGURATION_ERROR';
    this.config = config;
  }
}

// Обработчик ошибок
class ErrorHandler {
  // Обработка PostgreSQL ошибок
  static handlePostgreSQLError(error, context = {}) {
    let appError;
    
    if (error.code === 'ECONNREFUSED') {
      appError = new ConnectionError(
        'Не удается подключиться к PostgreSQL серверу',
        { host: context.host, port: context.port }
      );
    } else if (error.code === '28P01') {
      appError = new SecurityError(
        'Неверные учетные данные PostgreSQL',
        { username: context.username }
      );
    } else if (error.code === '3D000') {
      appError = new ValidationError(
        'База данных не существует',
        'database',
        context.database
      );
    } else if (error.code === '42601') {
      appError = new ValidationError(
        'Синтаксическая ошибка в SQL запросе',
        'sql',
        context.sql
      );
    } else if (error.code === '42703') {
      appError = new ValidationError(
        'Колонка не существует',
        'column',
        context.column
      );
    } else if (error.code === '42P01') {
      appError = new ValidationError(
        'Таблица не существует',
        'table',
        context.table
      );
    } else {
      appError = new AppError(
        `PostgreSQL ошибка: ${error.message}`,
        500
      );
    }
    
    logger.error('PostgreSQL error handled', {
      original: error.message,
      code: error.code,
      mapped: appError.message,
      context
    });
    
    return appError;
  }

  // Обработка SSH ошибок
  static handleSSHError(error, context = {}) {
    let appError;
    
    if (error.code === 'ECONNREFUSED') {
      appError = new ConnectionError(
        'Не удается подключиться к SSH серверу',
        { host: context.host, port: context.port }
      );
    } else if (error.code === 'ENOTFOUND') {
      appError = new ValidationError(
        'SSH хост не найден',
        'host',
        context.host
      );
    } else if (error.message.includes('Authentication')) {
      appError = new SecurityError(
        'SSH аутентификация не удалась',
        { username: context.username }
      );
    } else if (error.message.includes('timeout')) {
      appError = new ConnectionError(
        'Таймаут SSH подключения',
        { timeout: context.timeout }
      );
    } else {
      appError = new AppError(
        `SSH ошибка: ${error.message}`,
        500
      );
    }
    
    logger.error('SSH error handled', {
      original: error.message,
      mapped: appError.message,
      context
    });
    
    return appError;
  }

  // Обработка API ошибок
  static handleAPIError(error, context = {}) {
    let appError;
    
    if (error.code === 'ECONNREFUSED') {
      appError = new ConnectionError(
        'API сервер недоступен',
        { url: context.url }
      );
    } else if (error.code === 'ENOTFOUND') {
      appError = new ValidationError(
        'API хост не найден',
        'url',
        context.url
      );
    } else if (error.name === 'AbortError') {
      appError = new ConnectionError(
        'API запрос прерван по таймауту',
        { timeout: context.timeout }
      );
    } else if (error.response) {
      const status = error.response.status;
      if (status >= 400 && status < 500) {
        appError = new ValidationError(
          `API клиентская ошибка: ${status}`,
          'request',
          error.response.statusText
        );
      } else if (status >= 500) {
        appError = new ConnectionError(
          `API серверная ошибка: ${status}`,
          { status, statusText: error.response.statusText }
        );
      }
    } else {
      appError = new AppError(
        `API ошибка: ${error.message}`,
        500
      );
    }
    
    logger.error('API error handled', {
      original: error.message,
      mapped: appError.message,
      context
    });
    
    return appError;
  }

  // Безопасное выполнение операции
  static async safeExecute(operation, context = {}) {
    try {
      return await operation();
    } catch (error) {
      const handledError = this.handleError(error, context);
      throw handledError;
    }
  }

  // Универсальная обработка ошибок
  static handleError(error, context = {}) {
    // Если это уже обработанная ошибка
    if (error instanceof AppError) {
      return error;
    }

    // Определение типа ошибки по контексту
    if (context.type === 'postgresql') {
      return this.handlePostgreSQLError(error, context);
    } else if (context.type === 'ssh') {
      return this.handleSSHError(error, context);
    } else if (context.type === 'api') {
      return this.handleAPIError(error, context);
    }

    // Общая обработка
    logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      context
    });

    return new AppError(
      'Внутренняя ошибка сервера',
      500,
      false
    );
  }

  // Форматирование ошибки для ответа
  static formatError(error) {
    const isOperational = error.isOperational || false;
    
    return {
      error: true,
      type: error.type || 'INTERNAL_ERROR',
      message: error.message,
      statusCode: error.statusCode || 500,
      timestamp: error.timestamp || new Date().toISOString(),
      ...(isOperational && error.field && { field: error.field }),
      ...(isOperational && error.details && { details: error.details })
    };
  }

  // Логирование ошибки с правильным уровнем
  static logError(error, context = {}) {
    const level = error.statusCode >= 500 ? LOG_LEVELS.ERROR : LOG_LEVELS.WARN;
    
    logger[level]('Error occurred', {
      type: error.type,
      message: error.message,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      context
    });
  }
}

module.exports = {
  AppError,
  ConnectionError,
  ValidationError,
  SecurityError,
  ConfigurationError,
  ErrorHandler
}; 