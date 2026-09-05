import type {
  AgentAdapter,
  AgentSession,
  CreateSessionOptions,
  AgentInput,
  AgentEvent,
  ApprovalDecision,
} from '@study-studio/agent-core';
import type { ToolDefinition } from '@study-studio/tool-core';
import {
  ok,
  err,
  isOk,
  type Result,
  BusinessError,
  translateToBusinessError,
} from '@study-studio/shared';
import { CodexAppServerConnection } from './app-server-client.js';
import {
  toolsToDynamicSpecs,
  resolveToolName,
  sanitizeToolName,
} from './tools-bridge.js';
import type {
  CodexAppServerConfig,
  CodexAccountStatus,
  CodexModelInfo,
  CodexThreadSummary,
  CodexThreadItemDto,
  CodexCollaborationModeDto,
  DynamicToolCallResponse,
} from './app-server-protocol.js';

export type ExternalToolExecutor = (
  toolName: string,
  input: Record<string, unknown>,
  ctx: { sessionId: string; userId: string }
) => Promise<unknown>;

export interface CodexAdapterOptions {
  config?: CodexAppServerConfig;
  /** Gateway 注入：执行 Server/Client Tools 并把结果回填 App Server */
  executeTool?: ExternalToolExecutor;
}

/** 用户未操作时自动 decline，避免 App Server 审批请求挂死 */
const APPROVAL_TIMEOUT_MS = 120_000;

function normalizeApprovalDecision(
  decision: boolean | ApprovalDecision
): ApprovalDecision {
  if (typeof decision === 'boolean') return decision ? 'accept' : 'decline';
  return decision;
}

/**
 * 真实 Codex App Server 适配器（stdio JSON-RPC）。
 * 无 CLI / 未登录时 createSession 失败，由 Gateway 回落本地旁路。
 * 认证：复用本机 CODEX_HOME / ~/.codex（与 VS Code Codex 插件同源）。
 */
export class CodexSession implements AgentSession {
  private activeTurnId: string | null = null;
  private abort: AbortController | null = null;
  private readonly pendingApprovals = new Map<
    string,
    (decision: ApprovalDecision, reason?: 'user' | 'timeout' | 'interrupt') => void
  >();
  private eventSink: ((ev: AgentEvent) => void) | null = null;

  constructor(
    public readonly sessionId: string,
    public readonly threadId: string,
    public readonly userId: string,
    private readonly connection: CodexAppServerConnection,
    private readonly executeTool?: ExternalToolExecutor,
    private readonly toolNameMap?: Map<string, string>
  ) {
    this.connection.setToolCallHandler(async (params) => {
      this.activeTurnId = params.turnId;
      const toolName = params.tool;
      const args =
        params.arguments && typeof params.arguments === 'object'
          ? (params.arguments as Record<string, unknown>)
          : {};
      try {
        if (!this.executeTool) {
          return failTool('Gateway 未注入工具执行器');
        }
        const candidates = resolveToolName(toolName, this.toolNameMap);
        let lastErr = 'tool not found';
        for (const name of candidates) {
          try {
            const result = await this.executeTool(name, args, {
              sessionId: this.sessionId,
              userId: this.userId,
            });
            return {
              contentItems: [{ type: 'inputText', text: JSON.stringify(result ?? null) }],
              success: true,
            } satisfies DynamicToolCallResponse;
          } catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
          }
        }
        return failTool(lastErr);
      } catch (e) {
        return failTool(e instanceof Error ? e.message : String(e));
      }
    });

