import { describe, it, expect } from 'bun:test';
import {
  COURSE_UNITS,
  nextUnit,
  resolveCourseRoute,
  unitsForTrack,
  type UnitEvidence,
} from '../course-units.js';

const EMPTY: UnitEvidence = {
  kanaOk: [],
  quizBySkill: {},
  lessonsDone: [],
  wordsStudied: [],
  examsPassed: [],
};

describe('course-units（课程单元与解锁）', () => {
  it('ja 零基础 12 单元 + 初学 4 单元，前置成链', () => {
    const units = unitsForTrack('ja');
    expect(units.length).toBe(16);
    const ids = units.map((u) => u.id);
    expect(ids).toContain('ja-u-vowels');
    expect(ids).toContain('ja-u-exam0');
    // 前置引用的单元都存在（不断链）
    for (const u of units) {
      for (const r of u.requires) {
        expect(ids).toContain(r);
      }
    }
    // 无环：拓扑序存在（按 requires 逐个可满足）
    const done = new Set<string>();
    const pending = [...units];
    let progressed = true;
    while (pending.length > 0 && progressed) {
      progressed = false;
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i]!.requires.every((r) => done.has(r))) {
          done.add(pending[i]!.id);
          pending.splice(i, 1);
          progressed = true;
        }
      }
    }
    expect(pending.length).toBe(0);
  });

  it('新人：仅元音与问候线头可用（问候要元音先行），其余锁定', () => {
    const route = resolveCourseRoute('ja', EMPTY, new Set());
    const byId = new Map(route.map((r) => [r.unit.id, r]));
    expect(byId.get('ja-u-vowels')?.status).toBe('available');
    // 问候 requires 元音 → 锁定；元音掌握后放行
    expect(byId.get('ja-u-greet')?.status).toBe('locked');
    expect(byId.get('ja-u-exam0')?.status).toBe('locked');
    expect(nextUnit(route)?.unit.id).toBe('ja-u-vowels');
  });

  it('证据达标即掌握（调用方写档；纯函数不写库）', () => {
    const evidence: UnitEvidence = {
      ...EMPTY,
      kanaOk: ['kana_a', 'kana_i', 'kana_u', 'kana_e', 'kana_o'],
    };
    const route = resolveCourseRoute('ja', evidence, new Set());
    const byId = new Map(route.map((r) => [r.unit.id, r]));
    expect(byId.get('ja-u-vowels')?.status).toBe('mastered');
    expect(byId.get('ja-u-greet')?.status).toBe('available');
    expect(byId.get('ja-u-kasa')?.status).toBe('available');
  });

  it('已记录掌握永不收回（即使证据消失）', () => {
    const route = resolveCourseRoute('ja', EMPTY, new Set(['ja-u-vowels', 'ja-u-greet']));
    const byId = new Map(route.map((r) => [r.unit.id, r]));
    expect(byId.get('ja-u-vowels')?.status).toBe('mastered');
    expect(byId.get('ja-u-words1')?.status).toBe('available');
  });

  it('讲义/测评/做题证据口径（深链级联）', () => {
    const chain = [
      'ja-u-vowels', 'ja-u-kasa', 'ja-u-tana', 'ja-u-hm', 'ja-u-ryw', 'ja-u-dakuten',
      'ja-u-greet', 'ja-u-words1', 'ja-u-lesson-nide', 'ja-u-words2',
    ];
    const evidence: UnitEvidence = {
      kanaOk: [],
      quizBySkill: { 'jp.sentence.review': { attempts: 4, correct: 3 } },
      lessonsDone: ['jp.particle.ni_vs_de'],
      wordsStudied: [],
      examsPassed: ['BEGINNER'],
    };
    const route = resolveCourseRoute('ja', evidence, new Set(chain));
    const byId = new Map(route.map((r) => [r.unit.id, r]));
    // 前置链全齐 + 各自证据（讲义已学/考试已过）→ 级联掌握，tara 开放
    expect(byId.get('ja-u-lesson-nide')?.status).toBe('mastered');
    expect(byId.get('ja-u-exam0')?.status).toBe('mastered');
    expect(byId.get('ja-u-lesson-tara')?.status).toBe('available');
    // 前置未齐时自身证据再好也锁定（exam0 无链时）
    const locked = resolveCourseRoute('ja', evidence, new Set(['ja-u-vowels']));
    expect(locked.find((r) => r.unit.id === 'ja-u-exam0')?.status).toBe('locked');
    // 做题证据：textbook1 不在 exam0 链上 → 锁定；放开链后按做题口径评估
    expect(locked.find((r) => r.unit.id === 'ja-u-textbook1')?.status).toBe('locked');
    expect(byId.get('ja-u-textbook1')?.status).toBe('mastered');
    expect(byId.get('ja-u-textbook1')?.progress).toBe('已达标');
  });

  it('生词按组取数（网关传入候选集）', () => {
    const resolved = { 'ja-n5-core': ['w1', 'w2', 'w3'] };
    const evidence: UnitEvidence = { ...EMPTY, wordsStudied: ['w1', 'w2'] };
    const route = resolveCourseRoute('ja', evidence, new Set(['ja-u-vowels', 'ja-u-greet']), resolved);
    // words1 要 10/20：只有 2 个 → available 且进度 2/10
    const w1 = route.find((r) => r.unit.id === 'ja-u-words1')!;
    expect(w1.status).toBe('available');
    expect(w1.progress).toBe('2/10');
  });

  it('en/ko 各有一条可走的线', () => {
    expect(unitsForTrack('en').length).toBeGreaterThan(0);
    expect(unitsForTrack('ko').length).toBeGreaterThan(0);
    expect(nextUnit(resolveCourseRoute('en', EMPTY, new Set()))?.status).toBe('available');
    expect(nextUnit(resolveCourseRoute('ko', EMPTY, new Set()))?.status).toBe('available');
  });

  it('COURSE_UNITS 全量自检：阶段/活动合法', () => {
    const kinds = new Set(['NEW_WORDS', 'CARDS', 'GRAMMAR', 'READING', 'QUIZ', 'MISTAKES', 'PRACTICE_PLAN', 'ALPHABET']);
    for (const u of COURSE_UNITS) {
      expect([0, 1, 2, 3]).toContain(u.stage);
      expect(kinds.has(u.activity.planKind)).toBe(true);
      expect(u.title.length).toBeGreaterThan(0);
    }
  });
});
