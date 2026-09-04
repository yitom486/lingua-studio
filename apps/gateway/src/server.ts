import { SessionManager } from './session/session-manager.js';
import { ContextBuilder } from './context/context-builder.js';
import { ToolRouter } from './router/tool-router.js';
import { ToolRegistry } from '@study-studio/tool-core';
import { CodexAdapter } from '@study-studio/agent-codex';
import {
  type WsEnvelope,
  WsEventTypes,
} from '@study-studio/protocol';
import {
  ok,
  err,
  type Result,
  BusinessError,
  generateId,
  isOk,
  nowIso,
} from '@study-studio/shared';
import {
  type LearnerRepository,
  createMistakeEntry,
  scheduleNextReview,
} from '@study-studio/learner-core';
import { SqliteLearnerRepository } from './repository/sqlite-learner-repository.js';
import { GenerateAdaptiveQuizTool } from './tools/generate-adaptive-quiz.js';
import { GradeSubjectiveQuizTool } from './tools/grade-subjective-quiz.js';

export class GatewayServer {
  public readonly sessionManager = new SessionManager();
  public readonly contextBuilder = new ContextBuilder();
  public readonly toolRegistry = new ToolRegistry();
  public readonly toolRouter = new ToolRouter(this.toolRegistry);
  public readonly agentAdapter = new CodexAdapter();
  public readonly learnerRepo: LearnerRepository;

  constructor(learnerRepo?: LearnerRepository) {
    this.learnerRepo = learnerRepo ?? new SqliteLearnerRepository(':memory:');
    // 注册 M4 阶段核心自适应与批改服务端工具
    this.toolRegistry.register(new GenerateAdaptiveQuizTool(this.learnerRepo));
    this.toolRegistry.register(new GradeSubjectiveQuizTool(this.learnerRepo));
  }

  /**
   * 处理客户端接入的 WebSocket 消息信封
   */
  public async handleClientMessage(
    envelope: WsEnvelope
  ): Promise<Result<WsEnvelope, BusinessError>> {
    switch (envelope.type) {
      case WsEventTypes.CLIENT_SESSION_INIT: {
        const payload = envelope.payload as {
          userId: string;
          targetLanguage: 'ja' | 'en';
          targetLevel: string;
        };
        const sessionRes = this.sessionManager.createSession(
          payload.userId,
          payload.targetLanguage,
          payload.targetLevel
        );
        if (!isOk(sessionRes)) {
          return err(sessionRes.error);
        }

        // 获取该学习者的最新画像快照
        const snapshotRes = await this.learnerRepo.getProfileSnapshot(payload.userId);
        const snapshot = isOk(snapshotRes) ? snapshotRes.value : undefined;

        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: sessionRes.value.id,
          type: WsEventTypes.AGENT_TURN_COMPLETED,
          payload: { status: 'INITIALIZED', session: sessionRes.value, profile: snapshot },
          timestamp: Date.now(),
        });
      }

