import { describe, expect, it } from 'bun:test';
import {
  WsEnvelopeSchema,
  WsEventTypes,
  GeneratedQuestionSchema,
  QuizGradingResultSchema,
  parseTextbookAST,
  TextbookASTSchema,
} from '../index.js';


describe('Protocol Package Schemas', () => {
  it('should validate standard envelope correctly', () => {
    const rawEnvelope = {
      version: '1.0',
      id: 'msg-123',
      sessionId: 'sess-456',
      turnId: 'turn-789',
      type: WsEventTypes.CLIENT_TURN_SEND,
      payload: { input: 'How to say apple in Japanese?' },
      timestamp: Date.now(),
    };

    const parsed = WsEnvelopeSchema.safeParse(rawEnvelope);
    expect(parsed.success).toBe(true);
  });

  it('should validate generated question schema', () => {
    const question = {
      id: 'q-001',
      type: 'MULTIPLE_CHOICE',
      prompt: '选择正确的助词填空',
      content: '李さんはデパート____行きます。',
      options: ['に', 'で', 'を', 'から'],
      correctAnswer: 'に',
      explanation: '表示移动的目的地时使用助词「に」。',
      testedSkillId: 'jp.particle.direction_ni',
      difficultyTier: 2,
    };

    const parsed = GeneratedQuestionSchema.safeParse(question);
    expect(parsed.success).toBe(true);
  });

  it('should validate structured grading result schema', () => {
    const report = {
      questionId: 'q-001',
      isCorrect: false,
      score: 0,
      correctAnswer: 'に',
      userSubmission: 'で',
      explanation: '「で」表示动作发生的场所，而移动的目的地应用「に」。',
      errorDiagnosis: {
        category: 'PARTICLE',
        description: '助词「に」与「で」混淆',
        motherTongueInterference: '中文里“去百货商店”与“在百货商店”都可用介词表示，容易混淆。',
      },
      refinementSuggestion: '可以联想「へ」也是方向助词。',
      followUpTip: '口诀：目的地用に，活动地点用で。',
      mistakeRecorded: true,
    };

    const parsed = QuizGradingResultSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });

  it('should validate structured textbook AST and parse valid payload', () => {
    const rawTextbook = {
      id: 'book-test',
      title: '测试日语教材',
      shortTitle: '测日',
      level: 'N5',
      publisher: 'Study Studio Press',
      totalLessons: 1,
      lessons: [
        {
          id: 'lesson-1',
          lessonNumber: 1,
          title: '第1课 初次见面',
          summary: '基本寒暄与自我介绍',
          vocabularies: [
            {
              id: 'v-1',
              kanji: '初めまして',
              kana: 'はじめまして',
              pos: '寒暄语',
              pitchAccent: '④',
              chinese: '初次见面',
            },
          ],
          grammarPoints: [
            {
              id: 'g-1',
              title: '～は～です',
              connection: '名词1 + は + 名词2 + です',
              explanation: '判断句结构，表示断定。',
              examples: [{ japanese: '私は学生です。', chinese: '我是学生。' }],
            },
          ],
          dialogues: [
            {
              speaker: '田中',
              japanese: '初めまして、田中です。',
              chinese: '初次见面，我是田中。',
            },
          ],
          exercises: [
            {
              id: 'ex-1',
              type: 'CHOICE',
              prompt: '私は学生_____。',
              options: ['です', 'ます', 'でした', 'ません'],
              answer: 'です',
              explanation: '现在肯定判断用「です」。',
            },
          ],
        },
      ],
    };

    const parseResult = parseTextbookAST(rawTextbook);
    expect(parseResult.ok).toBe(true);
    if (parseResult.ok) {
      expect(parseResult.value.shortTitle).toBe('测日');
      expect(parseResult.value.lessons[0]!.vocabularies.length).toBe(1);
    }

    // 测试非法数据返回 BusinessError
    const invalidResult = parseTextbookAST({ id: 'invalid' });
    expect(invalidResult.ok).toBe(false);
    if (!invalidResult.ok) {
      expect(invalidResult.error.code).toBe('E_INVALID_TEXTBOOK_AST');
    }
  });
});


