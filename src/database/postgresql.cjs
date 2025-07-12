// 🐘 POSTGRESQL МОДУЛЬ
// Безопасные операции с базой данных с защитой от SQL injection

const { TIMEOUTS, DEFAULTS, ACTIONS, AI_HINTS } = require('../constants/index.cjs');
const securityManager = require('../security/index.cjs');
const logger = require('../logger/index.cjs');

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
    if (!host || !username || !password || !database) {
      throw new Error('host, username, password и database обязательны');
    }

    const config = {
      host,
      port: port || DEFAULTS.POSTGRESQL_PORT,
      database,
      username,
      password
    };

    // Проверки безопасности
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
        created_at: p.created_at,
        last_used: p.last_used
      })),
      count: profiles.length,
      ai_hint: "Список сохраненных профилей PostgreSQL"
    };
  }

  // Быстрый запрос (основная функция)
  async quickQuery(args) {
    const { sql, profile_name = 'default' } = args;
    
    if (!sql) {
      throw new Error('SQL запрос обязателен');
    }

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
    
    if (!table_name) {
      throw new Error('Имя таблицы обязательно');
    }

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
    const { table_name, profile_name = 'default', limit = 10 } = args;
    
    if (!table_name) {
      throw new Error('Имя таблицы обязательно');
    }

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
        ai_hint: `Примеры данных из таблицы ${table_name}`
      };
    } finally {
      await client.end();
    }
  }

  // Вставка данных
  async insertData(args) {
    const { table_name, data, profile_name = 'default' } = args;
    
    if (!table_name || !data) {
      throw new Error('table_name и data обязательны');
    }

    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      
      const columns = Object.keys(data).join(', ');
      const values = Object.values(data);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const insertSQL = `INSERT INTO ${table_name} (${columns}) VALUES (${placeholders}) RETURNING *`;
      
      const result = await client.query(insertSQL, values);
      
      return {
        table_name,
        inserted_data: result.rows[0],
        ai_hint: `Запись успешно добавлена в таблицу ${table_name}`
      };
    } finally {
      await client.end();
    }
  }

  // Обновление данных
  async updateData(args) {
    const { table_name, data, where, profile_name = 'default' } = args;
    
    if (!table_name || !data || !where) {
      throw new Error('table_name, data и where обязательны');
    }

    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      
      const setClause = Object.entries(data)
        .map(([col, val]) => `${col} = $${Object.keys(data).indexOf(col) + 1}`)
        .join(", ");
      const updateSQL = `UPDATE ${table_name} SET ${setClause} WHERE ${where}`;
      
      const result = await client.query(updateSQL, Object.values(data));
      
      return {
        table_name,
        updated_rows: result.rowCount,
        ai_hint: `Обновлено ${result.rowCount} записей в таблице ${table_name}`
      };
    } finally {
      await client.end();
    }
  }

  // Удаление данных
  async deleteData(args) {
    const { table_name, where, profile_name = 'default' } = args;
    
    if (!table_name || !where) {
      throw new Error('table_name и where обязательны');
    }

    const profile = securityManager.getProfile('postgresql', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const client = await this.createConnection(profile.config);
    
    try {
      await client.connect();
      
      const deleteSQL = `DELETE FROM ${table_name} WHERE ${where}`;
      const result = await client.query(deleteSQL);
      
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
    const { action } = args;
    
    switch (action) {
      case ACTIONS.POSTGRESQL.SETUP_PROFILE:
        return await this.setupProfile(args);
      case ACTIONS.POSTGRESQL.LIST_PROFILES:
        return await this.listProfiles(args);
      case ACTIONS.POSTGRESQL.QUICK_QUERY:
        return await this.quickQuery(args);
      case ACTIONS.POSTGRESQL.SHOW_TABLES:
        return await this.showTables(args);
      case ACTIONS.POSTGRESQL.DESCRIBE_TABLE:
        return await this.describeTable(args);
      case ACTIONS.POSTGRESQL.SAMPLE_DATA:
        return await this.sampleData(args);
      case ACTIONS.POSTGRESQL.INSERT_DATA:
        return await this.insertData(args);
      case ACTIONS.POSTGRESQL.UPDATE_DATA:
        return await this.updateData(args);
      case ACTIONS.POSTGRESQL.DELETE_DATA:
        return await this.deleteData(args);
      case ACTIONS.POSTGRESQL.DATABASE_INFO:
        return await this.databaseInfo(args);
      default:
        throw new Error(`Неизвестное действие PostgreSQL: ${action}`);
    }
  }
}

module.exports = PostgreSQLManager; 