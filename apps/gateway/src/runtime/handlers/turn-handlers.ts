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
} from '@study-studio/shared';
import type { GatewayServer } from '../gateway-runtime.js';
import type { ContextSnapshot } from '@study-studio/agent-core';
import type { ToolDefinition } from '@study-studio/tool-core';
import type { AgentLane, SessionManager } from '../../session/session-manager.js';
import {
  buildGenericCoachReply,
  defaultCoachTopic,
  defaultExplainTopic,
  defaultQuizSkillId,
  normalizeTrackLanguage,
} from '../../services/learning-language-policy.js';
import { selectAgentRoute } from '../../router/agent-router.js';
import { resolveResponsesLiteCoach } from '../responses-lite-coach.js';
import { buildTurnExecutionSummary, formatCodexLocalFallbackNote } from '../turn-summary-builder.js';
import type { LearningContentOutput } from '../../transport/tools/learning-content-tool.js';

function resolveAgentLane(
  intent: string,
  explicit?: string | null
): AgentLane {
  if (explicit === 'coach' || explicit === 'learning') return explicit;
  // 聊天界面专用；出题/批改/题目讲解走 learning，与 coach thread 隔离
  if (intent === 'FREE_COACH') return 'coach';
  return 'learning';
}

/** 下发 Client Tool 调用（前端执行，Gateway 只做参数校验） */
async function emitClientTool(
  server: GatewayServer,
  emit: ((env: WsEnvelope) => void) | undefined,
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<void> {
  const tool = server.toolRegistry.get(toolName);
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

export async function handleTurnSend(
  server: GatewayServer,
  envelope: WsEnvelope,
  emit?: (env: WsEnvelope) => void
): Promise<Result<WsEnvelope, BusinessError>> {
  const payload = (envelope.payload ?? {}) as {
    input: string;
    userId?: string;
    intent?: string;
    contextSnapshot?: Partial<ContextSnapshot>;
    agentOptions?: {
      model?: string;
      preferCodex?: boolean;
      effort?: string;
      approvalPolicy?: string;
      threadId?: string;
      ephemeral?: boolean;
      collaborationMode?: string;
      /**
       * 跳过关键词模板短路（导师抽屉等拼装式 prompt 专用：触发词多为脚手架文字）。
       * 置 true 后本轮必经 AgentRouter（含 Codex 主通路），不再被模板截获。
       */
      bypassKeywordTemplates?: boolean;
      /** coach=聊天；learning=出题/批改/题目导师 */
      lane?: string;
    };
  };
  const userId = payload.userId || 'student_web_01';
  const userPrompt = String(payload.input || '').trim();
  const preferredModel =
    typeof payload.agentOptions?.model === 'string' && payload.agentOptions.model.trim()
      ? payload.agentOptions.model.trim()
      : undefined;
  const preferredEffort =
    typeof payload.agentOptions?.effort === 'string' && payload.agentOptions.effort.trim()
      ? payload.agentOptions.effort.trim()
      : undefined;
  const preferredApproval =
    typeof payload.agentOptions?.approvalPolicy === 'string' &&
    payload.agentOptions.approvalPolicy.trim()
      ? payload.agentOptions.approvalPolicy.trim()
      : undefined;
  const preferredThreadId =
    typeof payload.agentOptions?.threadId === 'string' &&
    payload.agentOptions.threadId.trim()
      ? payload.agentOptions.threadId.trim()
      : undefined;
  const preferredCollab =
    typeof payload.agentOptions?.collaborationMode === 'string' &&
    payload.agentOptions.collaborationMode.trim()
      ? payload.agentOptions.collaborationMode.trim()
      : undefined;
  const preferPersistent =
    payload.agentOptions?.ephemeral === false
      ? true
      : payload.agentOptions?.ephemeral === true
        ? false
        : undefined;

  // 1. 组装不可变学情快照
  const snapshot = await server.contextBuilder.buildTurnSnapshot(
    userId,
    server.learnerRepo,
    payload.contextSnapshot
  );

  // 2. 发出回合启动通知
  const intent = payload.intent || snapshot.userIntentHint || 'EXPLAIN';
  const agentLane = resolveAgentLane(intent, payload.agentOptions?.lane);
  const startEnvelope: WsEnvelope = {
    version: '1.0',
    id: generateId('turn'),
    sessionId: envelope.sessionId,
    type: WsEventTypes.AGENT_TURN_START,
    payload: { intent, focus: snapshot.focus, lane: agentLane },
    timestamp: Date.now(),
  };
  if (emit) emit(startEnvelope);

  // 3. 建立打断控制器
  const abortController = new AbortController();
  server.activeStreamControllers.set(envelope.sessionId, abortController);
  server.activeTurnEmit = emit;
  server.activeTurnLane.set(envelope.sessionId, agentLane);
  // P3-C：记录回合起始时间，供执行摘要计算耗时
  const turnStartedAt = Date.now();

  let reply = '';
  let toolResults: unknown = undefined;
  let replySource: 'codex' | 'lite' | 'keyword' | 'local' = 'local';
  let codexThreadId: string | undefined;
  let codexFailureMessage: string | undefined;
  // P3-C：保留 Codex 失败的结构化业务错误，供执行摘要翻译为用户友好状态（不泄漏栈）
  let codexFailureError: BusinessError | undefined;

  try {
    const track = normalizeTrackLanguage(snapshot.targetLanguage);
    // FREE_COACH：跳过关键词模板，直接交给 Codex 主通路
    const skipKeywordTemplates =
      intent === 'FREE_COACH' || payload.agentOptions?.bypassKeywordTemplates === true;

    // 根据意图或用户自然语言分发到参数化工具或专家教学大纲
    if (!skipKeywordTemplates && (userPrompt.includes('例句') || userPrompt.includes('造句'))) {
      const tool = server.toolRegistry.get('learning.content');
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
      !skipKeywordTemplates &&
      (
      userPrompt.includes('为什么') ||
      userPrompt.includes('讲透') ||
      userPrompt.includes('辨析') ||
      userPrompt.includes('区分') ||
      userPrompt.includes('考点')
      )
    ) {
      const tool = server.toolRegistry.get('learning.content');
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
      !skipKeywordTemplates &&
      (
      userPrompt.includes('考我') ||
      userPrompt.includes('出题') ||
      userPrompt.includes('练一练') ||
      intent === 'GENERATE_QUIZ'
      )
    ) {
      const tool = server.toolRegistry.get('learning.content');
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

            await emitClientTool(server, emit, envelope.sessionId, 'ui.navigate', {
              target: 'QUIZ',
            });
            await emitClientTool(server, emit, envelope.sessionId, 'ui.present', {
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
          replySource = 'lite';
        }

        if (!reply) {
          const liteSessionRes = await server.responsesAdapter.createSession({
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
              replySource = 'lite';
            }
          }
        }
      }

      // learning-loop：优先真实 Codex App Server 流式（复用本机 login）
      let streamedFromCodex = false;
      let codexFailHint = '';
      if (!reply && decision.route === 'learning-loop') {
        const learningTools = [
          server.toolRegistry.get('learning.content'),
          server.toolRegistry.get('learning.assess'),
          server.toolRegistry.get('learning.progress'),
          server.toolRegistry.get('learning.plan'),
          server.toolRegistry.get('learning.curriculum'),
          server.toolRegistry.get('learning.library'),
          server.toolRegistry.get('dictionary.lookup'),
          server.toolRegistry.get('ui.navigate'),
          server.toolRegistry.get('ui.present'),
        ].filter((tool): tool is ToolDefinition => Boolean(tool));

        // 按 lane 复用 Codex thread（coach 与 learning 互不共享）
        let agentSession =
          server.sessionManager.getAgentSession(envelope.sessionId, agentLane) ?? null;

        if (
          agentSession &&
          preferredThreadId &&
          agentSession.threadId &&
          agentSession.threadId !== preferredThreadId
        ) {
          void agentSession.close();
          server.sessionManager.detachAgentSession(envelope.sessionId, agentLane);
          agentSession = null;
        }

        if (!agentSession) {
          const sessionOpts: {
            sessionId: string;
            userId: string;
            tools?: ToolDefinition[];
            model?: string;
            approvalPolicy?: string;
            resumeThreadId?: string;
            ephemeral?: boolean;
          } = {
            // 同一 Gateway WS session 下按 lane 分 key，避免 CodexAdapter 互相覆盖
            sessionId: `${envelope.sessionId}:${agentLane}`,
            userId,
            tools: learningTools,
          };
          if (preferredModel) sessionOpts.model = preferredModel;
          if (preferredApproval) sessionOpts.approvalPolicy = preferredApproval;
          if (preferredThreadId) sessionOpts.resumeThreadId = preferredThreadId;
          if (preferPersistent === true) sessionOpts.ephemeral = false;
          if (preferPersistent === false) sessionOpts.ephemeral = true;

          const sessionRes = await server.agentAdapter.createSession(sessionOpts);
          if (isOk(sessionRes)) {
            server.sessionManager.attachAgentSession(
              envelope.sessionId,
              sessionRes.value,
              agentLane
            );
            agentSession = sessionRes.value;
          } else {
            codexFailHint =
              sessionRes.error.userMessage || 'Codex 服务暂时不可用，请稍后重试。';
            codexFailureMessage = codexFailHint;
            codexFailureError = sessionRes.error;
            console.warn(
              `[codex-session] ${sessionRes.error.code} ${codexFailHint}`
            );
          }
        }

        if (agentSession) {
          if (agentSession.threadId) codexThreadId = agentSession.threadId;
          let acc = '';
          for await (const ev of agentSession.send({
            message: userPrompt,
            contextSnapshot: snapshot,
            turnOptions: {
              ...(preferredModel ? { model: preferredModel } : {}),
              ...(preferredEffort ? { effort: preferredEffort } : {}),
              ...(preferredApproval ? { approvalPolicy: preferredApproval } : {}),
              ...(preferredCollab ? { collaborationMode: preferredCollab } : {}),
            },
          })) {
            if (abortController.signal.aborted) {
              await agentSession.interrupt();
              break;
            }
            if (ev.type === 'TEXT_DELTA' && ev.delta) {
              acc += ev.delta;
              streamedFromCodex = true;
              if (emit) {
                emit({
                  version: '1.0',
                  id: generateId('delta'),
                  sessionId: envelope.sessionId,
                  type: WsEventTypes.AGENT_TEXT_DELTA,
                  payload: {
                    delta: ev.delta,
                    textDelta: ev.delta,
                    source: 'codex',
                    lane: agentLane,
                  },
                  timestamp: Date.now(),
                });
              }
            } else if (ev.type === 'REASONING_DELTA' && ev.delta) {
              if (emit) {
                emit({
                  version: '1.0',
                  id: generateId('reason'),
                  sessionId: envelope.sessionId,
                  type: WsEventTypes.AGENT_REASONING_DELTA,
                  payload: { delta: ev.delta, lane: agentLane },
                  timestamp: Date.now(),
                });
              }
            } else if (ev.type === 'TOOL_CALL_REQUESTED') {
              if (emit) {
                emit({
                  version: '1.0',
                  id: generateId('tool'),
                  sessionId: envelope.sessionId,
                  type: WsEventTypes.AGENT_TOOL_CALL,
                  payload: {
                    callId: ev.callId,
                    toolName: ev.toolName,
                    arguments: ev.input,
                    args: ev.input,
                    lane: agentLane,
                  },
                  timestamp: Date.now(),
                });
              }
            } else if (ev.type === 'APPROVAL_REQUESTED') {
              if (emit) {
                emit({
                  version: '1.0',
                  id: generateId('appr'),
                  sessionId: envelope.sessionId,
                  type: WsEventTypes.AGENT_APPROVAL_REQUEST,
                  payload: {
                    approvalId: ev.approvalId,
                    action: ev.action,
                    description: ev.description,
                    riskLevel: ev.riskLevel,
                    expiresAt: ev.expiresAt,
                    lane: agentLane,
                  },
                  timestamp: Date.now(),
                });
              }
            } else if (ev.type === 'APPROVAL_RESOLVED') {
              if (emit) {
                emit({
                  version: '1.0',
                  id: generateId('appr_res'),
                  sessionId: envelope.sessionId,
                  type: WsEventTypes.AGENT_APPROVAL_RESOLVED,
                  payload: {
                    approvalId: ev.approvalId,
                    decision: ev.decision,
                    reason: ev.reason,
                    lane: agentLane,
                  },
                  timestamp: Date.now(),
                });
              }
            } else if (ev.type === 'COMPLETED' && ev.finalOutput) {
              if (!acc) acc = String(ev.finalOutput);
            } else if (ev.type === 'ERROR') {
              streamedFromCodex = false;
              acc = '';
              codexFailHint =
                ev.error?.userMessage || 'Codex 服务暂时不可用，请稍后重试。';
              codexFailureMessage = codexFailHint || undefined;
              codexFailureError = ev.error;
              console.warn(
                `[codex-turn] ${ev.error?.code ?? 'E_CODEX_TURN'} ${codexFailHint}`
              );
              // 出错时丢弃坏会话，下轮重建
              void agentSession.close();
              server.sessionManager.detachAgentSession(envelope.sessionId, agentLane);
              break;
            }
          }
          if (acc) {
            reply = acc;
            streamedFromCodex = true;
            replySource = 'codex';
          }
        }
      }

      if (!reply) {
        reply = buildGenericCoachReply({
          track,
          userPrompt,
          focusLabel: snapshot.focus?.skillTag || snapshot.focus?.surface,
        });
        replySource = 'local';
        if (codexFailHint) {
          reply += formatCodexLocalFallbackNote(codexFailHint, codexFailureError);
        }
      }

      // 非 Codex 真流式时：本地文案假分块推流
      if (!streamedFromCodex) {
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
            payload: { delta: chunk, textDelta: chunk, source: replySource },
            timestamp: Date.now(),
          };
          if (emit) emit(deltaEnvelope);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
    } else {
      replySource = 'keyword';
      // 关键词工具已生成整段 reply：假分块推流
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
          payload: { delta: chunk, textDelta: chunk, source: replySource },
          timestamp: Date.now(),
        };
        if (emit) emit(deltaEnvelope);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
  } finally {
    server.activeStreamControllers.delete(envelope.sessionId);
    server.activeTurnEmit = undefined;
    server.activeTurnLane.delete(envelope.sessionId);
  }

  const isInterrupted = abortController.signal.aborted;
  let queueRemaining = 0;
  if (codexThreadId && !isInterrupted) {
    const queued = await server.listCodexQueue({ threadId: codexThreadId, limit: 20 });
    if (isOk(queued)) queueRemaining = queued.value.items.length;
  }
  // P3-C：统一执行摘要（普通回合）
  const outcome: 'streamed' | 'fallback' | 'not_requested' =
    replySource === 'codex'
      ? 'streamed'
      : codexFailureMessage
        ? 'fallback'
        : 'not_requested';
  const summary = buildTurnExecutionSummary({
    status: isInterrupted ? 'INTERRUPTED' : 'COMPLETED',
    startedAt: turnStartedAt,
    source: replySource,
    outcome,
    failureError: isInterrupted ? null : codexFailureError ?? null,
    failureCategory: isInterrupted ? 'INTERRUPTED' : codexFailureError ? undefined : undefined,
    queueRemaining,
    lane: agentLane,
    threadId: codexThreadId,
    model: preferredModel,
    legacyFailureMessage: codexFailureMessage,
  });
  const completedEnvelope: WsEnvelope = {
    version: '1.0',
    id: generateId('done'),
    sessionId: envelope.sessionId,
    type: WsEventTypes.AGENT_TURN_COMPLETED,
    payload: {
      finalOutput: reply,
      toolResults,
      // P3-C 结构化执行摘要（含 status/source/outcome/failure/elapsedMs/queueRemaining/lane/threadId/model）
      ...summary,
      // 旧字段兼容（codexOutcome / codexFailureMessage）保留，便于过渡期前端旧逻辑
      codexOutcome: outcome,
      ...(codexFailureMessage ? { codexFailureMessage } : {}),
    },
    timestamp: Date.now(),
  };
  if (emit) emit(completedEnvelope);

  return ok(completedEnvelope);
}

export async function handleQueueStart(
  server: GatewayServer,
  envelope: WsEnvelope,
  emit?: (env: WsEnvelope) => void
): Promise<Result<WsEnvelope, BusinessError>> {
  const payload = (envelope.payload ?? {}) as {
    queuedSubmissionId?: string;
    approvalPolicy?: string;
    lane?: string;
  };
  const lane: AgentLane =
    payload.lane === 'learning' || payload.lane === 'coach'
      ? payload.lane
      : server.activeTurnLane.get(envelope.sessionId) ?? 'coach';
  const agentSession = server.sessionManager.getAgentSession(envelope.sessionId, lane) as
    | (ReturnType<SessionManager['getAgentSession']> & {
        sendQueued?: (opts?: {
          queuedSubmissionId?: string;
          approvalPolicy?: string;
        }) => AsyncIterable<import('@study-studio/agent-core').AgentEvent>;
      })
    | undefined;
  if (!agentSession) {
    return err(
      new BusinessError(
        'E_SESSION_NOT_FOUND',
        '当前没有可启动队列的 Agent 会话。',
        'VALIDATION'
      )
    );
  }
  if (typeof agentSession.sendQueued !== 'function') {
    return err(
      new BusinessError(
        'E_UNSUPPORTED',
        '当前 Agent 引擎不支持队列消费。',
        'AGENT_RUNTIME'
      )
    );
  }

  const abortController = new AbortController();
  server.activeStreamControllers.set(envelope.sessionId, abortController);
  server.activeTurnEmit = emit;
  server.activeTurnLane.set(envelope.sessionId, lane);
  // P3-C：队列回合起始时间
  const turnStartedAt = Date.now();

  if (emit) {
    emit({
      version: '1.0',
      id: generateId('turn'),
      sessionId: envelope.sessionId,
      type: WsEventTypes.AGENT_TURN_START,
      payload: { source: 'codex', fromQueue: true },
      timestamp: Date.now(),
    });
  }

  let reply = '';
  let replySource: 'codex' | 'local' = 'codex';
  let streamed = false;
  // P3-C：队列失败时保留结构化业务错误
  let queueFailureError: BusinessError | undefined;
  const threadId = agentSession.threadId;

  try {
    for await (const ev of agentSession.sendQueued({
      ...(payload.queuedSubmissionId
        ? { queuedSubmissionId: payload.queuedSubmissionId }
        : {}),
      ...(payload.approvalPolicy ? { approvalPolicy: payload.approvalPolicy } : {}),
    })) {
      if (abortController.signal.aborted) {
        await agentSession.interrupt();
        break;
      }
      if (ev.type === 'TEXT_DELTA' && ev.delta) {
        reply += ev.delta;
        streamed = true;
        if (emit) {
          emit({
            version: '1.0',
            id: generateId('delta'),
            sessionId: envelope.sessionId,
            type: WsEventTypes.AGENT_TEXT_DELTA,
            payload: { delta: ev.delta, textDelta: ev.delta, source: 'codex' },
            timestamp: Date.now(),
          });
        }
      } else if (ev.type === 'REASONING_DELTA' && ev.delta) {
        if (emit) {
          emit({
            version: '1.0',
            id: generateId('reason'),
            sessionId: envelope.sessionId,
            type: WsEventTypes.AGENT_REASONING_DELTA,
            payload: { delta: ev.delta },
            timestamp: Date.now(),
          });
        }
      } else if (ev.type === 'TOOL_CALL_REQUESTED') {
        if (emit) {
          emit({
            version: '1.0',
            id: generateId('tool'),
            sessionId: envelope.sessionId,
            type: WsEventTypes.AGENT_TOOL_CALL,
            payload: {
              callId: ev.callId,
              toolName: ev.toolName,
              arguments: ev.input,
              args: ev.input,
            },
            timestamp: Date.now(),
          });
        }
      } else if (ev.type === 'APPROVAL_REQUESTED') {
        if (emit) {
          emit({
            version: '1.0',
            id: generateId('appr'),
            sessionId: envelope.sessionId,
            type: WsEventTypes.AGENT_APPROVAL_REQUEST,
            payload: {
              approvalId: ev.approvalId,
              action: ev.action,
              description: ev.description,
              riskLevel: ev.riskLevel,
              expiresAt: ev.expiresAt,
            },
            timestamp: Date.now(),
          });
        }
      } else if (ev.type === 'APPROVAL_RESOLVED') {
        if (emit) {
          emit({
            version: '1.0',
            id: generateId('appr_res'),
            sessionId: envelope.sessionId,
            type: WsEventTypes.AGENT_APPROVAL_RESOLVED,
            payload: {
              approvalId: ev.approvalId,
              decision: ev.decision,
              reason: ev.reason,
            },
            timestamp: Date.now(),
          });
        }
      } else if (ev.type === 'COMPLETED' && ev.finalOutput) {
        if (!reply) reply = String(ev.finalOutput);
      } else if (ev.type === 'ERROR') {
        streamed = false;
        reply = ev.error?.userMessage || ev.error?.message || '队列启动失败';
        replySource = 'local';
        queueFailureError = ev.error;
        break;
      }
    }
  } finally {
    server.activeStreamControllers.delete(envelope.sessionId);
    server.activeTurnEmit = undefined;
    server.activeTurnLane.delete(envelope.sessionId);
  }

  const isInterrupted = abortController.signal.aborted;
  let queueRemaining = 0;
  if (threadId && !isInterrupted) {
    const queued = await server.listCodexQueue({ threadId, limit: 20 });
    if (isOk(queued)) queueRemaining = queued.value.items.length;
  }
  // P3-C：统一执行摘要（队列回合）
  const queueStatus: 'COMPLETED' | 'INTERRUPTED' | 'FAILED' = isInterrupted
    ? 'INTERRUPTED'
    : streamed
      ? 'COMPLETED'
      : 'FAILED';
  const queueSummary = buildTurnExecutionSummary({
    status: queueStatus,
    startedAt: turnStartedAt,
    source: replySource === 'codex' ? 'codex' : 'local',
    outcome: streamed ? 'streamed' : queueFailureError ? 'fallback' : 'not_requested',
    failureError: isInterrupted ? null : queueFailureError ?? null,
    failureCategory: isInterrupted ? 'INTERRUPTED' : 'QUEUE',
    queueRemaining,
    lane,
    threadId,
    fromQueue: true,
    legacyFailureMessage: queueFailureError?.userMessage,
  });

  const completedEnvelope: WsEnvelope = {
    version: '1.0',
    id: generateId('done'),
    sessionId: envelope.sessionId,
    type: WsEventTypes.AGENT_TURN_COMPLETED,
    payload: {
      finalOutput: reply,
      // P3-C 结构化执行摘要（含 status/source/outcome/failure/elapsedMs/queueRemaining/lane/threadId/fromQueue/model）
      ...queueSummary,
      // 旧字段兼容保留
      fromQueue: true,
    },
    timestamp: Date.now(),
  };
  if (emit) emit(completedEnvelope);
  return ok(completedEnvelope);
}

export async function handleApprovalRespond(
  server: GatewayServer,
  envelope: WsEnvelope
): Promise<Result<WsEnvelope, BusinessError>> {
  const payload = (envelope.payload ?? {}) as {
    approvalId?: string;
    approved?: boolean;
    decision?: string;
    lane?: string;
  };
  const approvalId = String(payload.approvalId || '');
  if (!approvalId) {
    return err(
      new BusinessError('E_INVALID_INPUT', '缺少 approvalId', 'VALIDATION')
    );
  }

  const allowed = new Set([
    'accept',
    'acceptForSession',
    'decline',
    'cancel',
  ]);
  let decision: boolean | string;
  if (typeof payload.decision === 'string' && allowed.has(payload.decision)) {
    decision = payload.decision;
  } else if (typeof payload.approved === 'boolean') {
    decision = payload.approved;
  } else {
    return err(
      new BusinessError(
        'E_INVALID_INPUT',
        '缺少有效的审批决策（accept / acceptForSession / decline）。',
        'VALIDATION'
      )
    );
  }

  const lane: AgentLane =
    payload.lane === 'learning' || payload.lane === 'coach'
      ? payload.lane
      : server.activeTurnLane.get(envelope.sessionId) ?? 'coach';
  const agentSession = server.sessionManager.getAgentSession(envelope.sessionId, lane);
  if (!agentSession) {
    return err(
      new BusinessError(
        'E_SESSION_NOT_FOUND',
        '当前没有可响应的 Agent 会话。',
        'VALIDATION'
      )
    );
  }
  const res = await agentSession.submitApproval(
    approvalId,
    decision as boolean | 'accept' | 'acceptForSession' | 'decline' | 'cancel'
  );
  if (!isOk(res)) return err(res.error);
  return ok({
    version: '1.0',
    id: generateId('appr_ack'),
    sessionId: envelope.sessionId,
    type: WsEventTypes.AGENT_TURN_COMPLETED,
    payload: {
      status: 'APPROVAL_ACK',
      approvalId,
      lane,
      decision:
        typeof decision === 'string'
          ? decision
          : decision
            ? 'accept'
            : 'decline',
      approved:
        decision === true ||
        decision === 'accept' ||
        decision === 'acceptForSession',
    },
    timestamp: Date.now(),
  });
}

export async function handleTurnInterrupt(
  server: GatewayServer,
  envelope: WsEnvelope
): Promise<Result<WsEnvelope, BusinessError>> {
  const controller = server.activeStreamControllers.get(envelope.sessionId);
  if (controller) {
    controller.abort();
    server.activeStreamControllers.delete(envelope.sessionId);
  }
  const payload = (envelope.payload ?? {}) as { lane?: string };
  const lane: AgentLane =
    payload.lane === 'learning' || payload.lane === 'coach'
      ? payload.lane
      : server.activeTurnLane.get(envelope.sessionId) ?? 'coach';
  const agentSession = server.sessionManager.getAgentSession(envelope.sessionId, lane);
  if (agentSession) {
    void agentSession.interrupt();
  }
  return ok({
    version: '1.0',
    id: generateId('msg'),
    sessionId: envelope.sessionId,
    type: WsEventTypes.AGENT_TURN_COMPLETED,
    payload: { status: 'INTERRUPTED', lane },
    timestamp: Date.now(),
  });
}

export async function handleTurnSteer(
  server: GatewayServer,
  envelope: WsEnvelope
): Promise<Result<WsEnvelope, BusinessError>> {
  const payload = (envelope.payload ?? {}) as {
    input?: string;
    message?: string;
    lane?: string;
  };
  const message = String(payload.input || payload.message || '').trim();
  if (!message) {
    return err(
      new BusinessError('E_INVALID_INPUT', '引导消息不能为空', 'VALIDATION')
    );
  }
  const lane: AgentLane =
    payload.lane === 'learning' || payload.lane === 'coach'
      ? payload.lane
      : server.activeTurnLane.get(envelope.sessionId) ?? 'coach';
  const agentSession = server.sessionManager.getAgentSession(envelope.sessionId, lane);
  if (!agentSession) {
    return err(
      new BusinessError(
        'E_SESSION_NOT_FOUND',
        '当前没有可引导的 Agent 会话。',
        'VALIDATION'
      )
    );
  }
  const res = await agentSession.steer(message);
  if (!isOk(res)) return err(res.error);
  return ok({
    version: '1.0',
    id: generateId('steer_ack'),
    sessionId: envelope.sessionId,
    type: WsEventTypes.AGENT_TURN_COMPLETED,
    payload: { status: 'STEER_ACK', message, lane },
    timestamp: Date.now(),
  });
}
