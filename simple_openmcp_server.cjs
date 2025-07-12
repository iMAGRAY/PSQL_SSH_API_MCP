#!/usr/bin/env node

// 🚀 POSTGRESQL + API + SSH MCP СЕРВЕР v4.0
// Эффективная Service Layer архитектура

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');

// Инициализация сервисов
const ServiceBootstrap = require('./src/bootstrap/ServiceBootstrap.cjs');

class MCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'psql-ssh-api',
        version: '4.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.container = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Инициализация Service Layer
      this.container = await ServiceBootstrap.initialize();
      
      // Регистрация обработчиков
      await this.setupHandlers();
      
      this.initialized = true;
      
      const logger = this.container.get('logger');
      logger.info('MCP Server v4.0 initialized with Service Layer architecture');
      
    } catch (error) {
      console.error('Failed to initialize MCP Server:', error);
      throw error;
    }
  }

  async setupHandlers() {
    // Обработчик списка инструментов
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'mcp_psql_manager',
            description: '🐘 PostgreSQL Manager - безопасные операции с базой данных: setup_profile, list_profiles, quick_query, show_tables, describe_table, sample_data, insert_data, update_data, delete_data, database_info. Шифрование AES-256-CBC, защита от SQL injection, валидация входных данных.',
            inputSchema: {
              type: 'object',
              properties: {
                action: { 
                  type: 'string', 
                  description: 'Действие PostgreSQL',
                  enum: ['setup_profile', 'list_profiles', 'quick_query', 'show_tables', 'describe_table', 'sample_data', 'insert_data', 'update_data', 'delete_data', 'database_info']
                },
                profile_name: { type: 'string', description: 'Имя профиля подключения (по умолчанию \'default\')' },
                host: { type: 'string', description: 'Хост PostgreSQL' },
                port: { type: 'integer', description: 'Порт PostgreSQL' },
                username: { type: 'string', description: 'Имя пользователя PostgreSQL' },
                password: { type: 'string', description: 'Пароль PostgreSQL' },
                database: { type: 'string', description: 'Имя базы данных' },
                sql: { type: 'string', description: 'SQL запрос' },
                table_name: { type: 'string', description: 'Имя таблицы' },
                data: { type: 'object', description: 'Данные для insert/update' },
                where: { type: 'string', description: 'WHERE условие' },
                limit: { type: 'integer', description: 'Лимит записей' }
              },
              required: ['action']
            }
          },
          {
            name: 'mcp_ssh_manager',
            description: '🔐 SSH Manager - безопасные SSH операции: setup_profile, list_profiles, execute, system_info, check_host. Защита от command injection, санитизация команд, ограничения безопасности.',
            inputSchema: {
              type: 'object',
              properties: {
                action: { 
                  type: 'string', 
                  description: 'Действие SSH',
                  enum: ['setup_profile', 'list_profiles', 'execute', 'system_info', 'check_host']
                },
                profile_name: { type: 'string', description: 'Имя профиля подключения (по умолчанию \'default\')' },
                host: { type: 'string', description: 'Хост SSH сервера' },
                port: { type: 'integer', description: 'Порт SSH' },
                username: { type: 'string', description: 'Имя пользователя SSH' },
                password: { type: 'string', description: 'Пароль SSH' },
                command: { type: 'string', description: 'Команда для выполнения' }
              },
              required: ['action']
            }
          },
          {
            name: 'mcp_api_client',
            description: '🌐 API Client - безопасные HTTP запросы: get, post, put, delete, patch, check_api. Валидация URL, санитизация заголовков, защита от SSRF, ограничения размера данных.',
            inputSchema: {
              type: 'object',
              properties: {
                action: { 
                  type: 'string', 
                  description: 'HTTP действие',
                  enum: ['get', 'post', 'put', 'delete', 'patch', 'check_api']
                },
                url: { type: 'string', description: 'URL для запроса' },
                data: { type: 'object', description: 'Данные для POST/PUT/PATCH' },
                headers: { type: 'object', description: 'HTTP заголовки' },
                auth_token: { type: 'string', description: 'Bearer токен авторизации' }
              },
              required: ['action', 'url']
            }
          }
        ]
      };
    });

    // Обработчик вызова инструментов
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          case 'mcp_psql_manager':
            result = await this.handlePostgreSQL(args);
            break;
          case 'mcp_ssh_manager':
            result = await this.handleSSH(args);
            break;
          case 'mcp_api_client':
            result = await this.handleAPI(args);
            break;
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        };

      } catch (error) {
        const logger = this.container.get('logger');
        logger.error('Tool execution failed', { 
          tool: name, 
          action: args?.action,
          error: error.message 
        });

        throw new McpError(
          ErrorCode.InternalError,
          `Ошибка выполнения ${name}: ${error.message}`
        );
      }
    });
  }

  // Обработка PostgreSQL операций
  async handlePostgreSQL(args) {
    this.ensureInitialized();
    const manager = this.container.get('postgresqlManager');
    return await manager.handleAction(args);
  }

  // Обработка SSH операций  
  async handleSSH(args) {
    this.ensureInitialized();
    const manager = this.container.get('sshManager');
    return await manager.handleAction(args);
  }

  // Обработка API операций
  async handleAPI(args) {
    this.ensureInitialized();
    const manager = this.container.get('apiManager');
    return await manager.handleAction(args);
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('MCP Server not initialized');
    }
  }

  // Запуск сервера
  async run() {
    await this.initialize();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Graceful shutdown
    const cleanup = async () => {
      try {
        await ServiceBootstrap.cleanup();
        process.exit(0);
      } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      cleanup();
    });
  }

  // Получение статистики сервера
  getStats() {
    if (!this.initialized) {
      return { error: 'Server not initialized' };
    }

    return {
      version: '4.0.0',
      architecture: 'Service Layer',
      ...ServiceBootstrap.getStats()
    };
  }
}

// Запуск сервера
if (require.main === module) {
  const server = new MCPServer();
  server.run().catch(console.error);
}

module.exports = MCPServer; 