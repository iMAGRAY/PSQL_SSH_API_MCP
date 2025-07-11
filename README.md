# 🚀 PostgreSQL API SSH MCP Server

> Универсальный MCP (Model Context Protocol) сервер для PostgreSQL, REST API и SSH операций с расширенными возможностями ИИ анализа и безопасным редактированием баз данных.

[![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-12+-blue.svg)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple.svg)](https://modelcontextprotocol.io/)

## 🌟 Особенности

- **🔒 Безопасность превыше всего** - Система подтверждений для критических операций
- **🧠 ИИ-дружественный** - Специальные функции для анализа баз данных ИИ агентами
- **🛠️ Полное редактирование БД** - Создание, изменение и удаление таблиц с валидацией
- **🔄 Система миграций** - Версионирование изменений схемы БД
- **🌐 Универсальный API клиент** - HTTP запросы с аутентификацией
- **🔐 SSH управление** - Безопасные SSH соединения и выполнение команд

## 📦 Установка

```bash
# Клонировать репозиторий
git clone https://github.com/your-username/postgresql-api-ssh-mcp-server.git
cd postgresql-api-ssh-mcp-server

# Установить зависимости
npm install
```

## 🚀 Быстрый старт

### 1. Настройка PostgreSQL

```bash
# Создать базу данных
createdb myapp_db

# Установить пароль для пользователя postgres (если необходимо)
psql -U postgres -c "ALTER USER postgres PASSWORD 'your_password';"
```

### 2. Запуск сервера

```bash
npm start
```

### 3. Настройка MCP клиента

Добавьте в конфигурацию вашего MCP клиента (например, Claude Desktop):

```json
{
  "mcpServers": {
    "postgresql-api-ssh": {
      "command": "node",
      "args": ["/path/to/postgresql-api-ssh-mcp-server/simple_openmcp_server.cjs"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 🛠️ Функции

### 📊 PostgreSQL Manager (31 функция)

#### Базовые операции
- `connect` - Подключение к PostgreSQL
- `query` - Выполнение SQL запросов
- `insert` - Вставка данных
- `show_tables` - Список таблиц

#### 🧠 ИИ анализ базы данных (8 функций)
- `analyze_schema` - Полный анализ схемы БД
- `table_structure` - Детальная структура таблицы
- `sample_data` - Примеры данных для анализа
- `table_stats` - Статистика таблиц и колонок
- `relationships` - Анализ связей между таблицами
- `indexes` - Анализ индексов для оптимизации
- `generate_query` - Автоматическая генерация запросов
- `database_overview` - Общий обзор базы данных

#### 🛠️ Редактирование БД (13 функций)
- `create_table` - Создание таблиц с валидацией
- `alter_table` - Изменение структуры таблиц
- `drop_table` - Безопасное удаление таблиц
- `create_index` - Создание индексов
- `drop_index` - Удаление индексов
- `add_constraint` - Добавление ограничений
- `drop_constraint` - Удаление ограничений
- `create_schema` - Создание схем
- `drop_schema` - Удаление схем
- `truncate_table` - Очистка таблиц
- `bulk_update` - Массовое обновление
- `bulk_delete` - Массовое удаление
- `backup_schema` - Создание резервных копий

#### 🔄 Система миграций (3 функции)
- `apply_migration` - Применение миграций
- `rollback_migration` - Откат миграций
- `list_migrations` - История миграций

#### 🔒 Безопасность (3 функции)
- `check_table_safety` - Анализ безопасности операций
- `generate_confirmation_token` - Токены подтверждения
- `confirm_destructive_operation` - Подтверждение опасных операций

### 🌐 Universal API Client

HTTP клиент для REST API с поддержкой:
- GET, POST, PUT, DELETE, PATCH запросы
- Bearer токен аутентификация
- Автоматическое парсинг JSON/XML
- Настраиваемые заголовки

### 🔐 SSH Manager

Безопасные SSH операции:
- Установка SSH соединений
- Выполнение команд на удаленных серверах
- Поддержка различных алгоритмов шифрования

## 💡 Примеры использования

### Анализ базы данных ИИ агентом

```javascript
// Получить общий обзор базы данных
{
  "action": "database_overview",
  "host": "localhost",
  "database": "myapp_db",
  "username": "postgres",
  "password": "password"
}

// Проанализировать структуру конкретной таблицы
{
  "action": "table_structure",
  "table_name": "users",
  "host": "localhost",
  "database": "myapp_db",
  "username": "postgres",
  "password": "password"
}

// Получить примеры данных для анализа
{
  "action": "sample_data",
  "table_name": "users",
  "limit": 10,
  "host": "localhost",
  "database": "myapp_db",
  "username": "postgres",
  "password": "password"
}
```

### Безопасное создание таблицы

```javascript
{
  "action": "create_table",
  "table_name": "products",
  "data": {
    "id": {
      "type": "SERIAL",
      "primary_key": true
    },
    "name": {
      "type": "VARCHAR(255)",
      "not_null": true
    },
    "price": {
      "type": "DECIMAL(10,2)",
      "not_null": true,
      "check": "price > 0"
    },
    "created_at": {
      "type": "TIMESTAMP",
      "default": "CURRENT_TIMESTAMP"
    }
  },
  "host": "localhost",
  "database": "myapp_db",
  "username": "postgres",
  "password": "password"
}
```

### Применение миграции

```javascript
{
  "action": "apply_migration",
  "data": {
    "migration_name": "add_user_email_index",
    "migration_sql": "CREATE INDEX idx_user_email ON users(email);"
  },
  "host": "localhost",
  "database": "myapp_db",
  "username": "postgres",
  "password": "password"
}
```

## 🔒 Безопасность

Сервер включает многоуровневую систему безопасности:

### Валидация данных
- Проверка имен таблиц и колонок (только буквы, цифры, подчеркивания)
- Валидация типов данных
- Проверка существования объектов БД

### Предотвращение потери данных
- Обязательное подтверждение для операций удаления
- Предварительный подсчет записей
- Анализ зависимостей между таблицами
- Система предупреждений

### Токены безопасности
- Временные токены подтверждения (1 минута)
- Защита от случайного выполнения команд
- Аудит критических операций

## 🛠️ Разработка

### Структура проекта

```
postgresql-api-ssh-mcp-server/
├── simple_openmcp_server.cjs    # Основной сервер
├── package.json                 # Конфигурация npm
├── mcp_config.md               # Документация по настройке
├── FINAL_FIX_REPORT.md         # Отчет об исправлениях
├── .gitignore                  # Git ignore файл
└── README.md                   # Этот файл
```

### Требования

- **Node.js** 16 или выше
- **PostgreSQL** 12 или выше
- **npm** или **yarn**

### Зависимости

```json
{
  "@modelcontextprotocol/sdk": "^1.12.1",
  "pg": "^8.11.3",
  "ssh2": "^1.15.0",
  "node-fetch": "^3.3.2"
}
```

## 📝 Changelog

См. [CHANGELOG.md](CHANGELOG.md) для детальной истории изменений.

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте feature ветку (`git checkout -b feature/amazing-feature`)
3. Закоммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Запушьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект лицензирован под MIT License - см. [LICENSE](LICENSE) файл для деталей.

## 🆘 Поддержка

Если у вас возникли проблемы или вопросы:

1. Проверьте [Issues](https://github.com/your-username/postgresql-api-ssh-mcp-server/issues)
2. Создайте новый Issue с подробным описанием проблемы
3. Укажите версию Node.js и PostgreSQL

## 🙏 Благодарности

- [Model Context Protocol](https://modelcontextprotocol.io/) за отличный протокол
- [PostgreSQL](https://www.postgresql.org/) за надежную базу данных
- [Node.js](https://nodejs.org/) за runtime среду

---

**Сделано с ❤️ для ИИ агентов и разработчиков** 