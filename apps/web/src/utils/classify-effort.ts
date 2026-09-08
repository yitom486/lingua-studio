/**
 * 分类任务 effort 选择（纯函数，可单测）。
 * mini 分流要“思考等级为低”：从模型声明的支持列表里取最低档；
 * 列表未知/为空时沿用模型缺省，不硬塞（防模型拒收未知 effort）。
 */
const EFFORT_RANK = ['minimal', 'low', 'medium', 'high', 'max'];

export function pickClassifyEffort(
  supported: string[] | undefined,
  modelDefault: string | undefined
): string | undefined {
  const list = (supported ?? []).filter((e) => typeof e === 'string' && e);
  for (const rank of EFFORT_RANK) {
    if (list.includes(rank)) return rank;
  }
  if (typeof modelDefault === 'string' && modelDefault) return modelDefault;
  return undefined;
}
