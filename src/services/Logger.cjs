#!/usr/bin/env node

/**
 * 📝 LOGGER SERVICE
 * Система асинхронного логирования с буферизацией и ротацией
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const Constants = require('../constants/Constants.cjs');

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
    this.bufferSize = Constants.BUFFERS.LOG_BUFFER_SIZE; // Размер буфера
    this.flushInterval = Constants.TIMEOUTS.BUFFER_FLUSH; // Интервал сброса буфера (5 сек)
    this.maxLogSize = Constants.BUFFERS.MAX_LOG_SIZE; // Максимальный размер лог-файла (10MB)
    
    // Настройки файлов
    this.logDir = process.env.LOG_DIR || './logs';
    this.logFile = path.join(this.logDir, 'app.log');
    this.errorFile = path.join(this.logDir, 'error.log');
    
    // Создание директории логов
    this.ensureLogDir();
    
    // Состояние для предотвращения множественных операций
    this.isShuttingDown = false;
    this.isFlushingBuffer = false;
    this.flushPromise = null;
    
    // Автоматический сброс буфера
    this.flushTimer = setInterval(() => {
      this.flushBuffer();
    }, this.flushInterval);
    
    // Graceful shutdown (один раз)
    this.setupShutdownHandlers();
  }

  // Безопасная настройка обработчиков процессов
  setupShutdownHandlers() {
    // Используем уникальный идентификатор для каждого экземпляра
    if (this.shutdownHandlersSet) {
      return;
    }
    
    this.shutdownHandlersSet = true;
    
    const gracefulShutdown = async (signal) => {
      if (this.isShuttingDown) {
        return;
      }
      
      this.isShuttingDown = true;
      
      try {
        // Сброс буфера
        await this.shutdown();
        if (this.logger) {
          this.logger.info(`Logger shutdown completed by ${signal}`);
        }
        process.exit(0);
      } catch (error) {
        if (this.logger) {
          this.logger.error('Error during shutdown', { error: error.message });
        }
        process.exit(1);
      }
    };
    
    // Сохраняем ссылки на обработчики для возможного удаления
    this.sigintHandler = () => gracefulShutdown('SIGINT');
    this.sigtermHandler = () => gracefulShutdown('SIGTERM');
    
    process.on('SIGINT', this.sigintHandler);
    process.on('SIGTERM', this.sigtermHandler);
  }

  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      // Критическая ошибка на этапе инициализации
      process.stderr.write(`[LOGGER ERROR] Failed to create log directory: ${error.message}\n`);
    }
  }

  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level];
    }
  }

  // Асинхронная запись в буфер
  async writeLog(level, message, meta = {}) {
    if (this.isShuttingDown) {
      return null;
    }
    
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

  // Безопасный сброс буфера в файл с защитой от переполнения
  async flushBuffer() {
    if (this.isFlushingBuffer || this.buffer.length === 0) {
      return;
    }
    
    this.isFlushingBuffer = true;
    let entries = null;
    
    try {
      // Безопасное извлечение записей с проверкой на переполнение
      const maxSafeEntries = Math.min(this.buffer.length, this.bufferSize * 3);
      entries = this.buffer.slice(0, maxSafeEntries);
      this.buffer.splice(0, maxSafeEntries);
      this.stats.buffer_size = this.buffer.length;
      
      // Критическая проверка на переполнение
      if (entries.length > this.bufferSize * 2) {
        if (this.logger) {
          this.logger.warn('Buffer overflow detected, truncating entries', {
            originalLength: entries.length,
            maxAllowed: this.bufferSize * 2
          });
        }
        entries = entries.slice(0, this.bufferSize * 2);
      }
      
      // Группировка по уровням
      const regularLogs = [];
      const errorLogs = [];
      
      for (const entry of entries) {
        if (!entry || !entry.level) {
          continue; // Пропускаем поврежденные записи
        }
        
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
      // Критическая ошибка - используем прямой вывод только для логгера
      if (this.logger && this.logger !== this) {
        this.logger.error('Failed to flush log buffer', { error: error.message });
      } else {
        // Fallback для самого logger сервиса
        process.stderr.write(`[LOGGER ERROR] Failed to flush log buffer: ${error.message}\n`);
      }
      
              // Безопасное восстановление буфера при ошибке с защитой от переполнения
        if (!this.isShuttingDown && entries && Array.isArray(entries)) {
          // Строгое ограничение восстанавливаемых записей
          const maxRestore = Math.min(entries.length, Math.floor(this.bufferSize * 0.5));
          const restoreEntries = entries.slice(0, maxRestore);
          
          // Атомарная проверка и восстановление
          const spaceAvailable = Math.max(0, this.bufferSize - this.buffer.length);
          const safeRestoreCount = Math.min(restoreEntries.length, spaceAvailable);
          
          if (safeRestoreCount > 0) {
            // Проверяем целостность записей перед восстановлением
            const validEntries = restoreEntries.slice(0, safeRestoreCount).filter(entry => 
              entry && typeof entry === 'object' && entry.level && entry.message
            );
            
            if (validEntries.length > 0) {
              this.buffer.unshift(...validEntries);
              this.stats.buffer_size = this.buffer.length;
            }
          }
        }
    } finally {
      this.isFlushingBuffer = false;
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
      // Критическая ошибка записи в файл
      process.stderr.write(`[LOGGER ERROR] Failed to write to log file ${filename}: ${error.message}\n`);
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
        process.stderr.write(`[LOGGER ERROR] Failed to rotate log: ${error.message}\n`);
      }
    }
  }

  // Очистка старых логов
      async cleanupOldLogs(logDir, maxFiles = Constants.BUFFERS.MAX_LOG_FILES) {
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
      
      // Удаление старых файлов
      for (let i = maxFiles; i < logFiles.length; i++) {
        await fs.promises.unlink(logFiles[i].path);
      }
    } catch (error) {
      process.stderr.write(`[LOGGER ERROR] Failed to cleanup old logs: ${error.message}\n`);
    }
  }

  // Безопасный shutdown
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    
    try {
      // Остановка таймера
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }
      
      // Финальный сброс буфера
      await this.flushBuffer();
      
      process.stdout.write('📝 Logger shutdown completed\n');
    } catch (error) {
      process.stderr.write(`[LOGGER ERROR] Error during logger shutdown: ${error.message}\n`);
    }
  }

  // Публичные методы логирования
  error(message, meta = {}) {
    if (this.currentLevel >= this.levels.error) {
      this.stats.errors++;
      this.writeLog('error', message, meta);
    }
  }

  warn(message, meta = {}) {
    if (this.currentLevel >= this.levels.warn) {
      this.stats.warnings++;
      this.writeLog('warn', message, meta);
    }
  }

  info(message, meta = {}) {
    if (this.currentLevel >= this.levels.info) {
      this.stats.infos++;
      this.writeLog('info', message, meta);
    }
  }

  debug(message, meta = {}) {
    if (this.currentLevel >= this.levels.debug) {
      this.stats.debugs++;
      this.writeLog('debug', message, meta);
    }
  }

  // Статистика
  getStats() {
    return {
      ...this.stats,
      buffer_size: this.buffer.length,
      is_flushing: this.isFlushingBuffer,
      is_shutting_down: this.isShuttingDown
    };
  }
}

// Статический флаг для предотвращения множественных обработчиков
Logger.shutdownHandlersSet = false;

module.exports = Logger; 