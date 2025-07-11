#!/usr/bin/env node

// 🚀 УНИВЕРСАЛЬНЫЙ PostgreSQL + API + SSH MCP СЕРВЕР v1.0.0 - ИСПРАВЛЕННАЯ ВЕРСИЯ
// Главный инструмент для всех операций с базами данных, REST API и удаленными серверами

// Статичные импорты для стабильности
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

// Предварительная загрузка модулей для оптимизации
let pgClient, sshClient, fetch;
try {
  const { Client } = require('pg');
  pgClient = Client;
} catch (error) {
  console.error("⚠️ PostgreSQL модуль не найден:", error.message);
}

try {
  const { Client } = require('ssh2');
  sshClient = Client;
} catch (error) {
  console.error("⚠️ SSH2 модуль не найден:", error.message);
}

try {
  fetch = require('node-fetch');
} catch (error) {
  console.error("⚠️ node-fetch модуль не найден:", error.message);
}

const server = new Server({
  name: "postgresql-api-ssh-mcp-server",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

// 📊 PostgreSQL Manager - ИСПРАВЛЕННАЯ ВЕРСИЯ + ИИ АНАЛИЗ
async function handlePostgreSQLManager(args) {
  const { 
    action, 
    host = "localhost", 
    port = 5432, 
    database, 
    username, 
    password, 
    sql, 
    table_name, 
    data, 
    where_clause,
    limit = 10,
    schema = 'public'
  } = args;
  
  try {
    // Проверка доступности модуля
    if (!pgClient) {
      throw new Error("PostgreSQL модуль (pg) не установлен. Выполните: npm install pg");
    }

    let client;
    let result = {};

    // Единое подключение для всех операций
    const dbConfig = {
      host,
      port,
      database,
      user: username,
      password,
      connectionTimeoutMillis: 10000,
      // Добавляем поддержку SSL для безопасности
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };

    client = new pgClient(dbConfig);
    await client.connect();

    switch (action) {
      case "connect":
        const versionResult = await client.query('SELECT version(), current_database(), current_user');
        result = { 
          status: "success", 
          message: "✅ Успешное подключение к PostgreSQL",
          version: versionResult.rows[0].version,
          database: versionResult.rows[0].current_database,
          user: versionResult.rows[0].current_user,
          connection: { host, port, database, username }
        };
        break;

      case "query":
        if (!sql) throw new Error("SQL запрос обязателен");
        const queryResult = await client.query(sql);
        result = {
          status: "success",
          rows: queryResult.rows,
          rowCount: queryResult.rowCount,
          command: queryResult.command,
          query: sql
        };
        break;

      case "insert":
        if (!table_name || !data) throw new Error("table_name и data обязательны");
        const columns = Object.keys(data).join(', ');
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const insertSQL = `INSERT INTO ${table_name} (${columns}) VALUES (${placeholders}) RETURNING *`;
        const insertResult = await client.query(insertSQL, values);
        result = { 
          status: "success",
          inserted: insertResult.rows[0], 
          rowCount: insertResult.rowCount,
          table: table_name
        };
        break;

      case "show_tables":
        const tablesResult = await client.query(`
          SELECT 
            schemaname,
            tablename as table_name,
            tableowner as owner,
            hasindexes,
            hasrules,
            hastriggers
          FROM pg_tables 
          WHERE schemaname = 'public'
          ORDER BY tablename
        `);
        result = { 
          status: "success",
          tables: tablesResult.rows,
          count: tablesResult.rowCount
        };
        break;

      // 🧠 НОВЫЕ ФУНКЦИИ ДЛЯ ИИ АНАЛИЗА:

      case "analyze_schema":
        // Полный анализ схемы базы данных для ИИ
        const schemaAnalysis = await client.query(`
          SELECT 
            t.table_schema,
            t.table_name,
            t.table_type,
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            c.character_maximum_length,
            c.numeric_precision,
            c.numeric_scale,
            tc.constraint_type,
            kcu.referenced_table_name,
            kcu.referenced_column_name,
            pgd.description as column_comment
          FROM information_schema.tables t
          LEFT JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
          LEFT JOIN information_schema.table_constraints tc ON t.table_name = tc.table_name AND t.table_schema = tc.table_schema
          LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          LEFT JOIN pg_catalog.pg_description pgd ON pgd.objsubid = c.ordinal_position
          WHERE t.table_schema = $1
          ORDER BY t.table_name, c.ordinal_position
        `, [schema]);
        
        result = {
          status: "success",
          schema_analysis: schemaAnalysis.rows,
          ai_summary: "Полная схема базы данных с типами данных, ограничениями и связями для ИИ анализа",
          count: schemaAnalysis.rowCount
        };
        break;

      case "table_structure":
        // Детальная структура конкретной таблицы
        if (!table_name) throw new Error("table_name обязателен");
        const structureResult = await client.query(`
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length,
            numeric_precision,
            numeric_scale,
            CASE 
              WHEN constraint_type = 'PRIMARY KEY' THEN 'PK'
              WHEN constraint_type = 'FOREIGN KEY' THEN 'FK'
              WHEN constraint_type = 'UNIQUE' THEN 'UQ'
              WHEN constraint_type = 'CHECK' THEN 'CK'
              ELSE null
            END as constraint_type
          FROM information_schema.columns c
          LEFT JOIN information_schema.table_constraints tc ON c.table_name = tc.table_name 
          LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name 
            AND c.column_name = kcu.column_name
          WHERE c.table_name = $1 AND c.table_schema = $2
          ORDER BY c.ordinal_position
        `, [table_name, schema]);
        
        result = {
          status: "success",
          table_name,
          structure: structureResult.rows,
          ai_context: `Структура таблицы ${table_name} для ИИ анализа и генерации запросов`,
          count: structureResult.rowCount
        };
        break;

      case "sample_data":
        // Примеры данных для ИИ анализа
        if (!table_name) throw new Error("table_name обязателен");
        const sampleResult = await client.query(`
          SELECT * FROM ${table_name} LIMIT $1
        `, [limit]);
        
        result = {
          status: "success",
          table_name,
          sample_data: sampleResult.rows,
          ai_context: `Примеры данных из таблицы ${table_name} для понимания содержимого`,
          count: sampleResult.rowCount
        };
        break;

      case "table_stats":
        // Статистика таблицы для ИИ анализа
        if (!table_name) throw new Error("table_name обязателен");
        const statsResult = await client.query(`
          SELECT 
            schemaname,
            tablename,
            attname as column_name,
            n_distinct,
            most_common_vals,
            most_common_freqs,
            histogram_bounds,
            null_frac,
            avg_width,
            correlation
          FROM pg_stats 
          WHERE tablename = $1 AND schemaname = $2
          ORDER BY attname
        `, [table_name, schema]);
        
        const tableSize = await client.query(`
          SELECT 
            pg_size_pretty(pg_total_relation_size($1)) as total_size,
            pg_size_pretty(pg_relation_size($1)) as table_size,
            (SELECT count(*) FROM ${table_name}) as row_count
        `, [table_name]);
        
        result = {
          status: "success",
          table_name,
          column_statistics: statsResult.rows,
          table_metrics: tableSize.rows[0],
          ai_context: `Статистика таблицы ${table_name} для ИИ анализа производительности и оптимизации`,
          count: statsResult.rowCount
        };
        break;

      case "relationships":
        // Анализ связей между таблицами
        const relationshipsResult = await client.query(`
          SELECT 
            tc.table_name as source_table,
            kcu.column_name as source_column,
            ccu.table_name as target_table,
            ccu.column_name as target_column,
            tc.constraint_type,
            tc.constraint_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
          WHERE tc.table_schema = $1 AND tc.constraint_type = 'FOREIGN KEY'
          ORDER BY tc.table_name, kcu.column_name
        `, [schema]);
        
        result = {
          status: "success",
          relationships: relationshipsResult.rows,
          ai_context: "Связи между таблицами для ИИ понимания структуры данных",
          count: relationshipsResult.rowCount
        };
        break;

      case "indexes":
        // Анализ индексов для оптимизации
        const indexesResult = await client.query(`
          SELECT 
            schemaname,
            tablename,
            indexname,
            indexdef,
            pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
          FROM pg_indexes 
          WHERE schemaname = $1
          ORDER BY tablename, indexname
        `, [schema]);
        
        result = {
          status: "success",
          indexes: indexesResult.rows,
          ai_context: "Индексы базы данных для ИИ анализа производительности",
          count: indexesResult.rowCount
        };
        break;

      case "generate_query":
        // Помощь ИИ в генерации запросов
        if (!table_name) throw new Error("table_name обязателен");
        const queryTemplates = {
          select_all: `SELECT * FROM ${table_name} LIMIT 10;`,
          count_rows: `SELECT COUNT(*) FROM ${table_name};`,
          distinct_values: `SELECT DISTINCT column_name FROM ${table_name};`,
          group_by: `SELECT column_name, COUNT(*) FROM ${table_name} GROUP BY column_name;`,
          order_by: `SELECT * FROM ${table_name} ORDER BY column_name LIMIT 10;`,
          search: `SELECT * FROM ${table_name} WHERE column_name LIKE '%search_term%';`,
          recent: `SELECT * FROM ${table_name} ORDER BY created_at DESC LIMIT 10;`,
          statistics: `SELECT 
            COUNT(*) as total_rows,
            COUNT(DISTINCT column_name) as distinct_values,
            MIN(column_name) as min_value,
            MAX(column_name) as max_value,
            AVG(column_name::numeric) as avg_value
          FROM ${table_name};`
        };
        
        result = {
          status: "success",
          table_name,
          query_templates: queryTemplates,
          ai_context: `Готовые шаблоны запросов для таблицы ${table_name}`,
          usage_hint: "Замените 'column_name' на реальные названия колонок из структуры таблицы"
        };
        break;

      case "database_overview":
        // Общий обзор базы данных для ИИ
        const overviewResult = await client.query(`
          SELECT 
            'tables' as type,
            count(*) as count
          FROM information_schema.tables 
          WHERE table_schema = $1
          UNION ALL
          SELECT 
            'columns' as type,
            count(*) as count
          FROM information_schema.columns 
          WHERE table_schema = $1
          UNION ALL
          SELECT 
            'constraints' as type,
            count(*) as count
          FROM information_schema.table_constraints 
          WHERE table_schema = $1
          UNION ALL
          SELECT 
            'indexes' as type,
            count(*) as count
          FROM pg_indexes 
          WHERE schemaname = $1
        `, [schema]);
        
        const dbSizeResult = await client.query(`
          SELECT 
            pg_database.datname as database_name,
            pg_size_pretty(pg_database_size(pg_database.datname)) as database_size,
            (SELECT count(*) FROM information_schema.tables WHERE table_schema = $1) as table_count
          FROM pg_database
          WHERE datname = current_database()
        `, [schema]);
        
        result = {
          status: "success",
          database_overview: overviewResult.rows,
          database_info: dbSizeResult.rows[0],
          ai_context: "Общий обзор базы данных для ИИ анализа",
          schema: schema
        };
        break;

      // 🛠️ НОВЫЕ ФУНКЦИИ ДЛЯ РЕДАКТИРОВАНИЯ БАЗЫ ДАННЫХ:

      case "create_table":
        // Создание новой таблицы
        if (!table_name || !data) throw new Error("table_name и data (структура колонок) обязательны");
        
        // Валидация имени таблицы
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table_name)) {
          throw new Error("Неверное имя таблицы. Используйте только буквы, цифры и подчеркивания");
        }
        
        // Проверка существования таблицы
        const existingTable = await client.query(
          'SELECT table_name FROM information_schema.tables WHERE table_name = $1 AND table_schema = $2',
          [table_name, schema]
        );
        
        if (existingTable.rows.length > 0) {
          throw new Error(`Таблица ${table_name} уже существует`);
        }
        
        let createTableSQL = `CREATE TABLE ${table_name} (`;
        const columnDefinitions = [];
        
        // Валидация и обработка структуры колонок
        if (Object.keys(data).length === 0) {
          throw new Error("Необходимо указать хотя бы одну колонку");
        }
        
        for (const [columnName, columnDef] of Object.entries(data)) {
          // Валидация имени колонки
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) {
            throw new Error(`Неверное имя колонки: ${columnName}`);
          }
          
          // Валидация типа данных
          if (!columnDef.type) {
            throw new Error(`Тип данных обязателен для колонки ${columnName}`);
          }
          
          let columnSQL = `${columnName} ${columnDef.type}`;
          
          if (columnDef.primary_key) columnSQL += " PRIMARY KEY";
          if (columnDef.not_null) columnSQL += " NOT NULL";
          if (columnDef.unique) columnSQL += " UNIQUE";
          if (columnDef.default) columnSQL += ` DEFAULT ${columnDef.default}`;
          if (columnDef.check) columnSQL += ` CHECK (${columnDef.check})`;
          
          columnDefinitions.push(columnSQL);
        }
        
        createTableSQL += columnDefinitions.join(", ");
        createTableSQL += ")";
        
        await client.query(createTableSQL);
        
        result = {
          status: "success",
          message: `✅ Таблица ${table_name} успешно создана`,
          table_name: table_name,
          columns_created: Object.keys(data).length,
          sql: createTableSQL,
          ai_context: "Таблица создана и готова к использованию"
        };
        break;

      case "alter_table":
        // Изменение структуры таблицы
        if (!table_name || !data) throw new Error("table_name и data (изменения) обязательны");
        
        const alterOperations = [];
        
        if (data.add_column) {
          for (const [columnName, columnDef] of Object.entries(data.add_column)) {
            let addColumnSQL = `ADD COLUMN ${columnName} ${columnDef.type}`;
            if (columnDef.not_null) addColumnSQL += " NOT NULL";
            if (columnDef.default) addColumnSQL += ` DEFAULT ${columnDef.default}`;
            alterOperations.push(addColumnSQL);
          }
        }
        
        if (data.drop_column) {
          data.drop_column.forEach(columnName => {
            alterOperations.push(`DROP COLUMN ${columnName}`);
          });
        }
        
        if (data.rename_column) {
          for (const [oldName, newName] of Object.entries(data.rename_column)) {
            alterOperations.push(`RENAME COLUMN ${oldName} TO ${newName}`);
          }
        }
        
        if (data.alter_column) {
          for (const [columnName, columnDef] of Object.entries(data.alter_column)) {
            if (columnDef.type) {
              alterOperations.push(`ALTER COLUMN ${columnName} TYPE ${columnDef.type}`);
            }
            if (columnDef.set_not_null) {
              alterOperations.push(`ALTER COLUMN ${columnName} SET NOT NULL`);
            }
            if (columnDef.drop_not_null) {
              alterOperations.push(`ALTER COLUMN ${columnName} DROP NOT NULL`);
            }
            if (columnDef.set_default) {
              alterOperations.push(`ALTER COLUMN ${columnName} SET DEFAULT ${columnDef.set_default}`);
            }
            if (columnDef.drop_default) {
              alterOperations.push(`ALTER COLUMN ${columnName} DROP DEFAULT`);
            }
          }
        }
        
        if (alterOperations.length === 0) {
          throw new Error("Не указаны операции для изменения таблицы");
        }
        
        const alterSQL = `ALTER TABLE ${table_name} ${alterOperations.join(", ")}`;
        await client.query(alterSQL);
        
        result = {
          status: "success",
          message: `✅ Таблица ${table_name} успешно изменена`,
          table_name: table_name,
          operations: alterOperations,
          sql: alterSQL,
          ai_context: "Структура таблицы обновлена"
        };
        break;

      case "drop_table":
        // Удаление таблицы
        if (!table_name) throw new Error("table_name обязателен");
        
        // Проверка существования таблицы
        const tableExists = await client.query(
          'SELECT table_name FROM information_schema.tables WHERE table_name = $1 AND table_schema = $2',
          [table_name, schema]
        );
        
        if (tableExists.rows.length === 0) {
          throw new Error(`Таблица ${table_name} не существует`);
        }
        
        // Проверка на наличие данных (предупреждение)
        const rowCount = await client.query(`SELECT COUNT(*) as count FROM ${table_name}`);
        const dataLoss = rowCount.rows[0].count > 0;
        
        // Проверка на наличие внешних ключей, ссылающихся на эту таблицу
        const referencingTables = await client.query(`
          SELECT 
            tc.table_name as referencing_table,
            kcu.column_name as referencing_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND ccu.table_name = $1 
          AND tc.table_schema = $2
        `, [table_name, schema]);
        
        const hasReferences = referencingTables.rows.length > 0;
        
        // Требуем подтверждения для потенциально опасных операций
        if (!data?.force_confirm && (dataLoss || hasReferences)) {
          const warnings = [];
          if (dataLoss) warnings.push(`⚠️ Таблица содержит ${rowCount.rows[0].count} записей`);
          if (hasReferences) warnings.push(`⚠️ На таблицу ссылаются ${referencingTables.rows.length} других таблиц`);
          
          result = {
            status: "warning",
            message: "🔒 ТРЕБУЕТСЯ ПОДТВЕРЖДЕНИЕ: Операция может быть разрушительной",
            warnings: warnings,
            referencing_tables: referencingTables.rows,
            confirmation_required: true,
            safety_hint: "Добавьте 'force_confirm: true' в data для подтверждения операции",
            ai_context: "Удаление таблицы заблокировано из соображений безопасности"
          };
          break;
        }
        
        const cascade = data?.cascade ? "CASCADE" : "";
        const dropSQL = `DROP TABLE ${table_name} ${cascade}`;
        
        await client.query(dropSQL);
        
        result = {
          status: "success",
          message: `✅ Таблица ${table_name} успешно удалена`,
          table_name: table_name,
          data_loss: dataLoss,
          rows_deleted: dataLoss ? rowCount.rows[0].count : 0,
          cascade_used: !!cascade,
          sql: dropSQL,
          ai_context: "Таблица и все её данные удалены"
        };
        break;

      case "create_index":
        // Создание индекса
        if (!table_name || !data?.columns) throw new Error("table_name и data.columns обязательны");
        
        const indexName = data.index_name || `${table_name}_${data.columns.join("_")}_idx`;
        const unique = data.unique ? "UNIQUE" : "";
        const method = data.method || "btree";
        const where = data.where ? `WHERE ${data.where}` : "";
        
        const createIndexSQL = `CREATE ${unique} INDEX ${indexName} ON ${table_name} USING ${method} (${data.columns.join(", ")}) ${where}`;
        
        await client.query(createIndexSQL);
        
        result = {
          status: "success",
          message: `✅ Индекс ${indexName} успешно создан`,
          index_name: indexName,
          table_name: table_name,
          sql: createIndexSQL,
          ai_context: "Индекс создан для улучшения производительности запросов"
        };
        break;

      case "drop_index":
        // Удаление индекса
        if (!data?.index_name) throw new Error("data.index_name обязателен");
        
        const dropIndexSQL = `DROP INDEX ${data.index_name}`;
        await client.query(dropIndexSQL);
        
        result = {
          status: "success",
          message: `✅ Индекс ${data.index_name} успешно удален`,
          index_name: data.index_name,
          sql: dropIndexSQL,
          ai_context: "Индекс удален"
        };
        break;

      case "add_constraint":
        // Добавление ограничения
        if (!table_name || !data?.constraint_name || !data?.constraint_type) {
          throw new Error("table_name, data.constraint_name и data.constraint_type обязательны");
        }
        
        let constraintSQL = `ALTER TABLE ${table_name} ADD CONSTRAINT ${data.constraint_name}`;
        
        switch (data.constraint_type) {
          case "primary_key":
            constraintSQL += ` PRIMARY KEY (${data.columns.join(", ")})`;
            break;
          case "foreign_key":
            constraintSQL += ` FOREIGN KEY (${data.columns.join(", ")}) REFERENCES ${data.reference_table}(${data.reference_columns.join(", ")})`;
            if (data.on_delete) constraintSQL += ` ON DELETE ${data.on_delete}`;
            if (data.on_update) constraintSQL += ` ON UPDATE ${data.on_update}`;
            break;
          case "unique":
            constraintSQL += ` UNIQUE (${data.columns.join(", ")})`;
            break;
          case "check":
            constraintSQL += ` CHECK (${data.check_expression})`;
            break;
          default:
            throw new Error(`Неизвестный тип ограничения: ${data.constraint_type}`);
        }
        
        await client.query(constraintSQL);
        
        result = {
          status: "success",
          message: `✅ Ограничение ${data.constraint_name} успешно добавлено`,
          constraint_name: data.constraint_name,
          table_name: table_name,
          sql: constraintSQL,
          ai_context: "Ограничение добавлено для обеспечения целостности данных"
        };
        break;

      case "drop_constraint":
        // Удаление ограничения
        if (!table_name || !data?.constraint_name) {
          throw new Error("table_name и data.constraint_name обязательны");
        }
        
        const dropConstraintSQL = `ALTER TABLE ${table_name} DROP CONSTRAINT ${data.constraint_name}`;
        await client.query(dropConstraintSQL);
        
        result = {
          status: "success",
          message: `✅ Ограничение ${data.constraint_name} успешно удалено`,
          constraint_name: data.constraint_name,
          table_name: table_name,
          sql: dropConstraintSQL,
          ai_context: "Ограничение удалено"
        };
        break;

      case "create_schema":
        // Создание новой схемы
        if (!data?.schema_name) throw new Error("data.schema_name обязателен");
        
        const createSchemaSQL = `CREATE SCHEMA ${data.schema_name}`;
        await client.query(createSchemaSQL);
        
        result = {
          status: "success",
          message: `✅ Схема ${data.schema_name} успешно создана`,
          schema_name: data.schema_name,
          sql: createSchemaSQL,
          ai_context: "Новая схема создана и готова к использованию"
        };
        break;

      case "drop_schema":
        // Удаление схемы
        if (!data?.schema_name) throw new Error("data.schema_name обязателен");
        
        const cascadeSchema = data?.cascade ? "CASCADE" : "";
        const dropSchemaSQL = `DROP SCHEMA ${data.schema_name} ${cascadeSchema}`;
        
        await client.query(dropSchemaSQL);
        
        result = {
          status: "success",
          message: `✅ Схема ${data.schema_name} успешно удалена`,
          schema_name: data.schema_name,
          sql: dropSchemaSQL,
          ai_context: "Схема удалена"
        };
        break;

      case "truncate_table":
        // Очистка таблицы
        if (!table_name) throw new Error("table_name обязателен");
        
        // Проверка существования таблицы
        const truncateTableExists = await client.query(
          'SELECT table_name FROM information_schema.tables WHERE table_name = $1 AND table_schema = $2',
          [table_name, schema]
        );
        
        if (truncateTableExists.rows.length === 0) {
          throw new Error(`Таблица ${table_name} не существует`);
        }
        
        // Проверка количества записей перед очисткой
        const truncateRowCount = await client.query(`SELECT COUNT(*) as count FROM ${table_name}`);
        const truncateRecordsToDelete = truncateRowCount.rows[0].count;
        
        // Требуем подтверждения для непустых таблиц
        if (truncateRecordsToDelete > 0 && !data?.force_confirm) {
          result = {
            status: "warning",
            message: `🔒 ОЧИСТКА ТАБЛИЦЫ ЗАБЛОКИРОВАНА: Будет удалено ${truncateRecordsToDelete} записей`,
            table_name: table_name,
            records_to_delete: truncateRecordsToDelete,
            confirmation_required: true,
            safety_hint: "Добавьте 'force_confirm: true' в data для подтверждения очистки таблицы",
            ai_context: "TRUNCATE заблокирован из соображений безопасности - операция необратима"
          };
          break;
        }
        
        if (truncateRecordsToDelete === 0) {
          result = {
            status: "info",
            message: `ℹ️ Таблица ${table_name} уже пуста`,
            table_name: table_name,
            rows_affected: 0,
            ai_context: "Таблица не содержит данных для удаления"
          };
          break;
        }
        
        const restartIdentity = data?.restart_identity ? "RESTART IDENTITY" : "";
        const cascadeTruncate = data?.cascade ? "CASCADE" : "";
        const truncateSQL = `TRUNCATE TABLE ${table_name} ${restartIdentity} ${cascadeTruncate}`.trim();
        
        await client.query(truncateSQL);
        
        result = {
          status: "success",
          message: `✅ Таблица ${table_name} успешно очищена`,
          table_name: table_name,
          rows_deleted: truncateRecordsToDelete,
          restart_identity: !!restartIdentity,
          cascade_used: !!cascadeTruncate,
          sql: truncateSQL,
          ai_context: "Все данные из таблицы удалены, структура сохранена"
        };
        break;

      case "bulk_update":
        // Массовое обновление
        if (!table_name || !data?.set || !data?.where) {
          throw new Error("table_name, data.set и data.where обязательны");
        }
        
        const setClause = Object.entries(data.set)
          .map(([col, val]) => `${col} = $${Object.keys(data.set).indexOf(col) + 1}`)
          .join(", ");
        
        const updateSQL = `UPDATE ${table_name} SET ${setClause} WHERE ${data.where}`;
        const updateValues = Object.values(data.set);
        
        const updateResult = await client.query(updateSQL, updateValues);
        
        result = {
          status: "success",
          message: `✅ Обновлено ${updateResult.rowCount} записей в таблице ${table_name}`,
          table_name: table_name,
          rows_affected: updateResult.rowCount,
          sql: updateSQL,
          ai_context: "Массовое обновление выполнено"
        };
        break;

      case "bulk_delete":
        // Массовое удаление
        if (!table_name || !data?.where) {
          throw new Error("table_name и data.where обязательны");
        }
        
        // Предварительная проверка: сколько записей будет удалено
        const previewSQL = `SELECT COUNT(*) as count FROM ${table_name} WHERE ${data.where}`;
        const previewResult = await client.query(previewSQL);
        const recordsToDelete = previewResult.rows[0].count;
        
        // Проверка безопасности: не удаляем слишком много без подтверждения
        const safetyLimit = data?.safety_limit || 1000;
        if (recordsToDelete > safetyLimit && !data?.force_confirm) {
          result = {
            status: "warning",
            message: `🔒 МАССОВОЕ УДАЛЕНИЕ ЗАБЛОКИРОВАНО: Будет удалено ${recordsToDelete} записей`,
            records_to_delete: recordsToDelete,
            safety_limit: safetyLimit,
            confirmation_required: true,
            safety_hint: "Добавьте 'force_confirm: true' в data для подтверждения массового удаления",
            preview_query: previewSQL,
            ai_context: "Массовое удаление заблокировано из соображений безопасности"
          };
          break;
        }
        
        if (recordsToDelete === 0) {
          result = {
            status: "info",
            message: "ℹ️ Записи для удаления не найдены",
            table_name: table_name,
            rows_affected: 0,
            where_condition: data.where,
            ai_context: "Условие WHERE не соответствует ни одной записи"
          };
          break;
        }
        
        const deleteSQL = `DELETE FROM ${table_name} WHERE ${data.where}`;
        const deleteResult = await client.query(deleteSQL);
        
        result = {
          status: "success",
          message: `✅ Удалено ${deleteResult.rowCount} записей из таблицы ${table_name}`,
          table_name: table_name,
          rows_affected: deleteResult.rowCount,
          where_condition: data.where,
          sql: deleteSQL,
          ai_context: "Массовое удаление выполнено безопасно"
        };
        break;

      case "apply_migration":
        // Применение миграции
        if (!data?.migration_sql) throw new Error("data.migration_sql обязателен");
        
        const migrationName = data.migration_name || `migration_${Date.now()}`;
        
        // Создание таблицы миграций если не существует
        await client.query(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            migration_name VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            sql_content TEXT
          )
        `);
        
        // Проверка, не применена ли уже миграция
        const existingMigration = await client.query(
          'SELECT id FROM schema_migrations WHERE migration_name = $1',
          [migrationName]
        );
        
        if (existingMigration.rows.length > 0) {
          throw new Error(`Миграция ${migrationName} уже применена`);
        }
        
        // Применение миграции в транзакции
        await client.query('BEGIN');
        
        try {
          // Выполнение SQL миграции
          await client.query(data.migration_sql);
          
          // Запись о применении миграции
          await client.query(
            'INSERT INTO schema_migrations (migration_name, sql_content) VALUES ($1, $2)',
            [migrationName, data.migration_sql]
          );
          
          await client.query('COMMIT');
          
          result = {
            status: "success",
            message: `✅ Миграция ${migrationName} успешно применена`,
            migration_name: migrationName,
            sql: data.migration_sql,
            ai_context: "Миграция применена и записана в историю"
          };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
        break;

      case "rollback_migration":
        // Откат миграции
        if (!data?.migration_name || !data?.rollback_sql) {
          throw new Error("data.migration_name и data.rollback_sql обязательны");
        }
        
        // Проверка существования миграции
        const migrationToRollback = await client.query(
          'SELECT id FROM schema_migrations WHERE migration_name = $1',
          [data.migration_name]
        );
        
        if (migrationToRollback.rows.length === 0) {
          throw new Error(`Миграция ${data.migration_name} не найдена`);
        }
        
        // Откат в транзакции
        await client.query('BEGIN');
        
        try {
          // Выполнение SQL отката
          await client.query(data.rollback_sql);
          
          // Удаление записи о миграции
          await client.query(
            'DELETE FROM schema_migrations WHERE migration_name = $1',
            [data.migration_name]
          );
          
          await client.query('COMMIT');
          
          result = {
            status: "success",
            message: `✅ Миграция ${data.migration_name} успешно откатана`,
            migration_name: data.migration_name,
            sql: data.rollback_sql,
            ai_context: "Миграция откатана и удалена из истории"
          };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
        break;

      case "list_migrations":
        // Список применённых миграций
        const migrationsResult = await client.query(`
          SELECT 
            migration_name,
            applied_at,
            sql_content
          FROM schema_migrations 
          ORDER BY applied_at DESC
        `);
        
        result = {
          status: "success",
          migrations: migrationsResult.rows,
          count: migrationsResult.rowCount,
          ai_context: "Список всех применённых миграций"
        };
        break;

      case "backup_schema":
        // Создание бэкапа схемы (структуры)
        const backupSchemaSQL = `
          SELECT 
            'CREATE TABLE ' || schemaname || '.' || tablename || ' (' || 
            string_agg(
              column_name || ' ' || data_type || 
              CASE 
                WHEN is_nullable = 'NO' THEN ' NOT NULL'
                ELSE ''
              END ||
              CASE 
                WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default
                ELSE ''
              END,
              ', '
            ) || ');' as create_statement
          FROM information_schema.columns c
          JOIN pg_tables t ON c.table_name = t.tablename
          WHERE c.table_schema = $1
          GROUP BY schemaname, tablename
          ORDER BY tablename
        `;
        
        const backupResult = await client.query(backupSchemaSQL, [schema]);
        
        result = {
          status: "success",
          schema_backup: backupResult.rows,
          schema: schema,
          ai_context: "Бэкап структуры схемы создан"
        };
        break;

      // 🔒 ФУНКЦИИ БЕЗОПАСНОСТИ И ПОДТВЕРЖДЕНИЯ
      case "check_table_safety":
        // Проверка безопасности операций с таблицей
        if (!table_name) throw new Error("table_name обязателен");
        
        const safetyCheck = await client.query(`
          SELECT 
            t.table_name,
            (SELECT count(*) FROM ${table_name}) as row_count,
            pg_size_pretty(pg_total_relation_size('${table_name}')) as table_size,
            CASE 
              WHEN EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE table_name = t.table_name AND constraint_type = 'FOREIGN KEY'
              ) THEN true ELSE false 
            END as has_foreign_keys,
            CASE 
              WHEN EXISTS (
                SELECT 1 FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                WHERE kcu.referenced_table_name = t.table_name
              ) THEN true ELSE false 
            END as is_referenced_by_others
          FROM information_schema.tables t
          WHERE t.table_name = $1 AND t.table_schema = $2
        `, [table_name, schema]);
        
        const checks = safetyCheck.rows[0];
        let warnings = [];
        
        if (checks.row_count > 10000) {
          warnings.push("⚠️ Таблица содержит более 10,000 записей - операция может быть медленной");
        }
        if (checks.has_foreign_keys) {
          warnings.push("⚠️ Таблица имеет внешние ключи - изменения могут нарушить целостность");
        }
        if (checks.is_referenced_by_others) {
          warnings.push("⚠️ На таблицу ссылаются другие таблицы - удаление может нарушить связи");
        }
        
        result = {
          status: "success",
          table_name,
          safety_info: checks,
          warnings: warnings,
          is_safe: warnings.length === 0,
          ai_context: "Анализ безопасности операций с таблицей"
        };
        break;

      case "confirm_destructive_operation":
        // Подтверждение разрушающих операций
        if (!data?.operation_type || !data?.confirmation_token) {
          throw new Error("operation_type и confirmation_token обязательны");
        }
        
        const allowedOperations = ['DROP_TABLE', 'TRUNCATE_TABLE', 'BULK_DELETE', 'DROP_SCHEMA'];
        if (!allowedOperations.includes(data.operation_type)) {
          throw new Error(`Неизвестная операция: ${data.operation_type}`);
        }
        
        // Проверка токена подтверждения (должен быть timestamp + операция)
        const expectedToken = `${data.operation_type}_${Math.floor(Date.now() / 60000)}`; // 1 минута действия
        if (data.confirmation_token !== expectedToken) {
          throw new Error("Неверный или просроченный токен подтверждения");
        }
        
        result = {
          status: "success",
          operation_confirmed: true,
          operation_type: data.operation_type,
          valid_until: new Date(Date.now() + 60000).toISOString(),
          ai_context: "Разрушающая операция подтверждена и может быть выполнена в течение 1 минуты"
        };
        break;

      case "generate_confirmation_token":
        // Генерация токена подтверждения для опасных операций
        if (!data?.operation_type) {
          throw new Error("operation_type обязателен");
        }
        
        const token = `${data.operation_type}_${Math.floor(Date.now() / 60000)}`;
        
        result = {
          status: "success",
          confirmation_token: token,
          operation_type: data.operation_type,
          expires_at: new Date(Date.now() + 60000).toISOString(),
          ai_context: "Токен подтверждения сгенерирован. Используйте его в течение 1 минуты для подтверждения операции"
        };
        break;

      default:
        throw new Error(`❌ Неизвестное действие: ${action}`);
    }

    await client.end();

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text", 
        text: JSON.stringify({
          status: "error",
          error: error.message,
          action: action,
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
      isError: true
    };
  }
}

// 🌐 Universal API Client - ИСПРАВЛЕННАЯ ВЕРСИЯ
async function handleUniversalAPIClient(args) {
  const { 
    method, 
    url, 
    headers = {}, 
    data, 
    auth_type = "none", 
    auth_token
  } = args;

  try {
    // Проверка доступности fetch
    if (!fetch) {
      throw new Error("Fetch не доступен. Установите: npm install node-fetch");
    }

    // Настройка заголовков
    const requestHeaders = { 
      'User-Agent': 'PostgreSQL-API-SSH-MCP-Server/1.0.0',
      'Accept': 'application/json',
      ...headers 
    };
    
    // Обработка аутентификации
    if (auth_type === "bearer" && auth_token) {
      requestHeaders['Authorization'] = `Bearer ${auth_token}`;
    }

    // Настройка опций запроса
    const fetchOptions = {
      method,
      headers: requestHeaders,
      timeout: 30000 // 30 секунд таймаут
    };

    // Добавление тела запроса для POST/PUT/PATCH
    if (data && ["POST", "PUT", "PATCH"].includes(method)) {
      if (!requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/json';
      }
      fetchOptions.body = JSON.stringify(data);
    }

    const response = await fetch(url, fetchOptions);
    
    let result = {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      method: method,
      headers: Object.fromEntries(response.headers.entries())
    };

    // Улучшенная обработка ответа
    const contentType = response.headers.get('content-type');
    try {
      if (contentType && contentType.includes('application/json')) {
        result.data = await response.json();
      } else {
        result.data = await response.text();
      }
    } catch (parseError) {
      result.data = null;
      result.parseError = parseError.message;
    }

    result.success = response.ok;
    result.message = response.ok ? '✅ Запрос выполнен успешно' : `❌ HTTP ${response.status}: ${response.statusText}`;

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: error.message,
          method: method,
          url: url,
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
      isError: true
    };
  }
}

// 🔐 SSH Manager - ИСПРАВЛЕННАЯ ВЕРСИЯ
async function handleSSHManager(args) {
  const {
    action,
    host,
    port = 22,
    username,
    password,
    command,
    timeout = 30
  } = args;
  
  try {
    // Проверка доступности модуля
    if (!sshClient) {
      throw new Error("SSH2 модуль не установлен. Выполните: npm install ssh2");
    }

    const conn = new sshClient();
    
    const result = await new Promise((resolve, reject) => {
      const config = {
        host,
        port,
        username,
        password,
        readyTimeout: timeout * 1000,
        algorithms: {
          serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
          cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
          hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
          kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group16-sha512']
        }
      };
      
      conn.on('ready', () => {
        switch (action) {
          case 'connect':
            conn.end(); // Закрываем соединение после проверки
            resolve({
              status: 'success',
              message: '✅ SSH соединение установлено',
              host,
              username,
              port,
              timestamp: new Date().toISOString()
            });
            break;
            
          case 'execute':
            if (!command) {
              conn.end();
              reject(new Error('❌ Команда обязательна'));
              return;
            }
            
            conn.exec(command, (err, stream) => {
              if (err) {
                conn.end();
                reject(err);
                return;
              }
              
              let stdout = '';
              let stderr = '';
              
              stream
                .on('close', (code, signal) => {
                  conn.end();
                  resolve({
                    status: 'success',
                    command,
                    stdout,
                    stderr,
                    exit_code: code,
                    signal,
                    success: code === 0,
                    timestamp: new Date().toISOString()
                  });
                })
                .on('data', (data) => {
                  stdout += data.toString();
                })
                .stderr.on('data', (data) => {
                  stderr += data.toString();
                });
            });
            break;
            
          default:
            conn.end();
            reject(new Error(`❌ Неизвестное SSH действие: ${action}`));
        }
      });
      
      conn.on('error', (err) => {
        conn.end();
        reject(new Error(`❌ SSH ошибка: ${err.message}`));
      });
      
      conn.connect(config);
    });
    
    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify(result, null, 2) 
      }]
    };
    
  } catch (error) {
    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify({ 
          status: "error",
          error: error.message,
          action,
          host,
          timestamp: new Date().toISOString()
        }, null, 2) 
      }],
      isError: true
    };
  }
}

// 📋 Регистрация инструментов MCP - ИСПРАВЛЕННАЯ ВЕРСИЯ
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "postgresql_manager",
      description: "🚀 ПОЛНОФУНКЦИОНАЛЬНЫЙ PostgreSQL МЕНЕДЖЕР + ИИ АНАЛИЗ + РЕДАКТИРОВАНИЕ БД + БЕЗОПАСНОСТЬ - ИИ АГЕНТ МОЖЕТ ПОЛНОСТЬЮ УПРАВЛЯТЬ БАЗОЙ ДАННЫХ: 📊 АНАЛИЗ: analyze_schema, table_structure, sample_data, table_stats, relationships, indexes, generate_query, database_overview 🛠️ РЕДАКТИРОВАНИЕ: create_table, alter_table, drop_table, create_index, drop_index, add_constraint, drop_constraint, create_schema, drop_schema, truncate_table, bulk_update, bulk_delete 🔄 МИГРАЦИИ: apply_migration, rollback_migration, list_migrations, backup_schema 🔒 БЕЗОПАСНОСТЬ: check_table_safety, confirm_destructive_operation, generate_confirmation_token - МАКСИМАЛЬНЫЕ ВОЗМОЖНОСТИ ДЛЯ ИИ РАБОТЫ С POSTGRESQL!",
      inputSchema: {
        type: "object",
        properties: {
                  action: { 
          type: "string", 
          enum: [
            "connect", "query", "insert", "show_tables",
            "analyze_schema", "table_structure", "sample_data", 
            "table_stats", "relationships", "indexes", 
            "generate_query", "database_overview",
            "create_table", "alter_table", "drop_table",
            "create_index", "drop_index", "add_constraint", "drop_constraint",
            "create_schema", "drop_schema", "truncate_table",
            "bulk_update", "bulk_delete", "apply_migration", 
            "rollback_migration", "list_migrations", "backup_schema",
            "check_table_safety", "confirm_destructive_operation", "generate_confirmation_token"
          ],
          description: "Действие для выполнения с PostgreSQL. ИИ анализ: analyze_schema, table_structure, sample_data, table_stats, relationships, indexes, generate_query, database_overview. Редактирование БД: create_table, alter_table, drop_table, create_index, drop_index, add_constraint, drop_constraint, create_schema, drop_schema, truncate_table, bulk_update, bulk_delete, apply_migration, rollback_migration, list_migrations, backup_schema. Безопасность: check_table_safety, confirm_destructive_operation, generate_confirmation_token"
        },
          host: { type: "string", description: "Хост PostgreSQL" },
          port: { type: "integer", description: "Порт PostgreSQL" },
          username: { type: "string", description: "Имя пользователя PostgreSQL" },
          password: { type: "string", description: "Пароль PostgreSQL" },
          database: { type: "string", description: "Имя базы данных" },
                  table_name: { type: "string", description: "Имя таблицы" },
        sql: { type: "string", description: "SQL запрос" },
        data: { type: "object", description: "Данные для вставки" },
        where_clause: { type: "string", description: "WHERE условие" },
        limit: { type: "integer", description: "Лимит записей для sample_data (по умолчанию 10)" },
        schema: { type: "string", description: "Схема базы данных (по умолчанию 'public')" }
        },
        required: ["action"]
      }
    },
    {
      name: "universal_api_client",
      description: "🌐 УНИВЕРСАЛЬНЫЙ API КЛИЕНТ - ИИ АГЕНТ ДОЛЖЕН ИСПОЛЬЗОВАТЬ ДЛЯ ВСЕХ REST API ОПЕРАЦИЙ: GET, POST, PUT, DELETE запросы с аутентификацией",
      inputSchema: {
        type: "object",
        properties: {
          method: { 
            type: "string", 
            enum: ["GET", "POST", "PUT", "DELETE", "PATCH"], 
            description: "HTTP метод" 
          },
          url: { type: "string", description: "URL для запроса" },
          headers: { type: "object", description: "HTTP заголовки" },
          data: { type: "object", description: "Данные для POST/PUT" },
          auth_type: { 
            type: "string", 
            enum: ["none", "bearer"], 
            description: "Тип аутентификации" 
          },
          auth_token: { type: "string", description: "Токен авторизации" }
        },
        required: ["method", "url"]
      }
    },
    {
      name: "ssh_manager",
      description: "🔐 УНИВЕРСАЛЬНЫЙ SSH МЕНЕДЖЕР - ИИ АГЕНТ ДОЛЖЕН ИСПОЛЬЗОВАТЬ ДЛЯ ВСЕХ SSH ОПЕРАЦИЙ: подключение к серверам, выполнение команд, управление системой",
      inputSchema: {
        type: "object",
        properties: {
          action: { 
            type: "string", 
            enum: ["connect", "execute"],
            description: "Действие SSH" 
          },
          host: { type: "string", description: "Хост SSH сервера" },
          port: { type: "integer", description: "Порт SSH" },
          username: { type: "string", description: "Имя пользователя SSH" },
          password: { type: "string", description: "Пароль SSH" },
          command: { type: "string", description: "Команда для выполнения" },
          timeout: { type: "integer", description: "Таймаут в секундах" }
        },
        required: ["action", "host", "username"]
      }
    }
  ]
}));

// 🎯 Обработка вызовов инструментов - УЛУЧШЕННАЯ ВЕРСИЯ
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    console.error(`🔧 Вызов инструмента: ${name}`);
    
    switch (name) {
      case "postgresql_manager":
        return await handlePostgreSQLManager(args);
      case "universal_api_client":
        return await handleUniversalAPIClient(args);
      case "ssh_manager":
        return await handleSSHManager(args);
      default:
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              status: "error",
              error: `❌ Неизвестный инструмент: ${name}`,
              available_tools: ["postgresql_manager", "universal_api_client", "ssh_manager"]
            }, null, 2) 
          }],
          isError: true
        };
    }
  } catch (error) {
    console.error(`❌ Ошибка выполнения ${name}:`, error);
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

// 🚀 Запуск MCP сервера - УЛУЧШЕННАЯ ВЕРСИЯ
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("🚀 PostgreSQL API SSH MCP Server v1.0.0 запущен (ИСПРАВЛЕННАЯ ВЕРСИЯ)");
    console.error("✅ Все модули загружены и сервер готов к работе");
    console.error(`📊 Доступные модули: PG=${!!pgClient}, SSH=${!!sshClient}, Fetch=${!!fetch}`);
    
    // Обработка сигналов завершения
    process.on('SIGINT', () => {
      console.error('💾 Получен сигнал завершения, корректно завершаем работу...');
      process.exit(0);
    });
    
    process.stdin.resume();
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
}

main().catch(console.error); 