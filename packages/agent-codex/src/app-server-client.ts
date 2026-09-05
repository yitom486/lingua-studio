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
} from './app-server-protocol.js';
import { mapAppServerNotificationToEvents } from './event-mapper.js';

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

    const startOpts: { command: string; args: string[]; cwd?: string } = {
      command: this.config.command || 'codex',
      args: this.config.args ?? ['app-server', '--listen', 'stdio://'],
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
  }): Promise<Result<{ threadId: string }, BusinessError>> {
    const ready = await this.connect();
    if (!isOk(ready)) return ready;

    const body: ThreadStartParams = {
      model: params?.model ?? this.config.model ?? null,
      cwd: params?.cwd ?? this.config.cwd ?? null,
      sandbox: this.config.sandbox ?? 'readOnly',
      approvalPolicy: this.config.approvalPolicy ?? 'never',
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
        // 若已有流式正文，避免再用整段 COMPLETED 覆盖；仍要结束
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
      const startRes = await this.rpc.request<TurnStartResponse>('turn/start', {
        threadId: params.threadId,
        input: [{ type: 'text', text: params.message }],
      } satisfies TurnStartParams);

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
    const res = await this.rpc.request('turn/interrupt', { threadId, turnId } satisfies TurnInterruptParams);
    if (!isOk(res)) return res;
    return ok(undefined);
  }

  public async close(): Promise<Result<void, BusinessError>> {
    this.initialized = false;
    return this.rpc.close();
  }
}
