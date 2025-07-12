// 🔐 СИСТЕМА ВАЛИДАЦИИ
// Защита от SQL injection и валидация входных данных

const { VALIDATION_PATTERNS, SECURITY_LIMITS, ACTIONS } = require('../constants/index.cjs');
const logger = require('../logger/index.cjs');

class ValidationError extends Error {
  constructor(message, field, value) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

class Validator {
  // Проверка на SQL injection
  static checkSQLInjection(input, fieldName) {
    if (typeof input !== 'string') return true;
    
    // Проверяем только на самые опасные паттерны для non-SQL полей
    const suspiciousPatterns = [
      /['";]/g,               // Опасные кавычки
      /--/g,                  // SQL комментарии  
      /\/\*[\s\S]*?\*\//g,    // Блочные комментарии
      /\b(DROP|DELETE|TRUNCATE|ALTER|GRANT|REVOKE)\s+/gi,  // Опасные операции
      /\b(XP_|SP_)\w+/gi      // Системные процедуры
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(input)) {
        logger.security('SQL injection attempt detected', { field: fieldName, value: input });
        throw new ValidationError(
          `Потенциальная SQL injection в поле ${fieldName}`,
          fieldName,
          input
        );
      }
    }
    return true;
  }

  // Валидация имени таблицы
  static validateTableName(tableName) {
    if (!tableName || typeof tableName !== 'string') {
      throw new ValidationError('Имя таблицы обязательно и должно быть строкой', 'table_name', tableName);
    }

    if (!VALIDATION_PATTERNS.TABLE_NAME.test(tableName)) {
      throw new ValidationError(
        'Имя таблицы должно содержать только буквы, цифры и подчеркивания',
        'table_name',
        tableName
      );
    }

    if (tableName.length > 63) {
      throw new ValidationError('Имя таблицы слишком длинное (максимум 63 символа)', 'table_name', tableName);
    }

    return true;
  }

  // Валидация имени колонки
  static validateColumnName(columnName) {
    if (!columnName || typeof columnName !== 'string') {
      throw new ValidationError('Имя колонки обязательно и должно быть строкой', 'column_name', columnName);
    }

    if (!VALIDATION_PATTERNS.COLUMN_NAME.test(columnName)) {
      throw new ValidationError(
        'Имя колонки должно содержать только буквы, цифры и подчеркивания',
        'column_name',
        columnName
      );
    }

    return true;
  }

  // Валидация SQL запроса
  static validateSQL(sql) {
    if (!sql || typeof sql !== 'string') {
      throw new ValidationError('SQL запрос обязателен', 'sql', sql);
    }

    if (sql.length > SECURITY_LIMITS.MAX_QUERY_LENGTH) {
      throw new ValidationError(
        `SQL запрос слишком длинный (максимум ${SECURITY_LIMITS.MAX_QUERY_LENGTH} символов)`,
        'sql',
        sql
      );
    }

    // Проверяем на опасные SQL injection паттерны в SQL
    const sqlInjectionPatterns = [
      /[';]/g,                // Одиночные кавычки и точки с запятой в неожиданных местах
      /--/g,                  // SQL комментарии
      /\/\*[\s\S]*?\*\//g,    // Блочные комментарии
      /\b(XP_|SP_)\w+/gi      // Системные процедуры
    ];

    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(sql)) {
        logger.security('SQL injection attempt in SQL query', { sql });
        throw new ValidationError(
          'SQL запрос содержит потенциально опасные символы',
          'sql',
          sql
        );
      }
    }

    // Проверяем на подозрительные операции
    const dangerousOperations = /\b(DROP|DELETE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/gi;
    if (dangerousOperations.test(sql)) {
      logger.security('Dangerous SQL operation detected', { sql });
      // Не блокируем, но логируем
    }

    return true;
  }

  // Валидация данных подключения PostgreSQL
  static validatePostgreSQLConnection(config) {
    const required = ['host', 'username', 'password', 'database'];
    
    for (const field of required) {
      if (!config[field]) {
        throw new ValidationError(`Поле ${field} обязательно для PostgreSQL подключения`, field, config[field]);
      }
    }

    // Валидация хоста
    if (!VALIDATION_PATTERNS.IP_ADDRESS.test(config.host) && !/^[a-zA-Z0-9.-]+$/.test(config.host)) {
      throw new ValidationError('Некорректный формат хоста', 'host', config.host);
    }

    // Валидация порта
    if (config.port && (config.port < 1 || config.port > 65535)) {
      throw new ValidationError('Порт должен быть между 1 и 65535', 'port', config.port);
    }

    // Валидация пароля
    if (config.password.length < SECURITY_LIMITS.PASSWORD_MIN_LENGTH) {
      throw new ValidationError(
        `Пароль должен содержать минимум ${SECURITY_LIMITS.PASSWORD_MIN_LENGTH} символов`,
        'password',
        '***'
      );
    }

    return true;
  }

