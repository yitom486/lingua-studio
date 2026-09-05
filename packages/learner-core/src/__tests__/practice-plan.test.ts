import { describe, expect, it } from 'bun:test';
import { isOk, isErr } from '@study-studio/shared';
import type { PracticeBlockSpec, PracticePlanTemplate } from '@study-studio/protocol';
import {
  validateBlockSpec,
  validatePracticePlanTemplate,
  freezeRunFromTemplate,
  isRunComplete,
  parsePracticeBlockSpec,
  parsePracticeBlockSpecs,
  SUBJECTIVE_BATCH_MAX_COUNT,
} from '../practice-plan.js';

function baseBlock(overrides: Partial<PracticeBlockSpec> = {}): PracticeBlockSpec {
  return {
    id: 'b1',
    kind: 'QUIZ',
    count: 5,
    gradingMode: 'AUTO_IMMEDIATE',
    ...overrides,
  };
}

function baseTemplate(blocks: PracticeBlockSpec[]): PracticePlanTemplate {
  return {
    id: 'tpl_1',
    userId: 'u1',
    language: 'en',
    name: '晚间 35 分钟',
    enabled: true,
    revision: 1,
    blocks,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  };
}

describe('validateBlockSpec', () => {
  it('accepts a valid objective block', () => {
    const res = validateBlockSpec(baseBlock());
    expect(isOk(res)).toBe(true);
  });

  it('rejects count out of range', () => {
    expect(isErr(validateBlockSpec(baseBlock({ count: 0 })))).toBe(true);
    expect(isErr(validateBlockSpec(baseBlock({ count: 31 })))).toBe(true);
  });

  it('rejects objective block with AI grading', () => {
    const res = validateBlockSpec(baseBlock({ gradingMode: 'AI_BATCH' }));
    expect(isErr(res)).toBe(true);
  });

  it('rejects subjective block with AUTO_IMMEDIATE', () => {
    const res = validateBlockSpec(
      baseBlock({ kind: 'TRANSLATION', gradingMode: 'AUTO_IMMEDIATE' })
    );
    expect(isErr(res)).toBe(true);
  });

  it('enforces subjective batch cap', () => {
    const ok = validateBlockSpec(
      baseBlock({
        kind: 'TRANSLATION',
        gradingMode: 'AI_BATCH',
        count: SUBJECTIVE_BATCH_MAX_COUNT,
      })
    );
    expect(isOk(ok)).toBe(true);
    const bad = validateBlockSpec(
      baseBlock({
        kind: 'TRANSLATION',
        gradingMode: 'AI_BATCH',
        count: SUBJECTIVE_BATCH_MAX_COUNT + 1,
      })
    );
    expect(isErr(bad)).toBe(true);
  });

  it('rejects vocabularySource on non-vocab block', () => {
    const res = validateBlockSpec(baseBlock({ vocabularySource: 'DUE_CARDS' }));
    expect(isErr(res)).toBe(true);
  });

  it('rejects translationDirection on non-translation block', () => {
    const res = validateBlockSpec(
      baseBlock({ translationDirection: { sourceLanguage: 'zh', targetLanguage: 'en' } })
    );
    expect(isErr(res)).toBe(true);
  });
});

describe('validatePracticePlanTemplate', () => {
  it('accepts a valid template', () => {
    const res = validatePracticePlanTemplate(baseTemplate([baseBlock({ id: 'b1' })]));
    expect(isOk(res)).toBe(true);
  });

  it('rejects empty blocks', () => {
    const res = validatePracticePlanTemplate(baseTemplate([]));
    expect(isErr(res)).toBe(true);
  });

  it('rejects duplicate block ids', () => {
    const res = validatePracticePlanTemplate(
      baseTemplate([baseBlock({ id: 'b1' }), baseBlock({ id: 'b1', count: 3 })])
    );
    expect(isErr(res)).toBe(true);
  });
});

describe('freezeRunFromTemplate', () => {
  it('freezes a copy of blocks with revision', () => {
    const template = baseTemplate([
      baseBlock({ id: 'b1', skillIds: ['s1'] }),
      baseBlock({ id: 'b2', kind: 'TRANSLATION', gradingMode: 'AI_BATCH', count: 3 }),
    ]);
    const run = freezeRunFromTemplate({ template, runId: 'run_1' });
    expect(run.templateRevision).toBe(1);
    expect(run.templateId).toBe('tpl_1');
    expect(run.status).toBe('IN_PROGRESS');
    expect(run.blocks.map((b) => b.id)).toEqual(['b1', 'b2']);
    // 深拷贝：改模板不影响 run
    template.blocks[0]!.skillIds!.push('s2');
    expect(run.blocks[0]!.skillIds).toEqual(['s1']);
    // 改模板 revision 不影响已冻结 run
    template.revision = 2;
    expect(run.templateRevision).toBe(1);
  });
});

describe('isRunComplete', () => {
  it('returns true when all expected items submitted/graded', () => {
    const attempts = [
      { id: 'a1', runId: 'r1', blockId: 'b1', itemId: 'q1', status: 'GRADED' as const },
      { id: 'a2', runId: 'r1', blockId: 'b1', itemId: 'q2', status: 'SUBMITTED' as const },
    ];
    expect(isRunComplete(attempts, ['q1', 'q2'])).toBe(true);
  });

  it('returns false when any item pending or draft', () => {
    const attempts = [
      { id: 'a1', runId: 'r1', blockId: 'b1', itemId: 'q1', status: 'GRADED' as const },
      { id: 'a2', runId: 'r1', blockId: 'b1', itemId: 'q2', status: 'DRAFT' as const },
    ];
    expect(isRunComplete(attempts, ['q1', 'q2'])).toBe(false);
  });

  it('returns false for empty expected set', () => {
    expect(isRunComplete([], [])).toBe(false);
  });
});

describe('parsePracticeBlockSpec', () => {
  it('parses a full block', () => {
    const raw = {
      id: 'b1',
      kind: 'TRANSLATION',
      count: 3,
      gradingMode: 'AI_BATCH',
      translationDirection: { sourceLanguage: 'zh', targetLanguage: 'en' },
      skillIds: ['s1'],
    };
    const b = parsePracticeBlockSpec(raw);
    expect(b?.kind).toBe('TRANSLATION');
    expect(b?.translationDirection?.targetLanguage).toBe('en');
  });

  it('rejects corrupt input', () => {
    expect(parsePracticeBlockSpec(null)).toBeNull();
    expect(parsePracticeBlockSpec({ id: 'x' })).toBeNull();
    expect(parsePracticeBlockSpec({ id: 'x', kind: 'BOGUS', count: 1, gradingMode: 'AUTO_IMMEDIATE' })).toBeNull();
  });

  it('parsePracticeBlockSpecs rejects empty or corrupt arrays', () => {
    expect(parsePracticeBlockSpecs([])).toBeNull();
    expect(parsePracticeBlockSpecs([{ id: 'x' }])).toBeNull();
    const ok = parsePracticeBlockSpecs([
      { id: 'b1', kind: 'QUIZ', count: 1, gradingMode: 'AUTO_IMMEDIATE' },
    ]);
    expect(ok?.[0]?.id).toBe('b1');
  });
});
