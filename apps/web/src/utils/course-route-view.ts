/**
 * 路线总览纯展示逻辑（可单测，不碰 React/Query）。
 */
export interface RouteUnitLike {
  unit: { id: string; stage: number; order: number; title: string };
  status: 'locked' | 'available' | 'mastered';
  progress: string;
  needsReview?: boolean | undefined;
}

export interface RouteStageGroup<T extends RouteUnitLike = RouteUnitLike> {
  stage: number;
  total: number;
  mastered: number;
  units: T[];
}

/** 按阶段分组（保持单元原有顺序；空输入返回空数组；保留元素具体类型）。 */
export function groupUnitsByStage<T extends RouteUnitLike>(units: T[]): RouteStageGroup<T>[] {
  const map = new Map<number, T[]>();
  for (const u of units) {
    const list = map.get(u.unit.stage) ?? [];
    list.push(u);
    map.set(u.unit.stage, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stage, list]) => ({
      stage,
      total: list.length,
      mastered: list.filter((u) => u.status === 'mastered').length,
      units: list,
    }));
}
