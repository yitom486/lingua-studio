import { ok, err, type Result, BusinessError, generateId } from '@study-studio/shared';
import type { TargetLanguage } from '@study-studio/learner-core';
import type { AgentSession } from '@study-studio/agent-core';

export interface ActiveSession {
  id: string;
  userId: string;
  targetLanguage: TargetLanguage;
  targetLevel: string;
  agentSession?: AgentSession;
  createdAt: number;
  lastActiveAt: number;
}

export class SessionManager {
  private readonly sessions = new Map<string, ActiveSession>();

  public createSession(
    userId: string,
    targetLanguage: TargetLanguage,
    targetLevel: string
  ): Result<ActiveSession, BusinessError> {
    const id = generateId('sess');
    const now = Date.now();
    const session: ActiveSession = {
      id,
      userId,
      targetLanguage,
      targetLevel,
      createdAt: now,
      lastActiveAt: now,
    };
    this.sessions.set(id, session);
    return ok(session);
  }

  public getSession(sessionId: string): Result<ActiveSession, BusinessError> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(
        new BusinessError(
          'E_SESSION_NOT_FOUND',
          '未找到指定的学习会话，请重新初始化。',
          'VALIDATION',
          false
        )
      );
    }
    session.lastActiveAt = Date.now();
    return ok(session);
  }

  public attachAgentSession(sessionId: string, agentSession: AgentSession): Result<void, BusinessError> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new BusinessError('E_SESSION_NOT_FOUND', '会话不存在', 'VALIDATION'));
    }
    session.agentSession = agentSession;
    return ok(undefined);
  }

  public closeSession(sessionId: string): Result<void, BusinessError> {
    const session = this.sessions.get(sessionId);
    if (session?.agentSession) {
      session.agentSession.close();
    }
    this.sessions.delete(sessionId);
    return ok(undefined);
  }
}
