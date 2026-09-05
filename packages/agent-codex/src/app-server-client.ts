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
  type TurnStartParams,
  type TurnStartResponse,
  loadCodexConfigFromEnv,
  buildCodexProcessEnv,
  resolveCodexHome,
  resolveCodexBinary,
  type CodexAccountStatus,
  type CodexModelInfo,
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

  constructor(config?: CodexAppServerConfig) {
    this.config = { ...loadCodexConfigFromEnv(), ...config };
  }

  public setToolCallHandler(handler: ToolCallHandler | null): void {
    this.toolCallHandler = handler;
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

      // 学习教练默认自动放行常见审批，避免卡死（sandbox=readOnly）
      if (
        req.method === 'item/commandExecution/requestApproval' ||
        req.method === 'item/fileChange/requestApproval' ||
        req.method === 'item/permissions/requestApproval' ||
        req.method === 'applyPatchApproval' ||
        req.method === 'execCommandApproval'
      ) {
        if (this.config.approvalPolicy === 'never') {
          return { decision: 'approved' };
        }
        // 交由上层可扩展；默认拒绝破坏性操作
        return { decision: 'declined' };
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
    return ok(undefined);
  }

  public async startThread(params?: {
    dynamicTools?: DynamicToolSpec[];
    model?: string;
    cwd?: string;
    sandbox?: string;
    approvalPolicy?: string;
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
      ephemeral: true,
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
  }): AsyncGenerator<AgentEvent, void, unknown> {
    const ready = await this.connect();
    if (!isOk(ready)) {
      yield { type: 'ERROR', error: ready.error };
      return;
    }

    const queue: AgentEvent[] = [];
    let wake: (() => void) | null = null;
    let done = false;
    let turnId: string | null = null;
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

    const unsub = this.rpc.onNotification((note) => {
      const mapped = mapAppServerNotificationToEvents(note.method, note.params);
      for (const ev of mapped) {
        if (ev.type === 'COMPLETED' && note.method === 'turn/completed') {
          done = true;
        }
        if (note.method === 'turn/started') {
          turnId = (note.params as any)?.turn?.id ?? turnId;
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
      const turnBody: TurnStartParams = {
        threadId: params.threadId,
        input: [{ type: 'text', text: params.message }],
      };
      if (params.model) turnBody.model = params.model;
      if (params.effort) turnBody.effort = params.effort;
      if (params.approvalPolicy) {
        turnBody.approvalPolicy = normalizeApprovalPolicy(params.approvalPolicy);
      } else if (this.config.effort && !params.effort) {
        // no-op; effort only when explicitly set
      }
      if (!params.effort && this.config.effort) {
        turnBody.effort = this.config.effort;
      }

      const startRes = await this.rpc.request<TurnStartResponse>('turn/start', turnBody);

      if (!isOk(startRes)) {
        yield { type: 'ERROR', error: startRes.error };
        return;
      }
      turnId = startRes.value?.turn?.id ?? turnId;

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
      unsub();
      params.signal?.removeEventListener('abort', onAbort);
    }
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

  public async close(): Promise<Result<void, BusinessError>> {
    this.initialized = false;
    return this.rpc.close();
  }
}
