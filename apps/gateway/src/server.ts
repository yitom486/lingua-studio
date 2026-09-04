import { SessionManager } from './session/session-manager.js';
import { ContextBuilder } from './context/context-builder.js';
import { ToolRouter } from './router/tool-router.js';
import { ToolRegistry } from '@study-studio/tool-core';
import { CodexAdapter } from '@study-studio/agent-codex';
import { ResponsesAdapter } from '@study-studio/agent-responses';
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
  recordSkillAttempt,
  scheduleNextReview,
} from '@study-studio/learner-core';
import { DrizzleLearnerRepository } from './repository/drizzle-learner-repository.js';
import { GenerateAdaptiveQuizTool } from './tools/generate-adaptive-quiz.js';
import { GradeSubjectiveQuizTool } from './tools/grade-subjective-quiz.js';
import { LearningContentTool, type LearningContentOutput } from './tools/learning-content-tool.js';
import { LearningAssessTool } from './tools/learning-assess-tool.js';
import { LearningProgressTool } from './tools/learning-progress-tool.js';
import { LearningCurriculumTool } from './tools/learning-curriculum-tool.js';
import { LearningLibraryTool } from './tools/learning-library-tool.js';
import { UiNavigateTool, UiPresentTool } from './tools/ui-command-tools.js';
import {
  buildGenericCoachReply,
  defaultCoachTopic,
  defaultExplainTopic,
  defaultQuizSkillId,
  normalizeTrackLanguage,
} from './services/learning-language-policy.js';
import { selectAgentRoute } from './router/agent-router.js';
import { resolveResponsesLiteCoach } from './services/responses-lite-coach.js';


export class GatewayServer {
  public readonly sessionManager = new SessionManager();
  public readonly contextBuilder = new ContextBuilder();
  public readonly toolRegistry = new ToolRegistry();
  public readonly toolRouter = new ToolRouter(this.toolRegistry);
  public readonly agentAdapter = new CodexAdapter();
  /** 轻量旁路骨架：未接入路由前勿当默认学习闭环依赖 */
  public readonly responsesAdapter = new ResponsesAdapter();
  public readonly learnerRepo: LearnerRepository;
  private readonly activeStreamControllers = new Map<string, AbortController>();

  constructor(learnerRepo?: LearnerRepository) {
    this.learnerRepo = learnerRepo ?? new DrizzleLearnerRepository(':memory:');
    const drizzle =
      this.learnerRepo instanceof DrizzleLearnerRepository
        ? this.learnerRepo
        : new DrizzleLearnerRepository(':memory:');

    this.toolRegistry.register(new GenerateAdaptiveQuizTool(this.learnerRepo));
    this.toolRegistry.register(new GradeSubjectiveQuizTool(this.learnerRepo));
    this.toolRegistry.register(new LearningContentTool(this.learnerRepo));
    this.toolRegistry.register(new LearningAssessTool(this.learnerRepo));
    this.toolRegistry.register(new LearningProgressTool(this.learnerRepo));
    this.toolRegistry.register(new LearningCurriculumTool(drizzle));
    this.toolRegistry.register(new LearningLibraryTool(drizzle));
    this.toolRegistry.register(new UiNavigateTool());
    this.toolRegistry.register(new UiPresentTool());
  }

