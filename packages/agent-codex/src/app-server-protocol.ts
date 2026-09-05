/**
 * Codex App Server 最小协议类型（对照官方 generate-ts / learn.chatgpt.com/docs/app-server）。
 * 完整生成物可放在 packages/agent-codex/protocol-gen（不进 tsc）。
 */

export interface DynamicToolFunctionSpec {
  type: 'function';
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  deferLoading?: boolean;
}

export type DynamicToolSpec = DynamicToolFunctionSpec;

export interface ThreadStartParams {
  model?: string | null;
  cwd?: string | null;
  approvalPolicy?: 'untrusted' | 'onFailure' | 'onRequest' | 'never' | string;
  sandbox?: 'readOnly' | 'workspaceWrite' | 'dangerFullAccess' | string;
  dynamicTools?: DynamicToolSpec[] | null;
  ephemeral?: boolean | null;
}

export interface ThreadStartResponse {
  thread: { id: string };
  model?: string;
}

export interface TurnStartParams {
  threadId: string;
  input: Array<{ type: 'text'; text: string } | Record<string, unknown>>;
}

export interface TurnStartResponse {
  turn: { id: string; status?: string };
}

export interface TurnInterruptParams {
  threadId: string;
  turnId: string;
}

export interface DynamicToolCallParams {
  threadId: string;
  turnId: string;
  itemId: string;
  tool: string;
  arguments: unknown;
  namespace?: string | null;
}

export interface DynamicToolCallResponse {
  contentItems: Array<{ type: 'inputText'; text: string }>;
  success: boolean;
}

export interface CodexAppServerConfig {
  /** 可执行文件，默认从 PATH / CODEX_BIN 解析 */
  command?: string;
  args?: string[];
  cwd?: string;
  model?: string;
  /** 学习教练默认只读沙箱，减少 shell 审批 */
  sandbox?: ThreadStartParams['sandbox'];
  approvalPolicy?: ThreadStartParams['approvalPolicy'];
  /** 为 false 时 createSession 直接失败，Gateway 可回落本地旁路 */
  enabled?: boolean;
}

export function resolveCodexBinary(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.CODEX_BIN?.trim()) return process.env.CODEX_BIN.trim();
  if (process.env.CODEX_PATH?.trim()) return process.env.CODEX_PATH.trim();
  return 'codex';
}

export function loadCodexConfigFromEnv(): CodexAppServerConfig {
  const enabledRaw = (process.env.STUDY_STUDIO_CODEX ?? '1').trim().toLowerCase();
  const config: CodexAppServerConfig = {
    command: resolveCodexBinary(),
    args: ['app-server', '--listen', 'stdio://'],
    cwd: process.env.STUDY_STUDIO_CODEX_CWD || process.cwd(),
    sandbox: (process.env.STUDY_STUDIO_CODEX_SANDBOX as ThreadStartParams['sandbox']) || 'readOnly',
    approvalPolicy:
      (process.env.STUDY_STUDIO_CODEX_APPROVAL as ThreadStartParams['approvalPolicy']) || 'never',
    enabled: !(enabledRaw === '0' || enabledRaw === 'false' || enabledRaw === 'off'),
  };
  const model = process.env.STUDY_STUDIO_CODEX_MODEL?.trim();
  if (model) config.model = model;
  return config;
}
