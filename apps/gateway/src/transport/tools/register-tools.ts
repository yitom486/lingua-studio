import { ToolRegistry } from '@study-studio/tool-core';
import type { LearnerRepository } from '@study-studio/learner-core';
import { DrizzleLearnerRepository } from '../../infrastructure/drizzle-learner-repository.js';
import { GenerateAdaptiveQuizTool } from '../../modules/practice/tools/generate-adaptive-quiz.js';
import { GradeSubjectiveQuizTool } from '../../modules/practice/tools/grade-subjective-quiz.js';
import { LearningAssessTool } from '../../modules/practice/tools/learning-assess-tool.js';
import { LearningPracticeTool } from '../../modules/practice/tools/learning-practice-tool.js';
import { LearningProgressTool } from '../../modules/learning-progress/tools/learning-progress-tool.js';
import { LearningCurriculumTool } from '../../modules/curriculum/tools/learning-curriculum-tool.js';
import { LearningLibraryTool } from '../../modules/library/tools/learning-library-tool.js';
import { DictionaryLookupTool } from '../../modules/dictionary/tools/dictionary-lookup-tool.js';
import { LearningContentTool } from './learning-content-tool.js';
import { LearningPlanTool } from './learning-plan-tool.js';
import { UiNavigateTool, UiPresentTool } from './ui-command-tools.js';

/**
 * 网关 Tool 注册表装配（G3：由 GatewayServer 构造函数迁移而来，行为不变）。
 * 由装配根注入依赖；不在 Tool 内部创建第二个 DB。
 * 注意保留原有 fallback 语义：非 Drizzle 仓储时课程/词典/文库工具使用内存库。
 */
export function registerGatewayTools(registry: ToolRegistry, learnerRepo: LearnerRepository): void {
  const drizzle =
    learnerRepo instanceof DrizzleLearnerRepository
      ? learnerRepo
      : new DrizzleLearnerRepository(':memory:');

  registry.register(new GenerateAdaptiveQuizTool(learnerRepo));
  registry.register(new GradeSubjectiveQuizTool(learnerRepo));
  registry.register(new LearningContentTool(learnerRepo));
  registry.register(new LearningAssessTool(learnerRepo));
  registry.register(new LearningProgressTool(learnerRepo));
  registry.register(new LearningPlanTool(learnerRepo));
  registry.register(new LearningPracticeTool(learnerRepo));
  registry.register(new LearningCurriculumTool(drizzle));
  registry.register(new LearningLibraryTool(drizzle));
  registry.register(new DictionaryLookupTool(drizzle));
  registry.register(new UiNavigateTool());
  registry.register(new UiPresentTool());
}
