#!/usr/bin/env node

/**
 * 🌐 API MANAGER
 * Управление HTTP запросами с безопасностью и валидацией
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const Constants = require('../constants/Constants.cjs');

class APIManager {
  constructor(logger, security, validation) {
    this.logger = logger;
    this.security = security;
    this.validation = validation;
    
    // Базовая статистика (аккумуляторы)
    this.stats = {
      requests: 0,
      get_requests: 0,
      post_requests: 0,
      put_requests: 0,
      delete_requests: 0,
      patch_requests: 0,
      errors: 0
    };
    
    // Безопасное скользящее окно для детальной статистики
    this.slidingWindow = {
      windowSize: Constants.BUFFERS.SLIDING_WINDOW_SIZE,      // Размер окна (количество запросов)
      maxAge: Constants.TIMEOUTS.STATISTICS_WINDOW,       // Максимальный возраст записи (1 час)
      requests: [],          // Массив запросов с timestamp
      currentIndex: 0,       // Текущий индекс для записи
      isLocked: false        // Флаг для предотвращения concurrent access
    };
    
    // Интервал очистки старых записей (каждые 5 минут)
    this.cleanupInterval = setInterval(() => {
      this.safeCleanupOldRecords();
    }, Constants.RATE_LIMIT.CLEANUP_INTERVAL);
  }

  // Безопасное добавление записи в скользящее окно
  addToSlidingWindow(type, success = true) {
    if (this.slidingWindow.isLocked) {
      // Если окно заблокировано, пропускаем запись
      return;
    }
    
    const now = Date.now();
    const record = {
      timestamp: now,
      type,
      success
    };
    
    // Безопасная круговая замена в фиксированном массиве
    if (this.slidingWindow.requests.length < this.slidingWindow.windowSize) {
      // Добавляем в конец, если есть место
      this.slidingWindow.requests.push(record);
    } else {
      // Перезаписываем старую запись
      const index = this.slidingWindow.currentIndex;
      this.slidingWindow.requests[index] = record;
      this.slidingWindow.currentIndex = (index + 1) % this.slidingWindow.windowSize;
    }
  }

  // Безопасная очистка устаревших записей
  async safeCleanupOldRecords() {
    if (this.slidingWindow.isLocked) {
      return; // Уже выполняется очистка
    }
    
    this.slidingWindow.isLocked = true;
    
    try {
      const now = Date.now();
      const cutoff = now - this.slidingWindow.maxAge;
      const originalLength = this.slidingWindow.requests.length;
      
      // Создаем новый массив с валидными записями
      const validRecords = this.slidingWindow.requests.filter(
        record => record && record.timestamp > cutoff
      );
      
      // Атомарная замена массива
      this.slidingWindow.requests = validRecords;
      
      // Обновление индекса с защитой от overflow
      if (this.slidingWindow.currentIndex >= validRecords.length) {
        this.slidingWindow.currentIndex = validRecords.length > 0 ? 
          validRecords.length % this.slidingWindow.windowSize : 0;
      }
      
      this.logger.debug('Cleaned up old API records', {
        originalLength,
        remaining: validRecords.length,
        windowSize: this.slidingWindow.windowSize,
        currentIndex: this.slidingWindow.currentIndex
      });
      
    } catch (error) {
      this.logger.error('Error during sliding window cleanup', { error: error.message });
    } finally {
      this.slidingWindow.isLocked = false;
    }
  }

  // Безопасное получение статистики скользящего окна
  getSlidingWindowStats() {
    if (this.slidingWindow.isLocked) {
      // Возвращаем пустую статистику если окно заблокировано
      return {
        last_hour: { total: 0, successful: 0, failed: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 },
        last_minute: { total: 0, successful: 0, failed: 0 }
      };
    }
    
    const now = Date.now();
    const oneHourAgo = now - Constants.TIMEOUTS.STATISTICS_WINDOW;
    const oneMinuteAgo = now - Constants.TIMEOUTS.STATISTICS_MINUTE;
    
    // Безопасное создание копии массива для фильтрации
    const requestsCopy = [...this.slidingWindow.requests];
    
    const recentRequests = requestsCopy.filter(r => r && r.timestamp > oneHourAgo);
    const lastMinuteRequests = requestsCopy.filter(r => r && r.timestamp > oneMinuteAgo);
    
    return {
      last_hour: {
        total: recentRequests.length,
        successful: recentRequests.filter(r => r.success).length,
        failed: recentRequests.filter(r => !r.success).length,
        get: recentRequests.filter(r => r.type === 'GET').length,
        post: recentRequests.filter(r => r.type === 'POST').length,
        put: recentRequests.filter(r => r.type === 'PUT').length,
        delete: recentRequests.filter(r => r.type === 'DELETE').length,
        patch: recentRequests.filter(r => r.type === 'PATCH').length
      },
      last_minute: {
        total: lastMinuteRequests.length,
        successful: lastMinuteRequests.filter(r => r.success).length,
        failed: lastMinuteRequests.filter(r => !r.success).length
      }
    };
  }

  // Обработка всех действий API
  async handleAction(args) {
    const { action, url, ...params } = args;
    
    try {
      this.logger.info('API action requested', { action, url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH) });
      
      switch (action) {
        case 'get':
          return await this.get(url, params);
        case 'post':
          return await this.post(url, params);
        case 'put':
          return await this.put(url, params);
        case 'delete':
          return await this.delete(url, params);
        case 'patch':
          return await this.patch(url, params);
        case 'check_api':
          return await this.checkAPI(url, params);
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      this.stats.errors++;
      this.addToSlidingWindow(action?.toUpperCase() || 'UNKNOWN', false);
      this.logger.error('API action failed', { 
        action, 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        error: error.message 
      });
      throw error;
    }
  }

  // GET запрос
  async get(url, params = {}) {
    try {
      const { headers = {}, auth_token } = params;
      
      this.stats.get_requests++;
      this.stats.requests++;
      this.addToSlidingWindow('GET');
      
      const requestHeaders = this.prepareHeaders(headers, auth_token);
      const response = await this.makeRequest('GET', url, null, requestHeaders);
      
      this.logger.info('GET request completed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        status: response.statusCode 
      });
      
      return {
        success: true,
        method: 'GET',
        url,
        status: response.statusCode,
        headers: response.headers,
        data: response.data
      };
      
    } catch (error) {
      this.addToSlidingWindow('GET', false);
      this.logger.error('GET request failed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        error: error.message 
      });
      throw error;
    }
  }

  // POST запрос
  async post(url, params = {}) {
    try {
      const { data = {}, headers = {}, auth_token } = params;
      
      this.stats.post_requests++;
      this.stats.requests++;
      this.addToSlidingWindow('POST');
      
      const requestHeaders = this.prepareHeaders(headers, auth_token);
      const response = await this.makeRequest('POST', url, data, requestHeaders);
      
      this.logger.info('POST request completed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        status: response.statusCode 
      });
      
      return {
        success: true,
        method: 'POST',
        url,
        status: response.statusCode,
        headers: response.headers,
        data: response.data
      };
      
    } catch (error) {
      this.addToSlidingWindow('POST', false);
      this.logger.error('POST request failed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        error: error.message 
      });
      throw error;
    }
  }

  // PUT запрос
  async put(url, params = {}) {
    try {
      const { data = {}, headers = {}, auth_token } = params;
      
      this.stats.put_requests++;
      this.stats.requests++;
      this.addToSlidingWindow('PUT');
      
      const requestHeaders = this.prepareHeaders(headers, auth_token);
      const response = await this.makeRequest('PUT', url, data, requestHeaders);
      
      this.logger.info('PUT request completed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        status: response.statusCode 
      });
      
      return {
        success: true,
        method: 'PUT',
        url,
        status: response.statusCode,
        headers: response.headers,
        data: response.data
      };
      
    } catch (error) {
      this.addToSlidingWindow('PUT', false);
      this.logger.error('PUT request failed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        error: error.message 
      });
      throw error;
    }
  }

  // DELETE запрос
  async delete(url, params = {}) {
    try {
      const { headers = {}, auth_token } = params;
      
      this.stats.delete_requests++;
      this.stats.requests++;
      this.addToSlidingWindow('DELETE');
      
      const requestHeaders = this.prepareHeaders(headers, auth_token);
      const response = await this.makeRequest('DELETE', url, null, requestHeaders);
      
      this.logger.info('DELETE request completed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        status: response.statusCode 
      });
      
      return {
        success: true,
        method: 'DELETE',
        url,
        status: response.statusCode,
        headers: response.headers,
        data: response.data
      };
      
    } catch (error) {
      this.addToSlidingWindow('DELETE', false);
      this.logger.error('DELETE request failed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        error: error.message 
      });
      throw error;
    }
  }

  // PATCH запрос
  async patch(url, params = {}) {
    try {
      const { data = {}, headers = {}, auth_token } = params;
      
      this.stats.patch_requests++;
      this.stats.requests++;
      this.addToSlidingWindow('PATCH');
      
      const requestHeaders = this.prepareHeaders(headers, auth_token);
      const response = await this.makeRequest('PATCH', url, data, requestHeaders);
      
      this.logger.info('PATCH request completed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        status: response.statusCode 
      });
      
      return {
        success: true,
        method: 'PATCH',
        url,
        status: response.statusCode,
        headers: response.headers,
        data: response.data
      };
      
    } catch (error) {
      this.addToSlidingWindow('PATCH', false);
      this.logger.error('PATCH request failed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        error: error.message 
      });
      throw error;
    }
  }

  // Проверка API
  async checkAPI(url, params = {}) {
    try {
      const { headers = {}, auth_token } = params;
      
      // Базовая проверка URL
      if (!this.security.validateUrl(url)) {
        throw new Error('Invalid or potentially dangerous URL');
      }

      // Проверка доступности
      const startTime = Date.now();
      const requestHeaders = this.prepareHeaders(headers, auth_token);
      
      try {
        const response = await this.makeRequest('GET', url, null, requestHeaders);
        const responseTime = Date.now() - startTime;
        
        this.logger.info('API check completed', { 
          url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
          status: response.statusCode,
          responseTime 
        });
        
        return {
          success: true,
          url,
          status: response.statusCode,
          response_time: responseTime,
          accessible: true,
          headers: response.headers,
          content_type: response.headers['content-type'] || 'unknown'
        };
        
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        return {
          success: false,
          url,
          accessible: false,
          response_time: responseTime,
          error: error.message
        };
      }
      
    } catch (error) {
      this.logger.error('API check failed', { 
        url: url?.substring(0, Constants.LIMITS.LOG_SUBSTRING_LENGTH), 
        error: error.message 
      });
      throw error;
    }
  }

  // Подготовка заголовков
  prepareHeaders(headers = {}, authToken = null) {
    const requestHeaders = {
      'User-Agent': 'MCP-API-Client/4.0.0',
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      ...headers
    };

    // Добавление токена авторизации
    if (authToken) {
      requestHeaders['Authorization'] = `Bearer ${authToken}`;
    }

    // Санитизация заголовков
    const sanitizedHeaders = {};
    for (const [key, value] of Object.entries(requestHeaders)) {
      if (typeof key === 'string' && typeof value === 'string') {
        // Удаление потенциально опасных символов
        const sanitizedKey = key.replace(/[^\w-]/g, '');
        const sanitizedValue = value.replace(/[\r\n]/g, '');
        
        if (sanitizedKey && sanitizedValue) {
          sanitizedHeaders[sanitizedKey] = sanitizedValue;
        }
      }
    }

    return sanitizedHeaders;
  }

  // Выполнение HTTP запроса
  async makeRequest(method, url, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Валидация URL
        const urlValidation = this.validation.validateHttpUrl(url);
        if (!urlValidation.valid) {
          throw new Error(`URL validation failed: ${urlValidation.errors.join(', ')}`);
        }

        // Дополнительная проверка безопасности
        if (!this.security.validateUrl(url)) {
          throw new Error('URL security validation failed');
        }

        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        // Подготовка данных
        let requestData = '';
        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
          requestData = JSON.stringify(data);
          headers['Content-Length'] = Buffer.byteLength(requestData);
        }

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method,
          headers,
          timeout: Constants.NETWORK.TIMEOUT_SSH_COMMAND
        };

        const req = httpModule.request(options, (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk;
            
            // Защита от слишком больших ответов
            if (responseData.length > Constants.LIMITS.MAX_DATA_SIZE) { // 10MB
              req.destroy();
              reject(new Error('Response too large'));
              return;
            }
          });

          res.on('end', () => {
            try {
              let parsedData;
              
              // Попытка парсинга JSON
              if (res.headers['content-type']?.includes('application/json')) {
                try {
                  parsedData = JSON.parse(responseData);
                } catch (error) {
                  parsedData = responseData;
                }
              } else {
                parsedData = responseData;
              }

              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                data: parsedData
              });
            } catch (error) {
              reject(error);
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        // Отправка данных
        if (requestData) {
          req.write(requestData);
        }
        
        req.end();
        
      } catch (error) {
        reject(error);
      }
    });
  }

  // Получение статистики с дополнительными метриками
  getStats() {
    const slidingStats = this.getSlidingWindowStats();
    
    return {
      total_stats: { ...this.stats },
      sliding_window: slidingStats,
      memory_usage: {
        window_size: this.slidingWindow.requests.length,
        max_window_size: this.slidingWindow.windowSize,
        memory_efficiency: `${((this.slidingWindow.requests.length / this.slidingWindow.windowSize) * Constants.LIMITS.DEFAULT_QUERY_LIMIT).toFixed(1)}%`
      }
    };
  }

  // Очистка ресурсов
  async cleanup() {
    try {
      // Очистка интервала
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }
      
      // Очистка скользящего окна
      this.slidingWindow.requests = [];
      this.slidingWindow.currentIndex = 0;
      
      this.logger.info('API manager cleaned up');
    } catch (error) {
      this.logger.error('Failed to cleanup API manager', { error: error.message });
      throw error;
    }
  }
}

function createAPIManager(logger, security, validation) {
  return new APIManager(logger, security, validation);
}

module.exports = APIManager; 