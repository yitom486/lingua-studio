import { describe, expect, it } from 'bun:test';
import {
  BUILTIN_CARD_FORMATS,
  buildCardContext,
  escapeHtml,
  extractCardFields,
  extractFieldMarkers,
  getBuiltinCardFormat,
  renderCard,
  renderCardTemplate,
  renderFieldTemplate,
  validateCardFormat,
  validateCardTemplate,
  validateFieldTemplate,
  type CardContext,
} from '../card-templates.js';

const SAMPLE: CardContext = {
  expression: '食べる',
  reading: 'たべる',
  glossary: '<div>to eat</div>',
  sentence: 'ご飯を食べる。',
  pitchAccent: '⓪',
  frequency: 123,
  tags: ['jlpt-n5'],
};

describe('card field templates {marker}', () => {
  it('替换白名单标记；未知标记原样保留', () => {
    expect(renderFieldTemplate('{expression}（{reading}）', SAMPLE)).toBe('食べる（たべる）');
    expect(renderFieldTemplate('{glossary}', SAMPLE)).toBe('<div>to eat</div>');
    expect(renderFieldTemplate('{pitch-accent} {frequency}', SAMPLE)).toBe('⓪ #123');
    expect(renderFieldTemplate('{unknown-thing}', SAMPLE)).toBe('{unknown-thing}');
  });

  it('缺失值渲染为空；纯文本转义防 XSS', () => {
    const bare: CardContext = { expression: '<script>alert(1)</script>', glossary: '<div>x</div>' };
    expect(renderFieldTemplate('{expression}|{reading}|{sentence}', bare)).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;||'
    );
    // glossary 为预组装 HTML，原样输出
    expect(renderFieldTemplate('{glossary}', bare)).toBe('<div>x</div>');
  });

  it('校验上报未知标记', () => {
    expect(validateFieldTemplate('{expression}')).toEqual([]);
    const issues = validateFieldTemplate('{expression} {foobar}');
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('{foobar}');
  });

  it('extractFieldMarkers 去重', () => {
    expect(extractFieldMarkers('{expression}{expression}{reading}').sort()).toEqual([
      'expression',
      'reading',
    ]);
  });
});

describe('card templates {{Field}} (Anki subset v1)', () => {
  it('字段/FrontSide/条件块/反向条件', () => {
    const fields = { Expression: '食べる', Reading: '', Meaning: '<div>to eat</div>' };
    expect(renderCardTemplate('<div>{{Expression}}</div>', fields)).toBe('<div>食べる</div>');
    expect(
      renderCardTemplate('{{#Reading}}R{{/Reading}}{{^Reading}}no-R{{/Reading}}', fields)
    ).toBe('no-R');
    expect(renderCardTemplate('{{FrontSide}}<hr>{{Meaning}}', fields, 'FRONT')).toBe(
      'FRONT<hr><div>to eat</div>'
    );
  });

  it('未知字段按 Anki 语义置空', () => {
    expect(renderCardTemplate('[{{Missing}}]', {})).toBe('[]');
  });

  it('校验：未闭合条件块与超集过滤器', () => {
    expect(validateCardTemplate('{{Expression}}')).toEqual([]);
    expect(validateCardTemplate('{{#Reading}}x').length).toBe(1);
    const filter = validateCardTemplate('{{cloze:Text}}');
    expect(filter.length).toBe(1);
    expect(filter[0]).toContain('cloze');
  });

  it('extractCardFields 含条件块内外字段名', () => {
    expect(
      extractCardFields('{{Expression}}{{#Reading}}r{{/Reading}}{{FrontSide}}').sort()
    ).toEqual(['Expression', 'FrontSide', 'Reading']);
  });
});

describe('buildCardContext + renderCard end-to-end', () => {
  it('条目组装上下文并渲染内置模板', () => {
    const ctx = buildCardContext({
      headword: '食べる',
      reading: 'たべる',
      meanings: ['to eat', 'to live'],
      pitchLabel: '⓪',
      frequency: 123,
      sentence: 'ご飯を食べる。',
    });
    const builtin = getBuiltinCardFormat('study-basic');
    expect(builtin).toBeDefined();
    const rendered = renderCard(builtin!, ctx);
    expect(rendered.fields['Expression']).toBe('食べる');
    expect(rendered.frontHtml).toContain('食べる');
    expect(rendered.backHtml).toContain('たべる');
    expect(rendered.backHtml).toContain('to eat');
    expect(rendered.backHtml).toContain('⓪');
    expect(rendered.backHtml).toContain('ご飯を食べる。');
  });

  it('空释义不编造：回退词面', () => {
    const ctx = buildCardContext({ headword: 'xyz', meanings: [] });
    expect(ctx.glossary).toContain('xyz');
  });

  it('escapeHtml 全覆盖', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('validateCardFormat', () => {
  it('内置模板通过校验', () => {
    expect(validateCardFormat(BUILTIN_CARD_FORMATS[0]!)).toEqual([]);
  });

  it('空字段/未知标记/空正面逐条上报', () => {
    const bad = {
      ...BUILTIN_CARD_FORMATS[0]!,
      fields: { Expression: '{nope}' },
      frontTemplate: '{{Missing}}',
    };
    const issues = validateCardFormat(bad);
    expect(issues.some((i) => i.includes('{nope}'))).toBe(true);
    expect(issues.some((i) => i.includes('正面模板渲染为空'))).toBe(true);
  });

  it('getBuiltinCardFormat 未知 id 返回 undefined（读侧永不抛）', () => {
    expect(getBuiltinCardFormat('no-such-format')).toBeUndefined();
  });
});
