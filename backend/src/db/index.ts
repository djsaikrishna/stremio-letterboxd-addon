import Database from 'better-sqlite3';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { createChildLogger } from '../lib/logger.js';

const logger = createChildLogger('database');

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = config.DATABASE_PATH;
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    logger.info({ path: dbDir }, 'Created database directory');
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  logger.info({ path: dbPath }, 'Database connected');

  runMigrations(db);

  return db;
}

function runMigrations(database: Database.Database): void {
  const migrationsDir = join(__dirname, 'migrations');

  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const appliedMigrations = database
    .prepare('SELECT name FROM migrations')
    .all() as Array<{ name: string }>;
  const appliedSet = new Set(appliedMigrations.map((m) => m.name));

  // Read the directory instead of a hardcoded list: a new .sql file is picked
  // up on its own. An empty or missing directory means the build failed to copy
  // the migrations, so fail loudly rather than start on an outdated schema.
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    throw new Error(`No migration files found in ${migrationsDir}`);
  }

  for (const file of migrationFiles) {
    if (appliedSet.has(file)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');

    database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    })();

    logger.info({ migration: file }, 'Applied migration');
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}
