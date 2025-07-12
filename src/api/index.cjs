// 🌐 API МОДУЛЬ
// Безопасные HTTP запросы с валидацией и защитой

const { TIMEOUTS, ACTIONS, AI_HINTS } = require('../constants/index.cjs');
const logger = require('../logger/index.cjs');

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
    
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    const upperMethod = method.toUpperCase();
    
    if (!validMethods.includes(upperMethod)) {
      throw new Error(`Неподдерживаемый HTTP метод: ${method}`);
    }
    
    return upperMethod;
  }

  // Валидация и санитизация заголовков
  validateHeaders(headers = {}) {
    if (typeof headers !== 'object') {
      throw new Error('Заголовки должны быть объектом');
    }

    const sanitizedHeaders = {};
    
    for (const [key, value] of Object.entries(headers)) {
      // Проверка на опасные заголовки
      const dangerousHeaders = [
        'x-forwarded-for',
        'x-real-ip',
        'x-original-url',
        'x-rewrite-url',
        'host'
      ];
      
      if (dangerousHeaders.includes(key.toLowerCase())) {
        logger.security('Dangerous header detected', { key, value });
        continue; // Пропускаем опасные заголовки
      }
      
      sanitizedHeaders[key] = String(value);
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
      'User-Agent': 'PostgreSQL-API-SSH-MCP-Server/3.0.0',
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
        status: response.ok ? 'success' : 'error',
        http_status: response.status,
        url: validURL,
        method: validMethod,
        data: responseData,
        duration: `${duration}ms`,
        ai_hint: response.ok ? AI_HINTS.QUERY_SUCCESS : `HTTP ошибка: ${response.status}`
      };

      logger.info('API request completed', { 
        method: validMethod, 
        url: validURL,
        status: response.status,
        duration 
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
      throw error;
    }
  }

  // GET запрос
  async get(args) {
    return await this.makeRequest({ ...args, method: 'GET' });
  }

  // POST запрос
  async post(args) {
    return await this.makeRequest({ ...args, method: 'POST' });
  }

  // PUT запрос
  async put(args) {
    return await this.makeRequest({ ...args, method: 'PUT' });
  }

  // DELETE запрос
  async delete(args) {
    return await this.makeRequest({ ...args, method: 'DELETE' });
  }

  // PATCH запрос
  async patch(args) {
    return await this.makeRequest({ ...args, method: 'PATCH' });
  }

  // Проверка доступности API
  async checkAPI(args) {
    const { url } = args;
    
    try {
      const result = await this.makeRequest({ 
        method: 'GET', 
        url,
        timeout: 5000 
      });
      
      return {
        url,
        status: 'available',
        response_time: result.duration,
        ai_hint: 'API доступен'
      };
    } catch (error) {
      return {
        url,
        status: 'unavailable',
        error: error.message,
        ai_hint: 'API недоступен'
      };
    }
  }

  // Обработка действий
  async handleAction(args) {
    const { action } = args;
    
    switch (action) {
      case ACTIONS.API.GET:
        return await this.get(args);
      case ACTIONS.API.POST:
        return await this.post(args);
      case ACTIONS.API.PUT:
        return await this.put(args);
      case ACTIONS.API.DELETE:
        return await this.delete(args);
      case ACTIONS.API.PATCH:
        return await this.patch(args);
      case ACTIONS.API.CHECK_API:
        return await this.checkAPI(args);
      default:
        throw new Error(`Неизвестное действие API: ${action}`);
    }
  }
}

module.exports = APIManager; 