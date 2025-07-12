#!/usr/bin/env node

/**
 * 🌐 API MANAGER (Legacy Compatibility)
 * Обратно совместимый API Manager для поддержки старых импортов
 */

const { createAPIManager } = require('../managers/APIManager.cjs');
const { createLogger } = require('../services/Logger.cjs');
const { createSecurity } = require('../services/Security.cjs');
const { createValidation } = require('../services/Validation.cjs');

// Создание экземпляра со стандартными сервисами
class APIManager {
  constructor() {
    this.logger = createLogger();
    this.security = createSecurity(this.logger);
    this.validation = createValidation(this.logger);
    this.manager = createAPIManager(this.logger, this.security, this.validation);
  }

  // Проксирование всех методов к основному менеджеру
  async handleAction(args) {
    return await this.manager.handleAction(args);
  }

  getStats() {
    return this.manager.getStats();
  }

  async cleanup() {
    return await this.manager.cleanup();
  }
}

module.exports = { APIManager }; 