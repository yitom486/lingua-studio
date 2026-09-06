// P1-2 拆分：键与默认用户已下沉 query-keys.ts，此处重导出保持对外不变。
import { DEFAULT_USER_ID, QUERY_KEYS, invalidateAllLearningQueries } from './query-keys.js';

export { DEFAULT_USER_ID, QUERY_KEYS, invalidateAllLearningQueries };

// P1-2 拆分：画像/计划/分析组已下沉 profile-plan-analysis.ts，此处重导出保持对外不变。
export { useLearnerProfileQuery, useDailyTaskQuery, useDailyPlanQuery, useCompletePlanStepMutation, useLearningAnalysisQuery, useRefreshLearningAnalysisMutation, useActivityHistoryQuery } from './profile-plan-analysis.js';

// P1-2 拆分：卡片/错题/题库组已下沉 cards-mistakes-questions.ts，此处重导出保持对外不变。
export { useCardsQuery, useAddCardsMutation, useUpdateCardMutation, vocabToStudyCard, useMistakesQuery, useUpdateMistakeMutation, useAddMistakeMutation, useQuestionsQuery, usePrependQuestionMutation } from './cards-mistakes-questions.js';

// P1-2 拆分注：usePrependQuestionMutation / useAddCardsMutation / useUpdateCardMutation / useUpdateMistakeMutation / useAddMistakeMutation 已下沉 cards-mistakes-questions.ts，见文件顶部 barrel 重导出。
// 双传输收敛：同名 useSubmitQuizMutation 只保留 useAgentMutations 的 WS 版（HTTP 记足迹版零消费已删除）。

// P1-2 拆分：教材/批注组已下沉 textbooks-annotations.ts，此处重导出保持对外不变。
export { useTextbooksQuery, useImportTextbookMutation, useAnnotationsQuery, useAddAnnotationMutation, useAnnotationToCardMutation } from './textbooks-annotations.js';

// P1-2 拆分：练习队列组已下沉 practice-collect.ts，此处重导出保持对外不变。
export { usePracticeCollectionsQuery, usePracticeItemsQuery, usePracticeItemsToCardsMutation } from './practice-collect.js';

// P1-2 拆分：词典/假名/课程阅读/新闻组已下沉 dictionary-curriculum-reading.ts，此处重导出保持对外不变。
export { useCurriculumKanaQuery, useKanaPracticeMutation, useCurriculumHangulQuery, useHangulPracticeMutation, useReadingSetsQuery, useNewsTopicsQuery, type PitchLexiconItem, type DictionaryLookupResult, type DictionaryPackageInfo, type DictionaryEntryCollection, useDictionaryPackagesQuery, useInstallDictionaryPackageMutation, useCollectDictionaryEntryMutation, useDictionaryLookupQuery, usePitchLexiconQuery, useGenerateReadingSetMutation, useSubmitReadingPracticeMutation, type WritingPromptItem, type DictationChallengeItem, useGenerateWritingPromptsMutation, useGenerateDictationMutation, type KanaWordItem, useGenerateKanaWordsMutation, type HangulWordItem, useGenerateHangulWordsMutation } from './dictionary-curriculum-reading.js';

// P1-2 拆分：练习计划组已下沉 practice-plan.ts，此处重导出保持对外不变。
export { usePracticeTemplatesQuery, useSavePracticeTemplateMutation, useDeletePracticeTemplateMutation, useTogglePracticeTemplateMutation, useCopyPracticeTemplateMutation, useStartPracticeRunMutation, usePracticeRunQuery, useSavePracticeDraftMutation, useSubmitObjectiveMutation, useSubmitSubjectiveMutation, useSubmitBatchMutation, useFinalizePracticeRunMutation, type AssessBatchResult, useGradeBatchMutation, type AssessSingleResult, useGradeSingleMutation, useAssemblePracticeRunMutation, type PracticeRunnerItemDTO, usePracticeRunItemsQuery, type PracticeProposalDTO, useProposeTemplateMutation, useApplyProposalMutation, type RunSummaryDTO, usePracticeRunSummaryQuery } from './practice-plan.js';
