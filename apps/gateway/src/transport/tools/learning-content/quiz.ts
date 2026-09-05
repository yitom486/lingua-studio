import type { ToolExecutionContext } from '@study-studio/tool-core';
import type { GeneratedQuestion } from '@study-studio/protocol';
import { err, generateId, isOk, ok, type Result, BusinessError } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../../../infrastructure/drizzle-learner-repository.js';
import type { LearningContentInput, LearningContentOutput } from '../learning-content-tool.js';
import {
  MSG,
  defaultQuizSkill,
  loadTemplates,
  maybeCollect,
  pickCycled,
} from './shared.js';

export async function handleQuizAction(
  repo: DrizzleLearnerRepository,
  context: ToolExecutionContext,
  input: LearningContentInput,
  language: 'ja' | 'en' | 'ko'
): Promise<Result<LearningContentOutput, BusinessError>> {
  if (input.format === 'LISTENING_DICTATION') {
    return buildDictation(repo, context, input, language);
  }

  const count = input.count ?? 1;
  const difficulty = input.difficulty ?? 2;
  const skillId = input.skillIds?.[0];
  const targetSkill = skillId || defaultQuizSkill(language);
  const templates = await loadTemplates(repo, {
    action: 'generate_quiz',
    language,
    skillId: targetSkill,
    format: input.format,
  });
  if (!isOk(templates)) return templates;
  if (templates.value.length === 0) {
    return err(
      new BusinessError('E_CONTENT_EMPTY', MSG.emptyQuiz(language, targetSkill), 'TOOL_EXECUTION')
    );
  }

  const picked = pickCycled(templates.value, count);
  const questions: GeneratedQuestion[] = picked.map((row) => {
    const q = (row.payload as { question: Omit<GeneratedQuestion, 'id'> }).question;
    return {
      ...q,
      id: generateId('q_dyn'),
      testedSkillId: targetSkill.includes('particle')
        ? targetSkill
        : q.testedSkillId || targetSkill,
      difficultyTier: difficulty,
    };
  });

  return maybeCollect(
    repo,
    context,
    input,
    language,
    questions,
    MSG.quizSummary(questions.length, targetSkill)
  );
}

export async function buildDictation(
  repo: DrizzleLearnerRepository,
  context: ToolExecutionContext,
  input: LearningContentInput,
  language: string
): Promise<Result<LearningContentOutput, BusinessError>> {
  const count = input.count ?? 1;
  const difficulty = input.difficulty ?? 2;
  const skillId = input.skillIds?.[0];
  const templates = await loadTemplates(repo, {
    action: 'dictation',
    language,
    skillId,
    format: 'LISTENING_DICTATION',
  });
  if (!isOk(templates)) return templates;
  if (templates.value.length === 0) {
    return err(new BusinessError('E_CONTENT_EMPTY', MSG.emptyDictation(language), 'TOOL_EXECUTION'));
  }

  const picked = pickCycled(templates.value, count);
  const dictationItems = picked.map((row) => {
    const item = (
      row.payload as {
        item: Omit<NonNullable<LearningContentOutput['dictationItems']>[number], 'id'>;
      }
    ).item;
    return {
      ...item,
      id: generateId('dict'),
      testedSkillId: skillId || item.testedSkillId,
    };
  });

  const questions: GeneratedQuestion[] = dictationItems.map((d) => ({
    id: d.id,
    type: 'LISTENING_DICTATION' as const,
    prompt: d.blankPrompt,
    content: d.clozeDisplay,
    correctAnswer: d.targetWord,
    explanation: d.grammarExplanation,
    testedSkillId: d.testedSkillId,
    difficultyTier: difficulty,
    // P5-E8：完整语料随题走（TTS 播原句；UI 可展示挖空提示）
    dictation: {
      fullJapanese: d.fullJapanese,
      speaker: d.speaker,
      chinese: d.chinese,
      furiganaHint: d.furiganaHint,
    },
  }));

  return maybeCollect(
    repo,
    context,
    input,
    language,
    questions,
    MSG.dictationSummary(dictationItems.length),
    { dictationItems }
  );
}
