#!/usr/bin/env node

/**
 * 📝 LOGGER SERVICE
 * Система асинхронного логирования с буферизацией и ротацией
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

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
      debugs: 0,
      buffer_size: 0,
      writes: 0
    };
    
    // Асинхронная буферизация
    this.buffer = [];
    this.bufferSize = 100; // Размер буфера
    this.flushInterval = 5000; // Интервал сброса буфера (5 сек)
    this.maxLogSize = 10 * 1024 * 1024; // Максимальный размер лог-файла (10MB)
    
    // Настройки файлов
    this.logDir = process.env.LOG_DIR || './logs';
    this.logFile = path.join(this.logDir, 'app.log');
    this.errorFile = path.join(this.logDir, 'error.log');
    
    // Создание директории логов
    this.ensureLogDir();
    
    // Автоматический сброс буфера
    this.flushTimer = setInterval(() => {
      this.flushBuffer();
    }, this.flushInterval);
    
    // Graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level];
    }
  }

  // Асинхронная запись в буфер
  async writeLog(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      meta,
      pid: process.pid
    };
    
    this.buffer.push(logEntry);
    this.stats.buffer_size = this.buffer.length;
    
    // Принудительный сброс при заполнении буфера
    if (this.buffer.length >= this.bufferSize) {
      setImmediate(() => this.flushBuffer());
    }
    
    return logEntry;
  }

  // Сброс буфера в файл
  async flushBuffer() {
    if (this.buffer.length === 0) return;
    
    const entries = this.buffer.slice();
    this.buffer.length = 0;
    this.stats.buffer_size = 0;
    
    try {
      // Группировка по уровням
      const regularLogs = [];
      const errorLogs = [];
      
      for (const entry of entries) {
        const formatted = this.formatLogEntry(entry);
        
        if (entry.level === 'error') {
          errorLogs.push(formatted);
        }
        regularLogs.push(formatted);
      }
      
      // Асинхронная запись в файлы
      const writePromises = [];
      
      if (regularLogs.length > 0) {
        writePromises.push(this.writeToFile(this.logFile, regularLogs.join('\n') + '\n'));
      }
      
      if (errorLogs.length > 0) {
        writePromises.push(this.writeToFile(this.errorFile, errorLogs.join('\n') + '\n'));
      }
      
      await Promise.all(writePromises);
      this.stats.writes++;
      
    } catch (error) {
      console.error('Failed to flush log buffer:', error);
      // Возвращаем записи в буфер при ошибке
      this.buffer.unshift(...entries);
      this.stats.buffer_size = this.buffer.length;
    }
  }

  // Форматирование записи лога
  formatLogEntry(entry) {
    const icon = this.getLevelIcon(entry.level);
    const metaStr = Object.keys(entry.meta).length > 0 ? 
      ' | ' + util.inspect(entry.meta, { depth: 2, colors: false }) : '';
    
    return `${icon} [${entry.level.toUpperCase()}] ${entry.timestamp} [PID:${entry.pid}] - ${entry.message}${metaStr}`;
  }

  getLevelIcon(level) {
    const icons = {
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🐛'
    };
    return icons[level] || '📝';
  }

  // Асинхронная запись в файл с ротацией
  async writeToFile(filename, content) {
    try {
      // Проверка размера файла для ротации
      await this.rotateLogIfNeeded(filename);
      
      // Асинхронная запись
      await fs.promises.appendFile(filename, content, 'utf8');
      
    } catch (error) {
      console.error(`Failed to write to log file ${filename}:`, error);
      throw error;
    }
  }

  // Ротация логов
  async rotateLogIfNeeded(filename) {
    try {
      const stats = await fs.promises.stat(filename);
      
      if (stats.size > this.maxLogSize) {
        const rotatedName = `${filename}.${Date.now()}`;
        await fs.promises.rename(filename, rotatedName);
        
        // Ограничение количества архивных файлов
        await this.cleanupOldLogs(path.dirname(filename));
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to rotate log:', error);
      }
    }
  }

  // Очистка старых логов
  async cleanupOldLogs(logDir, maxFiles = 10) {
    try {
      const files = await fs.promises.readdir(logDir);
      const logFiles = files
        .filter(file => file.startsWith('app.log.') || file.startsWith('error.log.'))
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
          mtime: fs.statSync(path.join(logDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // Удаляем файлы сверх лимита
      if (logFiles.length > maxFiles) {
        const filesToDelete = logFiles.slice(maxFiles);
        await Promise.all(filesToDelete.map(file => 
          fs.promises.unlink(file.path).catch(err => 
            console.error(`Failed to delete old log ${file.name}:`, err)
          )
        ));
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  // Публичные методы логирования
  async error(message, meta = {}) {
    this.stats.errors++;
    if (this.currentLevel >= this.levels.error) {
      // Дублирование в console для критических ошибок
      console.error(`❌ [ERROR] ${new Date().toISOString()} - ${message}`, meta);
      return await this.writeLog('error', message, meta);
    }
  }

  async warn(message, meta = {}) {
    this.stats.warnings++;
    if (this.currentLevel >= this.levels.warn) {
      console.warn(`⚠️  [WARN]  ${new Date().toISOString()} - ${message}`, meta);
      return await this.writeLog('warn', message, meta);
    }
  }

  async info(message, meta = {}) {
    this.stats.infos++;
    if (this.currentLevel >= this.levels.info) {
      console.info(`ℹ️  [INFO]  ${new Date().toISOString()} - ${message}`, meta);
      return await this.writeLog('info', message, meta);
    }
  }

  async debug(message, meta = {}) {
    this.stats.debugs++;
    if (this.currentLevel >= this.levels.debug) {
      console.debug(`🐛 [DEBUG] ${new Date().toISOString()} - ${message}`, meta);
      return await this.writeLog('debug', message, meta);
    }
  }

  getStats() {
    return { 
      ...this.stats,
      logDir: this.logDir,
      bufferSize: this.bufferSize,
      flushInterval: this.flushInterval
    };
  }

  // Graceful shutdown
  async shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Финальный сброс буфера
    await this.flushBuffer();
  }

  async cleanup() {
    await this.shutdown();
  }
}

function createLogger() {
  return new Logger();
}

module.exports = { createLogger, Logger }; 