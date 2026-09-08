import { describe, it, expect } from 'bun:test';
import {
  groundClassifications,
  parseStructureJson,
} from '../application/pdf-import/structure-classify.js';
import {
  StructureClassSchema,
  type HeadingCandidate,
} from '@study-studio/protocol';

const CANDIDATES: HeadingCandidate[] = [
  { page: 3, text: '第3課' },
  { page: 5, text: '会話' },
  { page: 9, text: 'これは本です' },
];
const ALLOWED = new Set(['jp.particle.ni_vs_de', 'jp.grammar.conditional_tara']);

/** mini 分流分类：联合枚举 + zod + 接地（文本逐字对、技能白名单）。 */
describe('structure classify grounding', () => {
  it('合法输出全收：kind 枚举 + 技能白名单内保留', () => {
    const { classes, dropped } = groundClassifications(
      [
        { text: '第3課', kind: 'lesson', lessonNo: '3', skillId: null },
        { text: '会話', kind: 'section', lessonNo: null, skillId: 'jp.particle.ni_vs_de' },
      ],
      CANDIDATES,
      ALLOWED
    );
    expect(dropped).toBe(0);
    expect(classes.length).toBe(2);
    expect(classes[0]).toMatchObject({ text: '第3課', page: 3, kind: 'lesson', lessonNo: '3' });
    expect(classes[1]?.skillId).toBe('jp.particle.ni_vs_de');
  });

  it('文本对不上输入逐字丢弃（防臆造课）', () => {
    const { classes, dropped } = groundClassifications(
      [
        { text: '第3課', kind: 'lesson', lessonNo: '3', skillId: null },
        { text: '第99課（模型编的）', kind: 'lesson', lessonNo: '99', skillId: null },
      ],
      CANDIDATES,
      ALLOWED
    );
    expect(classes.length).toBe(1);
    expect(dropped).toBe(1);
  });

  it('非法 kind 丢弃；不在白名单的 skillId 置空保留条目', () => {
    const { classes, dropped } = groundClassifications(
      [
        { text: '会話', kind: 'chapter', lessonNo: null, skillId: null },
        { text: 'これは本です', kind: 'noise', lessonNo: null, skillId: 'jp.grammar.invented' },
      ],
      CANDIDATES,
      ALLOWED
    );
    expect(classes.length).toBe(1);
    expect(dropped).toBe(1);
    expect(classes[0]).toMatchObject({ text: 'これは本です', kind: 'noise', skillId: null });
  });

  it('非数组/垃圾输入整体丢弃计数', () => {
    expect(groundClassifications(null, CANDIDATES, ALLOWED)).toEqual({ classes: [], dropped: 0 });
    expect(groundClassifications([null, 42, 'x'], CANDIDATES, ALLOWED).dropped).toBe(3);
  });

  it('parseStructureJson 花括号切片与非法回 null', () => {
    expect(parseStructureJson('前面废话 {"items": []} 后面废话')).toEqual({ items: [] });
    expect(parseStructureJson('no json here')).toBeNull();
  });

  it('StructureClassSchema 拒绝非法 kind 与超长文本', () => {
    expect(StructureClassSchema.safeParse({ text: 'a', page: 1, kind: 'chapter' }).success).toBe(false);
    expect(
      StructureClassSchema.safeParse({ text: '', page: 1, kind: 'lesson' }).success
    ).toBe(false);
    expect(
      StructureClassSchema.safeParse({ text: '第3課', page: 0, kind: 'lesson' }).success
    ).toBe(false);
  });
});
