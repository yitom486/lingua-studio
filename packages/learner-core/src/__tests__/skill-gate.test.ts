import { describe, it, expect } from 'bun:test';
import {
  filterQuestionsByLevel,
  isQuestionAllowedForLevel,
  isSkillAllowedForLevel,
  minLevelForSkill,
  NOVICE_SAFE_SKILL,
  parseLevelLabel,
  resolveGateLevel,
  tierCapForLevel,
} from '../skill-gate.js';

describe('skill-gate（组卷难度门）', () => {
  it('截图 case：NOVICE 不见 tara（N4），BEGINNER 可见', () => {
    expect(minLevelForSkill('jp.grammar.conditional_tara')).toBe('BEGINNER');
    expect(isQuestionAllowedForLevel('jp.grammar.conditional_tara', 3, 'NOVICE')).toBe(false);
    expect(isQuestionAllowedForLevel('jp.grammar.conditional_tara', 3, 'BEGINNER')).toBe(true);
  });

  it('使役/虚拟语气 INTERMEDIATE 起；N5 基础点 NOVICE 全放行', () => {
    expect(isSkillAllowedForLevel('jp.grammar.causative_active', 'BEGINNER')).toBe(false);
    expect(isSkillAllowedForLevel('jp.grammar.causative_active', 'INTERMEDIATE')).toBe(true);
    expect(isSkillAllowedForLevel('en.grammar.subjunctive', 'BEGINNER')).toBe(false);
    for (const s of [
      'jp.particle.ni_vs_de',
      'jp.particle.destination_ni',
      'jp.particle.ka',
      'jp.grammar.reason_kara',
      'ko.grammar.particle_eseo',
      'en.grammar.article',
    ]) {
      expect(isSkillAllowedForLevel(s, 'NOVICE')).toBe(true);
    }
  });

  it('难度闸：NOVICE tier 上限 2；未知技能只看 tier', () => {
    expect(tierCapForLevel('NOVICE')).toBe(2);
    expect(tierCapForLevel('ADVANCED')).toBe(5);
    // 未知技能 tier3 → NOVICE 拦、BEGINNER 放
    expect(isQuestionAllowedForLevel('xx.unknown.skill', 3, 'NOVICE')).toBe(false);
    expect(isQuestionAllowedForLevel('xx.unknown.skill', 3, 'BEGINNER')).toBe(true);
    // 生词/句子/假名家族跟档位走，不额外拦
    expect(isSkillAllowedForLevel('jp.vocab.review', 'NOVICE')).toBe(true);
    expect(isSkillAllowedForLevel('jp.sentence.review', 'NOVICE')).toBe(true);
  });

  it('已知技能无视低 tier 蒙混：tara 标 tier2 照样拦 NOVICE', () => {
    expect(isQuestionAllowedForLevel('jp.grammar.conditional_tara', 2, 'NOVICE')).toBe(false);
  });

  it('批量过滤保序', () => {
    const items = [
      { skillId: 'jp.particle.ni_vs_de', tier: 2 },
      { skillId: 'jp.grammar.conditional_tara', tier: 3 },
      { skillId: 'jp.grammar.causative_active', tier: 4 },
    ];
    const kept = filterQuestionsByLevel(items, 'NOVICE', (q) => ({
      skillId: q.skillId,
      tier: q.tier,
    }));
    expect(kept.length).toBe(1);
    expect(kept[0]?.skillId).toBe('jp.particle.ni_vs_de');
  });

  it('等级标签解析：CEFR/JLPT/中文', () => {
    expect(parseLevelLabel('CEFR B1')).toBe('INTERMEDIATE');
    expect(parseLevelLabel('JLPT N3')).toBe('INTERMEDIATE');
    expect(parseLevelLabel('N5')).toBe('NOVICE');
    expect(parseLevelLabel('初级')).toBe('BEGINNER');
    expect(parseLevelLabel('B1')).toBe('INTERMEDIATE');
    expect(parseLevelLabel('???')).toBeNull();
    expect(parseLevelLabel(undefined)).toBeNull();
  });

  it('档位解析：画像优先，拿不到按 NOVICE 从简', () => {
    expect(resolveGateLevel('BEGINNER', 'JLPT N3')).toBe('BEGINNER');
    expect(resolveGateLevel(null, 'JLPT N3')).toBe('INTERMEDIATE');
    expect(resolveGateLevel(undefined, '???')).toBe('NOVICE');
  });

  it('各轨道安全默认考点均有定义', () => {
    expect(NOVICE_SAFE_SKILL.ja).toBe('jp.particle.ni_vs_de');
    expect(NOVICE_SAFE_SKILL.ko).toContain('ko.');
    expect(NOVICE_SAFE_SKILL.en).toContain('en.');
  });
});
