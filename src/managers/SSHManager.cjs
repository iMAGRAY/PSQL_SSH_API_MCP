#!/usr/bin/env node

/**
 * 🔐 SSH MANAGER
 * Управление SSH подключениями и командами с безопасностью
 */

const { Client } = require('ssh2');

class SSHManager {
  constructor(logger, security, validation, profileService) {
    this.logger = logger;
    this.security = security;
    this.validation = validation;
    this.profileService = profileService;
    this.connections = new Map();
    this.stats = {
      commands: 0,
      connections: 0,
      errors: 0,
      profiles_created: 0
    };
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
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('Connection timeout'));
      }, 10000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        
        // Простая проверка команды
        conn.exec('echo "test"', (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }
          
          stream.on('close', () => {
            conn.end();
            resolve();
          });
          
          stream.on('data', () => {
            // Данные получены, тест успешен
          });
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
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

  // Выполнение команды через SSH
  async runCommand(profile, command) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('Command execution timeout'));
      }, 30000);

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';
          let exitCode = null;

          stream.on('close', (code) => {
            clearTimeout(timeout);
            conn.end();
            exitCode = code;
            
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode
            });
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
        clearTimeout(timeout);
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
      active_connections: this.connections.size
    };
  }

  // Очистка ресурсов
  async cleanup() {
    try {
      // Закрытие всех подключений
      for (const [profileName, connection] of this.connections) {
        try {
          connection.end();
          this.logger.debug('SSH connection closed', { profileName });
        } catch (error) {
          this.logger.warn('Failed to close SSH connection', { 
            profileName, 
            error: error.message 
          });
        }
      }
      
      this.connections.clear();
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