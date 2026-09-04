import type { AgentEvent } from './event.js';
import type { AgentInput } from './context.js';
import type { Result, BusinessError } from '@study-studio/shared';

export interface AgentSession {
  readonly sessionId: string;

  /**
   * 启动对话轮次，返回标准事件流
   */
  send(input: AgentInput): AsyncIterable<AgentEvent>;

  /**
   * 提交工具执行结果
   */
  submitToolResult(
    callId: string,
    result: unknown
  ): Promise<Result<void, BusinessError>>;

  /**
   * 提交敏感操作审批决策
   */
  submitApproval(
    approvalId: string,
    approved: boolean
  ): Promise<Result<void, BusinessError>>;

  /**
   * 中断当前轮次
   */
  interrupt(): Promise<Result<void, BusinessError>>;

  /**
   * 关闭会话
   */
  close(): Promise<Result<void, BusinessError>>;
}
