// 🚀 SERVICE BOOTSTRAP
// Инициализация и регистрация всех сервисов

const container = require('../core/ServiceContainer.cjs');

// Импорт сервисов
const ConnectionService = require('../services/ConnectionService.cjs');
const QueryService = require('../services/QueryService.cjs');
const ProfileService = require('../services/ProfileService.cjs');

// Импорт менеджеров
const PostgreSQLManager = require('../managers/PostgreSQLManager.cjs');
const SSHManager = require('../managers/SSHManager.cjs');

class ServiceBootstrap {
  static async initialize() {
    // Регистрация базовых сервисов (singleton)
    container.register('config', () => require('../constants/index.cjs'), true);
    container.register('logger', () => require('../logger/index.cjs'), true);
    container.register('security', () => require('../security/index.cjs'), true);
    container.register('validation', () => require('../validation/index.cjs'), true);

    // Регистрация сервисов уровня приложения
    container.register('connectionService', (c) => new ConnectionService(), true);
    
    container.register('queryService', (c) => new QueryService(
      c.get('connectionService'),
      c.get('validation')
    ), true);
    
    container.register('profileService', (c) => new ProfileService(
      c.get('security'),
      c.get('validation')
    ), true);

    // Регистрация менеджеров (не singleton - новый экземпляр для каждого запроса)
    container.register('postgresqlManager', (c) => new PostgreSQLManager(c), false);
    container.register('sshManager', (c) => new SSHManager(c), false);

    // Инициализация контейнера
    await container.initialize();

    return container;
  }

  static getContainer() {
    return container;
  }

  static async cleanup() {
    // Закрытие всех подключений
    try {
      const connectionService = container.get('connectionService');
      await connectionService.closeAllConnections();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }

    // Очистка контейнера
    container.clear();
  }

  static getStats() {
    const stats = {
      container: container.getStats(),
      services: {}
    };

    try {
      // Статистика подключений
      if (container.has('connectionService')) {
        stats.services.connections = container.get('connectionService').getStats();
      }

      // Статистика запросов
      if (container.has('queryService')) {
        stats.services.queries = container.get('queryService').getStats();
      }

      // Статистика профилей
      if (container.has('profileService')) {
        stats.services.profiles = container.get('profileService').getStats();
      }
    } catch (error) {
      stats.error = error.message;
    }

    return stats;
  }
}

module.exports = ServiceBootstrap; 