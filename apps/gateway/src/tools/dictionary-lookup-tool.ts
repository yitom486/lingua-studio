import { z } from 'zod';
import {
  type ToolDefinition,
  type ToolExecutionContext,
  ToolPermissions,
  ToolLocations,
} from '@study-studio/tool-core';
import { ok, type Result, BusinessError, isOk } from '@study-studio/shared';
import {
  DrizzleLearnerRepository,
  type LocalDictionaryEntry,
  type TrackLanguage,
} from '../repository/drizzle-learner-repository.js';
import { buildOjadSearchUrl } from '../services/dictionary-external-links.js';

export const DictionaryLookupInputSchema = z.object({
  language: z.enum(['ja', 'en', 'ko']),
  query: z.string().trim().min(1).max(64),
});

export type DictionaryLookupInput = z.infer<typeof DictionaryLookupInputSchema>;

export interface DictionaryExternalLookup {
  provider: 'OJAD';
  url: string;
  opensExternally: true;
}

export interface DictionaryLookupOutput {
  entries: LocalDictionaryEntry[];
  externalLookup?: DictionaryExternalLookup | undefined;
}

/**
 * 本地可再分发词典的统一读取入口。
 *
 * OJAD 仅作为日语未命中时的用户主动外部检索深链：不请求、不爬取、不缓存其页面内容。
 */
export class DictionaryLookupTool
  implements ToolDefinition<DictionaryLookupInput, DictionaryLookupOutput>
{
  public readonly name = 'dictionary.lookup';
  public readonly description =
    '查询本地词典资产。日语未命中时仅返回可由用户主动打开的 OJAD 检索深链；绝不抓取 OJAD。';
  public readonly location = ToolLocations.SERVER;
  public readonly permission = ToolPermissions.READ;
  public readonly schema = DictionaryLookupInputSchema;

  constructor(private readonly learnerRepo: DrizzleLearnerRepository) {}

  public async execute(
    input: DictionaryLookupInput,
    _context: ToolExecutionContext
  ): Promise<Result<DictionaryLookupOutput, BusinessError>> {
    const result = await this.learnerRepo.searchLocalDictionary(
      input.language as TrackLanguage,
      input.query
    );
    if (!isOk(result)) return result;

    const externalUrl =
      result.value.length === 0 && input.language === 'ja'
        ? buildOjadSearchUrl(input.query)
        : undefined;

    return ok({
      entries: result.value,
      ...(externalUrl
        ? {
            externalLookup: {
              provider: 'OJAD' as const,
              url: externalUrl,
              opensExternally: true as const,
            },
          }
        : {}),
    });
  }
}
