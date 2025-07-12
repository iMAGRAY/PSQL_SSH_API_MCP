// 🏗️ SERVICE CONTAINER
// Управление зависимостями и инверсия контроля

const { PERFORMANCE_LIMITS } = require('../constants/index.cjs');
const logger = require('../logger/index.cjs');

class ServiceContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.initialized = false;
  }

  // Регистрация сервиса
  register(name, factory, singleton = false) {
    this.services.set(name, { factory, singleton });
    logger.debug(`Service registered: ${name}`);
  }

  // Получение сервиса с ленивой инициализацией
  get(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not found`);
    }

    // Singleton pattern
    if (service.singleton) {
      if (!this.singletons.has(name)) {
        this.singletons.set(name, service.factory(this));
      }
      return this.singletons.get(name);
    }

    // Factory pattern
    return service.factory(this);
  }

  // Проверка существования сервиса
  has(name) {
    return this.services.has(name);
  }

  // Инициализация всех сервисов
  async initialize() {
    if (this.initialized) return;

    logger.info('Initializing Service Container...');
    
    // Инициализация критических сервисов
    const criticalServices = ['config', 'logger', 'security', 'validation'];
    
    for (const serviceName of criticalServices) {
      if (this.has(serviceName)) {
        try {
          this.get(serviceName);
          logger.debug(`Service initialized: ${serviceName}`);
        } catch (error) {
          logger.error(`Failed to initialize service: ${serviceName}`, { error: error.message });
          throw error;
        }
      }
    }

    this.initialized = true;
    logger.info('Service Container initialized successfully');
  }

  // Получение всех зарегистрированных сервисов
  getRegisteredServices() {
    return Array.from(this.services.keys());
  }

  // Очистка контейнера
  clear() {
    this.services.clear();
    this.singletons.clear();
    this.initialized = false;
    logger.debug('Service Container cleared');
  }

  // Статистика использования
  getStats() {
    return {
      registered: this.services.size,
      singletons: this.singletons.size,
      initialized: this.initialized,
      services: this.getRegisteredServices()
    };
  }
}

// Глобальный экземпляр контейнера
const container = new ServiceContainer();

module.exports = container; 