# 🚀 УПРОЩЕННЫЙ MCP СЕРВЕР v2.0.0 - ИНСТРУКЦИЯ ДЛЯ ИИ АГЕНТОВ

## 📋 ОСНОВНЫЕ ПРАВИЛА

### 1. ПЕРВОНАЧАЛЬНАЯ НАСТРОЙКА
**ВАЖНО:** Сначала настройте профили подключения, чтобы не вводить пароль каждый раз!

### 2. ПРОСТЫЕ КОМАНДЫ
Всего 3 инструмента:
- `mcp_postgresql-api-ssh-mcp-server_postgresql_manager` - База данных
- `mcp_postgresql-api-ssh-mcp-server_ssh_manager` - SSH подключения
- `mcp_postgresql-api-ssh-mcp-server_universal_api_client` - API запросы

---

## 🗄️ POSTGRESQL МЕНЕДЖЕР

### 🔧 НАСТРОЙКА ПРОФИЛЯ (ОБЯЗАТЕЛЬНО ПЕРВЫМ ДЕЛОМ)
```json
{
  "action": "setup_profile",
  "profile_name": "default",
  "host": "localhost",
  "port": 5432,
  "username": "postgres",
  "password": "ваш_пароль",
  "database": "имя_базы"
}
```

### 📊 ОСНОВНЫЕ КОМАНДЫ (БЕЗ ПАРОЛЯ)

#### Быстрый SQL запрос
```json
{
  "action": "quick_query",
  "sql": "SELECT * FROM users LIMIT 5"
}
```

#### Показать все таблицы
```json
{
  "action": "show_tables"
}
```

#### Описание таблицы
```json
{
  "action": "describe_table",
  "table_name": "users"
}
```

#### Примеры данных
```json
{
  "action": "sample_data",
  "table_name": "users",
  "limit": 10
}
```

#### Вставка данных
```json
{
  "action": "insert_data",
  "table_name": "users",
  "data": {
    "name": "Иван",
    "email": "ivan@example.com"
  }
}
```

#### Обновление данных
```json
{
  "action": "update_data",
  "table_name": "users",
  "data": {
    "email": "newemail@example.com"
  },
  "where": "id = 1"
}
```

#### Удаление данных
```json
{
  "action": "delete_data",
  "table_name": "users",
  "where": "id = 1"
}
```

#### Создание таблицы
```json
{
  "action": "create_table",
  "table_name": "products",
  "columns": [
    {"name": "id", "type": "SERIAL", "primary_key": true},
    {"name": "name", "type": "VARCHAR(100)", "not_null": true},
    {"name": "price", "type": "DECIMAL(10,2)", "default": "0.00"}
  ]
}
```

#### Информация о базе данных
```json
{
  "action": "database_info"
}
```

---

## 🔐 SSH МЕНЕДЖЕР

### 🔧 НАСТРОЙКА ПРОФИЛЯ (ОБЯЗАТЕЛЬНО ПЕРВЫМ ДЕЛОМ)
```json
{
  "action": "setup_profile",
  "profile_name": "default",
  "host": "example.com",
  "port": 22,
  "username": "root",
  "password": "ваш_пароль"
}
```

### 💻 ОСНОВНЫЕ КОМАНДЫ (БЕЗ ПАРОЛЯ)

#### Выполнение команды
```json
{
  "action": "execute",
  "command": "ls -la /var/www"
}
```

#### Информация о системе
```json
{
  "action": "system_info"
}
```

#### Список профилей
```json
{
  "action": "list_profiles"
}
```

---

## 🌐 API КЛИЕНТ

### 📡 ПРОСТЫЕ HTTP ЗАПРОСЫ

#### GET запрос
```json
{
  "method": "GET",
  "url": "https://api.example.com/users"
}
```

#### POST запрос
```json
{
  "method": "POST",
  "url": "https://api.example.com/users",
  "data": {
    "name": "Иван",
    "email": "ivan@example.com"
  }
}
```

#### Запрос с авторизацией
```json
{
  "method": "GET",
  "url": "https://api.example.com/protected",
  "auth_token": "ваш_токен"
}
```

---

## 🎯 ПРИМЕР ПОЛНОГО WORKFLOW

### 1. Настройка PostgreSQL
```json
{
  "action": "setup_profile",
  "host": "localhost",
  "username": "postgres",
  "password": "mypassword",
  "database": "mydb"
}
```

### 2. Просмотр таблиц
```json
{
  "action": "show_tables"
}
```

