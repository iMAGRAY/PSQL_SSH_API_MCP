#!/usr/bin/env node

/**
 * 🔐 SSH MANAGER
 * Управление SSH подключениями и командами с безопасностью
 */

const { Client } = require('ssh2');

// Класс для управления пулом SSH соединений
class ConnectionPool {
  constructor(maxConnections = 5, idleTimeout = 30000) {
    this.pool = new Map(); // profileName -> connections[]
    this.maxConnections = maxConnections;
    this.idleTimeout = idleTimeout;
    this.stats = {
      created: 0,
      reused: 0,
      expired: 0
    };
  }

  // Получение соединения из пула
  async getConnection(profile) {
    const key = `${profile.host}:${profile.port}:${profile.username}`;
    
    if (!this.pool.has(key)) {
      this.pool.set(key, []);
    }

    const connections = this.pool.get(key);
    
    // Поиск свободного соединения
    for (let i = 0; i < connections.length; i++) {
      const connData = connections[i];
      if (!connData.inUse && connData.conn._sock && !connData.conn._sock.destroyed) {
        connData.inUse = true;
        connData.lastUsed = Date.now();
        this.stats.reused++;
        return connData;
      }
    }

    // Создание нового соединения если лимит не достигнут
    if (connections.length < this.maxConnections) {
      const connData = await this.createConnection(profile);
      connData.inUse = true;
      connData.lastUsed = Date.now();
      connections.push(connData);
      this.stats.created++;
      return connData;
    }

    // Ждём освобождения соединения
    throw new Error('Connection pool exhausted');
  }

  // Создание нового соединения
  async createConnection(profile) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let timeoutId = null;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };
      
      timeoutId = setTimeout(() => {
        cleanup();
        conn.end();
        reject(new Error('Connection timeout'));
      }, 10000);

      conn.on('ready', () => {
        cleanup();
        resolve({
          conn,
          inUse: false,
          lastUsed: Date.now(),
          created: Date.now()
        });
      });

      conn.on('error', (err) => {
        cleanup();
        reject(err);
      });

      conn.connect({
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password: profile.password,
        readyTimeout: 10000
      });
    });
  }

  // Освобождение соединения
  releaseConnection(profile, connData) {
    connData.inUse = false;
    connData.lastUsed = Date.now();
  }

  // Очистка устаревших соединений
  cleanupExpiredConnections() {
    const now = Date.now();
    
    for (const [key, connections] of this.pool) {
      for (let i = connections.length - 1; i >= 0; i--) {
        const connData = connections[i];
        
        if (!connData.inUse && (now - connData.lastUsed) > this.idleTimeout) {
          try {
            connData.conn.end();
            connections.splice(i, 1);
            this.stats.expired++;
          } catch (error) {
            // Игнорируем ошибки при закрытии
          }
        }
      }
      
      // Удаляем пустые пулы
      if (connections.length === 0) {
        this.pool.delete(key);
      }
    }
  }

  // Полная очистка пула
  async cleanup() {
    for (const [key, connections] of this.pool) {
      for (const connData of connections) {
        try {
          connData.conn.end();
        } catch (error) {
          // Игнорируем ошибки при закрытии
        }
      }
    }
    this.pool.clear();
  }

  // Статистика пула
  getStats() {
    let totalConnections = 0;
    let activeConnections = 0;
    
    for (const connections of this.pool.values()) {
      totalConnections += connections.length;
      activeConnections += connections.filter(c => c.inUse).length;
    }
    
    return {
      ...this.stats,
      totalConnections,
      activeConnections,
      poolSize: this.pool.size
    };
  }
}

class SSHManager {
  constructor(logger, security, validation, profileService) {
    this.logger = logger;
    this.security = security;
    this.validation = validation;
    this.profileService = profileService;
    this.connectionPool = new ConnectionPool();
    this.stats = {
      commands: 0,
      connections: 0,
      errors: 0,
      profiles_created: 0
    };

    // Автоматическая очистка каждые 5 минут
    this.cleanupInterval = setInterval(() => {
      this.connectionPool.cleanupExpiredConnections();
    }, 5 * 60 * 1000);
  }

