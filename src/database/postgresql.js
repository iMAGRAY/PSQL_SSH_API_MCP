// 🐘 POSTGRESQL МОДУЛЬ
// Безопасные операции с базой данных с защитой от SQL injection

import { TIMEOUTS, DEFAULTS, ACTIONS, AI_HINTS } from '../constants/index.js';
import { Validator } from '../validation/index.js';
import { ErrorHandler } from '../errors/index.js';
import securityManager from '../security/index.js';
import logger from '../logger/index.js';

class PostgreSQLManager {
  constructor() {
    this.Client = null;
    this.loadDependencies();
  }

  // Загрузка зависимостей
  loadDependencies() {
    try {
      const { Client } = require('pg');
      this.Client = Client;
      logger.info('PostgreSQL dependencies loaded');
    } catch (error) {
      logger.error('PostgreSQL dependencies not found', { error: error.message });
      throw new Error('PostgreSQL модуль не найден. Установите: npm install pg');
    }
  }

  // Создание безопасного подключения
  async createConnection(config) {
    if (!this.Client) {
      throw new Error('PostgreSQL клиент не загружен');
    }

    // Валидация конфигурации
    Validator.validatePostgreSQLConnection(config);

    const client = new this.Client({
      host: config.host,
      port: config.port || DEFAULTS.POSTGRESQL_PORT,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeoutMillis: TIMEOUTS.CONNECTION,
      query_timeout: TIMEOUTS.QUERY,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    return client;
  }

  // Настройка профиля подключения
  async setupProfile(args) {
    const { profile_name = 'default', host, port, username, password, database } = args;

    // Валидация входных данных
    const config = {
      host: Validator.sanitizeInput(host),
      port: port || DEFAULTS.POSTGRESQL_PORT,
      database: Validator.sanitizeInput(database),
      username: Validator.sanitizeInput(username),
      password: password
    };

    // Дополнительные проверки безопасности
    securityManager.validatePassword(password);
    securityManager.validateHost(host);

    // Тестирование подключения
    const client = await this.createConnection(config);
    
    try {
      await client.connect();
      await client.query('SELECT NOW()');
      await client.end();
      
      logger.connection('postgresql', 'test-success', { host, database, username });
    } catch (error) {
      logger.connection('postgresql', 'test-failed', { host, database, username, error: error.message });
      throw error;
    }

    // Сохранение профиля
    securityManager.saveProfile('postgresql', profile_name, config);

    return {
      message: `Профиль PostgreSQL '${profile_name}' успешно создан и протестирован`,
      profile_name,
      host: config.host,
      database: config.database,
      ai_hint: AI_HINTS.SETUP_COMPLETE
    };
  }

  // Получение списка профилей
  async listProfiles() {
    const profiles = securityManager.getProfilesByType('postgresql');
    
    return {
      profiles: profiles.map(p => ({
        name: p.name,
        host: p.host,
        port: p.port,
        created_at: p.createdAt,
        last_used: p.lastUsed
      })),
      count: profiles.length,
      ai_hint: "Список сохраненных профилей PostgreSQL"
    };
  }

  // Быстрый запрос (основная функция)
  async quickQuery(args) {
    const { sql, profile_name = 'default' } = args;
    
    // Валидация SQL
    Validator.validateSQL(sql);
    
    // Получение профиля
    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      logger.connection('postgresql', 'connected', { profile: profile_name });
      
      const startTime = Date.now();
      const result = await client.query(sql);
      const duration = Date.now() - startTime;
      
      logger.query(sql, duration, { profile: profile_name, rows: result.rowCount });
      
      return {
        rows: result.rows,
        count: result.rowCount,
        query: sql,
        duration: `${duration}ms`,
        ai_hint: AI_HINTS.QUERY_SUCCESS
      };
    } finally {
      await client.end();
      logger.connection('postgresql', 'disconnected', { profile: profile_name });
    }
  }

  // Показать таблицы
  async showTables(args) {
    const { profile_name = 'default' } = args;
    
    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      
      const result = await client.query(`
        SELECT 
          tablename,
          tableowner,
          hasindexes,
          hasrules,
          hastriggers
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      
      return {
        tables: result.rows,
        count: result.rowCount,
        ai_hint: "Список всех таблиц в базе данных"
      };
    } finally {
      await client.end();
    }
  }

  // Описание структуры таблицы
  async describeTable(args) {
    const { table_name, profile_name = 'default' } = args;
    
    // Валидация имени таблицы
    Validator.validateTableName(table_name);
    
    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      
      const result = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [table_name]);
      
      return {
        table_name,
        columns: result.rows,
        count: result.rowCount,
        ai_hint: `Структура таблицы ${table_name}`
      };
    } finally {
      await client.end();
    }
  }

  // Примеры данных из таблицы
  async sampleData(args) {
    const { table_name, limit = DEFAULTS.SAMPLE_DATA_LIMIT, profile_name = 'default' } = args;
    
    // Валидация
    Validator.validateTableName(table_name);
    Validator.validateLimit(limit);
    
    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      
      const result = await client.query(`SELECT * FROM ${table_name} LIMIT $1`, [limit]);
      
      return {
        table_name,
        sample_data: result.rows,
        count: result.rowCount,
        limit,
        ai_hint: `Примеры данных из таблицы ${table_name}`
      };
    } finally {
      await client.end();
    }
  }

  // Безопасная вставка данных
  async insertData(args) {
    const { table_name, data, profile_name = 'default' } = args;
    
    // Валидация
    Validator.validateTableName(table_name);
    Validator.validateDataObject(data);
    
    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      
      const columns = Object.keys(data);
      const values = Object.values(data);
      
      // Валидация имен колонок
      columns.forEach(col => Validator.validateColumnName(col));
      
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const columnNames = columns.join(', ');
      
      const sql = `INSERT INTO ${table_name} (${columnNames}) VALUES (${placeholders}) RETURNING *`;
      const result = await client.query(sql, values);
      
      logger.query(sql, 0, { profile: profile_name, table: table_name, action: 'insert' });
      
      return {
        table_name,
        inserted_data: result.rows[0],
        ai_hint: `Запись успешно добавлена в таблицу ${table_name}`
      };
    } finally {
      await client.end();
    }
  }

  // Безопасное обновление данных
  async updateData(args) {
    const { table_name, data, where, profile_name = 'default' } = args;
    
    // Валидация
    Validator.validateTableName(table_name);
    Validator.validateDataObject(data);
    
    if (!where || typeof where !== 'string') {
      throw new Error('WHERE условие обязательно для обновления');
    }

    // Проверка WHERE условия на SQL injection
    Validator.checkSQLInjection(where, 'where');
    
    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      
      const columns = Object.keys(data);
      const values = Object.values(data);
      
      // Валидация имен колонок
      columns.forEach(col => Validator.validateColumnName(col));
      
      const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
      const sql = `UPDATE ${table_name} SET ${setClause} WHERE ${where}`;
      
      const result = await client.query(sql, values);
      
      logger.query(sql, 0, { profile: profile_name, table: table_name, action: 'update' });
      
      return {
        table_name,
        updated_rows: result.rowCount,
        ai_hint: `Обновлено ${result.rowCount} записей в таблице ${table_name}`
      };
    } finally {
      await client.end();
    }
  }

  // Безопасное удаление данных
  async deleteData(args) {
    const { table_name, where, profile_name = 'default' } = args;
    
    // Валидация
    Validator.validateTableName(table_name);
    
    if (!where || typeof where !== 'string') {
      throw new Error('WHERE условие обязательно для удаления');
    }

    // Проверка WHERE условия на SQL injection
    Validator.checkSQLInjection(where, 'where');
    
    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      
      const sql = `DELETE FROM ${table_name} WHERE ${where}`;
      const result = await client.query(sql);
      
      logger.query(sql, 0, { profile: profile_name, table: table_name, action: 'delete' });
      
      return {
        table_name,
        deleted_rows: result.rowCount,
        ai_hint: `Удалено ${result.rowCount} записей из таблицы ${table_name}`
      };
    } finally {
      await client.end();
    }
  }

  // Информация о базе данных
  async databaseInfo(args) {
    const { profile_name = 'default' } = args;
    
    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      
      const result = await client.query(`
        SELECT 
          current_database() as database_name,
          current_user as current_user,
          version() as version,
          (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count
      `);
      
      return {
        database_info: result.rows[0],
        ai_hint: "Основная информация о базе данных"
      };
    } finally {
      await client.end();
    }
  }

  // Обработка действий
  async handleAction(args) {
    const { action, ...actionArgs } = args;
    
    // Валидация действия
    Validator.validatePostgreSQLAction(action);
    
    const context = {
      operation: 'postgresql',
      action,
      profile_name: actionArgs.profile_name,
      table_name: actionArgs.table_name,
      sql: actionArgs.sql
    };

    try {
      switch (action) {
        case ACTIONS.POSTGRESQL.SETUP_PROFILE:
          return await this.setupProfile(actionArgs);
        
        case ACTIONS.POSTGRESQL.LIST_PROFILES:
          return await this.listProfiles(actionArgs);
        
        case ACTIONS.POSTGRESQL.QUICK_QUERY:
          return await this.quickQuery(actionArgs);
        
        case ACTIONS.POSTGRESQL.SHOW_TABLES:
          return await this.showTables(actionArgs);
        
        case ACTIONS.POSTGRESQL.DESCRIBE_TABLE:
          return await this.describeTable(actionArgs);
        
        case ACTIONS.POSTGRESQL.SAMPLE_DATA:
          return await this.sampleData(actionArgs);
        
        case ACTIONS.POSTGRESQL.INSERT_DATA:
          return await this.insertData(actionArgs);
        
        case ACTIONS.POSTGRESQL.UPDATE_DATA:
          return await this.updateData(actionArgs);
        
        case ACTIONS.POSTGRESQL.DELETE_DATA:
          return await this.deleteData(actionArgs);
        
        case ACTIONS.POSTGRESQL.DATABASE_INFO:
          return await this.databaseInfo(actionArgs);
        
        default:
          throw new Error(`Неизвестное действие: ${action}`);
      }
    } catch (error) {
      throw error; // Пробрасываем ошибку для обработки в ErrorHandler
    }
  }
}

// Создаем экземпляр менеджера
const postgresqlManager = new PostgreSQLManager();

export default postgresqlManager; 