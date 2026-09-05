import {
  ok,
  err,
  isOk,
  type Result,
  BusinessError,
  translateToBusinessError,
} from '@study-studio/shared';
import type { AgentEvent } from '@study-studio/agent-core';
import { JsonRpcStdioClient } from './jsonrpc-stdio.js';
import {
  type CodexAppServerConfig,
  type DynamicToolCallParams,
  type DynamicToolCallResponse,
  type DynamicToolSpec,
  type ThreadStartParams,
  type ThreadStartResponse,
  type TurnInterruptParams,
  type TurnSteerParams,
  type TurnStartParams,
  type TurnStartResponse,
  loadCodexConfigFromEnv,
  buildCodexProcessEnv,
  resolveCodexHome,
  resolveCodexBinary,
  type CodexAccountStatus,
  type CodexModelInfo,
  type CodexApprovalHandler,
  type CodexApprovalRequest,
  type CodexApprovalDecision,
  type CodexThreadSummary,
  type CodexThreadItemDto,
  type CodexCollaborationModeDto,
  type CodexQueuedSubmissionDto,
  type CodexSkillDto,
  type CodexRateLimitsDto,
  type CodexMcpServerStatusDto,
  type CodexRealtimeStartParams,
  type CodexRealtimeAudioChunkDto,
  type CodexRealtimeVoicesDto,
  type CodexRealtimeCapabilityDto,
  type CodexRealtimeTextRole,
  normalizeSandboxMode,
  normalizeApprovalPolicy,
} from './app-server-protocol.js';
import { mapAppServerNotificationToEvents } from './event-mapper.js';
import { existsSync } from 'node:fs';
import path from 'node:path';

export type ToolCallHandler = (
  params: DynamicToolCallParams
) => Promise<DynamicToolCallResponse> | DynamicToolCallResponse;

/**
 * 单个 App Server 进程连接；可承载多个 Thread。
 */
export class CodexAppServerConnection {
  private readonly rpc = new JsonRpcStdioClient();
  private initialized = false;
  private readonly config: CodexAppServerConfig;
  private toolCallHandler: ToolCallHandler | null = null;
  private approvalHandler: CodexApprovalHandler | null = null;
  /** 当前 turn 的审批策略覆盖（never 则自动 accept） */
  private activeApprovalPolicy: string;
  /** 正在流式中的 turn id（供 steer / interrupt） */
  private activeTurnId: string | null = null;
  /** 连接级通知（含 idle 时 queue/changed 等） */
  private idleNotifyUnsub: (() => void) | null = null;
  private readonly idleNotifyHandlers = new Set<
    (method: string, params: unknown) => void
  >();

  constructor(config?: CodexAppServerConfig) {
    this.config = { ...loadCodexConfigFromEnv(), ...config };
    this.activeApprovalPolicy = normalizeApprovalPolicy(this.config.approvalPolicy);
  }

  /** 订阅 App Server 通知（不限于进行中的 turn） */
  public onNotification(
    handler: (method: string, params: unknown) => void
  ): () => void {
    this.idleNotifyHandlers.add(handler);
    return () => this.idleNotifyHandlers.delete(handler);
  }

  public setToolCallHandler(handler: ToolCallHandler | null): void {
    this.toolCallHandler = handler;
  }

  public setApprovalHandler(handler: CodexApprovalHandler | null): void {
    this.approvalHandler = handler;
  }

  public setActiveApprovalPolicy(policy?: string | null): void {
    this.activeApprovalPolicy = normalizeApprovalPolicy(
      policy ?? this.config.approvalPolicy
    );
  }