  /** 下发 Client Tool 调用（前端执行，Gateway 只做参数校验） */
  private async emitClientTool(
    emit: ((env: WsEnvelope) => void) | undefined,
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<void> {
    const tool = this.toolRegistry.get(toolName);
    if (!tool || !emit) return;
    const res = await tool.execute(args, {
      userId: 'system',
      sessionId,
    });
    if (!isOk(res)) return;
    emit({
      version: '1.0',
      id: generateId('tool'),
      sessionId,
      type: WsEventTypes.AGENT_TOOL_CALL,
      payload: {
        callId: generateId('call'),
        toolName,
        args: res.value,
      },
      timestamp: Date.now(),
    });
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
          targetLanguage: 'ja' | 'en' | 'ko';
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

        // 仅同步目标语种轨道；禁止每次重连强行改写 studyGoal（否则刷新会把韩语打回英语）
        await this.learnerRepo.updateLearnerProfile(payload.userId, {
          targetLanguage: payload.targetLanguage,
        });

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
        const attemptRes = await this.learnerRepo.recordQuizAttempt({
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
        if (!isOk(attemptRes)) return err(attemptRes.error);

        // 2. 将本次正误立即合并进 SQLite 学习画像，而不是仅依赖前端缓存。
        const snapshotRes = await this.learnerRepo.getProfileSnapshot(payload.userId);
        if (isOk(snapshotRes)) {
          const previous = snapshotRes.value.allMetrics.find(
            (metric) => metric.id === payload.testedSkillId
          );
          if (previous) {
            const metricRes = await this.learnerRepo.saveSkillMetric(
              payload.userId,
              recordSkillAttempt(previous, payload.isCorrect)
            );
            if (!isOk(metricRes)) return err(metricRes.error);
          }
        }

        // 3. 如果答错，自动将该题归入 SQLite 错题本
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
          const mistakeRes = await this.learnerRepo.saveMistake(mistake);
          if (!isOk(mistakeRes)) return err(mistakeRes.error);
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

        // 真正将卡片最新 FSRS 状态持久化回写至 SQLite
        const cardsRes = await this.learnerRepo.getDueCards(payload.userId, 200);
        if (isOk(cardsRes)) {
          const targetCard = cardsRes.value.find((c) => c.id === payload.cardId);
          if (targetCard) {
            targetCard.fsrs = nextFsrs;
            const saveRes = await this.learnerRepo.saveCard(targetCard);
            if (!isOk(saveRes)) return err(saveRes.error);
          }
        }

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
        // C5：优先 learning.content；旧 quiz.generateAdaptive 仅作兼容回退
        const contentTool = this.toolRegistry.get('learning.content');
        const legacyTool = this.toolRegistry.get('quiz.generateAdaptive');
        const rawPayload = (envelope.payload ?? {}) as Record<string, any>;
        const userId = rawPayload.userId ?? 'student_web_01';
        const count = typeof rawPayload.count === 'number' ? rawPayload.count : 1;

        let toolRes: Result<unknown, BusinessError>;
        if (contentTool) {
          toolRes = await contentTool.execute(
            {
              action: 'generate_quiz',
              count,
              skillIds: rawPayload.weaknessSkillId
                ? [String(rawPayload.weaknessSkillId)]
                : undefined,
              language: normalizeTrackLanguage(rawPayload.targetLanguage),
              collect: true,
            },
            { userId, sessionId: envelope.sessionId }
          );
          if (isOk(toolRes)) {
            const out = toolRes.value as {
              questions?: unknown[];
              message?: string;
            };
            toolRes = ok({
              targetSkillId: rawPayload.weaknessSkillId ?? 'adaptive',
              targetSkillName: 'learning.content 自适应组卷',
              adaptationReason: out.message ?? '经 learning.content 生成',
              questions: out.questions ?? [],
            });
          }
        } else if (legacyTool) {
          toolRes = await legacyTool.execute(
            {
              targetLanguage: rawPayload.targetLanguage ?? 'en',
              targetLevel: rawPayload.targetLevel ?? 'CEFR B1',
              weaknessSkillId: rawPayload.weaknessSkillId,
              count,
            },
            { userId, sessionId: envelope.sessionId }
          );
        } else {
          return err(new BusinessError('E_TOOL_NOT_FOUND', '出题工具未注册', 'AGENT_RUNTIME'));
        }
        if (!isOk(toolRes)) return err(toolRes.error);

        // 动态生成的题目属于学习资产；在发送给客户端前先写入 SQLite，刷新后仍可恢复。
        if (this.learnerRepo instanceof DrizzleLearnerRepository) {
          const generatedOutput = toolRes.value as { questions?: unknown[]; targetSkillName?: string };
          const partitionLang = normalizeTrackLanguage(rawPayload.targetLanguage);
          const questions = (generatedOutput.questions ?? []).map(
            (question) => {
              const generated = question as Record<string, unknown>;
              return {
              ...generated,
              userId,
              language: generated.language ?? partitionLang,
              // GeneratedQuestion 是工具协议，quiz_questions 则是可直接渲染的题库模型。
              category: generated.category ?? generatedOutput.targetSkillName ?? 'AI 靶向练习',
              difficulty: generated.difficulty ?? generated.difficultyTier ?? 3,
              };
            }
          );
          const saveRes = await this.learnerRepo.saveQuestions(questions);
          if (!isOk(saveRes)) return err(saveRes.error);
        }

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
          const track = normalizeTrackLanguage(snapshot.targetLanguage);
          // 根据意图或用户自然语言分发到参数化工具或专家教学大纲
          if (userPrompt.includes('例句') || userPrompt.includes('造句')) {
            const tool = this.toolRegistry.get('learning.content');
            if (tool) {
              const res = await tool.execute(
                {
                  action: 'example_set',
                  topic: snapshot.focus?.skillTag || defaultCoachTopic(track),
                  language: track,
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
                  topic: snapshot.focus?.skillTag || defaultExplainTopic(track),
                  language: track,
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
            userPrompt.includes('练一练') ||
            intent === 'GENERATE_QUIZ'
          ) {
            const tool = this.toolRegistry.get('learning.content');
            if (tool) {
              const skillIds = snapshot.focus?.skillTag
                ? [snapshot.focus.skillTag]
                : snapshot.learnerDigest?.topWeaknesses?.[0]?.skillId
                  ? [snapshot.learnerDigest.topWeaknesses[0].skillId]
                  : [defaultQuizSkillId(track)];
              const res = await tool.execute(
                {
                  action: 'generate_quiz',
                  count: Math.min(3, snapshot.constraints?.maxQuestions ?? 3),
                  difficulty: 2,
                  language: track,
                  skillIds,
                  collect: true,
                  collectionTitle: '导师即时练习',
                },
                { userId, sessionId: envelope.sessionId }
              );
              if (isOk(res)) {
                const content = res.value as LearningContentOutput;
                if (content.questions?.[0]) {
                  const q = content.questions[0];
                  toolResults = content;
                  reply =
                    `为你量身定制了 ${content.questions.length} 道自适应诊断题` +
                    (content.collectionId ? `（已收入练习队列 ${content.collectionId}）` : '') +
                    `：\n\n` +
                    `❓ **首题**：${q.content}\n` +
                    (q.options ?? [])
                      .map((opt: string, i: number) => `${String.fromCharCode(65 + i)}. ${opt}`)
                      .join('\n') +
                    `\n\n已通过 ui.present 推送到做题工作台，可直接作答！`;

                  await this.emitClientTool(emit, envelope.sessionId, 'ui.navigate', {
                    target: 'QUIZ',
                  });
                  await this.emitClientTool(emit, envelope.sessionId, 'ui.present', {
                    surface: 'quiz',
                    layout: 'SINGLE_COLUMN',
                    collectionId: content.collectionId,
                    questions: content.questions,
                    stepIndex: 0,
                  });
                }
              }
            }
          }

          if (!reply) {
            const decision = selectAgentRoute({
              userPrompt,
              intent: typeof intent === 'string' ? intent : undefined,
              targetLanguage: track,
            });

            if (decision.route === 'responses-lite') {
              const coach = resolveResponsesLiteCoach({
                prompt: userPrompt,
                track,
              });
              if (coach) {
                reply = coach.reply;
              }

              if (!reply) {
                const liteSessionRes = await this.responsesAdapter.createSession({
                  sessionId: envelope.sessionId,
                  userId,
                });
                if (isOk(liteSessionRes)) {
                  let liteOut = '';
                  for await (const ev of liteSessionRes.value.send({
                    message: userPrompt,
                    contextSnapshot: snapshot,
                  })) {
                    if (abortController.signal.aborted) break;
                    if (ev.type === 'TEXT_DELTA' && 'delta' in ev && ev.delta) {
                      liteOut += ev.delta;
                    } else if (ev.type === 'COMPLETED' && 'finalOutput' in ev && ev.finalOutput) {
                      liteOut = String(ev.finalOutput);
                    } else if (ev.type === 'ERROR' && 'error' in ev) {
                      return err(ev.error);
                    }
                  }
                  if (liteOut) {
                    reply = liteOut;
                  }
                }
              }
            }

            if (!reply) {
              reply = buildGenericCoachReply({
                track,
                userPrompt,
                focusLabel: snapshot.focus?.skillTag || snapshot.focus?.surface,
              });
            }
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
