// 🔧 КОНСТАНТЫ ПРИЛОЖЕНИЯ
// Заменяет magic numbers и централизует настройки

// Таймауты (в миллисекундах)
const TIMEOUTS = {
  CONNECTION: 10000,
  QUERY: 30000,
  TEST_CONNECTION: 5000,
  API_REQUEST: 30000,
  SSH_CONNECT: 15000
};

// Настройки по умолчанию
const DEFAULTS = {
  POSTGRESQL_PORT: 5432,
  SSH_PORT: 22,
  MAX_RETRIES: 3,
  BATCH_SIZE: 1000,
  SAMPLE_DATA_LIMIT: 10,
  MAX_QUERY_LENGTH: 10000
};

// Уровни логгирования
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// Статусы ответов
const RESPONSE_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  PARTIAL: 'partial'
};

// Типы действий
const ACTIONS = {
  POSTGRESQL: {
    SETUP_PROFILE: 'setup_profile',
    LIST_PROFILES: 'list_profiles',
    QUICK_QUERY: 'quick_query',
    SHOW_TABLES: 'show_tables',
    DESCRIBE_TABLE: 'describe_table',
    SAMPLE_DATA: 'sample_data',
    INSERT_DATA: 'insert_data',
    UPDATE_DATA: 'update_data',
    DELETE_DATA: 'delete_data',
    DATABASE_INFO: 'database_info'
  },
  SSH: {
    SETUP_PROFILE: 'setup_profile',
    LIST_PROFILES: 'list_profiles',
    EXECUTE: 'execute',
    SYSTEM_INFO: 'system_info',
    CHECK_HOST: 'check_host'
  },
  API: {
    GET: 'get',
    POST: 'post',
    PUT: 'put',
    DELETE: 'delete',
    PATCH: 'patch',
    CHECK_API: 'check_api'
  }
};

// Сообщения для ИИ
const AI_HINTS = {
  SETUP_COMPLETE: 'Профиль успешно создан. Теперь можно использовать команды без указания пароля',
  QUERY_SUCCESS: 'Запрос выполнен успешно',
  CONNECTION_ERROR: 'Проверьте параметры подключения',
  VALIDATION_ERROR: 'Проверьте корректность входных данных',
  SECURITY_ERROR: 'Операция заблокирована из соображений безопасности'
};

// Регулярные выражения для валидации
const VALIDATION_PATTERNS = {
  SQL_INJECTION: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b|[';-])/gi,
  TABLE_NAME: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  COLUMN_NAME: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  IP_ADDRESS: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  URL: /^https?:\/\/.+$/
};

// Лимиты безопасности
const SECURITY_LIMITS = {
  MAX_CONNECTIONS: 10,
  MAX_QUERY_TIME: 60000,
  MAX_RESULT_SIZE: 1000000,
  MAX_BATCH_SIZE: 100,
  PASSWORD_MIN_LENGTH: 8,
  MAX_QUERY_LENGTH: 10000,
  MAX_QUERY_LIMIT: 1000,
  MAX_DATA_SIZE: 10000
};

// Лимиты производительности
const PERFORMANCE_LIMITS = {
  MAX_CONNECTIONS: 50,
  CONNECTION_POOL_SIZE: 10,
  QUERY_TIMEOUT: 30000,
  CLEANUP_INTERVAL: 300000  // 5 минут
};

// Лимиты запросов
const QUERY_LIMITS = {
  MAX_QUERY_LENGTH: 10000,
  MAX_COMMAND_LENGTH: 1000,
  MAX_BATCH_SIZE: 100,
  MAX_RESULT_ROWS: 10000
};

// Лимиты подключений
const CONNECTION_LIMITS = {
  MAX_IDLE_TIME: 300000,    // 5 минут
  MAX_LIFETIME: 3600000,    // 1 час
  HEALTH_CHECK_INTERVAL: 60000  // 1 минута
};

module.exports = {
  TIMEOUTS,
  DEFAULTS,
  LOG_LEVELS,
  RESPONSE_STATUS,
  ACTIONS,
  AI_HINTS,
  VALIDATION_PATTERNS,
  SECURITY_LIMITS,
  PERFORMANCE_LIMITS,
  QUERY_LIMITS,
  CONNECTION_LIMITS
}; 