  public async connect(): Promise<Result<void, BusinessError>> {
    if (this.config.enabled === false) {
      return err(
        new BusinessError(
          'E_CODEX_DISABLED',
          '已关闭 Codex App Server（STUDY_STUDIO_CODEX=0）。',
          'AGENT_RUNTIME'
        )
      );
    }
    if (this.rpc.isConnected && this.initialized) return ok(undefined);

    const startOpts: {
      command: string;
      args: string[];
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    } = {
      command: this.config.command || 'codex',
      args: this.config.args ?? ['app-server', '--listen', 'stdio://'],
      env: buildCodexProcessEnv(this.config),
    };
    if (this.config.cwd) startOpts.cwd = this.config.cwd;
    const startRes = await this.rpc.start(startOpts);
    if (!isOk(startRes)) return startRes;

    this.rpc.onServerRequest(async (req) => {
      if (req.method === 'item/tool/call') {
        const params = req.params as DynamicToolCallParams;
        if (!this.toolCallHandler) {
          return {
            contentItems: [
              {
                type: 'inputText',
                text: JSON.stringify({ error: 'No tool handler registered on Gateway' }),
              },
            ],
            success: false,
          } satisfies DynamicToolCallResponse;
        }
        return await this.toolCallHandler(params);
      }

      // 审批：never 自动放行；on-request / untrusted 交给 Gateway→前端
      if (
        req.method === 'item/commandExecution/requestApproval' ||
        req.method === 'item/fileChange/requestApproval' ||
        req.method === 'item/permissions/requestApproval' ||
        req.method === 'applyPatchApproval' ||
        req.method === 'execCommandApproval'
      ) {
        const policy = this.activeApprovalPolicy;
        if (policy === 'never') {
          return { decision: 'accept' satisfies CodexApprovalDecision };
        }
        if (!this.approvalHandler) {
          return { decision: 'decline' satisfies CodexApprovalDecision };
        }
        const params = (req.params ?? {}) as Record<string, unknown>;
        const approvalReq = buildApprovalRequest(req.method, params);
        const decision = await this.approvalHandler(approvalReq);
        return { decision };
      }

      if (req.method === 'currentTime/read') {
        return { isoTime: new Date().toISOString() };
      }

      throw new BusinessError(
        'E_CODEX_UNHANDLED_REQ',
        `未处理的 App Server 请求：${req.method}`,
        'AGENT_RUNTIME'
      );
    });

    const initRes = await this.rpc.request('initialize', {
      clientInfo: {
        name: 'study_studio_gateway',
        title: 'Study Studio Gateway',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    if (!isOk(initRes)) return initRes;

    const notified = this.rpc.notify('initialized');
    if (!isOk(notified)) return notified;

    this.initialized = true;
    if (!this.idleNotifyUnsub) {
      this.idleNotifyUnsub = this.rpc.onNotification((note) => {
        for (const h of this.idleNotifyHandlers) {
          try {
            h(note.method, note.params);
          } catch {
            // 旁路通知失败不拖垮连接
          }
        }
      });
    }
    return ok(undefined);
  }

  public async startThread(params?: {
    dynamicTools?: DynamicToolSpec[];
    model?: string;
    cwd?: string;
    sandbox?: string;
    approvalPolicy?: string;
    ephemeral?: boolean;
  }): Promise<Result<{ threadId: string }, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;

    const body: ThreadStartParams = {
      model: params?.model ?? this.config.model ?? null,
      cwd: params?.cwd ?? this.config.cwd ?? null,
      sandbox: normalizeSandboxMode(params?.sandbox ?? this.config.sandbox),
      approvalPolicy: normalizeApprovalPolicy(
        params?.approvalPolicy ?? this.config.approvalPolicy
      ),
      ephemeral: params?.ephemeral ?? true,
      dynamicTools: params?.dynamicTools ?? null,
    };

    const res = await this.rpc.request<ThreadStartResponse>('thread/start', body);
    if (!isOk(res)) return res;
    const threadId = res.value?.thread?.id;
    if (!threadId) {
      return err(
        new BusinessError('E_CODEX_THREAD', 'thread/start 未返回 thread.id', 'AGENT_RUNTIME', true)
      );
    }
    return ok({ threadId });
  }

  public async resumeThread(threadId: string): Promise<Result<void, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request('thread/resume', { threadId });
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  /**
   * 启动一轮 turn，并把通知流转为 AgentEvent。
   * 调用方负责执行 TOOL_CALL（通过 setToolCallHandler）并继续读流直至 COMPLETED。
   */
  public async *runTurn(params: {
    threadId: string;
    message: string;
    signal?: AbortSignal;
    model?: string;
    effort?: string;
    approvalPolicy?: string;
    collaborationMode?: string;
    additionalContext?: Record<
      string,
      { value: string; kind: 'untrusted' | 'application' }
    >;
  }): AsyncGenerator<AgentEvent, void, unknown> {
    const ready = await this.connect();
    if (!isOk(ready)) {
      yield { type: 'ERROR', error: ready.error };
      return;
    }

    this.setActiveApprovalPolicy(params.approvalPolicy ?? this.config.approvalPolicy);
    const turnBody: TurnStartParams = {
      threadId: params.threadId,
      input: [{ type: 'text', text: params.message }],
    };
    if (params.additionalContext) {
      turnBody.additionalContext = params.additionalContext;
    }
    if (params.model) turnBody.model = params.model;
    if (params.effort) turnBody.effort = params.effort;
    if (params.approvalPolicy) {
      turnBody.approvalPolicy = normalizeApprovalPolicy(params.approvalPolicy);
    }
    if (params.collaborationMode) {
      const mode =
        params.collaborationMode === 'plan' || params.collaborationMode === 'default'
          ? params.collaborationMode
          : 'default';
      turnBody.collaborationMode = {
        mode,
        settings: {
          model: params.model ?? this.config.model ?? '',
          reasoning_effort: params.effort ?? this.config.effort ?? null,
          developer_instructions: null,
        },
      };
    }
    if (!params.effort && this.config.effort) {
      turnBody.effort = this.config.effort;
    }

    const startRes = await this.rpc.request<TurnStartResponse>('turn/start', turnBody);
    if (!isOk(startRes)) {
      yield { type: 'ERROR', error: startRes.error };
      return;
    }
    const turnId = startRes.value?.turn?.id ?? null;
    yield* this.consumeTurnNotifications({
      threadId: params.threadId,
      turnId,
      ...(params.signal ? { signal: params.signal } : {}),
    });
  }

  /**
   * thread/queue/start — 启动队列项并流式消费该 turn。
   */
  public async *streamQueueStart(params: {
    threadId: string;
    queuedSubmissionId?: string;
    signal?: AbortSignal;
    approvalPolicy?: string;
  }): AsyncGenerator<AgentEvent, void, unknown> {
    const ready = await this.connect();
    if (!isOk(ready)) {
      yield { type: 'ERROR', error: ready.error };
      return;
    }

    this.setActiveApprovalPolicy(params.approvalPolicy ?? this.config.approvalPolicy);
    const body: Record<string, unknown> = { threadId: params.threadId };
    if (params.queuedSubmissionId) body.queuedSubmissionId = params.queuedSubmissionId;

    const startRes = await this.rpc.request<{ turn?: { id?: string } }>(
      'thread/queue/start',
      body
    );
    if (!isOk(startRes)) {
      yield { type: 'ERROR', error: startRes.error };
      return;
    }
    const turnId = startRes.value?.turn?.id ?? null;
    if (!turnId) {
      yield {
        type: 'ERROR',
        error: new BusinessError(
          'E_CODEX_QUEUE',
          'thread/queue/start 未返回 turn.id',
          'AGENT_RUNTIME',
          true
        ),
      };
      return;
    }
    yield* this.consumeTurnNotifications({
      threadId: params.threadId,
      turnId,
      ...(params.signal ? { signal: params.signal } : {}),
    });
  }

  /** 订阅 turn 通知直至 completed / abort / error */
  private async *consumeTurnNotifications(params: {
    threadId: string;
    turnId: string | null;
    signal?: AbortSignal;
  }): AsyncGenerator<AgentEvent, void, unknown> {
    const queue: AgentEvent[] = [];
    let wake: (() => void) | null = null;
    let done = false;
    let turnId = params.turnId;
    let sawText = false;
    let lastFinal: string | undefined;

    const push = (ev: AgentEvent) => {
      if (ev.type === 'TEXT_DELTA' && ev.delta) sawText = true;
      if (ev.type === 'COMPLETED' && ev.finalOutput) {
        lastFinal = ev.finalOutput;
        if (sawText) {
          queue.push({ type: 'COMPLETED' });
        } else {
          queue.push(ev);
        }
      } else {
        queue.push(ev);
      }
      wake?.();
    };

    this.activeTurnId = turnId;

    const unsub = this.rpc.onNotification((note) => {
      const mapped = mapAppServerNotificationToEvents(note.method, note.params);
      for (const ev of mapped) {
        if (ev.type === 'COMPLETED' && note.method === 'turn/completed') {
          done = true;
        }
        if (note.method === 'turn/started') {
          turnId = (note.params as { turn?: { id?: string } })?.turn?.id ?? turnId;
          this.activeTurnId = turnId;
        }
        push(ev);
      }
      if (note.method === 'turn/completed') {
        done = true;
        wake?.();
      }
    });

    const onAbort = () => {
      if (turnId) {
        void this.rpc.request('turn/interrupt', {
          threadId: params.threadId,
          turnId,
        } satisfies TurnInterruptParams);
      }
      done = true;
      wake?.();
    };
    params.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      while (!done || queue.length > 0) {
        if (params.signal?.aborted) break;
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
            setTimeout(resolve, 50);
          });
          wake = null;
          continue;
        }
        const next = queue.shift()!;
        yield next;
        if (next.type === 'ERROR') break;
        if (next.type === 'COMPLETED' && done && queue.length === 0) break;
      }