    this.connection.setApprovalHandler(async (req) => {
      const expiresAt = Date.now() + APPROVAL_TIMEOUT_MS;
      this.eventSink?.({
        type: 'APPROVAL_REQUESTED',
        approvalId: req.approvalId,
        action: req.action,
        description: req.description,
        riskLevel: req.riskLevel,
        expiresAt,
      });
      return await new Promise<ApprovalDecision>((resolve) => {
        const timer = setTimeout(() => {
          if (!this.pendingApprovals.has(req.approvalId)) return;
          this.pendingApprovals.delete(req.approvalId);
          this.eventSink?.({
            type: 'APPROVAL_RESOLVED',
            approvalId: req.approvalId,
            decision: 'decline',
            reason: 'timeout',
          });
          resolve('decline');
        }, APPROVAL_TIMEOUT_MS);
        this.pendingApprovals.set(req.approvalId, (decision, reason = 'user') => {
          clearTimeout(timer);
          this.eventSink?.({
            type: 'APPROVAL_RESOLVED',
            approvalId: req.approvalId,
            decision,
            reason,
          });
          resolve(decision);
        });
      });
    });
  }

  public async *send(input: AgentInput): AsyncIterable<AgentEvent> {
    this.abort = new AbortController();
    const queue: AgentEvent[] = [];
    const waiter: { fn: (() => void) | null } = { fn: null };
    let turnDone = false;

    const ping = () => {
      const fn = waiter.fn;
      if (fn) fn();
    };

    this.eventSink = (ev) => {
      queue.push(ev);
      ping();
    };

    const turnOpts: {
      threadId: string;
      message: string;
      signal: AbortSignal;
      model?: string;
      effort?: string;
      approvalPolicy?: string;
      collaborationMode?: string;
    } = {
      threadId: this.threadId,
      message: buildTurnMessage(input),
      signal: this.abort.signal,
    };
    if (input.turnOptions?.model) turnOpts.model = input.turnOptions.model;
    if (input.turnOptions?.effort) turnOpts.effort = input.turnOptions.effort;
    if (input.turnOptions?.approvalPolicy) {
      turnOpts.approvalPolicy = input.turnOptions.approvalPolicy;
    }
    if (input.turnOptions?.collaborationMode) {
      turnOpts.collaborationMode = input.turnOptions.collaborationMode;
    }

    const turnTask = (async () => {
      try {
        for await (const ev of this.connection.runTurn(turnOpts)) {
          queue.push(ev);
          ping();
        }
      } catch (rawError) {
        queue.push({
          type: 'ERROR',
          error: translateToBusinessError(rawError, 'CODEX_SESSION:send'),
        });
        ping();
      } finally {
        turnDone = true;
        ping();
      }
    })();

    try {
      while (!turnDone || queue.length > 0) {
        if (this.abort.signal.aborted) break;
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            waiter.fn = () => resolve();
            setTimeout(() => resolve(), 40);
          });
          waiter.fn = null;
          continue;
        }
        yield queue.shift()!;
      }
      await turnTask;
    } finally {
      this.eventSink = null;
      this.abort = null;
    }
  }

  public async submitToolResult(
    _callId: string,
    _result: unknown
  ): Promise<Result<void, BusinessError>> {
    return ok(undefined);
  }

  public async submitApproval(
    approvalId: string,
    decision: boolean | ApprovalDecision
  ): Promise<Result<void, BusinessError>> {
    const resolve = this.pendingApprovals.get(approvalId);
    if (!resolve) {
      return err(
        new BusinessError(
          'E_APPROVAL_NOT_FOUND',
          '找不到对应的审批请求，可能已超时或已处理。',
          'VALIDATION'
        )
      );
    }
    this.pendingApprovals.delete(approvalId);
    resolve(normalizeApprovalDecision(decision));
    return ok(undefined);
  }

  public async steer(message: string): Promise<Result<void, BusinessError>> {
    const text = message.trim();
    if (!text) {
      return err(
        new BusinessError('E_INVALID_INPUT', '引导消息不能为空。', 'VALIDATION')
      );
    }
    const turnId = this.activeTurnId ?? this.connection.getActiveTurnId();
    if (!turnId) {
      return err(
        new BusinessError(
          'E_NO_ACTIVE_TURN',
          '当前没有进行中的回复，无法注入引导。',
          'VALIDATION'
        )
      );
    }
    return this.connection.steer(this.threadId, turnId, text);
  }

  public async interrupt(): Promise<Result<void, BusinessError>> {
    this.abort?.abort();
    for (const [id, settle] of this.pendingApprovals) {
      this.pendingApprovals.delete(id);
      settle('cancel', 'interrupt');
    }
    if (this.activeTurnId) {
      return this.connection.interrupt(this.threadId, this.activeTurnId);
    }
    return ok(undefined);
  }

  public async close(): Promise<Result<void, BusinessError>> {
    this.abort?.abort();
    for (const [id, resolve] of this.pendingApprovals) {
      resolve('cancel');
      this.pendingApprovals.delete(id);
    }
    return ok(undefined);
  }
}

export class CodexAdapter implements AgentAdapter {
  public readonly id = 'codex-app-server';
  public readonly name = 'Codex App Server Adapter';

  private connection: CodexAppServerConnection | null = null;
  private readonly options: CodexAdapterOptions;
  private readonly threadBySession = new Map<
    string,
    { threadId: string; userId: string; toolNameMap?: Map<string, string> }
  >();

  constructor(options: CodexAdapterOptions = {}) {
    this.options = options;
  }

  public async createSession(
    options: CreateSessionOptions
  ): Promise<Result<AgentSession, BusinessError>> {
    try {
      const conn = await this.ensureConnection();
      if (!isOk(conn)) return conn;

      const bridge = options.tools?.length
        ? toolsToDynamicSpecs(options.tools as ToolDefinition[])
        : { specs: [], nameMap: new Map<string, string>() };

      let threadId: string;

      if (options.resumeThreadId) {
        const resumed = await conn.value.resumeThread(options.resumeThreadId);
        if (!isOk(resumed)) return resumed;
        threadId = options.resumeThreadId;
      } else {
        const threadParams: {
          dynamicTools: typeof bridge.specs;
          model?: string;
          approvalPolicy?: string;
          ephemeral?: boolean;
        } = {
          dynamicTools: bridge.specs,
        };
        if (options.model) threadParams.model = options.model;
        if (options.approvalPolicy) threadParams.approvalPolicy = options.approvalPolicy;
        if (typeof options.ephemeral === 'boolean') {
          threadParams.ephemeral = options.ephemeral;
        }

        const threadRes = await conn.value.startThread(threadParams);
        if (!isOk(threadRes)) return threadRes;
        threadId = threadRes.value.threadId;
      }

      this.threadBySession.set(options.sessionId, {
        threadId,
        userId: options.userId,
        toolNameMap: bridge.nameMap,
      });

      return ok(
        new CodexSession(
          options.sessionId,
          threadId,
          options.userId,
          conn.value,
          this.options.executeTool,
          bridge.nameMap
        )
      );
    } catch (raw) {
      return err(translateToBusinessError(raw, 'CODEX:createSession'));
    }
  }

