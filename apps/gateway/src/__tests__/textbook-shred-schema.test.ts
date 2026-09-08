import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';

/**
 * v14 教材 shred 表：只验表结构与约束（shred 写逻辑下一轮）。
 * - 四张行表 + FTS + 知识映射表存在，主键/唯一约束生效；
 * - map 表 skill_id/entry_id 可空（未映射≠脏数据，可统计覆盖率）。
 */
describe('textbook shred schema（v14）', () => {
  let repo: DrizzleLearnerRepository;

  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  afterEach(() => {
    repo.getRawDb().close();
  });

  it('迁移 v14 已登记', () => {
    const rows = repo
      .getRawDb()
      .query<{ version: number }, []>('SELECT version AS version FROM schema_migrations ORDER BY version')
      .all();
    expect(rows.map((r) => r.version)).toContain(14);
  });

  it('行表主键防重（同文档同课同序只存一行）', () => {
    const db = repo.getRawDb();
    db.query(
      `INSERT INTO textbook_lessons (document_id, lesson_id, lesson_number, title)
       VALUES ('d1', 'l1', 1, '第 1 課')`
    ).run();
    db.query(
      `INSERT INTO textbook_vocab (document_id, lesson_id, ord, surface, reading, gloss_zh)
       VALUES ('d1', 'l1', 0, '食べる', 'たべる', '吃')`
    ).run();
    expect(() =>
      db.query(
        `INSERT INTO textbook_vocab (document_id, lesson_id, ord, surface)
         VALUES ('d1', 'l1', 0, '食べる')`
      ).run()
    ).toThrow();
  });

  it('FTS 虚表可写可查', () => {
    const db = repo.getRawDb();
    db.query(
      `INSERT INTO textbook_fts (surface, reading, gloss, ja, zh, document_id, lesson_id, kind, ref)
       VALUES ('食べる', 'たべる', '吃', '', '', 'd1', 'l1', 'vocab', '食べる')`
    ).run();
    const rows = db
      .query('SELECT lesson_id AS lessonId FROM textbook_fts WHERE textbook_fts MATCH ?')
      .all('たべる') as Array<{ lessonId: string }>;
    expect(rows.map((r) => r.lessonId)).toContain('l1');
  });

  it('map 表允许空映射（未映射可统计，不算脏数据）', () => {
    const db = repo.getRawDb();
    db.query(
      `INSERT INTO textbook_term_map (document_id, lesson_id, kind, ref_text, skill_id, entry_id)
       VALUES ('d1', 'l1', 'grammar', '某文法', NULL, NULL),
              ('d1', 'l1', 'vocab', '食べる', NULL, 'n5_ja_taberu')`
    ).run();
    const unmapped = db
      .query('SELECT COUNT(*) AS n FROM textbook_term_map WHERE skill_id IS NULL AND entry_id IS NULL')
      .get() as { n: number };
    expect(unmapped.n).toBe(1);
  });
});
