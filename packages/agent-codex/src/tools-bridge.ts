import type { ToolDefinition } from '@study-studio/tool-core';
import type { DynamicToolSpec } from './app-server-protocol.js';
import type { z } from 'zod';

/** 将 tool-core 定义转为 Codex dynamicTools（Responses function schema） */
export function toolsToDynamicSpecs(tools: ToolDefinition[]): DynamicToolSpec[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    name: sanitizeToolName(tool.name),
    description: tool.description.slice(0, 1024),
    inputSchema: zodToJsonSchema(tool.schema),
  }));
}

export function sanitizeToolName(name: string): string {
  // Responses API 工具名约束：字母数字下划线为主
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '').slice(0, 64) || 'tool';
}

export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return convertZod(schema);
}

function convertZod(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = (schema as any)._def;
  const typeName = def?.typeName as string | undefined;

  switch (typeName) {
    case 'ZodObject': {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const key of Object.keys(shape)) {
        const child = shape[key] as z.ZodTypeAny;
        properties[key] = convertZod(child);
        if (!isOptional(child)) required.push(key);
      }
      return {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      };
    }
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return { type: 'array', items: convertZod(def.type) };
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodLiteral':
      return { const: def.value };
    case 'ZodOptional':
    case 'ZodDefault':
      return convertZod(def.innerType);
    case 'ZodNullable':
      return { anyOf: [convertZod(def.innerType), { type: 'null' }] };
    case 'ZodUnion':
      return { anyOf: (def.options as z.ZodTypeAny[]).map(convertZod) };
    case 'ZodRecord':
      return { type: 'object', additionalProperties: true };
    default:
      return {};
  }
}

function isOptional(schema: z.ZodTypeAny): boolean {
  const typeName = (schema as any)._def?.typeName;
  return typeName === 'ZodOptional' || typeName === 'ZodDefault';
}
