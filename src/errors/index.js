// 🚨 ЦЕНТРАЛИЗОВАННАЯ ОБРАБОТКА ОШИБОК
// Устраняет дублирование кода обработки ошибок

import { RESPONSE_STATUS, AI_HINTS } from '../constants/index.js';
import { ValidationError } from '../validation/index.js';
import logger from '../logger/index.js';

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
  }
}

class ConnectionError extends AppError {
  constructor(message, type) {
    super(message, 503);
    this.name = 'ConnectionError';
    this.type = type;
  }
}

class SecurityError extends AppError {
  constructor(message) {
    super(message, 403);
    this.name = 'SecurityError';
  }
}

class ErrorHandler {
  // Форматирование ошибки для MCP ответа
  static formatMCPError(error, context = {}) {
    const errorInfo = {
      status: RESPONSE_STATUS.ERROR,
      error: error.message,
      timestamp: new Date().toISOString(),
      ...context
    };

    // Добавляем специфическую информацию для разных типов ошибок
    if (error instanceof ValidationError) {
      errorInfo.validation_field = error.field;
      errorInfo.ai_hint = AI_HINTS.VALIDATION_ERROR;
    } else if (error instanceof ConnectionError) {
      errorInfo.connection_type = error.type;
      errorInfo.ai_hint = AI_HINTS.CONNECTION_ERROR;
    } else if (error instanceof SecurityError) {
      errorInfo.ai_hint = AI_HINTS.SECURITY_ERROR;
    } else {
      errorInfo.ai_hint = 'Произошла внутренняя ошибка сервера';
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(errorInfo, null, 2)
      }],
      isError: true
    };
  }

  // Обработка ошибок PostgreSQL
  static handlePostgreSQLError(error, context = {}) {
    logger.error('PostgreSQL error', { error: error.message, ...context });

    // Специфические ошибки PostgreSQL
    if (error.code === '28P01') {
      return this.formatMCPError(
        new ConnectionError('Неверные учетные данные для PostgreSQL', 'postgresql'),
        { action: context.action, profile: context.profile_name }
      );
    }

    if (error.code === 'ECONNREFUSED') {
      return this.formatMCPError(
        new ConnectionError('Не удается подключиться к PostgreSQL серверу', 'postgresql'),
        { action: context.action, profile: context.profile_name }
      );
    }

    if (error.code === '42P01') {
      return this.formatMCPError(
        new AppError('Таблица не найдена'),
        { action: context.action, table: context.table_name }
      );
    }

    if (error.code === '42601') {
      return this.formatMCPError(
        new AppError('Синтаксическая ошибка в SQL запросе'),
        { action: context.action, sql: context.sql }
      );
    }

    // Общая ошибка PostgreSQL
    return this.formatMCPError(
      new AppError(`Ошибка PostgreSQL: ${error.message}`),
      { action: context.action, code: error.code }
    );
  }

  // Обработка ошибок SSH
  static handleSSHError(error, context = {}) {
    logger.error('SSH error', { error: error.message, ...context });

    // Специфические ошибки SSH
    if (error.message.includes('Authentication failed')) {
      return this.formatMCPError(
        new ConnectionError('Неверные учетные данные для SSH', 'ssh'),
        { action: context.action, profile: context.profile_name }
      );
    }

    if (error.message.includes('connect ECONNREFUSED')) {
      return this.formatMCPError(
        new ConnectionError('Не удается подключиться к SSH серверу', 'ssh'),
        { action: context.action, profile: context.profile_name }
      );
    }

    if (error.message.includes('Timeout')) {
      return this.formatMCPError(
        new ConnectionError('Таймаут подключения к SSH серверу', 'ssh'),
        { action: context.action, profile: context.profile_name }
      );
    }

    // Общая ошибка SSH
    return this.formatMCPError(
      new AppError(`Ошибка SSH: ${error.message}`),
      { action: context.action }
    );
  }

  // Обработка ошибок API
  static handleAPIError(error, context = {}) {
    logger.error('API error', { error: error.message, ...context });

    // Специфические ошибки API
    if (error.message.includes('fetch')) {
      return this.formatMCPError(
        new ConnectionError('Ошибка HTTP запроса', 'api'),
        { method: context.method, url: context.url }
      );
    }

    if (error.code === 'ENOTFOUND') {
      return this.formatMCPError(
        new ConnectionError('Не удается найти хост', 'api'),
        { method: context.method, url: context.url }
      );
    }

    if (error.code === 'ECONNREFUSED') {
      return this.formatMCPError(
        new ConnectionError('Соединение отклонено', 'api'),
        { method: context.method, url: context.url }
      );
    }

    // Общая ошибка API
    return this.formatMCPError(
      new AppError(`Ошибка API: ${error.message}`),
      { method: context.method, url: context.url }
    );
  }

  // Обработка ошибок валидации
  static handleValidationError(error, context = {}) {
    logger.warn('Validation error', { error: error.message, field: error.field, ...context });
    return this.formatMCPError(error, context);
  }

  // Обработка ошибок безопасности
  static handleSecurityError(error, context = {}) {
    logger.error('Security error', { error: error.message, ...context });
    return this.formatMCPError(error, context);
  }

  // Универсальная обработка ошибок
  static handleError(error, context = {}) {
    // Логгируем ошибку
    logger.error('Unhandled error', { 
      error: error.message, 
      stack: error.stack,
      ...context 
    });

    // Определяем тип ошибки и обрабатываем соответственно
    if (error instanceof ValidationError) {
      return this.handleValidationError(error, context);
    }

    if (error instanceof SecurityError) {
      return this.handleSecurityError(error, context);
    }

    if (error instanceof ConnectionError) {
      return this.formatMCPError(error, context);
    }

    // Проверяем контекст для определения типа операции
    if (context.operation === 'postgresql') {
      return this.handlePostgreSQLError(error, context);
    }

    if (context.operation === 'ssh') {
      return this.handleSSHError(error, context);
    }

    if (context.operation === 'api') {
      return this.handleAPIError(error, context);
    }

    // Общая обработка ошибок
    return this.formatMCPError(
      new AppError('Внутренняя ошибка сервера'),
      { original_error: error.message, ...context }
    );
  }

  // Создание успешного ответа
  static formatSuccessResponse(data, aiHint = AI_HINTS.QUERY_SUCCESS) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: RESPONSE_STATUS.SUCCESS,
          ...data,
          ai_hint: aiHint,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }

  // Wrapper для безопасного выполнения операций
  static async safeExecute(operation, context = {}) {
    try {
      const result = await operation();
      return this.formatSuccessResponse(result);
    } catch (error) {
      return this.handleError(error, context);
    }
  }

  // Middleware для обработки ошибок в async функциях
  static catchAsync(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

export { 
  ErrorHandler, 
  AppError, 
  ConnectionError, 
  SecurityError, 
  ValidationError 
}; 