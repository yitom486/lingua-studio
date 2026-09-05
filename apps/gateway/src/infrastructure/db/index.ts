import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema.js';
import { KANA_SEEDS } from './seeds/kana-seed.js';
import { INITIAL_READING_SEEDS } from './seeds/reading-seed.js';
import {
  INITIAL_CARD_SEEDS,
  INITIAL_EN_CARD_SEEDS,
  INITIAL_QUESTION_SEEDS,
  INITIAL_EN_QUESTION_SEEDS,
  INITIAL_KO_QUESTION_SEEDS,
  INITIAL_MISTAKE_SEEDS,
  INITIAL_SKILL_METRIC_SEEDS,
} from './seeds/learning-seed.js';
import { LEARNING_CONTENT_TEMPLATE_SEEDS } from './seeds/content-template-seed.js';
import { PITCH_LEXICON } from './seeds/pitch-seed.js';
import { TEXTBOOK_BOOKS } from './seeds/textbook-seed.js';

export * from './schema.js';
export { KANA_SEEDS } from './seeds/kana-seed.js';
export { INITIAL_READING_SEEDS } from './seeds/reading-seed.js';
export {
  INITIAL_CARD_SEEDS,
  INITIAL_EN_CARD_SEEDS,
  INITIAL_QUESTION_SEEDS,
  INITIAL_EN_QUESTION_SEEDS,
  INITIAL_KO_QUESTION_SEEDS,
  INITIAL_MISTAKE_SEEDS,
  INITIAL_SKILL_METRIC_SEEDS,
} from './seeds/learning-seed.js';
export { LEARNING_CONTENT_TEMPLATE_SEEDS } from './seeds/content-template-seed.js';
export { PITCH_LEXICON } from './seeds/pitch-seed.js';
export { TEXTBOOK_BOOKS } from './seeds/textbook-seed.js';

// P2-5 拆分：DDL 与种子数据各自成模块；此处 re-export 保持既有导入路径不变。
import { initSchema } from './ddl.js';
import { seedInitialData } from './seed-bootstrap.js';
export { initSchema } from './ddl.js';
export { seedInitialData, pitchMeaningToGlosses } from './seed-bootstrap.js';

export type DrizzleDb = BunSQLiteDatabase<typeof schema>;

export interface DrizzleInstance {
  db: DrizzleDb;
  sqlite: Database;
}

/**
 * 初始化 SQLite 结构并挂载 Drizzle ORM 客户端
 */
export function createDrizzleDb(dbOrPath: Database | string = ':memory:'): DrizzleInstance {
  const sqlite = typeof dbOrPath === 'string' ? new Database(dbOrPath, { create: true }) : dbOrPath;

  // 提升 SQLite 性能与数据完整性
  try {
    sqlite.run('PRAGMA journal_mode = WAL;');
    sqlite.run('PRAGMA foreign_keys = ON;');
  } catch {
    // 内存数据库可能不支持 WAL，静默忽略
  }

  initSchema(sqlite);
  seedInitialData(sqlite);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
