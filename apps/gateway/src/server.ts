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
import { DrizzleLearnerRepository } from './repository/drizzle-learner-repository.js';
import { GenerateAdaptiveQuizTool } from './tools/generate-adaptive-quiz.js';
import { GradeSubjectiveQuizTool } from './tools/grade-subjective-quiz.js';
import { LearningContentTool, type LearningContentOutput } from './tools/learning-content-tool.js';
import { LearningAssessTool } from './tools/learning-assess-tool.js';

export class GatewayServer {
  public readonly sessionManager = new SessionManager();
  public readonly contextBuilder = new ContextBuilder();
  public readonly toolRegistry = new ToolRegistry();
  public readonly toolRouter = new ToolRouter(this.toolRegistry);
  public readonly agentAdapter = new CodexAdapter();
  public readonly learnerRepo: LearnerRepository;
  private readonly activeStreamControllers = new Map<string, AbortController>();

  constructor(learnerRepo?: LearnerRepository) {
    this.learnerRepo = learnerRepo ?? new DrizzleLearnerRepository(':memory:');
    // 注册 M4 与 D4 阶段核心自适应、参数化内容与智能诊断工具
    this.toolRegistry.register(new GenerateAdaptiveQuizTool(this.learnerRepo));
    this.toolRegistry.register(new GradeSubjectiveQuizTool(this.learnerRepo));
    this.toolRegistry.register(new LearningContentTool(this.learnerRepo));
    this.toolRegistry.register(new LearningAssessTool(this.learnerRepo));
  }

