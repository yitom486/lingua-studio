import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Slider } from './ui/slider.js';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './ui/select.js';
import {
  User,
  Target,
  Sparkles,
  Flame,
  CheckCircle2,
  BookOpen,
  Sliders,
  Layers,
} from 'lucide-react';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import { sound } from '../utils/audio.js';
import type { StudyGoal, LearnerLevel } from '@study-studio/protocol';
import {
  LEARNER_LEVELS,
  STUDY_GOAL_OPTIONS,
  findStudyGoalOption,
} from '../data/learner-profile-options.js';

export function UserProfileModal() {
  const profile = useUserProfileStore((s) => s.profile);
  const isOpen = useUserProfileStore((s) => s.isProfileModalOpen);
  const setOpen = useUserProfileStore((s) => s.setProfileModalOpen);
  const updateProfile = useUserProfileStore((s) => s.updateProfile);

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [studyGoal, setStudyGoal] = useState<StudyGoal>(profile.studyGoal);
  const [learnerLevel, setLearnerLevel] = useState<LearnerLevel>(profile.learnerLevel);
  const [dailyGoalQuizzes, setDailyGoalQuizzes] = useState(profile.dailyGoalQuizzes);
  const [dailyGoalCards, setDailyGoalCards] = useState(profile.dailyGoalCards);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDisplayName(profile.displayName);
      setStudyGoal(profile.studyGoal);
      setLearnerLevel(profile.learnerLevel);
      setDailyGoalQuizzes(profile.dailyGoalQuizzes);
      setDailyGoalCards(profile.dailyGoalCards);
    }
  }, [isOpen, profile]);

  const handleSave = async () => {
    sound.playClick();
    setIsSaving(true);
    const selectedMeta = findStudyGoalOption(studyGoal);
    const targetLanguage = selectedMeta?.lang ?? profile.targetLanguage;

    await updateProfile({
      displayName: displayName.trim() || '学习者',
      studyGoal,
      learnerLevel,
      targetLanguage,
      dailyGoalQuizzes,
      dailyGoalCards,
    });

    setIsSaving(false);
    sound.playSuccess();
    setOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-stone-950 shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                学情画像与学习目标设定
                <Badge variant="amber" className="text-[10px] font-semibold">
                  动态驱动
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-stone-500 dark:text-stone-400">
                配置你的专属备考赛道与每日节奏，AI 导师将据此智能编排自适应题目与复习密度
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 1. 昵称设定 */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-500" />
              学员昵称
            </label>
            <div className="relative">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如：极光学者、冲刺N1小能手"
                maxLength={24}
                className="w-full h-10 px-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1f1d1a] text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all shadow-xs"
              />
            </div>
          </div>

          {/* 2. 目标选择 */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-amber-500" />
                攻坚目标与备考赛道
              </span>
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                {findStudyGoalOption(studyGoal)?.label}
              </span>
            </label>

            <Select
              value={studyGoal}
              onValueChange={(val) => {
                if (val) setStudyGoal(val as StudyGoal);
              }}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="选择你的备考目标..." />
              </SelectTrigger>
              <SelectContent>
                {STUDY_GOAL_OPTIONS.map((goal) => (
                  <SelectItem key={goal.id} value={goal.id}>
                    <div className="flex flex-col py-0.5 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs">{goal.label}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono uppercase">
                          {goal.lang}
                        </span>
                      </div>
                      <span className="text-[11px] text-stone-400 dark:text-stone-500">
                        {goal.desc}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 3. 语言掌握阶段 */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-500" />
              当前自评能力梯度
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LEARNER_LEVELS.map((lvl) => {
                const isSelected = learnerLevel === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      setLearnerLevel(lvl.id);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 shadow-xs'
                        : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1f1d1a] hover:border-stone-300 dark:hover:border-stone-700'
                    }`}
                  >
                    <div className="text-xs font-bold truncate">{lvl.label}</div>
                    <div className="text-[10px] text-stone-400 dark:text-stone-500 truncate mt-0.5">
                      {lvl.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. 每日打卡门槛配置 */}
          <div className="p-4 rounded-2xl border border-amber-900/10 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/15 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                  每日打卡要求与连胜门槛
                </span>
              </div>
              <Badge variant="amber" className="text-[10px]">
                双标达成即打卡
              </Badge>
            </div>

            {/* 客观题目数滑块 */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                  每日自适应测试做题数
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400 bg-white dark:bg-stone-900 px-2 py-0.5 rounded border border-amber-500/20 text-xs">
                  {dailyGoalQuizzes} 道
                </span>
              </div>
              <Slider
                value={[dailyGoalQuizzes]}
                min={1}
                max={20}
                step={1}
                onValueChange={(val) => {
                  const num = Array.isArray(val) ? val[0] : typeof val === 'number' ? val : undefined;
                  if (typeof num === 'number') {
                    setDailyGoalQuizzes(num);
                  }
                }}
              />
            </div>

            {/* 记忆卡片复习数滑块 */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-500" />
                  每日 FSRS 闪卡复习量
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400 bg-white dark:bg-stone-900 px-2 py-0.5 rounded border border-amber-500/20 text-xs">
                  {dailyGoalCards} 张
                </span>
              </div>
              <Slider
                value={[dailyGoalCards]}
                min={5}
                max={50}
                step={5}
                onValueChange={(val) => {
                  const num = Array.isArray(val) ? val[0] : typeof val === 'number' ? val : undefined;
                  if (typeof num === 'number') {
                    setDailyGoalCards(num);
                  }
                }}
              />
            </div>

            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
              💡 达成上述两个指标即可点亮今日连胜；若状态极佳完成度超过 150%，将激活金色
              <strong className="text-amber-600 dark:text-amber-400 mx-1">「超额连刷」</strong>
              高光足迹！
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              sound.playClick();
              setOpen(false);
            }}
          >
            取消
          </Button>
          <Button
            variant="amber"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            {isSaving ? '保存中...' : '保存学情配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
