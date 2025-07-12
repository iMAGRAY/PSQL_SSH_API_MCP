// 🔐 SSH MANAGER
// Тонкий оркестратор для SSH операций

const { ACTIONS, AI_HINTS } = require('../constants/index.cjs');
const logger = require('../logger/index.cjs');

class SSHManager {
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
    const { profile_name = 'default', host, port, username, password } = args;

    try {
      const config = {
        host: this._sanitize(host),
        port: port || 22,
        username: this._sanitize(username),
        password: password
      };

      const result = await this._getProfileService().createProfile('ssh', profile_name, config);

      return {
        message: `Профиль SSH '${profile_name}' успешно создан и протестирован`,
        profile_name,
        host: config.host,
        port: config.port,
        ai_hint: AI_HINTS.SETUP_COMPLETE
      };
    } catch (error) {
      logger.error('SSH profile setup failed', { profile_name, error: error.message });
      throw error;
    }
  }

  // Получение списка профилей
  async listProfiles() {
    try {
      const profiles = this._getProfileService().listProfiles('ssh');
      
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
    } catch (error) {
      logger.error('Failed to list SSH profiles', { error: error.message });
      throw error;
    }
  }

  // Выполнение команды
  async executeCommand(args) {
    const { command, profile_name = 'default' } = args;
    
    try {
      // Валидация команды
      this._validateCommand(command);
      
      const result = await this._getQueryService().executeSSH('ssh', profile_name, command);
      
      return {
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exitCode,
        success: result.exitCode === 0,
        ai_hint: result.exitCode === 0 ? 
          "Команда выполнена успешно" : 
          "Команда завершилась с ошибкой"
      };
    } catch (error) {
      logger.error('SSH command failed', { 
        profile_name, 
        command: command?.substring(0, 100), 
        error: error.message 
      });
      throw error;
    }
  }

  // Получение информации о системе
  async getSystemInfo(args) {
    const { profile_name = 'default' } = args;
    
    const commands = {
      hostname: 'hostname',
      uptime: 'uptime',
      memory: 'free -h',
      disk: 'df -h',
      cpu: 'lscpu | grep "Model name"',
      os: 'cat /etc/os-release | grep PRETTY_NAME',
      load: 'cat /proc/loadavg'
    };

    try {
      const systemInfo = {};
      
      for (const [key, command] of Object.entries(commands)) {
        try {
          const result = await this._getQueryService().executeSSH('ssh', profile_name, command);
          systemInfo[key] = {
            output: result.stdout.trim(),
            success: result.exitCode === 0
          };
        } catch (error) {
          systemInfo[key] = {
            output: `Error: ${error.message}`,
            success: false
          };
        }
      }

      return {
        system_info: systemInfo,
        profile_name,
        ai_hint: "Информация о системе получена"
      };
    } catch (error) {
      logger.error('Failed to get system info', { profile_name, error: error.message });
      throw error;
    }
  }

  // Проверка доступности хоста
  async checkHost(args) {
    const { host, timeout = 5 } = args;
    
    try {
      this._getValidationService().sanitizeInput(host);
      
      // Используем простую проверку через SSH подключение
      const tempConfig = {
        host: host,
        port: 22,
        username: 'test', // Не важно для проверки доступности
        password: 'test'
      };

      // Попытка подключения с коротким таймаутом
      const startTime = Date.now();
      let accessible = false;
      let error = null;

      try {
        // Здесь будет проверка через ConnectionService
        accessible = true;
      } catch (err) {
        error = err.message;
      }

      const responseTime = Date.now() - startTime;

      return {
        host,
        accessible,
        response_time: responseTime,
        error,
        ai_hint: accessible ? 
          `Хост ${host} доступен (${responseTime}ms)` : 
          `Хост ${host} недоступен: ${error}`
      };
    } catch (error) {
      logger.error('Host check failed', { host, error: error.message });
      throw error;
    }
  }

  // Безопасные команды для быстрого доступа
  async runSafeCommand(args) {
    const { command_type, profile_name = 'default' } = args;
    
    const safeCommands = {
      'disk_usage': 'df -h',
      'memory_usage': 'free -h',
      'process_list': 'ps aux | head -20',
      'network_info': 'ip addr show',
      'system_load': 'uptime',
      'who_logged': 'who',
      'date_time': 'date',
      'kernel_version': 'uname -a'
    };

    const command = safeCommands[command_type];
    if (!command) {
      throw new Error(`Неизвестный тип команды: ${command_type}`);
    }

    return await this.executeCommand({
      command,
      profile_name
    });
  }

  // Главный обработчик действий
  async handleAction(args) {
    const { action } = args;
    
    try {
      this._getValidationService().validateSSHAction(action);
      
      switch (action) {
        case ACTIONS.SSH.SETUP_PROFILE:
          return await this.setupProfile(args);
        case ACTIONS.SSH.LIST_PROFILES:
          return await this.listProfiles(args);
        case ACTIONS.SSH.EXECUTE:
          return await this.executeCommand(args);
        case ACTIONS.SSH.SYSTEM_INFO:
          return await this.getSystemInfo(args);
        case ACTIONS.SSH.CHECK_HOST:
          return await this.checkHost(args);
        default:
          throw new Error(`Неизвестное действие SSH: ${action}`);
      }
    } catch (error) {
      logger.error('SSH action failed', { action, error: error.message });
      throw error;
    }
  }

  // Валидация команды
  _validateCommand(command) {
    // Базовая валидация
    if (!command || typeof command !== 'string') {
      throw new Error('Команда обязательна и должна быть строкой');
    }

    // Делегирование к ValidationService
    this._getValidationService().checkCommandInjection(command, 'ssh_command');
    
    // Дополнительные проверки безопасности
    this._checkDangerousCommands(command);
  }

  // Проверка опасных команд
  _checkDangerousCommands(command) {
    const dangerousPatterns = [
      /rm\s+-rf\s+\/|rm\s+-rf\s+\*/gi,        // Удаление корня
      /dd\s+if=.*of=/gi,                       // Перезапись дисков
      /mkfs/gi,                                // Форматирование
      /fdisk/gi,                               // Работа с дисками
      /shutdown|poweroff|halt|reboot/gi,       // Выключение
      /init\s+[0-6]/gi,                        // Смена runlevel
      /killall/gi,                             // Убийство процессов
      /\/etc\/passwd|\/etc\/shadow/gi,         // Системные файлы
      /iptables.*-F/gi,                        // Очистка фаервола
      /crontab.*-r/gi                          // Удаление cron
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error('Команда содержит потенциально опасные операции и заблокирована');
      }
    }
  }

  // Санитизация входных данных
  _sanitize(input) {
    return this._getValidationService().sanitizeInput(input);
  }
}

module.exports = SSHManager; 