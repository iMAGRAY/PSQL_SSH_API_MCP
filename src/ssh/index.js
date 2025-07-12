// 🔐 SSH МОДУЛЬ
// Безопасные SSH операции с защитой от command injection

import { TIMEOUTS, DEFAULTS, ACTIONS, AI_HINTS } from '../constants/index.js';
import { Validator } from '../validation/index.js';
import { ErrorHandler } from '../errors/index.js';
import securityManager from '../security/index.js';
import logger from '../logger/index.js';

class SSHManager {
  constructor() {
    this.Client = null;
    this.loadDependencies();
  }

  // Загрузка зависимостей
  loadDependencies() {
    try {
      const { Client } = require('ssh2');
      this.Client = Client;
      logger.info('SSH dependencies loaded');
    } catch (error) {
      logger.error('SSH dependencies not found', { error: error.message });
      throw new Error('SSH модуль не найден. Установите: npm install ssh2');
    }
  }

  // Создание безопасного подключения
  createConnection(config) {
    if (!this.Client) {
      throw new Error('SSH клиент не загружен');
    }

    // Валидация конфигурации
    Validator.validateSSHConnection(config);

    return new this.Client();
  }

  // Настройка профиля подключения
  async setupProfile(args) {
    const { profile_name = 'default', host, port, username, password } = args;

    // Валидация входных данных
    const config = {
      host: Validator.sanitizeInput(host),
      port: port || DEFAULTS.SSH_PORT,
      username: Validator.sanitizeInput(username),
      password: password
    };

    // Дополнительные проверки безопасности
    securityManager.validatePassword(password);
    securityManager.validateHost(host);

    // Тестирование подключения
    const conn = this.createConnection(config);
    
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          conn.end();
          reject(new Error('Таймаут подключения'));
        }, TIMEOUTS.TEST_CONNECTION);

        conn.on('ready', () => {
          clearTimeout(timeout);
          conn.end();
          resolve();
        });

        conn.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        conn.connect(config);
      });

      logger.connection('ssh', 'test-success', { host, username });
    } catch (error) {
      logger.connection('ssh', 'test-failed', { host, username, error: error.message });
      throw error;
    }

    // Сохранение профиля
    securityManager.saveProfile('ssh', profile_name, config);

    return {
      message: `Профиль SSH '${profile_name}' успешно создан и протестирован`,
      profile_name,
      host: config.host,
      port: config.port,
      ai_hint: AI_HINTS.SETUP_COMPLETE
    };
  }

  // Получение списка профилей
  async listProfiles() {
    const profiles = securityManager.getProfilesByType('ssh');
    
    return {
      profiles: profiles.map(p => ({
        name: p.name,
        host: p.host,
        port: p.port,
        created_at: p.createdAt,
        last_used: p.lastUsed
      })),
      count: profiles.length,
      ai_hint: "Список сохраненных профилей SSH"
    };
  }

  // Санитизация команды для предотвращения injection
  sanitizeCommand(command) {
    if (!command || typeof command !== 'string') {
      throw new Error('Команда обязательна и должна быть строкой');
    }

    // Проверяем на опасные символы и команды
    const dangerousPatterns = [
      /[;&|`$()]/g,           // Опасные символы
      /\|\s*rm\s+/gi,         // Удаление файлов
      /\|\s*dd\s+/gi,         // Перезапись дисков
      /\|\s*mkfs\s+/gi,       // Форматирование
      /\|\s*fdisk\s+/gi,      // Работа с дисками
      /\|\s*shutdown\s+/gi,   // Выключение
      /\|\s*reboot\s+/gi,     // Перезагрузка
      /\|\s*halt\s+/gi,       // Остановка
      /\|\s*init\s+/gi,       // Изменение уровня запуска
      /\|\s*killall\s+/gi,    // Убийство процессов
      /\/etc\/passwd/gi,      // Изменение паролей
      /\/etc\/shadow/gi,      // Теневые пароли
      /sudo\s+/gi,            // Sudo команды
      /su\s+/gi,              // Смена пользователя
      /chmod\s+[0-9]{3,4}/gi, // Изменение прав
      /chown\s+/gi,           // Изменение владельца
      /crontab\s+/gi,         // Планировщик задач
      /systemctl\s+/gi,       // Управление сервисами
      /service\s+/gi,         // Управление сервисами
      /iptables\s+/gi,        // Настройка фаервола
      /mount\s+/gi,           // Монтирование
      /umount\s+/gi           // Размонтирование
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        logger.security('Dangerous SSH command detected', { command });
        throw new Error('Команда содержит потенциально опасные операции');
      }
    }

    // Ограничиваем длину команды
    if (command.length > 1000) {
      throw new Error('Команда слишком длинная (максимум 1000 символов)');
    }

    return command.trim();
  }

  // Выполнение команды
  async executeCommand(args) {
    const { command, profile_name = 'default' } = args;
    
    // Санитизация команды
    const sanitizedCommand = this.sanitizeCommand(command);
    
    // Получение профиля
    const profile = securityManager.getProfile('ssh', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const conn = this.createConnection(profile.config);
    
    try {
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          conn.end();
          reject(new Error('Таймаут выполнения команды'));
        }, TIMEOUTS.SSH_CONNECT);

        conn.on('ready', () => {
          clearTimeout(timeout);
          logger.connection('ssh', 'connected', { profile: profile_name });
          
          conn.exec(sanitizedCommand, (err, stream) => {
            if (err) {
              conn.end();
              reject(err);
              return;
            }
            
            let stdout = '';
            let stderr = '';
            
            stream
              .on('close', (code, signal) => {
                conn.end();
                logger.connection('ssh', 'disconnected', { profile: profile_name });
                
                resolve({
                  command: sanitizedCommand,
                  output: stdout,
                  error: stderr,
                  exit_code: code,
                  success: code === 0,
                  ai_hint: code === 0 ? AI_HINTS.QUERY_SUCCESS : 'Команда завершилась с ошибкой'
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
        
        conn.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        
        conn.connect(profile.config);
      });

      logger.info('SSH command executed', { 
        profile: profile_name, 
        command: sanitizedCommand,
        success: result.success
      });

      return result;
    } catch (error) {
      logger.error('SSH command failed', { 
        profile: profile_name, 
        command: sanitizedCommand,
        error: error.message 
      });
      throw error;
    }
  }

  // Информация о системе
  async getSystemInfo(args) {
    const { profile_name = 'default' } = args;
    
    // Получение профиля
    const profile = securityManager.getProfile('ssh', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    // Безопасные команды для получения информации о системе
    const safeCommands = [
      'uname -a',
      'uptime',
      'df -h',
      'free -h',
      'ps aux | head -10',
      'whoami',
      'pwd',
      'id',
      'date'
    ];

    const conn = this.createConnection(profile.config);
    
    try {
      const systemInfo = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          conn.end();
          reject(new Error('Таймаут получения информации о системе'));
        }, TIMEOUTS.SSH_CONNECT);

        conn.on('ready', async () => {
          clearTimeout(timeout);
          logger.connection('ssh', 'connected', { profile: profile_name });
          
          const results = {};
          
          for (const cmd of safeCommands) {
            try {
              const cmdResult = await new Promise((cmdResolve, cmdReject) => {
                conn.exec(cmd, (err, stream) => {
                  if (err) {
                    cmdReject(err);
                    return;
                  }
                  
                  let output = '';
                  let hasError = false;
                  
                  stream
                    .on('data', (data) => {
                      output += data.toString();
                    })
                    .stderr.on('data', (data) => {
                      hasError = true;
                      output += `[ERROR] ${data.toString()}`;
                    })
                    .on('close', () => {
                      cmdResolve(hasError ? `Ошибка: ${output}` : output.trim());
                    });
                });
              });
              
              results[cmd] = cmdResult;
            } catch (error) {
              results[cmd] = `Ошибка: ${error.message}`;
            }
          }
          
          conn.end();
          logger.connection('ssh', 'disconnected', { profile: profile_name });
          resolve(results);
        });
        
        conn.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        
        conn.connect(profile.config);
      });

      return {
        system_info: systemInfo,
        ai_hint: "Информация о системе получена"
      };
    } catch (error) {
      logger.error('SSH system info failed', { 
        profile: profile_name,
        error: error.message 
      });
      throw error;
    }
  }

  // Проверка доступности хоста
  async checkHost(args) {
    const { host, port = DEFAULTS.SSH_PORT } = args;
    
    // Валидация хоста
    securityManager.validateHost(host);
    
    const conn = this.createConnection({ host, port, username: 'test', password: 'test' });
    
    try {
      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          conn.end();
          resolve({
            host,
            port,
            accessible: false,
            error: 'Таймаут подключения',
            ai_hint: 'Хост недоступен или не отвечает'
          });
        }, TIMEOUTS.TEST_CONNECTION);

        conn.on('ready', () => {
          clearTimeout(timeout);
          conn.end();
          resolve({
            host,
            port,
            accessible: true,
            ai_hint: 'Хост доступен для SSH подключений'
          });
        });

        conn.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            host,
            port,
            accessible: false,
            error: error.message,
            ai_hint: 'Хост недоступен или произошла ошибка подключения'
          });
        });

        conn.connect({ host, port, username: 'test', password: 'test' });
      });

      return result;
    } catch (error) {
      return {
        host,
        port,
        accessible: false,
        error: error.message,
        ai_hint: 'Ошибка при проверке доступности хоста'
      };
    }
  }

  // Обработка действий
  async handleAction(args) {
    const { action, ...actionArgs } = args;
    
    // Валидация действия
    Validator.validateSSHAction(action);
    
    const context = {
      operation: 'ssh',
      action,
      profile_name: actionArgs.profile_name,
      command: actionArgs.command,
      host: actionArgs.host
    };

    try {
      switch (action) {
        case ACTIONS.SSH.SETUP_PROFILE:
          return await this.setupProfile(actionArgs);
        
        case ACTIONS.SSH.LIST_PROFILES:
          return await this.listProfiles(actionArgs);
        
        case ACTIONS.SSH.EXECUTE:
          return await this.executeCommand(actionArgs);
        
        case ACTIONS.SSH.SYSTEM_INFO:
          return await this.getSystemInfo(actionArgs);
        
        default:
          throw new Error(`Неизвестное действие: ${action}`);
      }
    } catch (error) {
      throw error; // Пробрасываем ошибку для обработки в ErrorHandler
    }
  }
}

// Создаем экземпляр менеджера
const sshManager = new SSHManager();

export default sshManager; 