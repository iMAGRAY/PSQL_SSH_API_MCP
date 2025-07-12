const Constants = require('../constants/Constants.cjs');

/**
 * Утилиты для работы с сетью
 */
class NetworkUtils {
  /**
   * Проверка на localhost или локальный IP
   * @param {string} hostname - хост для проверки
   * @returns {boolean} true если это localhost/локальный IP
   */
  static isLocalhost(hostname) {
    if (!hostname || typeof hostname !== 'string') {
      return false;
    }

    const { NAMES, PRIVATE_RANGES } = Constants.LOCALHOST;
    
    // Проверка на localhost/127.0.0.1
    if (NAMES.includes(hostname)) {
      return true;
    }

    // Проверка на приватные IP диапазоны
    for (const range of PRIVATE_RANGES) {
      if (typeof range === 'string') {
        if (hostname.startsWith(range)) {
          return true;
        }
      } else if (range instanceof RegExp) {
        if (range.test(hostname)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Проверка на опасный порт
   * @param {number} port - порт для проверки
   * @returns {boolean} true если порт опасный
   */
  static isDangerousPort(port) {
    if (!port || typeof port !== 'number') {
      return false;
    }

    return Constants.NETWORK.DANGEROUS_PORTS.includes(port);
  }

  /**
   * Валидация URL с проверкой на localhost
   * @param {string} url - URL для валидации
   * @returns {object} объект с результатом валидации
   */
  static validateUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, isLocal: false, error: 'URL must be a non-empty string' };
    }

    if (url.length > Constants.LIMITS.MAX_URL_LENGTH) {
      return { valid: false, isLocal: false, error: 'URL too long' };
    }

    try {
      const parsed = new URL(url);
      
      // Проверка протокола
      if (!Constants.PROTOCOLS.ALLOWED_HTTP.includes(parsed.protocol)) {
        return { valid: false, isLocal: false, error: 'Only HTTP and HTTPS protocols are allowed' };
      }

      const isLocal = this.isLocalhost(parsed.hostname);
      const isDangerous = this.isDangerousPort(parseInt(parsed.port));

      return {
        valid: true,
        isLocal,
        isDangerous,
        hostname: parsed.hostname,
        port: parsed.port,
        protocol: parsed.protocol
      };
    } catch (error) {
      return { valid: false, isLocal: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Валидация порта
   * @param {number} port - порт для валидации
   * @returns {object} объект с результатом валидации
   */
  static validatePort(port) {
    if (!Number.isInteger(port) || port < Constants.LIMITS.MIN_PORT || port > Constants.LIMITS.MAX_PORT) {
      return { 
        valid: false, 
        error: `Port must be an integer between ${Constants.LIMITS.MIN_PORT} and ${Constants.LIMITS.MAX_PORT}` 
      };
    }

    return {
      valid: true,
      isDangerous: this.isDangerousPort(port)
    };
  }
}

module.exports = NetworkUtils; 