  /**
   * 处理客户端接入的 WebSocket 消息信封，支持可选多步流式发射器
   */
  public async handleClientMessage(
    envelope: WsEnvelope,
    emit?: (env: WsEnvelope) => void
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

        // 自动累计每日卡片复习足迹
        await this.learnerRepo.recordDailyActivity(payload.userId, { cards: 1 });

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

      case WsEventTypes.CLIENT_PROFILE_GET: {
        const payload = (envelope.payload ?? {}) as { userId?: string };
        const userId = payload.userId ?? 'student_web_01';
        const profileRes = await this.learnerRepo.getLearnerProfile(userId);
        if (!isOk(profileRes)) return err(profileRes.error);

        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.AGENT_TURN_COMPLETED,
          payload: profileRes.value,
          timestamp: Date.now(),
        });
      }

      case WsEventTypes.CLIENT_PROFILE_UPDATE: {
        const payload = (envelope.payload ?? {}) as {
          userId?: string;
          updates?: Record<string, any>;
        };
        const userId = payload.userId ?? 'student_web_01';
        const updateRes = await this.learnerRepo.updateLearnerProfile(
          userId,
          payload.updates ?? envelope.payload ?? {}
        );
        if (!isOk(updateRes)) return err(updateRes.error);

        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.LEARNER_PROFILE_UPDATED,
          payload: updateRes.value,
          timestamp: Date.now(),
        });
      }

      case WsEventTypes.CLIENT_TASK_PROGRESS_GET: {
        const payload = (envelope.payload ?? {}) as { userId?: string; date?: string };
        const userId = payload.userId ?? 'student_web_01';
        const progressRes = await this.learnerRepo.getDailyTaskProgress(userId, payload.date);
        if (!isOk(progressRes)) return err(progressRes.error);

        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.AGENT_TURN_COMPLETED,
          payload: progressRes.value,
          timestamp: Date.now(),
        });
      }

      case WsEventTypes.CLIENT_TASK_ACTIVITY_RECORD: {
        const payload = (envelope.payload ?? {}) as {
          userId?: string;
          quizzes?: number;
          cards?: number;
          listeningMinutes?: number;
          mistakesResolved?: number;
          date?: string;
        };
        const userId = payload.userId ?? 'student_web_01';
        const recordRes = await this.learnerRepo.recordDailyActivity(userId, payload);
        if (!isOk(recordRes)) return err(recordRes.error);

        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.LEARNER_DAILY_TASK_UPDATED,
          payload: recordRes.value,
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

      case WsEventTypes.CLIENT_TURN_SEND: {
        const payload = (envelope.payload ?? {}) as {
          input: string;
          userId?: string;
          intent?: string;
          contextSnapshot?: any;
        };
        const userId = payload.userId || 'student_web_01';
        const userPrompt = String(payload.input || '').trim();

        // 1. 组装不可变学情快照
        const snapshot = await this.contextBuilder.buildTurnSnapshot(
          userId,
          this.learnerRepo,
          payload.contextSnapshot
        );

        // 2. 发出回合启动通知
        const intent = payload.intent || snapshot.userIntentHint || 'EXPLAIN';
        const startEnvelope: WsEnvelope = {
          version: '1.0',
          id: generateId('turn'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.AGENT_TURN_START,
          payload: { intent, focus: snapshot.focus },
          timestamp: Date.now(),
        };
        if (emit) emit(startEnvelope);

        // 3. 建立打断控制器
        const abortController = new AbortController();
        this.activeStreamControllers.set(envelope.sessionId, abortController);

        let reply = '';
        let toolResults: any = undefined;

        try {
          // 根据意图或用户自然语言分发到参数化工具或专家教学大纲
          if (userPrompt.includes('例句') || userPrompt.includes('造句')) {
            const tool = this.toolRegistry.get('learning.content');
            if (tool) {
              const res = await tool.execute(
                {
                  action: 'example_set',
                  topic: snapshot.focus?.skillTag || '助词与谓语动词搭配',
                  language: snapshot.targetLanguage === 'en' ? 'en' : 'ja',
                },
                { userId, sessionId: envelope.sessionId }
              );
              if (isOk(res)) {
                const content = res.value as LearningContentOutput;
                if (content.examples) {
                  toolResults = content;
                  reply =
                    `为你精心梳理了 3 个与【${snapshot.focus?.skillTag || '当前语法点'}】紧密契合的地道生活化例句：\n\n` +
                    content.examples
                      .map(
                        (ex: { sentence: string; translation: string; grammarPoint: string }, i: number) =>
                          `${i + 1}. **${ex.sentence}**\n   ${ex.translation}\n   💡 *解析*：${ex.grammarPoint}`
                      )
                      .join('\n\n') +
                    `\n\n建议尝试默写或大声朗读，加深肌肉记忆！`;
                }
              }
            }
          } else if (
            userPrompt.includes('为什么') ||
            userPrompt.includes('讲透') ||
            userPrompt.includes('辨析') ||
            userPrompt.includes('区分') ||
            userPrompt.includes('考点')
          ) {
            const tool = this.toolRegistry.get('learning.content');
            if (tool) {
              const res = await tool.execute(
                {
                  action: 'explain',
                  topic: snapshot.focus?.skillTag || '格助词辨析',
                  language: snapshot.targetLanguage === 'en' ? 'en' : 'ja',
                },
                { userId, sessionId: envelope.sessionId }
              );
              if (isOk(res)) {
                const content = res.value as LearningContentOutput;
                if (content.explanation) {
                  const exp = content.explanation;
                  toolResults = content;
                  reply =
                    `【核心考点精讲】\n\n` +
                    `📌 **底层逻辑**：\n${exp.coreConcept}\n\n` +
                    `📐 **规则梳理**：\n${exp.rules.map((r: string) => `• ${r}`).join('\n')}\n\n` +
                    `⚠️ **典型雷区**：\n${exp.commonMistakes.map((m: string) => `• ${m}`).join('\n')}\n\n` +
                    `💡 **速记口诀**：\n${exp.mnemonicTip}`;
                }
              }
            }
          } else if (
            userPrompt.includes('考我') ||
            userPrompt.includes('出题') ||
            userPrompt.includes('练一练')
          ) {
            const tool = this.toolRegistry.get('learning.content');
            if (tool) {
              const res = await tool.execute(
                {
                  action: 'generate_quiz',
                  count: 1,
                  difficulty: 2,
                  language: snapshot.targetLanguage === 'en' ? 'en' : 'ja',
                },
                { userId, sessionId: envelope.sessionId }
              );
              if (isOk(res)) {
                const content = res.value as LearningContentOutput;
                if (content.questions?.[0]) {
                  const q = content.questions[0];
                  toolResults = content;
                  reply =
                    `为你量身定制了一道自适应诊断题，检验你对该考点的掌握：\n\n` +
                    `❓ **题目**：${q.content}\n` +
                    (q.options ?? []).map((opt: string, i: number) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n') +
                    `\n\n想好答案后可以直接告诉我，或在做题工作台作答！`;
                }
              }
            }
          }

          if (!reply) {
            // 通用导师对话与聚焦答疑
            const focusInfo = snapshot.focus
              ? `针对你正在学习的【${snapshot.focus.skillTag || snapshot.focus.surface}】`
              : '针对你的学情进度';
            reply =
              `你好！我是你的自适应学习专属导师。${focusInfo}：\n\n` +
              `你刚刚提到：“${userPrompt}”。在外语习得过程中，把孤立的语法点放入完整语境中体会情感色彩是攻克瓶颈最高效的途径。\n\n` +
              `建议结合我们刚刚复习的例句和错题，如果对某一句有疑惑，你可以随时点击「给出例句」或让我「讲透考点」！`;
          }

          // 4. 真流式逐块推流 (Text Delta)
          const chunkSize = 6;
          for (let i = 0; i < reply.length; i += chunkSize) {
            if (abortController.signal.aborted) {
              break;
            }
            const chunk = reply.slice(i, i + chunkSize);
            const deltaEnvelope: WsEnvelope = {
              version: '1.0',
              id: generateId('delta'),
              sessionId: envelope.sessionId,
              type: WsEventTypes.AGENT_TEXT_DELTA,
              payload: { delta: chunk, textDelta: chunk },
              timestamp: Date.now(),
            };
            if (emit) emit(deltaEnvelope);
            // 微延时模拟真实 LLM Token 流畅推流
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        } finally {
          this.activeStreamControllers.delete(envelope.sessionId);
        }

        const isInterrupted = abortController.signal.aborted;
        const completedEnvelope: WsEnvelope = {
          version: '1.0',
          id: generateId('done'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.AGENT_TURN_COMPLETED,
          payload: {
            status: isInterrupted ? 'INTERRUPTED' : 'COMPLETED',
            finalOutput: reply,
            toolResults,
          },
          timestamp: Date.now(),
        };
        if (emit) emit(completedEnvelope);

        return ok(completedEnvelope);
      }

      case WsEventTypes.CLIENT_TURN_INTERRUPT: {
        const controller = this.activeStreamControllers.get(envelope.sessionId);
        if (controller) {
          controller.abort();
          this.activeStreamControllers.delete(envelope.sessionId);
        }
        return ok({
          version: '1.0',
          id: generateId('msg'),
          sessionId: envelope.sessionId,
          type: WsEventTypes.AGENT_TURN_COMPLETED,
          payload: { status: 'INTERRUPTED' },
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