### 3. Работа с данными
```json
{
  "action": "quick_query",
  "sql": "SELECT COUNT(*) FROM users"
}
```

### 4. Настройка SSH
```json
{
  "action": "setup_profile",
  "host": "myserver.com",
  "username": "admin",
  "password": "sshpassword"
}
```

### 5. Проверка сервера
```json
{
  "action": "system_info"
}
```

---

## ⚡ ПРЕИМУЩЕСТВА НОВОЙ ВЕРСИИ

- ✅ **Пароль только один раз** - при настройке профиля
- ✅ **Простые команды** - понятные действия
- ✅ **Автоматическое управление** - соединениями
- ✅ **Безопасность** - пароли хранятся в памяти
- ✅ **Удобство** - минимум параметров для каждого запроса

---

## 🚫 ТИПИЧНЫЕ ОШИБКИ

### ❌ НЕПРАВИЛЬНО:
```json
{
  "action": "quick_query",
  "sql": "SELECT * FROM users",
  "host": "localhost",
  "username": "postgres",
  "password": "mypassword"
}
```

### ✅ ПРАВИЛЬНО:
1. Сначала настроить профиль:
```json
{
  "action": "setup_profile",
  "host": "localhost",
  "username": "postgres",
  "password": "mypassword",
  "database": "mydb"
}
```

2. Затем выполнить запрос:
```json
{
  "action": "quick_query",
  "sql": "SELECT * FROM users"
}
```

---

## 📚 ДОПОЛНИТЕЛЬНЫЕ ВОЗМОЖНОСТИ

### Использование именованных профилей
```json
{
  "action": "setup_profile",
  "profile_name": "production",
  "host": "prod.example.com",
  "username": "produser",
  "password": "prodpass",
  "database": "proddb"
}
```

```json
{
  "action": "quick_query",
  "profile_name": "production",
  "sql": "SELECT * FROM orders"
}
```

### Работа с несколькими серверами
```json
{
  "action": "setup_profile",
  "profile_name": "server1",
  "host": "server1.com",
  "username": "admin",
  "password": "pass1"
}
```

```json
{
  "action": "setup_profile",
  "profile_name": "server2",
  "host": "server2.com",
  "username": "root",
  "password": "pass2"
}
```

---

## 🔍 TROUBLESHOOTING

### Проблема: "Профиль не найден"
**Решение:** Сначала создайте профиль с `setup_profile`

### Проблема: "Пароль обязателен"
**Решение:** Либо создайте профиль `default`, либо укажите `profile_name`

### Проблема: "Соединение не установлено"
**Решение:** Проверьте параметры подключения в профиле

---

## 🎉 ГОТОВО!

Теперь ИИ агенты могут легко работать с PostgreSQL, SSH и API без постоянного ввода паролей!

---

## 🔧 КОНФИГУРАЦИЯ ДЛЯ CURSOR

### Добавление MCP сервера в Cursor

1. **Откройте настройки Cursor** (Ctrl+,)
2. **Найдите раздел "MCP Servers"**
3. **Добавьте новый сервер:**

```json
{
  "postgresql-api-ssh-mcp-server": {
    "command": "node",
    "args": ["simple_openmcp_server.cjs"],
    "cwd": "/путь/к/вашему/проекту/PSQL_SSH_API_MCP"
  }
}
```

**Важно:** Замените `/путь/к/вашему/проекту/PSQL_SSH_API_MCP` на реальный путь к папке с проектом.

### Проверка работы

После добавления в настройки:

1. **Перезапустите Cursor**
2. **Откройте чат**
3. **Проверьте, что в списке инструментов есть:**
   - `mcp_postgresql-api-ssh-mcp-server_postgresql_manager`
   - `mcp_postgresql-api-ssh-mcp-server_ssh_manager`
   - `mcp_postgresql-api-ssh-mcp-server_universal_api_client`

### Альтернативная конфигурация (если npm установлен глобально)

```json
{
  "postgresql-api-ssh-mcp-server": {
    "command": "npm",
    "args": ["start"],
    "cwd": "/путь/к/вашему/проекту/PSQL_SSH_API_MCP"
  }
}
```

### Устранение проблем

**Проблема:** Сервер показывает 0 инструментов (красный статус)
**Решение:**
1. Проверьте правильность пути в `cwd`
2. Убедитесь, что файл `simple_openmcp_server.cjs` существует
3. Проверьте, что установлены все зависимости: `npm install`
4. Перезапустите Cursor после изменения конфигурации 