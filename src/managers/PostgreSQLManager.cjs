// 🐘 POSTGRESQL MANAGER
// Тонкий оркестратор для PostgreSQL операций

const { ACTIONS, AI_HINTS } = require('../constants/index.cjs');
const logger = require('../logger/index.cjs');

class PostgreSQLManager {
  constructor(container) {
    this.container = container;
  }

  // Получение сервисов через DI
  _getProfileService() {
    return this.container.get('profileService');
  }

  _getQueryService() {
    return this.container.get('queryService');
  }

  _getValidationService() {
    return this.container.get('validationService');
  }

  // Настройка профиля подключения
  async setupProfile(args) {
    const { profile_name = 'default', host, port, username, password, database } = args;

    try {
      const config = {
        host: this._sanitize(host),
        port: port || 5432,
        database: this._sanitize(database),
        username: this._sanitize(username),
        password: password
      };

      const result = await this._getProfileService().createProfile('postgresql', profile_name, config);

      return {
        message: `Профиль PostgreSQL '${profile_name}' успешно создан и протестирован`,
        profile_name,
        host: config.host,
        database: config.database,
        ai_hint: AI_HINTS.SETUP_COMPLETE
      };
    } catch (error) {
      logger.error('PostgreSQL profile setup failed', { profile_name, error: error.message });
      throw error;
    }
  }

  // Получение списка профилей
  async listProfiles() {
    try {
      const profiles = this._getProfileService().listProfiles('postgresql');
      
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
    } catch (error) {
      logger.error('Failed to list PostgreSQL profiles', { error: error.message });
      throw error;
    }
  }

  // Быстрый запрос
  async quickQuery(args) {
    const { sql, profile_name = 'default' } = args;
    
    try {
      const result = await this._getQueryService().executeSQL('postgresql', profile_name, sql);
      
      return {
        rows: result.rows,
        count: result.count,
        query: sql,
        ai_hint: AI_HINTS.QUERY_SUCCESS
      };
    } catch (error) {
      logger.error('PostgreSQL query failed', { profile_name, sql: sql?.substring(0, 100), error: error.message });
      throw error;
    }
  }

  // Показать таблицы
  async showTables(args) {
    const { profile_name = 'default' } = args;
    
    const sql = `
      SELECT 
        tablename,
        tableowner,
        hasindexes,
        hasrules,
        hastriggers
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;

    try {
      const result = await this._getQueryService().executeSQL('postgresql', profile_name, sql);
      
      return {
        tables: result.rows,
        count: result.count,
        ai_hint: "Список всех таблиц в базе данных"
      };
    } catch (error) {
      logger.error('Failed to show tables', { profile_name, error: error.message });
      throw error;
    }
  }

  // Описание структуры таблицы
  async describeTable(args) {
    const { table_name, profile_name = 'default' } = args;
    
    // Валидация имени таблицы
    this._getValidationService().validateTableName(table_name);
    
    const sql = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position
    `;

    try {
      const result = await this._getQueryService().executeSQL('postgresql', profile_name, sql, [table_name]);
      
      return {
        table_name,
        columns: result.rows,
        count: result.count,
        ai_hint: `Структура таблицы ${table_name}`
      };
    } catch (error) {
      logger.error('Failed to describe table', { table_name, profile_name, error: error.message });
      throw error;
    }
  }

  // Примеры данных
  async sampleData(args) {
    const { table_name, limit = 5, profile_name = 'default' } = args;
    
    this._getValidationService().validateTableName(table_name);
    this._getValidationService().validateLimit(limit);
    
    const sql = `SELECT * FROM ${table_name} LIMIT $1`;

    try {
      const result = await this._getQueryService().executeSQL('postgresql', profile_name, sql, [limit]);
      
      return {
        table_name,
        sample_data: result.rows,
        count: result.count,
        ai_hint: `Примеры данных из таблицы ${table_name}`
      };
    } catch (error) {
      logger.error('Failed to get sample data', { table_name, profile_name, error: error.message });
      throw error;
    }
  }

  // Вставка данных
  async insertData(args) {
    const { table_name, data, profile_name = 'default' } = args;
    
    this._getValidationService().validateTableName(table_name);
    this._getValidationService().validateDataObject(data);
    
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    
    const sql = `INSERT INTO ${table_name} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;

    try {
      const result = await this._getQueryService().executeSQL('postgresql', profile_name, sql, values);
      
      return {
        table_name,
        inserted_data: result.rows[0],
        ai_hint: `Данные успешно добавлены в таблицу ${table_name}`
      };
    } catch (error) {
      logger.error('Failed to insert data', { table_name, profile_name, error: error.message });
      throw error;
    }
  }

  // Обновление данных
  async updateData(args) {
    const { table_name, data, where, profile_name = 'default' } = args;
    
    this._getValidationService().validateTableName(table_name);
    this._getValidationService().validateDataObject(data);
    
    const updates = Object.keys(data).map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = Object.values(data);
    
    const sql = `UPDATE ${table_name} SET ${updates} WHERE ${where} RETURNING *`;

    try {
      const result = await this._getQueryService().executeSQL('postgresql', profile_name, sql, values);
      
      return {
        table_name,
        updated_count: result.count,
        updated_data: result.rows,
        ai_hint: `Обновлено ${result.count} записей в таблице ${table_name}`
      };
    } catch (error) {
      logger.error('Failed to update data', { table_name, profile_name, error: error.message });
      throw error;
    }
  }

  // Удаление данных
  async deleteData(args) {
    const { table_name, where, profile_name = 'default' } = args;
    
    this._getValidationService().validateTableName(table_name);
    
    if (!where || where.includes('1=1') || where.toLowerCase().includes('true')) {
      throw new Error('WHERE условие обязательно для безопасности');
    }
    
    const sql = `DELETE FROM ${table_name} WHERE ${where} RETURNING *`;

    try {
      const result = await this._getQueryService().executeSQL('postgresql', profile_name, sql);
      
      return {
        table_name,
        deleted_count: result.count,
        deleted_data: result.rows,
        ai_hint: `Удалено ${result.count} записей из таблицы ${table_name}`
      };
    } catch (error) {
      logger.error('Failed to delete data', { table_name, profile_name, error: error.message });
      throw error;
    }
  }

  // Информация о базе данных
  async databaseInfo(args) {
    const { profile_name = 'default' } = args;
    
    const sql = `
      SELECT 
        current_database() as database_name,
        current_user as current_user,
        version() as version,
        current_setting('server_version') as server_version
    `;

    try {
      const result = await this._getQueryService().executeSQL('postgresql', profile_name, sql);
      
      return {
        database_info: result.rows[0],
        ai_hint: "Информация о текущей базе данных PostgreSQL"
      };
    } catch (error) {
      logger.error('Failed to get database info', { profile_name, error: error.message });
      throw error;
    }
  }

  // Главный обработчик действий
  async handleAction(args) {
    const { action } = args;
    
    try {
      this._getValidationService().validatePostgreSQLAction(action);
      
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
    } catch (error) {
      logger.error('PostgreSQL action failed', { action, error: error.message });
      throw error;
    }
  }

  // Санитизация входных данных
  _sanitize(input) {
    return this._getValidationService().sanitizeInput(input);
  }
}

module.exports = PostgreSQLManager; 