      case WsEventTypes.CLIENT_PING: {
        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.GATEWAY_PONG,
          payload: { serverTimestamp: Date.now() },
          timestamp: Date.now(),
        });
      }

      case WsEventTypes.CLIENT_QUIZ_SUBMIT: {
        const payload = envelope.payload as {
          userId: string;
          questionId: string;
          userAnswer: string;
          isCorrect: boolean;
          score: number;
          timeSpentMs: number;
          testedSkillId: string;
          questionContent?: string;
          correctAnswer?: string;
          explanation?: string;
        };

        // 1. 持久化单次做题记录
        await this.learnerRepo.recordQuizAttempt({
          id: generateId('att'),
          userId: payload.userId,
          questionId: payload.questionId,
          userAnswer: payload.userAnswer,
          isCorrect: payload.isCorrect,
          score: payload.score,
          timeSpentMs: payload.timeSpentMs,
          testedSkillId: payload.testedSkillId,
          createdAt: nowIso(),
        });

        // 2. 如果答错，自动将该题归入 SQLite 错题本
        if (!payload.isCorrect) {
          const mistake = createMistakeEntry(
            payload.userId,
            {
              id: payload.questionId,
              type: 'MULTIPLE_CHOICE',
              prompt: '自适应客观题',
              content: payload.questionContent ?? '',
              correctAnswer: payload.correctAnswer ?? '',
              explanation: payload.explanation ?? '',
              testedSkillId: payload.testedSkillId,
              difficultyTier: 3,
            },
            payload.userAnswer,
            {
              questionId: payload.questionId,
              isCorrect: false,
              score: 0,
              correctAnswer: payload.correctAnswer ?? '',
              userSubmission: payload.userAnswer,
              explanation: payload.explanation ?? '回答有误',
              mistakeRecorded: true,
            }
          );
          await this.learnerRepo.saveMistake(mistake);
        }

        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.AGENT_TURN_COMPLETED,
          payload: {
            status: 'RECORDED',
            questionId: payload.questionId,
            isCorrect: payload.isCorrect,
            persistedToDb: true,
          },
          timestamp: Date.now(),
        });
      }

      case WsEventTypes.CLIENT_CARD_REVIEW: {
        const payload = envelope.payload as {
          userId: string;
          cardId: string;
          rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
          currentStability?: number;
          currentReps?: number;
        };

        const currentFsrs = {
          stability: payload.currentStability ?? 1.0,
          difficulty: 5.0,
          reps: payload.currentReps ?? 0,
          lapses: 0,
          dueAt: nowIso(),
          state: 'REVIEW' as const,
        };

        const nextFsrs = scheduleNextReview(currentFsrs, payload.rating);

        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.AGENT_TURN_COMPLETED,
          payload: {
            cardId: payload.cardId,
            nextFsrs,
            nextReviewDays: Math.round(nextFsrs.stability),
          },
          timestamp: Date.now(),
        });
      }

      case WsEventTypes.CLIENT_QUIZ_GENERATE: {
        const tool = this.toolRegistry.get('quiz.generateAdaptive');
        if (!tool) {
          return err(new BusinessError('E_TOOL_NOT_FOUND', '自适应出题工具未注册', 'AGENT_RUNTIME'));
        }
        const rawPayload = (envelope.payload ?? {}) as Record<string, any>;
        const normalizedInput = {
          targetLanguage: rawPayload.targetLanguage ?? 'ja',
          targetLevel: rawPayload.targetLevel ?? 'JLPT N3',
          weaknessSkillId: rawPayload.weaknessSkillId,
          count: typeof rawPayload.count === 'number' ? rawPayload.count : 1,
        };
        const toolRes = await tool.execute(normalizedInput, {
          userId: rawPayload.userId ?? 'student_web_01',
          sessionId: envelope.sessionId,
        });
        if (!isOk(toolRes)) return err(toolRes.error);

        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.AGENT_TURN_COMPLETED,
          payload: toolRes.value,
          timestamp: Date.now(),
        });
      }

      case WsEventTypes.CLIENT_QUIZ_GRADE_SUBJECTIVE: {
        const tool = this.toolRegistry.get('quiz.gradeSubjective');
        if (!tool) {
          return err(new BusinessError('E_TOOL_NOT_FOUND', '主观题智能批改工具未注册', 'AGENT_RUNTIME'));
        }
        const toolRes = await tool.execute(envelope.payload, {
          userId: (envelope.payload as any)?.userId ?? 'student_web_01',
          sessionId: envelope.sessionId,
        });
        if (!isOk(toolRes)) return err(toolRes.error);

        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.AGENT_TURN_COMPLETED,
          payload: toolRes.value,
          timestamp: Date.now(),
        });
      }

      default:
        return err(
          new BusinessError(
            'E_UNSUPPORTED_EVENT',
            `暂不支持此事件类型 [${envelope.type}]`,
            'VALIDATION'
          )
        );
    }
  }
}
