// 🌐 API МОДУЛЬ
// Безопасные HTTP запросы с валидацией и защитой

import { TIMEOUTS, ACTIONS, AI_HINTS } from '../constants/index.js';
import { Validator } from '../validation/index.js';
import { ErrorHandler } from '../errors/index.js';
import logger from '../logger/index.js';

class APIManager {
  constructor() {
    this.fetch = null;
    this.loadDependencies();
  }

  // Загрузка зависимостей
  loadDependencies() {
    try {
      this.fetch = require('node-fetch');
      logger.info('API dependencies loaded');
    } catch (error) {
      logger.error('API dependencies not found', { error: error.message });
      throw new Error('API модуль не найден. Установите: npm install node-fetch');
    }
  }

  // Валидация HTTP метода
  validateMethod(method) {
    if (!method || typeof method !== 'string') {
      throw new Error('HTTP метод обязателен');
    }
    
    Validator.validateHTTPMethod(method.toUpperCase());
    return method.toUpperCase();
  }

  // Валидация и санитизация заголовков
  validateHeaders(headers = {}) {
    if (typeof headers !== 'object') {
      throw new Error('Заголовки должны быть объектом');
    }

    const sanitizedHeaders = {};
    
    for (const [key, value] of Object.entries(headers)) {
      // Санитизация ключей и значений заголовков
      const sanitizedKey = Validator.sanitizeInput(key);
      const sanitizedValue = Validator.sanitizeInput(String(value));
      
      // Проверка на опасные заголовки
      const dangerousHeaders = [
        'x-forwarded-for',
        'x-real-ip',
        'x-original-url',
        'x-rewrite-url',
        'host'
      ];
      
      if (dangerousHeaders.includes(sanitizedKey.toLowerCase())) {
        logger.security('Dangerous header detected', { key: sanitizedKey, value: sanitizedValue });
        continue; // Пропускаем опасные заголовки
      }
      
      sanitizedHeaders[sanitizedKey] = sanitizedValue;
    }

    return sanitizedHeaders;
  }

  // Валидация данных запроса
  validateRequestData(data) {
    if (!data) return null;
    
    if (typeof data !== 'object') {
      throw new Error('Данные запроса должны быть объектом');
    }

    // Проверяем размер данных
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 1024 * 1024) { // 1MB
      throw new Error('Данные запроса слишком большие (максимум 1MB)');
    }

