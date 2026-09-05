import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';
import { GenerateAdaptiveQuizTool } from '../modules/practice/tools/generate-adaptive-quiz.js';
import { GradeSubjectiveQuizTool } from '../modules/practice/tools/grade-subjective-quiz.js';
import { isOk } from '@study-studio/shared';

describe('Adaptive Quiz Tools (M4)', () => {
  let repo: DrizzleLearnerRepository;
  let generateTool: GenerateAdaptiveQuizTool;
  let gradeTool: GradeSubjectiveQuizTool;

  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
    generateTool = new GenerateAdaptiveQuizTool(repo);
    gradeTool = new GradeSubjectiveQuizTool(repo);
  });

  afterEach(() => {
    repo.getRawDb().close();
  });

  describe('GenerateAdaptiveQuizTool', () => {
    it('should generate targeted questions for specified weakness skill', async () => {
      const res = await generateTool.execute(
        {
          targetLanguage: 'ja',
          targetLevel: 'JLPT N3',
          weaknessSkillId: 'jp.particle.ni_vs_de',
          count: 1,
        },
        { userId: 'user_test', sessionId: 'sess_test' }
      );

      expect(isOk(res)).toBe(true);
      if (isOk(res)) {
        expect(res.value.targetSkillId).toBe('jp.particle.ni_vs_de');
        expect(res.value.questions.length).toBe(1);
        const q = res.value.questions[0]!;
        expect(q.testedSkillId).toBe('jp.particle.ni_vs_de');
        expect(q.options?.length).toBeGreaterThan(0);
        expect(q.correctAnswer).toBe('で');
        expect(q.explanation).toContain('本を読む');
      }
    });

    it('should extract top weakness from learner profile if not specified', async () => {
      // 写入一个弱项画像
      await repo.saveSkillMetric('user_test', {
        id: 'jp.grammar.conditional_tara',
        dimension: 'GRAMMAR',
        name: '假定形「～たら」',
        proficiency: 0.45,
        totalAttempts: 5,
        correctAttempts: 2,
        consecutiveErrors: 3,
        status: 'WEAKNESS',
      });

      const res = await generateTool.execute(
        {
          targetLanguage: 'ja',
          targetLevel: 'JLPT N3',
          count: 1,
        },
        { userId: 'user_test', sessionId: 'sess_test' }
      );

      expect(isOk(res)).toBe(true);
      if (isOk(res)) {
        expect(res.value.targetSkillId).toBe('jp.grammar.conditional_tara');
        expect(res.value.adaptationReason).toContain('近期连续出错');
        expect(res.value.questions.length).toBe(1);
        expect(res.value.questions[0]?.correctAnswer).toBe('高かったら');
      }
    });
  });

  describe('GradeSubjectiveQuizTool', () => {
    it('should grade perfect match as 100% correct with no mistake recorded', async () => {
      const res = await gradeTool.execute(
        {
          questionId: 'q_trans_01',
          prompt: '翻译：明天去图书馆。',
          standardAnswer: '明日図書館へ行きます。',
          userSubmission: '明日図書館へ行きます。',
          testedSkillId: 'jp.sentence.translation',
        },
        { userId: 'user_test', sessionId: 'sess_test' }
      );

      expect(isOk(res)).toBe(true);
      if (isOk(res)) {
        expect(res.value.isCorrect).toBe(true);
        expect(res.value.score).toBe(100);
        expect(res.value.mistakeRecorded).toBe(false);
      }

      const mistakesRes = await repo.getMistakes('user_test');
      expect(isOk(mistakesRes)).toBe(true);
      if (isOk(mistakesRes)) {
        expect(mistakesRes.value.length).toBe(0);
      }
    });

    it('should diagnose missing particle with mother tongue interference analysis and record mistake', async () => {
      const res = await gradeTool.execute(
        {
          questionId: 'q_trans_02',
          prompt: '翻译：在咖啡馆看书。',
          standardAnswer: 'カフェで本を読みます。',
          userSubmission: 'カフェ本を読みます。', // 漏掉了格助词「で」
          testedSkillId: 'jp.particle.ni_vs_de',
        },
        { userId: 'user_test', sessionId: 'sess_test' }
      );

      expect(isOk(res)).toBe(true);
      if (isOk(res)) {
        expect(res.value.isCorrect).toBe(false);
        expect(res.value.score).toBeLessThan(80);
        expect(res.value.errorDiagnosis?.category).toBe('PARTICLE');
        expect(res.value.errorDiagnosis?.motherTongueInterference).toContain('汉语是孤立语');
        expect(res.value.mistakeRecorded).toBe(true);
      }

      // 验证自动落库至 SQLite 错题本
      const mistakesRes = await repo.getMistakes('user_test');
      expect(isOk(mistakesRes)).toBe(true);
      if (isOk(mistakesRes)) {
        expect(mistakesRes.value.length).toBe(1);
        expect(mistakesRes.value[0]?.questionId).toBe('q_trans_02');
        expect(mistakesRes.value[0]?.lastUserSubmission).toBe('カフェ本を読みます。');
      }
    });

    it('should diagnose tense mismatch with mother tongue interference analysis', async () => {
      const res = await gradeTool.execute(
        {
          questionId: 'q_trans_03',
          prompt: '翻译：昨天买了新书。',
          standardAnswer: '昨日新しい本を買いました。',
          userSubmission: '昨日新しい本を買う。', // 过去时漏变
          testedSkillId: 'jp.grammar.tense',
        },
        { userId: 'user_test', sessionId: 'sess_test' }
      );

      expect(isOk(res)).toBe(true);
      if (isOk(res)) {
        expect(res.value.isCorrect).toBe(false);
        expect(res.value.errorDiagnosis?.category).toBe('TENSE');
        expect(res.value.errorDiagnosis?.motherTongueInterference).toContain('中文通过副词');
      }
    });
  });
});
