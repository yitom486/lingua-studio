import type { AgentEvent } from '@study-studio/agent-core';
import { translateToBusinessError } from '@study-studio/shared';

/**
 * 将 Codex App Server v2 通知映射为内部 AgentEvent。
 * 参考：item/agentMessage/delta、item/reasoning/*、item/started|completed、turn/completed
 */
export function mapAppServerNotificationToEvents(
  method: string,
  params: any
): AgentEvent[] {
  const events: AgentEvent[] = [];

  switch (method) {
    case 'item/agentMessage/delta': {
      const delta = String(params?.delta ?? params?.text ?? '');
      if (delta) events.push({ type: 'TEXT_DELTA', delta });
      break;
    }
    case 'item/reasoning/summaryTextDelta':
    case 'item/reasoning/textDelta': {
      const delta = String(params?.delta ?? params?.text ?? '');
      if (delta) {
        events.push({ type: 'REASONING_DELTA', delta });
      }
      break;
    }
    case 'item/started': {
      const item = params?.item;
      if (item?.type === 'reasoning') {
        events.push({ type: 'REASONING_STARTED' });
      }
      if (item?.type === 'dynamicToolCall') {
        events.push({
          type: 'TOOL_CALL_REQUESTED',
          callId: String(item.id || params?.itemId || ''),
          toolName: String(item.tool || item.name || 'tool'),
          input: normalizeArgs(item.arguments),
        });
      }
      break;
    }
    case 'item/completed': {
      const item = params?.item;
      if (item?.type === 'reasoning') {
        events.push({ type: 'REASONING_COMPLETED' });
      }
      if (item?.type === 'agentMessage' && item.text) {
        // 部分模型只在 completed 给全文；若已有 delta 则可能重复，由会话层去重
        events.push({ type: 'TEXT_DELTA', delta: '' }); // no-op marker
        events.push({
          type: 'COMPLETED',
          finalOutput: String(item.text),
        });
      }
      if (item?.type === 'dynamicToolCall') {
        events.push({
          type: 'TOOL_CALL_COMPLETED',
          callId: String(item.id || ''),
          result: {
            status: item.status,
            success: item.success,
            contentItems: item.contentItems,
          },
        });
      }
      break;
    }
    case 'turn/completed': {
      events.push({ type: 'COMPLETED' });
      break;
    }
    case 'error': {
      events.push({
        type: 'ERROR',
        error: translateToBusinessError(params?.error ?? params, 'CODEX_NOTIFY'),
      });
      break;
    }
    default:
      break;
  }

  return events.filter((e) => !(e.type === 'TEXT_DELTA' && !e.delta));
}

function normalizeArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return { raw };
    }
  }
  return {};
}

/** 兼容旧 RawCodexItem 映射（单测保留） */
export { mapCodexItemToAgentEvent } from './mapper.js';
