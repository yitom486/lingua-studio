import type {
  AgentAdapter,
  AgentSession,
  CreateSessionOptions,
  AgentInput,
  AgentEvent,
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

/**
 * 真实 Codex App Server 适配器（stdio JSON-RPC）。
 * 无 CLI / 未登录时 createSession 失败，由 Gateway 回落本地旁路。
 * 认证：复用本机 CODEX_HOME / ~/.codex（与 VS Code Codex 插件同源）。
 */
export class CodexSession implements AgentSession {
  private activeTurnId: string | null = null;
  private abort: AbortController | null = null;

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
  }

  public async *send(input: AgentInput): AsyncIterable<AgentEvent> {
    this.abort = new AbortController();
    try {
      const message = buildTurnMessage(input);
      const turnOpts: {
        threadId: string;
        message: string;
        signal: AbortSignal;
        model?: string;
        effort?: string;
        approvalPolicy?: string;
      } = {
        threadId: this.threadId,
        message,
        signal: this.abort.signal,
      };
      if (input.turnOptions?.model) turnOpts.model = input.turnOptions.model;
      if (input.turnOptions?.effort) turnOpts.effort = input.turnOptions.effort;
      if (input.turnOptions?.approvalPolicy) {
        turnOpts.approvalPolicy = input.turnOptions.approvalPolicy;
      }
      for await (const ev of this.connection.runTurn(turnOpts)) {
        yield ev;
      }
    } catch (rawError) {
      yield {
        type: 'ERROR',
        error: translateToBusinessError(rawError, 'CODEX_SESSION:send'),
      };
    } finally {
      this.abort = null;
    }
  }

  public async submitToolResult(
    _callId: string,
    _result: unknown
  ): Promise<Result<void, BusinessError>> {
    // App Server 的 dynamic tool 走 server-request 同步响应，已在 handler 内完成
    return ok(undefined);
  }

  public async submitApproval(
    _approvalId: string,
    _approved: boolean
  ): Promise<Result<void, BusinessError>> {
    return ok(undefined);
  }

  public async interrupt(): Promise<Result<void, BusinessError>> {
    this.abort?.abort();
    if (this.activeTurnId) {
      return this.connection.interrupt(this.threadId, this.activeTurnId);
    }
    return ok(undefined);
  }

  public async close(): Promise<Result<void, BusinessError>> {
    this.abort?.abort();
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

      const threadParams: {
        dynamicTools: typeof bridge.specs;
        model?: string;
      } = {
        dynamicTools: bridge.specs,
      };
      if (options.model) threadParams.model = options.model;

      const threadRes = await conn.value.startThread(threadParams);
      if (!isOk(threadRes)) return threadRes;

      this.threadBySession.set(options.sessionId, {
        threadId: threadRes.value.threadId,
        userId: options.userId,
        toolNameMap: bridge.nameMap,
      });

      return ok(
        new CodexSession(
          options.sessionId,
          threadRes.value.threadId,
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