    return data;
  }

  // Валидация URL
  validateRequestURL(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('URL обязателен');
    }

    // Валидация формата URL
    Validator.validateURL(url);

    // Проверка на опасные схемы
    const dangerousSchemes = ['file:', 'ftp:', 'data:', 'javascript:'];
    for (const scheme of dangerousSchemes) {
      if (url.toLowerCase().startsWith(scheme)) {
        logger.security('Dangerous URL scheme detected', { url });
        throw new Error(`Схема URL ${scheme} запрещена`);
      }
    }

    // Проверка на локальные адреса в production
    if (process.env.NODE_ENV === 'production') {
      const localPatterns = [
        /^https?:\/\/localhost/i,
        /^https?:\/\/127\./i,
        /^https?:\/\/192\.168\./i,
        /^https?:\/\/10\./i,
        /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./i
      ];

      for (const pattern of localPatterns) {
        if (pattern.test(url)) {
          logger.security('Local URL access attempted in production', { url });
          throw new Error('Доступ к локальным адресам запрещен в production');
        }
      }
    }

    return url;
  }

  // Выполнение HTTP запроса
  async makeRequest(args) {
    const { method, url, headers = {}, data, auth_token } = args;

    // Валидация всех параметров
    const validMethod = this.validateMethod(method);
    const validURL = this.validateRequestURL(url);
    const validHeaders = this.validateHeaders(headers);
    const validData = this.validateRequestData(data);

    // Настройка заголовков
    const requestHeaders = {
      'User-Agent': 'PostgreSQL-API-SSH-MCP-Server/2.0.0',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Cache-Control': 'no-cache',
      ...validHeaders
    };

    // Добавление авторизации
    if (auth_token) {
      if (typeof auth_token !== 'string') {
        throw new Error('Токен авторизации должен быть строкой');
      }
      requestHeaders['Authorization'] = `Bearer ${auth_token}`;
    }

    // Настройка тела запроса
    const fetchOptions = {
      method: validMethod,
      headers: requestHeaders,
      timeout: TIMEOUTS.API_REQUEST,
      follow: 5, // Максимум 5 редиректов
      size: 1024 * 1024, // Максимум 1MB ответа
      compress: true
    };

    // Добавляем данные для методов, которые их поддерживают
    if (validData && ['POST', 'PUT', 'PATCH'].includes(validMethod)) {
      if (!requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/json';
      }
      fetchOptions.body = JSON.stringify(validData);
    }

    const startTime = Date.now();
    
    try {
      logger.info('API request started', { 
        method: validMethod, 
        url: validURL,
        hasAuth: !!auth_token 
      });

      const response = await this.fetch(validURL, fetchOptions);
      const duration = Date.now() - startTime;

      // Обработка ответа
      let responseData;
      const contentType = response.headers.get('content-type');
      
      try {
        if (contentType && contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }
      } catch (parseError) {
        logger.warn('Response parsing failed', { 
          error: parseError.message,
          contentType 
        });
        responseData = `Ошибка парсинга: ${parseError.message}`;
      }

      const result = {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
        url: validURL,
        method: validMethod,
        duration: `${duration}ms`,
        ai_hint: response.ok ? AI_HINTS.QUERY_SUCCESS : `HTTP запрос завершился с ошибкой: ${response.status}`
      };

      logger.info('API request completed', { 
        method: validMethod, 
        url: validURL,
        status: response.status,
        duration,
        success: response.ok
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('API request failed', { 
        method: validMethod, 
        url: validURL,
        error: error.message,
        duration
      });

      // Обработка различных типов ошибок
      let errorMessage = error.message;
      let aiHint = 'Ошибка выполнения HTTP запроса';

      if (error.code === 'ENOTFOUND') {
        errorMessage = 'Не удается найти указанный хост';
        aiHint = 'Проверьте правильность URL';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Соединение отклонено';
        aiHint = 'Сервер недоступен или не отвечает';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Таймаут запроса';
        aiHint = 'Сервер не отвечает в течение заданного времени';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Запрос был прерван';
        aiHint = 'Запрос превысил установленный таймаут';
      }

      return {
        success: false,
        status: 0,
        error: errorMessage,
        url: validURL,
        method: validMethod,
        duration: `${duration}ms`,
        ai_hint: aiHint
      };
    }
  }

  // Специализированные методы для удобства
  async get(args) {
    return this.makeRequest({ ...args, method: 'GET' });
  }

  async post(args) {
    return this.makeRequest({ ...args, method: 'POST' });
  }

  async put(args) {
    return this.makeRequest({ ...args, method: 'PUT' });
  }

  async delete(args) {
    return this.makeRequest({ ...args, method: 'DELETE' });
  }

  async patch(args) {
    return this.makeRequest({ ...args, method: 'PATCH' });
  }

  // Проверка доступности API
  async checkAPI(args) {
    const { url } = args;
    
    try {
      const result = await this.makeRequest({
        method: 'HEAD',
        url: url,
        headers: { 'User-Agent': 'MCP-Health-Check' }
      });

      return {
        url,
        accessible: result.success,
        status: result.status,
        response_time: result.duration,
        ai_hint: result.success ? 'API доступен' : 'API недоступен'
      };
    } catch (error) {
      return {
        url,
        accessible: false,
        error: error.message,
        ai_hint: 'Ошибка проверки доступности API'
      };
    }
  }

  // Обработка действий
  async handleAction(args) {
    const { method, ...actionArgs } = args;
    
    const context = {
      operation: 'api',
      method: method,
      url: actionArgs.url
    };

    try {
      // Универсальная обработка для всех HTTP методов
      return await this.makeRequest(args);
    } catch (error) {
      throw error; // Пробрасываем ошибку для обработки в ErrorHandler
    }
  }
}

// Создаем экземпляр менеджера
const apiManager = new APIManager();

export default apiManager; 