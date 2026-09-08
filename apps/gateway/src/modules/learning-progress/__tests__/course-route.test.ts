import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../../../infrastructure/drizzle-learner-repository.js';

/** 课程路线：长期路线求值 + 新掌握写档（已记录永不收回）。 */
describe('course route', () => {
  let repo: DrizzleLearnerRepository;
  const userId = 'route_user';

  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  afterEach(() => {
    repo.getRawDb().close();
  });

  it('新人：元音可用，其余锁定；nextUp 指向元音', async () => {
    const res = await repo.getCourseRoute(userId, 'ja');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.units.length).toBe(16);
    expect(res.value.nextUpId).toBe('ja-u-vowels');
    const byId = new Map(res.value.units.map((u) => [u.unit.id, u]));
    expect(byId.get('ja-u-vowels')?.status).toBe('available');
    expect(byId.get('ja-u-kasa')?.status).toBe('locked');
  });

  it('假名练对即计覆盖：5 元音干净 → 元音掌握写档，K 行放行', async () => {
    for (const k of ['kana_a', 'kana_i', 'kana_u', 'kana_e', 'kana_o']) {
      const r = await repo.recordKanaPractice(userId, k, true, 'HIRAGANA');
      expect(isOk(r)).toBe(true);
    }
    const res = await repo.getCourseRoute(userId, 'ja');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    const byId = new Map(res.value.units.map((u) => [u.unit.id, u]));
    expect(byId.get('ja-u-vowels')?.status).toBe('mastered');
    expect(byId.get('ja-u-greet')?.status).toBe('available');
    expect(byId.get('ja-u-kasa')?.status).toBe('available');
    // 写档：下次调用仍是已掌握（证据消失也不收回，由库行保证）
    const again = await repo.getCourseRoute(userId, 'ja');
    expect(isOk(again)).toBe(true);
    if (!isOk(again)) return;
    expect(again.value.units.find((u) => u.unit.id === 'ja-u-vowels')?.status).toBe('mastered');
    const rows = repo
      .getRawDb()
      .query('SELECT unit_id AS unitId FROM unit_progress WHERE user_id = ?')
      .all(userId) as Array<{ unitId: string }>;
    expect(rows.map((r) => r.unitId)).toContain('ja-u-vowels');
  });

  it('答错不计干净覆盖（反复练同几个也混不过去）', async () => {
    await repo.recordKanaPractice(userId, 'kana_a', true, 'HIRAGANA');
    await repo.recordKanaPractice(userId, 'kana_a', true, 'HIRAGANA');
    await repo.recordKanaPractice(userId, 'kana_i', false, 'HIRAGANA');
    const res = await repo.getCourseRoute(userId, 'ja');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    const vowels = res.value.units.find((u) => u.unit.id === 'ja-u-vowels')!;
    expect(vowels.status).toBe('available');
    expect(vowels.progress).toBe('1/5');
  });

  it('生词/讲义证据联动：问候掌握开单词线', async () => {
    for (const e of ['starter_ja_ohayou', 'n5_ja_arigatou', 'n5_ja_sumimasen']) {
      const c = await repo.collectDictionaryEntry(userId, e);
      expect(isOk(c)).toBe(true);
      if (!isOk(c)) return;
      const s = await repo.markCardStudied(userId, c.value.card.id);
      expect(isOk(s)).toBe(true);
    }
    // 问候要元音前置：先把元音打通
    for (const k of ['kana_a', 'kana_i', 'kana_u', 'kana_e', 'kana_o']) {
      await repo.recordKanaPractice(userId, k, true, 'HIRAGANA');
    }
    const res = await repo.getCourseRoute(userId, 'ja');
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    const byId = new Map(res.value.units.map((u) => [u.unit.id, u]));
    expect(byId.get('ja-u-greet')?.status).toBe('mastered');
    expect(byId.get('ja-u-words1')?.status).toBe('available');
  });

  it('ko/en starter 线可用', async () => {
    const ko = await repo.getCourseRoute(userId, 'ko');
    expect(isOk(ko)).toBe(true);
    if (!isOk(ko)) return;
    expect(ko.value.nextUpId).toBe('ko-u-starter');
  });
});
