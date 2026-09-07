import { eq } from 'drizzle-orm';
import { localDictionaryEntries, dictionaryTermMeta } from '../../../infrastructure/db/index.js';
import type { RepoDeps } from '../../../infrastructure/persistence/repo-context.js';
import type { CardSourceEntry } from '@study-studio/learner-core';

/**
 * 生词卡 → CardSourceEntry（推送/导出共用）。
 * 有来源词条时取读音/释义/声调/词频，否则回退卡片自身前后端（不臆造）。
 */

export interface ResolvableCard {
  front: string;
  back: string;
  phonetic?: string | null | undefined;
  sourceEntryId?: string | null | undefined;
}

export interface ResolvedCardSource {
  source: CardSourceEntry;
  sourceLabel?: string | undefined;
}

/** pronunciation_json → 声调 label（结构不对返回 undefined，不抛）。 */
function pitchLabelOfPronunciation(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const pitch: unknown = (parsed as Record<string, unknown>)['pitch'];
    if (typeof pitch !== 'object' || pitch === null) return undefined;
    const label: unknown = (pitch as Record<string, unknown>)['label'];
    return typeof label === 'string' && label ? label : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveCardSourceEntry(
  deps: RepoDeps,
  card: ResolvableCard
): Promise<ResolvedCardSource> {
  let source: CardSourceEntry = { headword: card.front, meanings: [card.back] };
  let sourceLabel: string | undefined;
  if (!card.sourceEntryId) return { source };
  const entryRows = await deps.db
    .select()
    .from(localDictionaryEntries)
    .where(eq(localDictionaryEntries.id, card.sourceEntryId))
    .limit(1);
  const entry = entryRows[0];
  if (!entry) return { source };
  let meanings: string[] = [];
  try {
    const parsed: unknown = JSON.parse(entry.meaningsJson);
    if (Array.isArray(parsed)) {
      meanings = parsed.filter((m): m is string => typeof m === 'string');
    }
  } catch {
    meanings = [];
  }
  source = {
    headword: entry.headword,
    meanings: meanings.length > 0 ? meanings : [card.back],
  };
  const reading = entry.reading ?? entry.romanization ?? card.phonetic ?? undefined;
  if (reading) source.reading = reading;
  if (entry.partOfSpeech) source.partOfSpeech = entry.partOfSpeech;
  const pitchLabel = pitchLabelOfPronunciation(entry.pronunciationJson);
  if (pitchLabel) source.pitchLabel = pitchLabel;
  sourceLabel = entry.sourceLabel;
  try {
    const metaRows = await deps.db
      .select({ freqValue: dictionaryTermMeta.freqValue })
      .from(dictionaryTermMeta)
      .where(eq(dictionaryTermMeta.term, entry.headword))
      .limit(8);
    const freqs = metaRows
      .map((r) => r.freqValue)
      .filter((v): v is number => typeof v === 'number');
    if (freqs.length > 0) source.frequency = Math.min(...freqs);
  } catch {
    // 词频缺失不影响下游（频次徽标缺省隐藏）
  }
  return { source, sourceLabel };
}