  // Валидация данных SSH подключения
  static validateSSHConnection(config) {
    const required = ['host', 'username', 'password'];
    
    for (const field of required) {
      if (!config[field]) {
        throw new ValidationError(`Поле ${field} обязательно для SSH подключения`, field, config[field]);
      }
    }

    // Валидация хоста
    if (!VALIDATION_PATTERNS.IP_ADDRESS.test(config.host) && !/^[a-zA-Z0-9.-]+$/.test(config.host)) {
      throw new ValidationError('Некорректный формат хоста', 'host', config.host);
    }

    // Валидация порта
    if (config.port && (config.port < 1 || config.port > 65535)) {
      throw new ValidationError('Порт должен быть между 1 и 65535', 'port', config.port);
    }

    return true;
  }

  // Валидация URL для API запросов
  static validateURL(url) {
    if (!url || typeof url !== 'string') {
      throw new ValidationError('URL обязателен', 'url', url);
    }

    if (!VALIDATION_PATTERNS.URL.test(url)) {
      throw new ValidationError('Некорректный формат URL', 'url', url);
    }

    return true;
  }

  // Валидация действия PostgreSQL
  static validatePostgreSQLAction(action) {
    const validActions = Object.values(ACTIONS.POSTGRESQL);
    if (!validActions.includes(action)) {
      throw new ValidationError(`Неизвестное действие PostgreSQL: ${action}`, 'action', action);
    }
    return true;
  }

  // Валидация действия SSH
  static validateSSHAction(action) {
    const validActions = Object.values(ACTIONS.SSH);
    if (!validActions.includes(action)) {
      throw new ValidationError(`Неизвестное действие SSH: ${action}`, 'action', action);
    }
    return true;
  }

  // Валидация HTTP метода
  static validateHTTPMethod(method) {
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    if (!validMethods.includes(method.toUpperCase())) {
      throw new ValidationError(`Неизвестный HTTP метод: ${method}`, 'method', method);
    }
    return true;
  }

  // Санитизация входных данных
  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  // Валидация лимита записей
  static validateLimit(limit) {
    if (limit !== undefined && limit !== null) {
      if (!Number.isInteger(limit) || limit < 1 || limit > SECURITY_LIMITS.MAX_QUERY_LIMIT) {
        throw new ValidationError(
          `Лимит должен быть целым числом от 1 до ${SECURITY_LIMITS.MAX_QUERY_LIMIT}`,
          'limit',
          limit
        );
      }
    }
    return true;
  }

  // Валидация объекта данных
  static validateDataObject(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new ValidationError('Данные должны быть объектом', 'data', data);
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError('Объект данных не может быть пустым', 'data', data);
    }

    return true;
  }

  // Валидация JSON
  static validateJSON(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      throw new ValidationError('Некорректный JSON формат', 'json', jsonString);
    }
  }

  // Валидация размера данных
  static validateDataSize(data) {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    if (dataString.length > SECURITY_LIMITS.MAX_DATA_SIZE) {
      throw new ValidationError(
        `Размер данных превышает лимит ${SECURITY_LIMITS.MAX_DATA_SIZE} символов`,
        'data',
        data
      );
    }
    return true;
  }

  // Валидация порта
  static validatePort(port) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ValidationError('Порт должен быть целым числом от 1 до 65535', 'port', port);
    }
    return true;
  }

  // Валидация имени пользователя
  static validateUsername(username) {
    if (!username || typeof username !== 'string') {
      throw new ValidationError('Имя пользователя обязательно', 'username', username);
    }

    if (!VALIDATION_PATTERNS.USERNAME.test(username)) {
      throw new ValidationError('Недопустимые символы в имени пользователя', 'username', username);
    }

    return true;
  }

  // Проверка command injection
  static checkCommandInjection(command, fieldName) {
    if (typeof command !== 'string') return true;

    const dangerousPatterns = [
      /[;&|`$()]/g,           // Опасные символы
      /\s+(rm|cat|wget|curl|nc|telnet|ssh)\s+/gi,  // Опасные команды
      /\|\s*mail/gi           // Pipe в mail
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        logger.security('Command injection attempt detected', { field: fieldName, value: command });
        throw new ValidationError(
          `Потенциальная command injection в поле ${fieldName}`,
          fieldName,
          command
        );
      }
    }
    return true;
  }
}

module.exports = { Validator, ValidationError }; 