      if (!sawText && lastFinal) {
        yield { type: 'TEXT_DELTA', delta: lastFinal };
        yield { type: 'COMPLETED', finalOutput: lastFinal };
      } else if (!done) {
        yield { type: 'COMPLETED' };
      }
    } catch (e) {
      yield {
        type: 'ERROR',
        error: translateToBusinessError(e, 'CODEX_TURN'),
      };
    } finally {
      this.activeTurnId = null;
      unsub();
      params.signal?.removeEventListener('abort', onAbort);
    }
  }

  public getActiveTurnId(): string | null {
    return this.activeTurnId;
  }

  public async steer(
    threadId: string,
    turnId: string,
    message: string
  ): Promise<Result<void, BusinessError>> {
    const res = await this.rpc.request('turn/steer', {
      threadId,
      expectedTurnId: turnId,
      input: [{ type: 'text', text: message }],
    } satisfies TurnSteerParams);
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  public async interrupt(threadId: string, turnId: string): Promise<Result<void, BusinessError>> {
    const res = await this.rpc.request('turn/interrupt', {
      threadId,
      turnId,
    } satisfies TurnInterruptParams);
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  /** 列出本机 Codex 账号可见模型（复用 login 会话）。 */
  public async listModels(params?: {
    includeHidden?: boolean;
  }): Promise<Result<CodexModelInfo[], BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request<{ data?: Array<Record<string, unknown>> }>('model/list', {
      includeHidden: params?.includeHidden ?? false,
    });
    if (!isOk(res)) return res;
    const rows = Array.isArray(res.value?.data) ? res.value.data : [];
    const models: CodexModelInfo[] = rows
      .map((row) => {
        const info: CodexModelInfo = {
          id: String(row.id ?? row.model ?? ''),
          model: String(row.model ?? row.id ?? ''),
          displayName: String(row.displayName ?? row.model ?? row.id ?? 'model'),
          isDefault: Boolean(row.isDefault),
          hidden: Boolean(row.hidden),
        };
        if (row.description) info.description = String(row.description);
        const effortsRaw = row.supportedReasoningEfforts;
        if (Array.isArray(effortsRaw)) {
          info.supportedReasoningEfforts = effortsRaw
            .map((e) => {
              if (typeof e === 'string') return e;
              if (e && typeof e === 'object' && 'reasoningEffort' in e) {
                return String((e as { reasoningEffort: unknown }).reasoningEffort);
              }
              return '';
            })
            .filter(Boolean);
        }
        if (row.defaultReasoningEffort) {
          info.defaultReasoningEffort = String(row.defaultReasoningEffort);
        }
        return info;
      })
      .filter((m) => m.id || m.model);
    return ok(models);
  }

  /** thread/list — 本机持久化会话 */
  public async listThreads(params?: {
    limit?: number;
    cursor?: string;
    searchTerm?: string;
    archived?: boolean;
  }): Promise<
    Result<{ threads: CodexThreadSummary[]; nextCursor: string | null }, BusinessError>
  > {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request<{
      data?: Array<Record<string, unknown>>;
      nextCursor?: string | null;
    }>('thread/list', {
      limit: params?.limit ?? 40,
      cursor: params?.cursor ?? null,
      searchTerm: params?.searchTerm ?? null,
      archived: params?.archived ?? false,
      sortKey: 'updated_at',
      sortDirection: 'desc',
    });
    if (!isOk(res)) return res;
    const rows = Array.isArray(res.value?.data) ? res.value.data : [];
    const threads: CodexThreadSummary[] = rows
      .map((row) => {
        const t: CodexThreadSummary = {
          id: String(row.id ?? ''),
          preview: String(row.preview ?? ''),
          name: row.name != null ? String(row.name) : null,
          createdAt: Number(row.createdAt ?? 0),
          updatedAt: Number(row.updatedAt ?? 0),
          ephemeral: Boolean(row.ephemeral),
        };
        if (row.cwd != null) t.cwd = String(row.cwd);
        if (row.modelProvider != null) t.modelProvider = String(row.modelProvider);
        return t;
      })
      .filter((t) => t.id);
    return ok({
      threads,
      nextCursor: res.value?.nextCursor ?? null,
    });
  }

  /** thread/items/list — 恢复气泡用 */
  public async listThreadItems(params: {
    threadId: string;
    limit?: number;
  }): Promise<Result<{ items: CodexThreadItemDto[]; nextCursor: string | null }, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request<{
      data?: Array<{ turnId?: string; item?: Record<string, unknown> }>;
      nextCursor?: string | null;
    }>('thread/items/list', {
      threadId: params.threadId,
      limit: params.limit ?? 80,
      sortDirection: 'asc',
    });
    if (!isOk(res)) return res;
    const rows = Array.isArray(res.value?.data) ? res.value.data : [];
    const items: CodexThreadItemDto[] = [];
    for (const row of rows) {
      const item = row.item;
      if (!item || typeof item !== 'object') continue;
      const type = String(item.type ?? 'unknown');
      const dto: CodexThreadItemDto = {
        turnId: String(row.turnId ?? ''),
        type,
      };
      if (item.id != null) dto.id = String(item.id);
      if (type === 'agentMessage' && typeof item.text === 'string') {
        dto.text = item.text;
      } else if (type === 'userMessage' && Array.isArray(item.content)) {
        const texts = item.content
          .map((c) => {
            if (c && typeof c === 'object' && 'text' in c) return String((c as { text: unknown }).text ?? '');
            return '';
          })
          .filter(Boolean);
        dto.text = texts.join('\n');
      } else if (type === 'reasoning' && Array.isArray(item.summary)) {
        dto.text = item.summary.map(String).join('\n');
      } else if (type === 'dynamicToolCall') {
        dto.toolName = String(item.tool ?? 'tool');
        if (item.arguments && typeof item.arguments === 'object' && !Array.isArray(item.arguments)) {
          dto.arguments = item.arguments as Record<string, unknown>;
        }
      } else if (type === 'mcpToolCall') {
        const server = item.server ? String(item.server) : '';
        const tool = item.tool ? String(item.tool) : 'mcp';
        dto.toolName = server ? `${server}.${tool}` : tool;
        if (item.arguments && typeof item.arguments === 'object' && !Array.isArray(item.arguments)) {
          dto.arguments = item.arguments as Record<string, unknown>;
        }
      } else if (type === 'commandExecution') {
        dto.toolName = 'command';
        if (typeof item.command === 'string') dto.text = item.command;
      }
      items.push(dto);
    }
    return ok({ items, nextCursor: res.value?.nextCursor ?? null });
  }

  public async setThreadName(
    threadId: string,
    name: string
  ): Promise<Result<void, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request('thread/name/set', { threadId, name });
    if (!isOk(res)) {
      // 兼容旧方法名
      const alt = await this.rpc.request('thread/setName', { threadId, name });
      if (!isOk(alt)) return alt;
    }
    return ok(undefined);
  }

  public async archiveThread(threadId: string): Promise<Result<void, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request('thread/archive', { threadId });
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  /** thread/compact/start — 压缩上下文（异步，App Server 侧执行） */
  public async compactThread(threadId: string): Promise<Result<void, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request('thread/compact/start', { threadId });
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  /** thread/fork — 从已有会话分叉 */
  public async forkThread(params: {
    threadId: string;
    ephemeral?: boolean;
    model?: string;
  }): Promise<Result<{ threadId: string }, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const body: Record<string, unknown> = {
      threadId: params.threadId,
      excludeTurns: true,
    };
    if (typeof params.ephemeral === 'boolean') body.ephemeral = params.ephemeral;
    if (params.model) body.model = params.model;
    const res = await this.rpc.request<{ thread?: { id?: string } }>('thread/fork', body);
    if (!isOk(res)) return res;
    const threadId = res.value?.thread?.id;
    if (!threadId) {
      return err(
        new BusinessError('E_CODEX_THREAD', 'thread/fork 未返回 thread.id', 'AGENT_RUNTIME', true)
      );
    }
    return ok({ threadId });
  }

  /** thread/queue/add */
  public async queueAdd(params: {
    threadId: string;
    message: string;
    clientUserMessageId?: string;
  }): Promise<Result<CodexQueuedSubmissionDto, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const clientUserMessageId =
      params.clientUserMessageId || `q_${Date.now().toString(36)}`;
    const res = await this.rpc.request<{
      queuedSubmission?: {
        id?: string;
        clientUserMessageId?: string;
        input?: Array<{ type?: string; text?: string }>;
      };
    }>('thread/queue/add', {
      threadId: params.threadId,
      clientUserMessageId,
      input: [{ type: 'text', text: params.message }],
    });
    if (!isOk(res)) return res;
    const q = res.value?.queuedSubmission;
    if (!q?.id) {
      return err(
        new BusinessError('E_CODEX_QUEUE', 'thread/queue/add 未返回队列项', 'AGENT_RUNTIME', true)
      );
    }
    const text =
      Array.isArray(q.input) && q.input[0]?.text
        ? String(q.input[0].text)
        : params.message;
    return ok({
      id: String(q.id),
      text,
      clientUserMessageId: String(q.clientUserMessageId ?? clientUserMessageId),
    });
  }

  public async queueList(params: {
    threadId: string;
    limit?: number;
  }): Promise<
    Result<{ items: CodexQueuedSubmissionDto[]; nextCursor: string | null }, BusinessError>
  > {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request<{
      data?: Array<{
        id?: string;
        clientUserMessageId?: string;
        input?: Array<{ type?: string; text?: string }>;
      }>;
      nextCursor?: string | null;
    }>('thread/queue/list', {
      threadId: params.threadId,
      limit: params.limit ?? 20,
    });
    if (!isOk(res)) return res;
    const rows = Array.isArray(res.value?.data) ? res.value.data : [];
    const items: CodexQueuedSubmissionDto[] = rows
      .map((row) => {
        const text =
          Array.isArray(row.input) && row.input[0]?.text
            ? String(row.input[0].text)
            : '';
        return {
          id: String(row.id ?? ''),
          text,
          clientUserMessageId: String(row.clientUserMessageId ?? ''),
        };
      })
      .filter((i) => i.id);
    return ok({ items, nextCursor: res.value?.nextCursor ?? null });
  }

  public async queueDelete(params: {
    threadId: string;
    queuedSubmissionId: string;
  }): Promise<Result<void, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request('thread/queue/delete', {
      threadId: params.threadId,
      queuedSubmissionId: params.queuedSubmissionId,
    });
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  public async queueStart(params: {
    threadId: string;
    queuedSubmissionId?: string;
  }): Promise<Result<{ turnId: string }, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const body: Record<string, unknown> = { threadId: params.threadId };
    if (params.queuedSubmissionId) body.queuedSubmissionId = params.queuedSubmissionId;
    const res = await this.rpc.request<{ turn?: { id?: string } }>('thread/queue/start', body);
    if (!isOk(res)) return res;
    const turnId = res.value?.turn?.id;
    if (!turnId) {
      return err(
        new BusinessError(
          'E_CODEX_QUEUE',
          'thread/queue/start 未返回 turn.id',
          'AGENT_RUNTIME',
          true
        )
      );
    }
    return ok({ turnId: String(turnId) });
  }

  /** skills/list */
  public async listSkills(params?: {
    forceReload?: boolean;
  }): Promise<Result<CodexSkillDto[], BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request<{
      data?: Array<{
        skills?: Array<Record<string, unknown>>;
      }>;
    }>('skills/list', {
      forceReload: params?.forceReload ?? false,
    });
    if (!isOk(res)) return res;
    const groups = Array.isArray(res.value?.data) ? res.value.data : [];
    const skills: CodexSkillDto[] = [];
    for (const g of groups) {
      const rows = Array.isArray(g.skills) ? g.skills : [];
      for (const row of rows) {
        const s: CodexSkillDto = {
          name: String(row.name ?? ''),
          description: String(row.description ?? row.shortDescription ?? ''),
          enabled: Boolean(row.enabled),
        };
        if (row.scope != null) s.scope = String(row.scope);
        if (row.path != null) s.path = String(row.path);
        if (s.name) skills.push(s);
      }
    }
    return ok(skills);
  }

  /** collaborationMode/list */
  public async listCollaborationModes(): Promise<
    Result<CodexCollaborationModeDto[], BusinessError>
  > {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request<{ data?: Array<Record<string, unknown>> }>(
      'collaborationMode/list',
      {}
    );
    if (!isOk(res)) return res;
    const rows = Array.isArray(res.value?.data) ? res.value.data : [];
    return ok(
      rows.map((row) => ({
        name: String(row.name ?? row.mode ?? 'default'),
        mode: row.mode != null ? String(row.mode) : null,
        model: row.model != null ? String(row.model) : null,
        reasoningEffort:
          row.reasoning_effort != null
            ? String(row.reasoning_effort)
            : row.reasoningEffort != null
              ? String(row.reasoningEffort)
              : null,
      }))
    );
  }

  /** 探测本机 Codex 登录态（不读取/复制密钥，只问 App Server）。 */
  public async readAccountStatus(): Promise<Result<CodexAccountStatus, BusinessError>> {
    const binary = this.config.command || resolveCodexBinary();
    const codexHome = resolveCodexHome(this.config.codexHome);
    const authHint = Boolean(codexHome && existsSync(path.join(codexHome, 'auth.json')));

    const ready = await this.connect();
    if (!isOk(ready)) {
      const status: CodexAccountStatus = {
        linked: false,
        requiresOpenaiAuth: true,
        binary,
        message: ready.error.userMessage || ready.error.message,
      };
      if (codexHome) status.codexHome = codexHome;
      return ok(status);
    }

    const res = await this.rpc.request<{
      account?: { email?: string; planType?: string } | null;
      requiresOpenaiAuth?: boolean;
    }>('account/read', {});
    if (!isOk(res)) {
      const status: CodexAccountStatus = {
        linked: authHint,
        requiresOpenaiAuth: true,
        binary,
        message: res.error.userMessage || res.error.message,
      };
      if (codexHome) status.codexHome = codexHome;
      return ok(status);
    }

    const account = res.value?.account ?? null;
    const requires = Boolean(res.value?.requiresOpenaiAuth);
    const linked = Boolean(account) || (authHint && !requires);
    const status: CodexAccountStatus = {
      linked,
      requiresOpenaiAuth: requires,
      planType: account?.planType ?? null,
      email: account?.email ?? null,
      binary,
      message: linked
        ? '已联动本机 Codex 登录态'
        : requires
          ? '本机 Codex 尚未登录，请先在终端执行 codex login'
          : '已检测到本机 Codex 配置，可直接发起对话',
    };
    if (codexHome) status.codexHome = codexHome;
    return ok(status);
  }

  /** account/rateLimits/read */
  public async readRateLimits(): Promise<Result<CodexRateLimitsDto, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request<{
      rateLimits?: {
        limitId?: string | null;
        limitName?: string | null;
        planType?: string | null;
        primary?: { usedPercent?: number; resetsAt?: number | null } | null;
        secondary?: { usedPercent?: number; resetsAt?: number | null } | null;
      };
    }>('account/rateLimits/read', {});
    if (!isOk(res)) return res;
    const snap = res.value?.rateLimits;
    return ok({
      limitId: snap?.limitId ?? null,
      limitName: snap?.limitName ?? null,
      planType: snap?.planType != null ? String(snap.planType) : null,
      primaryUsedPercent:
        typeof snap?.primary?.usedPercent === 'number' ? snap.primary.usedPercent : null,
      primaryResetsAt:
        typeof snap?.primary?.resetsAt === 'number' ? snap.primary.resetsAt : null,
      secondaryUsedPercent:
        typeof snap?.secondary?.usedPercent === 'number'
          ? snap.secondary.usedPercent
          : null,
      secondaryResetsAt:
        typeof snap?.secondary?.resetsAt === 'number' ? snap.secondary.resetsAt : null,
    });
  }

  /** mcpServerStatus/list — 只读观测本机 Codex 已配置的 MCP（非学习域工具总线） */
  public async listMcpServerStatus(params?: {
    cursor?: string;
    limit?: number;
  }): Promise<
    Result<{ servers: CodexMcpServerStatusDto[]; nextCursor: string | null }, BusinessError>
  > {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const body: Record<string, unknown> = {
      limit: params?.limit ?? 40,
    };
    if (params?.cursor) body.cursor = params.cursor;
    const res = await this.rpc.request<{
      data?: Array<{
        name?: string;
        pluginId?: string | null;
        authStatus?: string | { status?: string };
        tools?: Record<string, unknown>;
      }>;
      nextCursor?: string | null;
    }>('mcpServerStatus/list', body);
    if (!isOk(res)) return res;
    const rows = Array.isArray(res.value?.data) ? res.value.data : [];
    const servers: CodexMcpServerStatusDto[] = rows.map((row) => {
      const auth =
        typeof row.authStatus === 'string'
          ? row.authStatus
          : row.authStatus && typeof row.authStatus === 'object'
            ? String((row.authStatus as { status?: string }).status ?? 'unknown')
            : 'unknown';
      return {
        name: String(row.name ?? ''),
        authStatus: auth,
        toolCount: row.tools ? Object.keys(row.tools).length : 0,
        pluginId: row.pluginId != null ? String(row.pluginId) : null,
      };
    }).filter((s) => s.name);
    return ok({
      servers,
      nextCursor: res.value?.nextCursor ?? null,
    });
  }

  /**
   * EXPERIMENTAL — thread/realtime/listVoices + 能力探测。
   * 成功仅代表本机 App Server 识别该 RPC；不代表 Study Studio 已接音频 UI。
   */
  public async probeRealtimeCapability(): Promise<
    Result<CodexRealtimeCapabilityDto, BusinessError>
  > {
    const voicesRes = await this.listRealtimeVoices();
    if (!isOk(voicesRes)) {
      return ok({
        available: false,
        experimental: true,
        message:
          voicesRes.error.userMessage ||
          voicesRes.error.message ||
          '本机 Codex 暂未响应 realtime voices；接口已预留，待引擎支持后再用。',
      });
    }
    return ok({
      available: true,
      experimental: true,
      message:
        '本机 App Server 已响应 realtime voices（实验性）。Study Studio 尚未接 UI/音频管线，请勿当作可用产品能力。',
      voices: voicesRes.value,
    });
  }

  public async listRealtimeVoices(): Promise<Result<CodexRealtimeVoicesDto, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request<{
      voices?: {
        v1?: string[];
        v2?: string[];
        defaultV1?: string;
        defaultV2?: string;
      };
    }>('thread/realtime/listVoices', {});
    if (!isOk(res)) return res;
    const v = res.value?.voices;
    return ok({
      v1: Array.isArray(v?.v1) ? v.v1.map(String) : [],
      v2: Array.isArray(v?.v2) ? v.v2.map(String) : [],
      defaultV1: v?.defaultV1 != null ? String(v.defaultV1) : null,
      defaultV2: v?.defaultV2 != null ? String(v.defaultV2) : null,
    });
  }

  /** EXPERIMENTAL — thread/realtime/start */
  public async startRealtime(
    params: CodexRealtimeStartParams
  ): Promise<Result<{ ok: true }, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const body: Record<string, unknown> = {
      threadId: params.threadId,
      outputModality: params.outputModality,
    };
    if (params.model) body.model = params.model;
    if (params.voice) body.voice = params.voice;
    if (params.prompt) body.prompt = params.prompt;
    if (params.transport) body.transport = params.transport;
    if (params.version) body.version = params.version;
    if (params.realtimeSessionId) body.realtimeSessionId = params.realtimeSessionId;
    if (params.realtimeStartInstructions) {
      body.realtimeStartInstructions = params.realtimeStartInstructions;
    }
    if (params.realtimeEndInstructions) {
      body.realtimeEndInstructions = params.realtimeEndInstructions;
    }
    const res = await this.rpc.request('thread/realtime/start', body);
    if (!isOk(res)) return res;
    return ok({ ok: true });
  }

  /** EXPERIMENTAL — thread/realtime/stop */
  public async stopRealtime(threadId: string): Promise<Result<void, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request('thread/realtime/stop', { threadId });
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  /** EXPERIMENTAL — thread/realtime/appendText */
  public async appendRealtimeText(params: {
    threadId: string;
    text: string;
    role?: CodexRealtimeTextRole;
  }): Promise<Result<void, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request('thread/realtime/appendText', {
      threadId: params.threadId,
      text: params.text,
      role: params.role ?? 'user',
    });
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  /** EXPERIMENTAL — thread/realtime/appendSpeech */
  public async appendRealtimeSpeech(params: {
    threadId: string;
    text: string;
  }): Promise<Result<void, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const res = await this.rpc.request('thread/realtime/appendSpeech', {
      threadId: params.threadId,
      text: params.text,
    });
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  /** EXPERIMENTAL — thread/realtime/appendAudio */
  public async appendRealtimeAudio(params: {
    threadId: string;
    audio: CodexRealtimeAudioChunkDto;
  }): Promise<Result<void, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;
    const audio: Record<string, unknown> = {
      data: params.audio.data,
      sampleRate: params.audio.sampleRate,
      numChannels: params.audio.numChannels,
      samplesPerChannel: params.audio.samplesPerChannel ?? null,
      itemId: params.audio.itemId ?? null,
    };
    const res = await this.rpc.request('thread/realtime/appendAudio', {
      threadId: params.threadId,
      audio,
    });
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  public async close(): Promise<Result<void, BusinessError>> {
    this.initialized = false;
    this.idleNotifyUnsub?.();
    this.idleNotifyUnsub = null;
    this.idleNotifyHandlers.clear();
    return this.rpc.close();
  }
}

