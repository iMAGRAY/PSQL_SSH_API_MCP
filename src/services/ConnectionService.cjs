// 🔗 CONNECTION SERVICE
// Централизованное управление подключениями

const { TIMEOUTS, CONNECTION_LIMITS } = require('../constants/index.cjs');
const logger = require('../logger/index.cjs');

class ConnectionService {
  constructor() {
    this.connections = new Map();
    this.connectionPools = new Map();
    this.connectionStats = {
      created: 0,
      active: 0,
      failed: 0,
      closed: 0
    };
  }

  // Создание подключения с универсальным интерфейсом
  async createConnection(type, config, identifier = 'default') {
    const connectionKey = `${type}_${identifier}`;
    
    try {
      let connection;
      
      switch (type) {
        case 'postgresql':
          connection = await this._createPostgreSQLConnection(config);
          break;
        case 'ssh':
          connection = await this._createSSHConnection(config);
          break;
        default:
          throw new Error(`Unsupported connection type: ${type}`);
      }

      // Обертка подключения с метаданными
      const wrappedConnection = {
        type,
        identifier,
        connection,
        config: this._sanitizeConfig(config),
        createdAt: new Date(),
        lastUsed: new Date(),
        isActive: true
      };

      this.connections.set(connectionKey, wrappedConnection);
      this.connectionStats.created++;
      this.connectionStats.active++;

      logger.connection(type, 'created', { 
        identifier, 
        host: config.host,
        active: this.connectionStats.active 
      });

      return wrappedConnection;
    } catch (error) {
      this.connectionStats.failed++;
      logger.connection(type, 'failed', { 
        identifier, 
        host: config.host, 
        error: error.message 
      });
      throw error;
    }
  }

  // Получение существующего подключения
  getConnection(type, identifier = 'default') {
    const connectionKey = `${type}_${identifier}`;
    const connection = this.connections.get(connectionKey);
    
    if (connection && connection.isActive) {
      connection.lastUsed = new Date();
      return connection;
    }
    
    return null;
  }

  // Закрытие подключения
  async closeConnection(type, identifier = 'default') {
    const connectionKey = `${type}_${identifier}`;
    const connection = this.connections.get(connectionKey);
    
    if (!connection) return false;

    try {
      switch (type) {
        case 'postgresql':
          await connection.connection.end();
          break;
        case 'ssh':
          connection.connection.end();
          break;
      }

      connection.isActive = false;
      this.connections.delete(connectionKey);
      this.connectionStats.active--;
      this.connectionStats.closed++;

      logger.connection(type, 'closed', { 
        identifier,
        active: this.connectionStats.active 
      });

      return true;
    } catch (error) {
      logger.error('Failed to close connection', { type, identifier, error: error.message });
      return false;
    }
  }

  // Выполнение операции с автоматическим управлением подключением
  async withConnection(type, config, identifier, operation) {
    let connection = this.getConnection(type, identifier);
    
    if (!connection) {
      connection = await this.createConnection(type, config, identifier);
    }

    try {
      const result = await operation(connection.connection);
      return result;
    } finally {
      // Опционально: закрыть подключение после операции
      // await this.closeConnection(type, identifier);
    }
  }

  // Создание PostgreSQL подключения
  async _createPostgreSQLConnection(config) {
    const { Client } = require('pg');
    
    const client = new Client({
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeoutMillis: TIMEOUTS.CONNECTION,
      query_timeout: TIMEOUTS.QUERY,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    await client.connect();
    
    // Тестовый запрос
    await client.query('SELECT NOW()');
    
    return client;
  }

  // Создание SSH подключения
  async _createSSHConnection(config) {
    const { Client } = require('ssh2');
    
    const conn = new Client();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('Connection timeout'));
      }, TIMEOUTS.SSH_CONNECT);

      conn.on('ready', () => {
        clearTimeout(timeout);
        resolve(conn);
      });

      conn.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      conn.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password
      });
    });
  }

  // Очистка конфигурации от чувствительных данных для логирования
  _sanitizeConfig(config) {
    return {
      ...config,
      password: '***'
    };
  }

  // Очистка неактивных подключений
  cleanupInactiveConnections(maxAge = 300000) { // 5 минут
    const now = new Date();
    const toRemove = [];

    for (const [key, connection] of this.connections) {
      const age = now - connection.lastUsed;
      if (age > maxAge && connection.isActive) {
        toRemove.push({ key, type: connection.type, identifier: connection.identifier });
      }
    }

    toRemove.forEach(({ key, type, identifier }) => {
      this.closeConnection(type, identifier);
    });

    if (toRemove.length > 0) {
      logger.info(`Cleaned up ${toRemove.length} inactive connections`);
    }
  }

  // Получение статистики подключений
  getStats() {
    return {
      ...this.connectionStats,
      connections: Array.from(this.connections.entries()).map(([key, conn]) => ({
        key,
        type: conn.type,
        identifier: conn.identifier,
        host: conn.config.host,
        createdAt: conn.createdAt,
        lastUsed: conn.lastUsed,
        isActive: conn.isActive
      }))
    };
  }

  // Закрытие всех подключений
  async closeAllConnections() {
    const promises = [];
    
    for (const [key, connection] of this.connections) {
      promises.push(this.closeConnection(connection.type, connection.identifier));
    }

    await Promise.all(promises);
    logger.info('All connections closed');
  }
}

module.exports = ConnectionService; 