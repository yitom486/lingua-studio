/**
 * 划选查词纯逻辑（无 DOM，可单测）。
 * 选中文本是瞬时 UI 状态；查词本身走既有领域命令（useDictionaryLookupQuery），不新增业务规则。
 */

/** 容器声明查词语种的属性名（值 ja/en/ko，大小写不限）。 */
export const LOOKUP_SCOPE_ATTR = 'data-lookup-scope';

/** 阅读工具栏自有划选行为的容器：全局浮层不抢（各管各的选择）。 */
export const MANUAL_LOOKUP_ATTR = 'data-manual-lookup';

/** 浮层自身的标记（选中浮层内文本不触发新一轮）。 */
export const LOOKUP_POPUP_ATTR = 'data-lookup-popup';

export type LookupLanguage = 'ja' | 'en' | 'ko';

/** 选中上限（词向查词；长句请用精读/翻译链路，不在此展开）。 */
export const MAX_LOOKUP_SELECTION = 32;

/** 选中文本归一化（压空白、截断；空返回 null，调用方直接忽略）。 */
export function normalizeSelectionText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_LOOKUP_SELECTION).trim();
  return collapsed ? collapsed : null;
}

/** scope 属性值 → 查词语种（猜不出返回 null，不猜）。 */
export function normalizeLookupLanguage(raw: string | null | undefined): LookupLanguage | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'ja' || v === 'en' || v === 'ko') return v;
  return null;
}
