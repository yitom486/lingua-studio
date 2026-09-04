export type TargetLanguage = 'ja' | 'en';

export type SkillDimension =
  | 'VOCABULARY'
  | 'GRAMMAR'
  | 'LISTENING'
  | 'NUANCE_PRAGMATIC'
  | 'READING';

export type SkillStatus = 'STRENGTH' | 'NORMAL' | 'WEAKNESS';

export interface SkillMetric {
  id: string;                      // 如 'jp.particle.ni_vs_de'
  dimension: SkillDimension;
  name: string;                    // 如 '助词「に」与「で」的场所功能区分'
  proficiency: number;             // 0.00 ~ 1.00
  totalAttempts: number;
  correctAttempts: number;
  consecutiveErrors: number;
  status: SkillStatus;
  lastPracticedAt?: string;
}

export interface LearnerProfileSnapshot {
  userId: string;
  targetLanguage: TargetLanguage;
  overallLevel: string;
  strengths: SkillMetric[];
  weaknesses: SkillMetric[];
  allMetrics: SkillMetric[];
  updatedAt: string;
}
