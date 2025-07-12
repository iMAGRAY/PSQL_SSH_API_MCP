// 🔐 SSH МОДУЛЬ
// Безопасные SSH операции с защитой от command injection

const { TIMEOUTS, DEFAULTS, ACTIONS, AI_HINTS } = require('../constants/index.cjs');
const Constants = require('../constants/Constants.cjs');
const securityManager = require('../security/index.cjs');
const logger = require('../logger/index.cjs');

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

    return new this.Client();
  }

  // Настройка профиля подключения
  async setupProfile(args) {
    const { profile_name = 'default', host, port, username, password } = args;

    // Валидация входных данных
    if (!host || !username || !password) {
      throw new Error('host, username и password обязательны');
    }

    const config = {
      host,
      port: port || DEFAULTS.SSH_PORT,
      username,
      password
    };

    // Проверки безопасности
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
        created_at: p.created_at,
        last_used: p.last_used
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
      /\|\s*shutdown\s+/gi,   // Выключение
      /\|\s*reboot\s+/gi,     // Перезагрузка
      /sudo\s+/gi,            // Sudo команды
      /su\s+/gi,              // Смена пользователя
      /chmod\s+[0-9]{3,4}/gi, // Изменение прав
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
    if (command.length > Constants.LIMITS.MAX_SQL_COMMAND_LENGTH) {
      throw new Error(`Команда слишком длинная (максимум ${Constants.LIMITS.MAX_SQL_COMMAND_LENGTH} символов)`);
    }

    return command.trim();
  }

  // Выполнение команды
  async execute(args) {
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
                resolve({
                  command: sanitizedCommand,
                  output: stdout,
                  error: stderr,
                  exit_code: code,
                  success: code === 0,
                  ai_hint: code === 0 ? "Команда выполнена успешно" : "Команда завершилась с ошибкой"
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

      return result;
    } catch (error) {
      logger.error('SSH command execution failed', { command: sanitizedCommand, error: error.message });
      throw error;
    }
  }

  // Получение информации о системе
  async systemInfo(args) {
    const { profile_name = 'default' } = args;
    
    const commands = [
      'uname -a',
      'uptime',
      'df -h',
      'free -h',
      'ps aux | head -10'
    ];

    const profile = securityManager.getProfile('ssh', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const conn = this.createConnection(profile.config);
    
    try {
      const systemInfo = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          conn.end();
          reject(new Error('Таймаут получения информации о системе'));
        }, TIMEOUTS.SSH_CONNECT);

        conn.on('ready', async () => {
          clearTimeout(timeout);
          const results = {};
          
          for (const cmd of commands) {
            try {
              const cmdResult = await new Promise((cmdResolve, cmdReject) => {
                conn.exec(cmd, (err, stream) => {
                  if (err) {
                    cmdReject(err);
                    return;
                  }
                  
                  let output = '';
                  stream.on('data', (data) => {
                    output += data.toString();
                  });
                  
                  stream.on('close', () => {
                    cmdResolve(output.trim());
                  });
                });
              });
              results[cmd] = cmdResult;
            } catch (error) {
              results[cmd] = `Ошибка: ${error.message}`;
            }
          }
          
          conn.end();
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
      logger.error('SSH system info failed', { error: error.message });
      throw error;
    }
  }

  // Проверка доступности хоста
  async checkHost(args) {
    const { profile_name = 'default' } = args;
    
    const profile = securityManager.getProfile('ssh', profile_name);
    if (!profile) {
      throw new Error(`Профиль '${profile_name}' не найден`);
    }

    const conn = this.createConnection(profile.config);
    
    try {
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          conn.end();
          reject(new Error('Таймаут проверки хоста'));
        }, TIMEOUTS.TEST_CONNECTION);

        conn.on('ready', () => {
          clearTimeout(timeout);
          conn.end();
          resolve({
            host: profile.config.host,
            port: profile.config.port,
            status: 'available',
            ai_hint: 'Хост доступен для подключения'
          });
        });

        conn.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        conn.connect(profile.config);
      });

      return result;
    } catch (error) {
      return {
        host: profile.config.host,
        port: profile.config.port,
        status: 'unavailable',
        error: error.message,
        ai_hint: 'Хост недоступен'
      };
    }
  }

  // Обработка действий
  async handleAction(args) {
    const { action } = args;
    
    switch (action) {
      case ACTIONS.SSH.SETUP_PROFILE:
        return await this.setupProfile(args);
      case ACTIONS.SSH.LIST_PROFILES:
        return await this.listProfiles(args);
      case ACTIONS.SSH.EXECUTE:
        return await this.execute(args);
      case ACTIONS.SSH.SYSTEM_INFO:
        return await this.systemInfo(args);
      case ACTIONS.SSH.CHECK_HOST:
        return await this.checkHost(args);
      default:
        throw new Error(`Неизвестное действие SSH: ${action}`);
    }
  }
}

module.exports = SSHManager; 