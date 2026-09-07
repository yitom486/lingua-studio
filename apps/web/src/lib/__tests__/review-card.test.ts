import { describe, expect, it } from 'bun:test';
import { studyCardToSourceEntry, buildReviewCardDoc } from '../review-card.js';
import type { StudyCardItem } from '../../models/learning.js';

const CARD: StudyCardItem = {
  id: 'c1',
  type: 'VOCAB',
  frontWord: '食べる',
  reading: 'たべる',
  tag: '生词',
  pos: '动词',
  backMeaning: '吃',
  exampleJp: 'ご飯を食べる。',
  exampleHighlight: '',
  exampleZh: '吃饭。',
  stability: 2,
  reps: 3,
};

describe('studyCardToSourceEntry', () => {
  it('字段映射完整；空释义回退词面', () => {
    const entry = studyCardToSourceEntry(CARD);
    expect(entry.headword).toBe('食べる');
    expect(entry.reading).toBe('たべる');
    expect(entry.meanings).toEqual(['吃']);
    expect(entry.sentence).toBe('ご飯を食べる。');
    expect(entry.partOfSpeech).toBe('动词');
    expect(entry.tags).toEqual(['生词', '动词']);
    const empty = studyCardToSourceEntry({ ...CARD, backMeaning: '  ' });
    expect(empty.meanings).toEqual(['食べる']);
    const noReading = studyCardToSourceEntry({ ...CARD, reading: '', exampleJp: '' });
    expect(noReading.reading).toBeUndefined();
    expect(noReading.sentence).toBeUndefined();
  });
});

describe('buildReviewCardDoc', () => {
  it('CSS 与正文组装进沙箱文档', () => {
    const doc = buildReviewCardDoc('.card{}', '<div>x</div>');
    expect(doc).toContain('<style>.card{}</style>');
    expect(doc).toContain('<div class="card"><div>x</div></div>');
    expect(doc.startsWith('<!doctype html>')).toBe(true);
  });
});
