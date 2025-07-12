// 🔧 КОНСТАНТЫ ПРИЛОЖЕНИЯ
// Заменяет magic numbers и централизует настройки

// Таймауты (в миллисекундах)
export const TIMEOUTS = {
  CONNECTION: 10000,
  QUERY: 30000,
  TEST_CONNECTION: 5000,
  API_REQUEST: 30000,
  SSH_CONNECT: 15000
};

// Настройки по умолчанию
export const DEFAULTS = {
  POSTGRESQL_PORT: 5432,
  SSH_PORT: 22,
  MAX_RETRIES: 3,
  BATCH_SIZE: 1000,
  SAMPLE_DATA_LIMIT: 10,
  MAX_QUERY_LENGTH: 10000
};

// Уровни логгирования
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// Статусы ответов
export const RESPONSE_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  PARTIAL: 'partial'
};

// Типы действий
export const ACTIONS = {
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
    CREATE_TABLE: 'create_table',
    DROP_TABLE: 'drop_table',
    DATABASE_INFO: 'database_info'
  },
  SSH: {
    SETUP_PROFILE: 'setup_profile',
    LIST_PROFILES: 'list_profiles',
    EXECUTE: 'execute',
    SYSTEM_INFO: 'system_info'
  },
  API: {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE',
    PATCH: 'PATCH'
  }
};

// Сообщения для ИИ
export const AI_HINTS = {
  SETUP_COMPLETE: 'Профиль успешно создан. Теперь можно использовать команды без указания пароля',
  QUERY_SUCCESS: 'Запрос выполнен успешно',
  CONNECTION_ERROR: 'Проверьте параметры подключения',
  VALIDATION_ERROR: 'Проверьте корректность входных данных',
  SECURITY_ERROR: 'Операция заблокирована из соображений безопасности'
};

// Регулярные выражения для валидации
export const VALIDATION_PATTERNS = {
  SQL_INJECTION: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b|[';-])/gi,
  TABLE_NAME: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  COLUMN_NAME: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  IP_ADDRESS: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  URL: /^https?:\/\/.+$/
};

// Лимиты безопасности
export const SECURITY_LIMITS = {
  MAX_CONNECTIONS: 10,
  MAX_QUERY_TIME: 60000,
  MAX_RESULT_SIZE: 1000000,
  MAX_BATCH_SIZE: 100,
  PASSWORD_MIN_LENGTH: 8
}; 