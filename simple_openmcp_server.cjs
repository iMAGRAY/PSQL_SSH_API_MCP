#!/usr/bin/env node

// 🚀 PostgreSQL + API + SSH MCP СЕРВЕР v3.0.0 - МОДУЛЬНАЯ АРХИТЕКТУРА
// Использует безопасные модули из /src с защитой от уязвимостей

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

// Загрузка модулей
const PostgreSQLManager = require('./src/database/postgresql.cjs');
const SSHManager = require('./src/ssh/index.cjs');
const APIManager = require('./src/api/index.cjs');
const Logger = require('./src/logger/index.cjs');

const server = new Server({
  name: "postgresql-api-ssh-mcp-server",
  version: "3.0.0"
}, {
  capabilities: { tools: {} }
});

// Инициализация модулей
let pgManager, sshManager, apiManager;
try {
  pgManager = new PostgreSQLManager();
  sshManager = new SSHManager();
  apiManager = new APIManager();
  Logger.info('All modules loaded successfully');
} catch (error) {
  Logger.error('Failed to load modules', { error: error.message });
  console.error('❌ Ошибка загрузки модулей:', error.message);
}

// 🐘 PostgreSQL Manager Handler
async function handlePostgreSQLManager(args) {
  try {
    if (!pgManager) {
      throw new Error('PostgreSQL модуль не доступен');
    }

    const result = await pgManager.handleAction(args);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "success",
          ...result
        }, null, 2)
      }]
    };
  } catch (error) {
    Logger.error('PostgreSQL operation failed', { action: args.action, error: error.message });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: error.message,
          action: args.action,
          ai_hint: "Проверьте параметры запроса и соединение с базой данных"
        }, null, 2)
      }],
      isError: true
    };
  }
}

// 🔐 SSH Manager Handler
async function handleSSHManager(args) {
  try {
    if (!sshManager) {
      throw new Error('SSH модуль не доступен');
    }

    const result = await sshManager.handleAction(args);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "success",
          ...result
        }, null, 2)
      }]
    };
  } catch (error) {
    Logger.error('SSH operation failed', { action: args.action, error: error.message });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: error.message,
          action: args.action,
          ai_hint: "Проверьте параметры запроса и соединение с сервером"
        }, null, 2)
      }],
      isError: true
    };
  }
}

// 🌐 API Manager Handler
async function handleAPIManager(args) {
  try {
    if (!apiManager) {
      throw new Error('API модуль не доступен');
    }

    const result = await apiManager.handleAction(args);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "success",
          ...result
        }, null, 2)
      }]
    };
  } catch (error) {
    Logger.error('API operation failed', { method: args.method, error: error.message });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: error.message,
          method: args.method,
          url: args.url,
          ai_hint: "Проверьте URL и параметры запроса"
        }, null, 2)
      }],
      isError: true
    };
  }
}

// 📋 Регистрация инструментов MCP
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "postgresql_manager",
      description: "🐘 PostgreSQL МЕНЕДЖЕР - Безопасные операции с базой данных: setup_profile, list_profiles, quick_query, show_tables, describe_table, sample_data, insert_data, update_data, delete_data, database_info. Защита от SQL injection, шифрование паролей, валидация входных данных.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "setup_profile", "list_profiles", "quick_query", "show_tables", 
              "describe_table", "sample_data", "insert_data", "update_data", 
              "delete_data", "database_info"
            ],
            description: "Действие PostgreSQL"
          },
          profile_name: {
            type: "string",
            description: "Имя профиля подключения (по умолчанию 'default')"
          },
          host: { type: "string", description: "Хост PostgreSQL" },
          port: { type: "integer", description: "Порт PostgreSQL" },
          username: { type: "string", description: "Имя пользователя PostgreSQL" },
          password: { type: "string", description: "Пароль PostgreSQL" },
          database: { type: "string", description: "Имя базы данных" },
          sql: { type: "string", description: "SQL запрос" },
          table_name: { type: "string", description: "Имя таблицы" },
          data: { type: "object", description: "Данные для insert/update" },
          where: { type: "string", description: "WHERE условие" },
          limit: { type: "integer", description: "Лимит записей" }
        },
        required: ["action"]
      }
    },
    {
      name: "ssh_manager",
      description: "🔐 SSH МЕНЕДЖЕР - Безопасные SSH операции: setup_profile, list_profiles, execute, system_info, check_host. Защита от command injection, санитизация команд, ограничения безопасности.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["setup_profile", "list_profiles", "execute", "system_info", "check_host"],
            description: "Действие SSH"
          },
          profile_name: {
            type: "string",
            description: "Имя профиля подключения (по умолчанию 'default')"
          },
          host: { type: "string", description: "Хост SSH сервера" },
          port: { type: "integer", description: "Порт SSH" },
          username: { type: "string", description: "Имя пользователя SSH" },
          password: { type: "string", description: "Пароль SSH" },
          command: { type: "string", description: "Команда для выполнения" }
        },
        required: ["action"]
      }
    },
    {
      name: "universal_api_client",
      description: "🌐 API КЛИЕНТ - Безопасные HTTP запросы: get, post, put, delete, patch, check_api. Валидация URL, санитизация заголовков, защита от SSRF, ограничения размера данных.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["get", "post", "put", "delete", "patch", "check_api"],
            description: "HTTP действие"
          },
          url: { type: "string", description: "URL для запроса" },
          headers: { type: "object", description: "HTTP заголовки" },
          data: { type: "object", description: "Данные для POST/PUT/PATCH" },
          auth_token: { type: "string", description: "Bearer токен авторизации" }
        },
        required: ["action", "url"]
      }
    }
  ]
}));

// 🎯 Обработка вызовов инструментов
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    Logger.info('Tool called', { name, action: args.action });
    
    switch (name) {
      case "postgresql_manager":
        return await handlePostgreSQLManager(args);
      case "ssh_manager":
        return await handleSSHManager(args);
      case "universal_api_client":
        return await handleAPIManager(args);
      default:
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "error",
              error: `❌ Неизвестный инструмент: ${name}`,
              available_tools: ["postgresql_manager", "ssh_manager", "universal_api_client"]
            }, null, 2)
          }],
          isError: true
        };
    }
  } catch (error) {
    Logger.error('Tool execution failed', { name, error: error.message });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: `❌ Ошибка выполнения ${name}: ${error.message}`,
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
      isError: true
    };
  }
});

// 🚀 Запуск MCP сервера
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("🚀 PostgreSQL API SSH MCP Server v3.0.0 запущен (МОДУЛЬНАЯ АРХИТЕКТУРА)");
    console.error("✅ Безопасные модули с защитой от уязвимостей");
    console.error("🔒 Шифрование паролей, валидация данных, санитизация входных данных");
    console.error(`📊 Модули: PostgreSQL=${!!pgManager}, SSH=${!!sshManager}, API=${!!apiManager}`);
    
    process.on('SIGINT', () => {
      console.error('💾 Корректное завершение работы...');
      process.exit(0);
    });
    
    process.stdin.resume();
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
}

main().catch(console.error); 