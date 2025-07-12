/**
 * Системные константы проекта
 */
class Constants {
  // Сетевые константы
  static get NETWORK() {
    return {
      POSTGRES_DEFAULT_PORT: 5432,
      SSH_DEFAULT_PORT: 22,
      TIMEOUT_SSH_READY: 10000,       // 10 секунд
      TIMEOUT_SSH_COMMAND: 30000,     // 30 секунд
      TIMEOUT_MUTEX: 30000,           // 30 секунд
      TIMEOUT_CONNECTION: 5000,       // 5 секунд
      TIMEOUT_IDLE: 300000,           // 5 минут
      KEEPALIVE_INTERVAL: 30000,      // 30 секунд
      CLEANUP_INTERVAL: 300000,       // 5 минут
      DANGEROUS_PORTS: [22, 23, 25, 53, 135, 139, 445, 593, 636, 993, 995]
    };
  }

  // Лимиты и размеры
  static get LIMITS() {
    return {
      MAX_DATA_SIZE: 1024 * 1024,     // 1MB
      MAX_PASSWORD_LENGTH: 128,
      MAX_URL_LENGTH: 2048,
      MAX_TABLE_NAME_LENGTH: 63,
      MAX_COMMAND_LENGTH: 1024,
      MAX_SQL_COMMAND_LENGTH: 1000,
      MAX_CONNECTIONS: 10,
      MAX_QUERY_LIMIT: 10000,
      MIN_QUERY_LIMIT: 1,
      MAX_PORT: 65535,
      MIN_PORT: 1,
      SAMPLE_DATA_LIMIT: 10,
      DEFAULT_QUERY_LIMIT: 100,
      LOG_SUBSTRING_LENGTH: 100,
      COMMAND_SUBSTRING_LENGTH: 50
    };
  }

  // Временные интервалы
  static get TIMEOUTS() {
    return {
      BUFFER_FLUSH: 5000,             // 5 секунд
      RATE_LIMIT_WINDOW: 60000,       // 1 минута
      STATISTICS_WINDOW: 3600000,     // 1 час
      STATISTICS_MINUTE: 60000,       // 1 минута
      CLEANUP_OLD_LOGS: 10000,        // 10 секунд
      CONNECTION_TIMEOUT: 2000,       // 2 секунды для подключения
      IDLE_TIMEOUT: 30000             // 30 секунд простоя
    };
  }

  // Размеры буферов и окон
  static get BUFFERS() {
    return {
      LOG_BUFFER_SIZE: 100,
      SLIDING_WINDOW_SIZE: 1000,
      MAX_LOG_SIZE: 10 * 1024 * 1024, // 10MB
      MAX_LOG_FILES: 10,
      CRYPTO_KEY_SIZE: 32,
      CRYPTO_IV_SIZE: 16,
      CRYPTO_SALT_SIZE: 32
    };
  }

  // Алгоритмы и шифрование
  static get CRYPTO() {
    return {
      ALGORITHM: 'aes-256-cbc',
      PBKDF2_ITERATIONS: 100000,
      HASH_LENGTH: 64,
      HASH_ALGORITHM: 'sha512'
    };
  }

  // Rate limiting
  static get RATE_LIMIT() {
    return {
      WINDOW_MS: 60000,               // 1 минута
      MAX_REQUESTS: 100,              // максимум запросов
      CLEANUP_INTERVAL: 300000        // 5 минут
    };
  }

  // Localhost и приватные IP
  static get LOCALHOST() {
    return {
      NAMES: ['localhost', '127.0.0.1'],
      PRIVATE_RANGES: [
        '192.168.',
        '10.',
        /^172\.(1[6-9]|2\d|3[01])\./
      ]
    };
  }

  // Протоколы
  static get PROTOCOLS() {
    return {
      ALLOWED_HTTP: ['http:', 'https:']
    };
  }
}

module.exports = Constants; 