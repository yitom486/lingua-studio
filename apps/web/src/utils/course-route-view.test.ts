import { describe, it, expect } from 'bun:test';
import { groupUnitsByStage, type RouteUnitLike } from './course-route-view.js';

function unit(id: string, stage: number, status: RouteUnitLike['status']): RouteUnitLike {
  return { unit: { id, stage, order: 0, title: id }, status, progress: '' };
}

describe('groupUnitsByStage（路线总览分组）', () => {
  it('按阶段升序分组并统计掌握数', () => {
    const groups = groupUnitsByStage([
      unit('b', 1, 'available'),
      unit('a', 0, 'mastered'),
      unit('c', 0, 'locked'),
    ]);
    expect(groups.map((g) => g.stage)).toEqual([0, 1]);
    expect(groups[0]?.total).toBe(2);
    expect(groups[0]?.mastered).toBe(1);
    expect(groups[0]?.units.map((u) => u.unit.id)).toEqual(['a', 'c']);
  });

  it('空输入返回空数组', () => {
    expect(groupUnitsByStage([])).toEqual([]);
  });
});
