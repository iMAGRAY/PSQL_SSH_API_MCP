# 🔧 MCP Configuration - PostgreSQL API SSH Server

## 📋 Обновлённая конфигурация (с ИИ анализом)

### Claude Desktop Configuration
Добавьте в `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "postgresql-api-ssh": {
      "command": "node", 
      "args": ["C:\\path\\to\\your\\postgresql-api-ssh\\simple_openmcp_server.cjs"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 🚀 Доступные инструменты:

### 1. 📊 PostgreSQL Manager + ИИ АНАЛИЗ + ПОЛНОЕ РЕДАКТИРОВАНИЕ БД
**Название**: `postgresql_manager`

**Базовые действия**:
- `connect` - подключение к PostgreSQL
- `query` - выполнение SQL запросов
- `insert` - вставка данных
- `show_tables` - список таблиц

**🧠 ФУНКЦИИ ИИ АНАЛИЗА (8 функций)**:
- `analyze_schema` - полный анализ схемы базы данных
- `table_structure` - детальная структура таблицы
- `sample_data` - примеры данных из таблицы
- `table_stats` - статистика таблицы и колонок
- `relationships` - анализ связей между таблицами
- `indexes` - анализ индексов для оптимизации
- `generate_query` - генерация шаблонов запросов
- `database_overview` - общий обзор базы данных

**🛠️ ФУНКЦИИ РЕДАКТИРОВАНИЯ БД (13 функций)**:
- `create_table` - создание новых таблиц с полной спецификацией
- `alter_table` - изменение структуры существующих таблиц
- `drop_table` - удаление таблиц
- `create_index` - создание индексов для производительности
- `drop_index` - удаление индексов
- `add_constraint` - добавление ограничений (PK, FK, UNIQUE, CHECK)
- `drop_constraint` - удаление ограничений
- `create_schema` - создание новых схем
- `drop_schema` - удаление схем
- `truncate_table` - очистка таблиц
- `bulk_update` - массовое обновление записей
- `bulk_delete` - массовое удаление записей
- `backup_schema` - создание бэкапа структуры

**🔄 СИСТЕМА МИГРАЦИЙ (3 функции)**:
- `apply_migration` - применение миграций с версионированием
- `rollback_migration` - откат миграций
- `list_migrations` - список применённых миграций

### 2. 🌐 Universal API Client
**Название**: `universal_api_client`

**Действия**:
- `get` - GET запросы
- `post` - POST запросы
- `put` - PUT запросы
- `delete` - DELETE запросы

### 3. 🔐 SSH Manager
**Название**: `ssh_manager`

**Действия**:
- `connect` - SSH подключение
- `execute` - выполнение команд
- `upload` - загрузка файлов
- `download` - скачивание файлов

## 🎯 Рекомендации для ИИ анализа базы данных:

### Начальное изучение базы данных:
1. `database_overview` - общий обзор
2. `analyze_schema` - полная схема
3. `show_tables` - список таблиц

### Детальный анализ таблиц:
1. `table_structure` - структура таблицы
2. `sample_data` - примеры данных (limit: 5-10)
3. `table_stats` - статистика

### Понимание связей и оптимизация:
1. `relationships` - связи между таблицами
2. `indexes` - анализ индексов
3. `generate_query` - готовые шаблоны

## 💡 Примеры использования новых функций:

### Базовое изучение БД:
```json
{
  "action": "database_overview",
  "host": "localhost",
  "database": "mydb",
  "username": "postgres",
  "password": "password"
}
```

### Анализ структуры таблицы:
```json
{
  "action": "table_structure",
  "table_name": "users",
  "host": "localhost",
  "database": "mydb",
  "username": "postgres",
  "password": "password"
}
```

### Получение примеров данных:
```json
{
  "action": "sample_data",
  "table_name": "users",
  "limit": 5,
  "host": "localhost",
  "database": "mydb",
  "username": "postgres",
  "password": "password"
}
```

## 🔧 Технические детали:

### Исправленные проблемы:
- ✅ Синтаксическая ошибка в handleUniversalAPIClient
- ✅ Динамические импорты заменены на require()
- ✅ JSON структура инструментов исправлена
- ✅ SSH соединения корректно закрываются
- ✅ Улучшена обработка ошибок

### Новые возможности:
- 🧠 8 новых функций ИИ анализа
- 📊 Детальная статистика таблиц
- 🔗 Анализ связей и ограничений
- ⚡ Анализ производительности
- 🔧 Автоматическая генерация запросов

### Безопасность:
- 🔒 SSL поддержка для PostgreSQL
- 🔐 Безопасные SSH соединения
- 🛡️ Корректная обработка ошибок

## 📚 Документация:
- `AI_DATABASE_ANALYSIS.md` - подробное руководство по ИИ анализу
- `postgresql_connection_examples.md` - примеры подключений
- `README_FIXED.md` - отчёт об исправлениях

## ✅ Статус:
- **MCP Server**: Полностью исправлен и работает
- **PostgreSQL Manager**: Расширен функциями ИИ анализа
- **SSH Manager**: Исправлен и оптимизирован
- **API Client**: Исправлен и работает
- **Документация**: Полная и актуальная

**🎉 Ваш PostgreSQL MCP Server теперь максимально удобен для ИИ анализа базы данных!** 