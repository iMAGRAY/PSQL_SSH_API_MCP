#!/usr/bin/env node

/**
 * 📝 LOGGER SERVICE
 * Система логирования с уровнями и форматированием
 */

class Logger {
  constructor() {
    this.levels = {
      error: 0,
      warn: 1, 
      info: 2,
      debug: 3
    };
    
    this.currentLevel = this.levels.info;
    this.stats = {
      errors: 0,
      warnings: 0,
      infos: 0,
      debugs: 0
    };
  }

  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level];
    }
  }

  error(message, meta = {}) {
    this.stats.errors++;
    if (this.currentLevel >= this.levels.error) {
      console.error(`❌ [ERROR] ${new Date().toISOString()} - ${message}`, meta);
    }
  }

  warn(message, meta = {}) {
    this.stats.warnings++;
    if (this.currentLevel >= this.levels.warn) {
      console.warn(`⚠️  [WARN]  ${new Date().toISOString()} - ${message}`, meta);
    }
  }

  info(message, meta = {}) {
    this.stats.infos++;
    if (this.currentLevel >= this.levels.info) {
      console.info(`ℹ️  [INFO]  ${new Date().toISOString()} - ${message}`, meta);
    }
  }

  debug(message, meta = {}) {
    this.stats.debugs++;
    if (this.currentLevel >= this.levels.debug) {
      console.debug(`🐛 [DEBUG] ${new Date().toISOString()} - ${message}`, meta);
    }
  }

  getStats() {
    return { ...this.stats };
  }

  async cleanup() {
    // Логгер не требует cleanup
    return;
  }
}

function createLogger() {
  return new Logger();
}

module.exports = { createLogger, Logger }; 