  // Обработка всех действий SSH
  async handleAction(args) {
    const { action, profile_name = 'default', ...params } = args;
    
    try {
      this.logger.info('SSH action requested', { action, profile_name });
      
      switch (action) {
        case 'setup_profile':
          return await this.setupProfile(profile_name, params);
        case 'list_profiles':
          return await this.listProfiles();
        case 'execute':
          return await this.executeCommand(profile_name, params.command);
        case 'system_info':
          return await this.getSystemInfo(profile_name);
        case 'check_host':
          return await this.checkHost(profile_name);
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      this.stats.errors++;
      this.logger.error('SSH action failed', { 
        action, 
        profile_name, 
        error: error.message 
      });
      throw error;
    }
  }

  // Настройка профиля подключения
  async setupProfile(profileName, params) {
    try {
      const { host, port = 22, username, password } = params;
      
      if (!host || !username || !password) {
        throw new Error('Missing required parameters: host, username, password');
      }

      const profile = {
        host,
        port: parseInt(port),
        username,
        password,
        type: 'ssh'
      };

      // Валидация профиля
      const validation = this.validation.validateConnectionProfile(profile);
      if (!validation.valid) {
        throw new Error(`Profile validation failed: ${validation.errors.join(', ')}`);
      }

      // Тестирование подключения
      await this.testConnection(profile);

      // Сохранение профиля
      await this.profileService.setProfile(profileName, profile);
      
      this.stats.profiles_created++;
      this.logger.info('SSH profile created', { profileName, host });
      
      return {
        success: true,
        message: `SSH profile '${profileName}' created successfully`,
        profile: { profileName, host, port, username }
      };
      
    } catch (error) {
      this.logger.error('Failed to setup SSH profile', { 
        profileName, 
        error: error.message 
      });
      throw error;
    }
  }

  // Список профилей
  async listProfiles() {
    try {
      const profiles = await this.profileService.listProfiles();
      const sshProfiles = profiles.filter(p => p.type === 'ssh');
      
      this.logger.debug('SSH profiles listed', { count: sshProfiles.length });
      
      return {
        success: true,
        profiles: sshProfiles
      };
      
    } catch (error) {
      this.logger.error('Failed to list SSH profiles', { error: error.message });
      throw error;
    }
  }

  // Тестирование подключения
  async testConnection(profile) {
    try {
      const connData = await this.connectionPool.getConnection(profile);
      
      // Простая проверка команды
      return new Promise((resolve, reject) => {
        connData.conn.exec('echo "test"', (err, stream) => {
          if (err) {
            this.connectionPool.releaseConnection(profile, connData);
            reject(err);
            return;
          }
          
          stream.on('close', () => {
            this.connectionPool.releaseConnection(profile, connData);
            resolve();
          });
          
          stream.on('error', (err) => {
            this.connectionPool.releaseConnection(profile, connData);
            reject(err);
          });
          
          stream.on('data', () => {
            // Данные получены, тест успешен
          });
        });
      });
    } catch (error) {
      // Fallback на прямое соединение если пул недоступен
      return this.testConnectionDirect(profile);
    }
  }

  // Прямое тестирование подключения (fallback)
  async testConnectionDirect(profile) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let timeoutId = null;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        conn.end();
      };
      
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Connection timeout'));
      }, 10000);

      conn.on('ready', () => {
        // Простая проверка команды
        conn.exec('echo "test"', (err, stream) => {
          if (err) {
            cleanup();
            reject(err);
            return;
          }
          
          stream.on('close', () => {
            cleanup();
            resolve();
          });
          
          stream.on('error', (err) => {
            cleanup();
            reject(err);
          });
          
          stream.on('data', () => {
            // Данные получены, тест успешен
          });
        });
      });

      conn.on('error', (err) => {
        cleanup();
        reject(err);
      });

      conn.connect({
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password: profile.password,
        readyTimeout: 10000
      });
    });
  }

  // Выполнение команды
  async executeCommand(profileName, command) {
    try {
      if (!command || typeof command !== 'string') {
        throw new Error('Command is required');
      }

      // Валидация команды
      const validation = this.validation.validateSshCommand(command);
      if (!validation.valid) {
        throw new Error(`Command validation failed: ${validation.errors.join(', ')}`);
      }

      // Санитизация команды
      const sanitizedCommand = this.security.sanitizeCommand(command);
      
      const profile = await this.profileService.getProfile(profileName);
      const result = await this.runCommand(profile, sanitizedCommand);
      
      this.stats.commands++;
      this.logger.info('SSH command executed', { 
        profileName, 
        command: sanitizedCommand.substring(0, 50) 
      });
      
      return {
        success: true,
        command: sanitizedCommand,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode
      };
      
    } catch (error) {
      this.logger.error('SSH command failed', { 
        profileName, 
        command: command?.substring(0, 50), 
        error: error.message 
      });
      throw error;
    }
  }

  // Выполнение команды через SSH с пулом соединений
  async runCommand(profile, command) {
    try {
      const connData = await this.connectionPool.getConnection(profile);
      
      return new Promise((resolve, reject) => {
        connData.conn.exec(command, (err, stream) => {
          if (err) {
            this.connectionPool.releaseConnection(profile, connData);
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';
          let exitCode = null;

          stream.on('close', (code) => {
            this.connectionPool.releaseConnection(profile, connData);
            exitCode = code;
            
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode
            });
          });

          stream.on('error', (err) => {
            this.connectionPool.releaseConnection(profile, connData);
            reject(err);
          });

          stream.on('data', (data) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data) => {
            stderr += data.toString();
          });
        });
      });
    } catch (error) {
      // Fallback на прямое соединение если пул недоступен
      return this.runCommandDirect(profile, command);
    }
  }

  // Прямое выполнение команды (fallback)
  async runCommandDirect(profile, command) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let timeoutId = null;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        conn.end();
      };
      
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Command execution timeout'));
      }, 30000);

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            cleanup();
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';
          let exitCode = null;

          stream.on('close', (code) => {
            cleanup();
            exitCode = code;
            
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode
            });
          });

          stream.on('error', (err) => {
            cleanup();
            reject(err);
          });

          stream.on('data', (data) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data) => {
            stderr += data.toString();
          });
        });
      });

      conn.on('error', (err) => {
        cleanup();
        reject(err);
      });

      conn.connect({
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password: profile.password,
        readyTimeout: 10000
      });
    });
  }

  // Получение системной информации
  async getSystemInfo(profileName) {
    const commands = [
      'uname -a',
      'cat /etc/os-release 2>/dev/null || echo "OS info not available"',
      'df -h',
      'free -h',
      'uptime',
      'whoami',
      'pwd'
    ];

    try {
      const profile = await this.profileService.getProfile(profileName);
      const results = {};

      for (const command of commands) {
        try {
          const result = await this.runCommand(profile, command);
          const key = command.split(' ')[0];
          results[key] = {
            command,
            output: result.stdout,
            error: result.stderr,
            exitCode: result.exitCode
          };
        } catch (error) {
          results[command.split(' ')[0]] = {
            command,
            error: error.message,
            exitCode: -1
          };
        }
      }

      this.stats.commands += commands.length;
      this.logger.info('SSH system info gathered', { profileName });
      
      return {
        success: true,
        system_info: results
      };
      
    } catch (error) {
      this.logger.error('Failed to get system info', { 
        profileName, 
        error: error.message 
      });
      throw error;
    }
  }

  // Проверка хоста
  async checkHost(profileName) {
    try {
      const profile = await this.profileService.getProfile(profileName);
      
      // Проверка подключения
      await this.testConnection(profile);
      
      // Получение базовой информации
      const result = await this.runCommand(profile, 'echo "Connection OK"; date; hostname');
      
      this.logger.info('SSH host check completed', { profileName });
      
      return {
        success: true,
        host: profile.host,
        port: profile.port,
        username: profile.username,
        connection_status: 'OK',
        server_response: result.stdout
      };
      
    } catch (error) {
      this.logger.error('SSH host check failed', { 
        profileName, 
        error: error.message 
      });
      
      return {
        success: false,
        host: profile?.host || 'unknown',
        connection_status: 'FAILED',
        error: error.message
      };
    }
  }

  // Получение статистики
  getStats() {
    return {
      ...this.stats,
      active_connections: this.connectionPool.getStats().activeConnections
    };
  }

  // Очистка ресурсов
  async cleanup() {
    try {
      // Очистка интервала автоматической очистки
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }
      
      // Закрытие всех подключений
      await this.connectionPool.cleanup();
      this.logger.info('SSH manager cleaned up');
      
    } catch (error) {
      this.logger.error('Failed to cleanup SSH manager', { error: error.message });
      throw error;
    }
  }
}

function createSSHManager(logger, security, validation, profileService) {
  return new SSHManager(logger, security, validation, profileService);
}

module.exports = { createSSHManager, SSHManager }; 