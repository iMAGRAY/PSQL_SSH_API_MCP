// 🔍 QUERY SERVICE
// Централизованное выполнение запросов и команд

const { PERFORMANCE_LIMITS, QUERY_LIMITS } = require('../constants/index.cjs');
const logger = require('../logger/index.cjs');

class QueryService {
  constructor(connectionService, validationService) {
    this.connectionService = connectionService;
    this.validationService = validationService;
    this.queryStats = {
      executed: 0,
      failed: 0,
      totalDuration: 0,
      avgDuration: 0
    };
  }

  // Выполнение SQL запроса
  async executeSQL(profileType, profileName, sql, params = []) {
    this._validateSQL(sql);
    
    const startTime = Date.now();
    
    try {
      const result = await this.connectionService.withConnection(
        'postgresql', 
        await this._getProfileConfig(profileType, profileName),
        profileName,
        async (client) => {
          const queryResult = params.length > 0 
            ? await client.query(sql, params)
            : await client.query(sql);
          
          return {
            rows: queryResult.rows,
            count: queryResult.rowCount,
            fields: queryResult.fields
          };
        }
      );

      this._updateStats(startTime);
      
      logger.query(sql, Date.now() - startTime, { 
        profile: profileName, 
        rows: result.count 
      });

      return result;
    } catch (error) {
      this._recordFailure();
      logger.error('SQL query failed', { sql: sql.substring(0, 100), error: error.message });
      throw error;
    }
  }

  // Выполнение SSH команды
  async executeSSH(profileType, profileName, command) {
    this._validateCommand(command);
    
    const startTime = Date.now();
    
    try {
      const result = await this.connectionService.withConnection(
        'ssh',
        await this._getProfileConfig(profileType, profileName),
        profileName,
        async (conn) => {
          return new Promise((resolve, reject) => {
            conn.exec(command, (err, stream) => {
              if (err) {
                reject(err);
                return;
              }
              
              let stdout = '';
              let stderr = '';
              
              stream
                .on('close', (code, signal) => {
                  resolve({
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: code,
                    signal
                  });
                })
                .on('data', (data) => {
                  stdout += data.toString();
                })
                .stderr.on('data', (data) => {
                  stderr += data.toString();
                });
            });
          });
        }
      );

      this._updateStats(startTime);
      
      logger.query(command, Date.now() - startTime, { 
        profile: profileName, 
        exitCode: result.exitCode 
      });

      return result;
    } catch (error) {
      this._recordFailure();
      logger.error('SSH command failed', { command: command.substring(0, 100), error: error.message });
      throw error;
    }
  }

  // Выполнение пакетных SQL операций
  async executeBatch(profileType, profileName, queries) {
    if (queries.length > QUERY_LIMITS.MAX_BATCH_SIZE) {
      throw new Error(`Batch size exceeds limit: ${QUERY_LIMITS.MAX_BATCH_SIZE}`);
    }

    const results = [];
    const startTime = Date.now();
    
    try {
      await this.connectionService.withConnection(
        'postgresql',
        await this._getProfileConfig(profileType, profileName),
        profileName,
        async (client) => {
          await client.query('BEGIN');
          
          try {
            for (const query of queries) {
              this._validateSQL(query.sql);
              const result = await client.query(query.sql, query.params || []);
              results.push({
                sql: query.sql,
                rows: result.rows,
                count: result.rowCount
              });
            }
            
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          }
        }
      );

      this._updateStats(startTime);
      logger.info(`Batch executed successfully: ${queries.length} queries`);
      
      return results;
    } catch (error) {
      this._recordFailure();
      logger.error('Batch execution failed', { queries: queries.length, error: error.message });
      throw error;
    }
  }

  // Стриминг больших результатов
  async streamQuery(profileType, profileName, sql, callback) {
    this._validateSQL(sql);
    
    return this.connectionService.withConnection(
      'postgresql',
      await this._getProfileConfig(profileType, profileName),
      profileName,
      async (client) => {
        const query = client.query(sql);
        
        query.on('row', (row, result) => {
          callback(row, result.rowCount);
        });
        
        return new Promise((resolve, reject) => {
          query.on('end', (result) => {
            resolve({ count: result.rowCount });
          });
          
          query.on('error', reject);
        });
      }
    );
  }

  // Валидация SQL
  _validateSQL(sql) {
    if (!sql || typeof sql !== 'string') {
      throw new Error('SQL query is required and must be a string');
    }
    
    if (sql.length > QUERY_LIMITS.MAX_QUERY_LENGTH) {
      throw new Error(`Query too long: ${sql.length} > ${QUERY_LIMITS.MAX_QUERY_LENGTH}`);
    }
    
    // Используем валидацию из ValidationService если доступна
    if (this.validationService) {
      this.validationService.validateSQL(sql);
    }
  }

  // Валидация команды
  _validateCommand(command) {
    if (!command || typeof command !== 'string') {
      throw new Error('Command is required and must be a string');
    }
    
    if (command.length > QUERY_LIMITS.MAX_COMMAND_LENGTH) {
      throw new Error(`Command too long: ${command.length} > ${QUERY_LIMITS.MAX_COMMAND_LENGTH}`);
    }
    
    // Используем валидацию из ValidationService если доступна
    if (this.validationService) {
      this.validationService.checkCommandInjection(command, 'ssh_command');
    }
  }

  // Получение конфигурации профиля
  async _getProfileConfig(profileType, profileName) {
    // Здесь будет обращение к SecurityService для получения расшифрованного профиля
    // Временная заглушка
    return {
      host: 'localhost',
      port: profileType === 'postgresql' ? 5432 : 22,
      username: 'user',
      password: 'password',
      database: profileType === 'postgresql' ? 'testdb' : undefined
    };
  }

  // Обновление статистики
  _updateStats(startTime) {
    const duration = Date.now() - startTime;
    this.queryStats.executed++;
    this.queryStats.totalDuration += duration;
    this.queryStats.avgDuration = this.queryStats.totalDuration / this.queryStats.executed;
  }

  // Запись ошибки
  _recordFailure() {
    this.queryStats.failed++;
  }

  // Получение статистики
  getStats() {
    return {
      ...this.queryStats,
      successRate: this.queryStats.executed / (this.queryStats.executed + this.queryStats.failed) * 100 || 0
    };
  }

  // Очистка статистики
  resetStats() {
    this.queryStats = {
      executed: 0,
      failed: 0,
      totalDuration: 0,
      avgDuration: 0
    };
  }
}

module.exports = QueryService; 