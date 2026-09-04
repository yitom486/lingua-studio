import type { AgentSession } from './session.js';
import type { ToolDefinition } from '@study-studio/tool-core';
import type { Result, BusinessError } from '@study-studio/shared';

export interface CreateSessionOptions {
  sessionId: string;
  userId: string;
  systemPrompt?: string;
  tools?: ToolDefinition[];
}

export interface AgentAdapter {
  readonly id: string;
  readonly name: string;

  createSession(
    options: CreateSessionOptions
  ): Promise<Result<AgentSession, BusinessError>>;

  resumeSession(
    sessionId: string
  ): Promise<Result<AgentSession, BusinessError>>;
}