function buildApprovalRequest(
  method: string,
  params: Record<string, unknown>
): CodexApprovalRequest {
  const itemId = params.itemId != null ? String(params.itemId) : '';
  const approvalId = String(params.approvalId || itemId || `appr_${Date.now()}`);
  const command = params.command != null ? String(params.command) : '';
  const reason = params.reason != null ? String(params.reason) : '';
  const cwd = params.cwd != null ? String(params.cwd) : '';

  let action = method;
  if (method.includes('commandExecution') || method.includes('execCommand')) {
    action = 'exec';
  } else if (method.includes('fileChange') || method.includes('applyPatch')) {
    action = 'file_change';
  } else if (method.includes('permissions')) {
    action = 'permissions';
  }

  const description =
    reason ||
    command ||
    (typeof params.summary === 'string' ? params.summary : '') ||
    `Codex 请求批准：${method}`;

  const available = Array.isArray(params.availableDecisions)
    ? params.availableDecisions.map((d) => String(d))
    : undefined;

  const req: CodexApprovalRequest = {
    method,
    approvalId,
    action,
    description: [description, cwd ? `cwd: ${cwd}` : ''].filter(Boolean).join('\n'),
    riskLevel: action === 'exec' ? 'high' : 'medium',
  };
  if (params.threadId != null) req.threadId = String(params.threadId);
  if (params.turnId != null) req.turnId = String(params.turnId);
  if (itemId) req.itemId = itemId;
  if (available?.length) req.availableDecisions = available;
  return req;
}