  public async resumeSession(
    sessionId: string
  ): Promise<Result<AgentSession, BusinessError>> {
    try {
      const meta = this.threadBySession.get(sessionId);
      if (!meta) {
        return err(
          new BusinessError(
            'E_CODEX_SESSION',
            '找不到可恢复的 Codex thread，请重新开始对话。',
            'AGENT_RUNTIME'
          )
        );
      }
      const conn = await this.ensureConnection();
      if (!isOk(conn)) return conn;
      const resumed = await conn.value.resumeThread(meta.threadId);
      if (!isOk(resumed)) return resumed;
      return ok(
        new CodexSession(
          sessionId,
          meta.threadId,
          meta.userId,
          conn.value,
          this.options.executeTool,
          meta.toolNameMap
        )
      );
    } catch (raw) {
      return err(translateToBusinessError(raw, 'CODEX:resumeSession'));
    }
  }

  public async listModels(includeHidden = false): Promise<Result<CodexModelInfo[], BusinessError>> {
    const conn = await this.ensureConnection();
    if (!isOk(conn)) return conn;
    return conn.value.listModels({ includeHidden });
  }

  public async listThreads(params?: {
    limit?: number;
    cursor?: string;
    searchTerm?: string;
  }): Promise<
    Result<{ threads: CodexThreadSummary[]; nextCursor: string | null }, BusinessError>
  > {
    const conn = await this.ensureConnection();
    if (!isOk(conn)) return conn;
    return conn.value.listThreads(params);
  }

  public async listThreadItems(params: {
    threadId: string;
    limit?: number;
  }): Promise<Result<{ items: CodexThreadItemDto[]; nextCursor: string | null }, BusinessError>> {
    const conn = await this.ensureConnection();
    if (!isOk(conn)) return conn;
    return conn.value.listThreadItems(params);
  }

  public async setThreadName(
    threadId: string,
    name: string
  ): Promise<Result<void, BusinessError>> {
    const conn = await this.ensureConnection();
    if (!isOk(conn)) return conn;
    return conn.value.setThreadName(threadId, name);
  }

  public async archiveThread(threadId: string): Promise<Result<void, BusinessError>> {
    const conn = await this.ensureConnection();
    if (!isOk(conn)) return conn;
    return conn.value.archiveThread(threadId);
  }

  public async listCollaborationModes(): Promise<
    Result<CodexCollaborationModeDto[], BusinessError>
  > {
    const conn = await this.ensureConnection();
    if (!isOk(conn)) return conn;
    return conn.value.listCollaborationModes();
  }

  public async getAccountStatus(): Promise<Result<CodexAccountStatus, BusinessError>> {
    const conn = await this.ensureConnection();
    if (!isOk(conn)) {
      // connect 失败也尽量返回结构化状态
      const fallback = new CodexAppServerConnection(this.options.config);
      return fallback.readAccountStatus();
    }
    return conn.value.readAccountStatus();
  }

  public async shutdown(): Promise<Result<void, BusinessError>> {
    const c = this.connection;
    this.connection = null;
    this.threadBySession.clear();
    if (!c) return ok(undefined);
    return c.close();
  }

  private async ensureConnection(): Promise<
    Result<CodexAppServerConnection, BusinessError>
  > {
    if (this.connection) return ok(this.connection);
    const conn = new CodexAppServerConnection(this.options.config);
    const ready = await conn.connect();
    if (!isOk(ready)) return ready;
    this.connection = conn;
    return ok(conn);
  }
}

function buildTurnMessage(input: AgentInput): string {
  const parts: string[] = [];
  if (input.contextSnapshot) {
    const s = input.contextSnapshot;
    parts.push(
      `[StudyStudio Context]\n` +
        `- targetLanguage: ${s.targetLanguage}\n` +
        `- learnerLevel: ${s.learnerLevel}\n` +
        (s.focus?.surface ? `- focus: ${s.focus.surface}\n` : '') +
        (s.focus?.skillTag ? `- skill: ${s.focus.skillTag}\n` : '') +
        (s.learnerDigest?.topWeaknesses?.length
          ? `- weaknesses: ${s.learnerDigest.topWeaknesses
              .slice(0, 3)
              .map((w) => w.skillId)
              .join(', ')}\n`
          : '') +
        `- instruction: Prefer calling registered learning.* / quiz.* / ui.* tools when helpful. Reply in zh-CN coaching tone unless the learner writes in the target language.`
    );
  }
  parts.push(input.message || '');
  return parts.join('\n\n');
}

function failTool(message: string): DynamicToolCallResponse {
  return {
    contentItems: [{ type: 'inputText', text: JSON.stringify({ error: message }) }],
    success: false,
  };
}

export { sanitizeToolName };
