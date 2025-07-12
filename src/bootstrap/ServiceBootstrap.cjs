#!/usr/bin/env node

/**
 * 🚀 SERVICE BOOTSTRAP
 * Service Layer инициализация и Dependency Injection контейнер
 */

class ServiceContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
  }

  // Регистрация сервиса
  register(name, factory, options = {}) {
    this.services.set(name, {
      factory,
      singleton: options.singleton || false,
      dependencies: options.dependencies || []
    });
  }

  // Получение сервиса
  get(name) {
    if (!this.services.has(name)) {
      throw new Error(`Service '${name}' not found`);
    }

    const service = this.services.get(name);
    
    // Если singleton и уже создан
    if (service.singleton && this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    // Создание экземпляра
    const dependencies = service.dependencies.map(dep => this.get(dep));
    const instance = service.factory(...dependencies);

    // Сохранение singleton
    if (service.singleton) {
      this.singletons.set(name, instance);
    }

    return instance;
  }

  // Проверка существования сервиса
  has(name) {
    return this.services.has(name);
  }

  // Получение статистики
  getStats() {
    return {
      registered: this.services.size,
      singletons: this.singletons.size,
      services: Array.from(this.services.keys())
    };
  }
}

class ServiceBootstrap {
  static container = null;
  static initialized = false;

  static async initialize() {
    if (this.initialized) {
      return this.container;
    }

    try {
      this.container = new ServiceContainer();
      
      // Регистрация базовых сервисов
      await this.registerBaseServices();
      
      // Регистрация менеджеров
      await this.registerManagers();
      
      this.initialized = true;
      
      console.log('✅ Service Layer initialized successfully');
      return this.container;
      
    } catch (error) {
      console.error('❌ Service Layer initialization failed:', error);
      throw error;
    }
  }

  static async registerBaseServices() {
    const { createLogger } = require('../services/Logger.cjs');
    const { createSecurity } = require('../services/Security.cjs');
    const { createValidation } = require('../services/Validation.cjs');

    // Logger (базовый сервис)
    this.container.register('logger', () => createLogger(), { singleton: true });

    // Security сервис
    this.container.register('security', (logger) => createSecurity(logger), { 
      singleton: true,
      dependencies: ['logger'] 
    });

    // Validation сервис
    this.container.register('validation', (logger) => createValidation(logger), { 
      singleton: true,
      dependencies: ['logger'] 
    });

    // Profile сервис
    const { createProfileService } = require('../services/ProfileService.cjs');
    this.container.register('profileService', (logger, security) => 
      createProfileService(logger, security), { 
      singleton: true,
      dependencies: ['logger', 'security'] 
    });
  }

  static async registerManagers() {
    const { createPostgreSQLManager } = require('../managers/PostgreSQLManager.cjs');
    const { createSSHManager } = require('../managers/SSHManager.cjs');
    const { createAPIManager } = require('../managers/APIManager.cjs');

    // PostgreSQL Manager
    this.container.register('postgresqlManager', 
      (logger, security, validation, profileService) => 
        createPostgreSQLManager(logger, security, validation, profileService), { 
      singleton: true,
      dependencies: ['logger', 'security', 'validation', 'profileService'] 
    });

    // SSH Manager
    this.container.register('sshManager', 
      (logger, security, validation, profileService) => 
        createSSHManager(logger, security, validation, profileService), { 
      singleton: true,
      dependencies: ['logger', 'security', 'validation', 'profileService'] 
    });

    // API Manager
    this.container.register('apiManager', 
      (logger, security, validation) => 
        createAPIManager(logger, security, validation), { 
      singleton: true,
      dependencies: ['logger', 'security', 'validation'] 
    });
  }

  static async cleanup() {
    if (!this.initialized) {
      return;
    }

    try {
      // Cleanup всех сервисов
      for (const [name, instance] of this.container.singletons) {
        if (instance && typeof instance.cleanup === 'function') {
          await instance.cleanup();
        }
      }

      this.container.services.clear();
      this.container.singletons.clear();
      this.container = null;
      this.initialized = false;
      
      console.log('✅ Service Layer cleanup completed');
      
    } catch (error) {
      console.error('❌ Service Layer cleanup failed:', error);
      throw error;
    }
  }

  static getStats() {
    if (!this.initialized) {
      return { error: 'Service Layer not initialized' };
    }

    return {
      initialized: this.initialized,
      ...this.container.getStats()
    };
  }
}

module.exports = ServiceBootstrap; 