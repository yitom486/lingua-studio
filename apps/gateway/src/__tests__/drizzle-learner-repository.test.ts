import { describe, it, expect, beforeEach } from 'bun:test';
import { isOk, isErr } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../repository/drizzle-learner-repository.js';

describe('DrizzleLearnerRepository', () => {
  let repo: DrizzleLearnerRepository;
  const testUserId = 'test_user_streak_01';

  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  it('should auto-create a default learner profile if non-existent', async () => {
    const res = await repo.getLearnerProfile(testUserId);
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;

    expect(res.value.userId).toBe(testUserId);
    expect(res.value.targetLanguage).toBe('ja');
    expect(res.value.studyGoal).toBe('JLPT_N2');
    expect(res.value.learnerLevel).toBe('BEGINNER');
    expect(res.value.streakDays).toBe(0);
    expect(res.value.dailyGoalQuizzes).toBe(5);
    expect(res.value.dailyGoalCards).toBe(10);
  });

  it('should update learner profile fields cleanly', async () => {
    const updateRes = await repo.updateLearnerProfile(testUserId, {
      displayName: '樱木花道',
      studyGoal: 'JLPT_N1',
      learnerLevel: 'INTERMEDIATE',
      dailyGoalQuizzes: 8,
      dailyGoalCards: 15,
    });

    expect(isOk(updateRes)).toBe(true);
    if (!isOk(updateRes)) return;

    expect(updateRes.value.displayName).toBe('樱木花道');
    expect(updateRes.value.studyGoal).toBe('JLPT_N1');
    expect(updateRes.value.learnerLevel).toBe('INTERMEDIATE');
    expect(updateRes.value.dailyGoalQuizzes).toBe(8);
    expect(updateRes.value.dailyGoalCards).toBe(15);
  });

  it('should accurately compute daily task progress and streak upon goal completion', async () => {
    // 初始目标：quizzes 5, cards 10
    const initialProgress = await repo.getDailyTaskProgress(testUserId, '2026-09-04');
    expect(isOk(initialProgress)).toBe(true);
    if (!isOk(initialProgress)) return;
    expect(initialProgress.value.isGoalCompleted).toBe(false);
    expect(initialProgress.value.streakDays).toBe(0);

    // 1. 完成部分任务 (3 道题，5 张卡)
    const step1 = await repo.recordDailyActivity(testUserId, {
      quizzes: 3,
      cards: 5,
      date: '2026-09-04',
    });
    expect(isOk(step1)).toBe(true);
    if (!isOk(step1)) return;
    expect(step1.value.quizzesCount).toBe(3);
    expect(step1.value.cardsReviewedCount).toBe(5);
    expect(step1.value.isGoalCompleted).toBe(false);
    expect(step1.value.streakDays).toBe(0);

    // 2. 达成每日目标门槛 (再做 2 道题，5 张卡 -> 总计 5 题，10 卡)
    const step2 = await repo.recordDailyActivity(testUserId, {
      quizzes: 2,
      cards: 5,
      date: '2026-09-04',
    });
    expect(isOk(step2)).toBe(true);
    if (!isOk(step2)) return;
    expect(step2.value.quizzesCount).toBe(5);
    expect(step2.value.cardsReviewedCount).toBe(10);
    expect(step2.value.isGoalCompleted).toBe(true);
    expect(step2.value.streakDays).toBe(1);
    expect(step2.value.completedAt).not.toBeNull();

    // 3. 用户感觉良好，开启超额连刷 (Overtime Burst)
    const step3 = await repo.recordDailyActivity(testUserId, {
      quizzes: 6, // 达到 11 题 (超过 5 题的两倍)
      cards: 10, // 达到 20 张卡
      date: '2026-09-04',
    });
    expect(isOk(step3)).toBe(true);
    if (!isOk(step3)) return;
    expect(step3.value.isGoalCompleted).toBe(true);
    expect(step3.value.isOvertimeBurst).toBe(true);
    expect(step3.value.intensityLevel).toBe(4);
    // 当日连胜天数保持 1，不重复+1
    expect(step3.value.streakDays).toBe(1);
  });

  it('should increase streak consecutively across days', async () => {
    // Day 1: 2026-09-03 达成目标
    await repo.recordDailyActivity(testUserId, {
      quizzes: 5,
      cards: 10,
      date: '2026-09-03',
    });

    const day1Profile = await repo.getLearnerProfile(testUserId);
    if (isOk(day1Profile)) {
      expect(day1Profile.value.streakDays).toBe(1);
    }

    // Day 2: 2026-09-04 连续第二天达成目标
    const day2 = await repo.recordDailyActivity(testUserId, {
      quizzes: 5,
      cards: 10,
      date: '2026-09-04',
    });
    expect(isOk(day2)).toBe(true);
    if (!isOk(day2)) return;
    expect(day2.value.streakDays).toBe(2);

    const day2Profile = await repo.getLearnerProfile(testUserId);
    if (isOk(day2Profile)) {
      expect(day2Profile.value.streakDays).toBe(2);
      expect(day2Profile.value.maxStreakDays).toBe(2);
    }
  });

  it('should reset streak if gap days exist', async () => {
    // Day 1: 2026-09-01 达成目标 (streak = 1)
    await repo.recordDailyActivity(testUserId, {
      quizzes: 5,
      cards: 10,
      date: '2026-09-01',
    });

    // Day 2 (2026-09-02) 缺席
    // Day 3 (2026-09-04) 再次达成目标 -> 连胜重新从 1 开始计算
    const day3 = await repo.recordDailyActivity(testUserId, {
      quizzes: 5,
      cards: 10,
      date: '2026-09-04',
    });
    expect(isOk(day3)).toBe(true);
    if (!isOk(day3)) return;
    expect(day3.value.streakDays).toBe(1);
  });

  it('should return fused profile snapshot with skills and daily task progress', async () => {
    await repo.recordDailyActivity(testUserId, {
      quizzes: 5,
      cards: 10,
    });

    const snapshotRes = await repo.getProfileSnapshot(testUserId);
    expect(isOk(snapshotRes)).toBe(true);
    if (!isOk(snapshotRes)) return;

    expect(snapshotRes.value.profile).toBeDefined();
    expect(snapshotRes.value.dailyTask).toBeDefined();
    expect(snapshotRes.value.dailyTask?.isGoalCompleted).toBe(true);
  });
});
