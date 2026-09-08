import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Award, GraduationCap } from 'lucide-react';
import { fireSuccessConfetti } from './magicui/index.js';
import { sound } from '../utils/audio.js';
import { useLearningShell } from '../hooks/useLearningShell.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import {
  useLevelInfoQuery,
  type LevelInfo,
} from '../queries/useLearnerQueries.js';
import {
  useStartPlacementMutation,
  useFinishPlacementMutation,
  type PlacementLevel,
} from '../queries/useLearnerQueries.js';
import { PracticeRunWorkbench } from './practice/PracticeRunWorkbench.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { DEFAULT_USER_ID } from '../queries/query-keys.js';

const LEVEL_ORDER: PlacementLevel[] = ['NOVICE', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const LEVEL_LABELS: Record<PlacementLevel, string> = {
  NOVICE: '零基础 / 入门',
  BEGINNER: '初级',
  INTERMEDIATE: '中级',
  ADVANCED: '高级',
};

/** 升级撒花：档位query变高即放（自动升降级由网关在落盘后求值）。 */
function useLevelUpWatcher(level: LevelInfo['level'] | undefined) {
  const prev = useRef<PlacementLevel | null>(null);
  React.useEffect(() => {
    if (!level) return;
    if (prev.current && LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(prev.current)) {
      fireSuccessConfetti();
      toast.success(`升级了：${LEVEL_LABELS[prev.current]} → ${LEVEL_LABELS[level]}，继续稳住`);
    }
    prev.current = level;
  }, [level]);
}

/**
 * 档位卡（画像页顶部）：当前档 + 升级提示 + 定级考入口。
 * 定级考在本卡内完成：开考 → runner 答题 → 交卷写档，不过可重考。
 */
export function LevelCard() {
  const shell = useLearningShell();
  const profileUserId = useUserProfileStore((s) => s.profile.userId || DEFAULT_USER_ID);
  const { data: info } = useLevelInfoQuery(undefined, shell.track);
  useLevelUpWatcher(info?.level);
  const startExam = useStartPlacementMutation();
  const finishExam = useFinishPlacementMutation();
  const [exam, setExam] = useState<{ examId: string; runId: string; target: PlacementLevel } | null>(null);

  if (exam) {
    return (
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <GraduationCap className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-bold">定级考 · 目标{LEVEL_LABELS[exam.target]}（20 道，≥80% 过线）</h3>
          <span className="flex-1" />
          <Button
            size="sm"
            disabled={finishExam.isPending}
            onClick={() => {
              sound.playClick();
              finishExam.mutate(
                { examId: exam.examId },
                {
                  onSuccess: (r) => {
                    if (r.passed) {
                      fireSuccessConfetti();
                      sound.playCorrect();
                      toast.success(`考过了：已定为${LEVEL_LABELS[r.level]}（正确率 ${Math.round(r.accuracy * 100)}%）`);
                    } else {
                      sound.playMistake();
                      toast.error(`差一点：正确率 ${Math.round(r.accuracy * 100)}%，可重考`);
                    }
                    setExam(null);
                  },
                  onError: (e) => {
                    sound.playMistake();
                    toast.error(e instanceof Error ? e.message : '交卷失败');
                  },
                }
              );
            }}
          >
            {finishExam.isPending ? '判卷中…' : '交卷'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExam(null)}>
            稍后再考
          </Button>
        </div>
        <PracticeRunWorkbench
          runId={exam.runId}
          userId={profileUserId}
          language={shell.track}
          onExit={() => setExam(null)}
        />
      </section>
    );
  }

  const current = info?.level ?? 'NOVICE';
  const higher = LEVEL_ORDER.filter((l) => LEVEL_ORDER.indexOf(l) > LEVEL_ORDER.indexOf(current));

  return (
    <section className="rounded-2xl border border-amber-900/10 dark:border-amber-500/15 bg-[#faf9f6] dark:bg-[#1a1816] p-4 shadow-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-bold">当前档位</span>
        <Badge variant="amber">{LEVEL_LABELS[current]}</Badge>
        {info && <span className="text-[11px] text-stone-500 dark:text-stone-400">{info.hint}</span>}
        <span className="flex-1" />
        {higher.map((lv) => (
          <Button
            key={lv}
            size="sm"
            variant="outline"
            disabled={startExam.isPending}
            title={`考过即定为${LEVEL_LABELS[lv]}（字母+20 道题，可重考）`}
            onClick={() => {
              sound.playClick();
              startExam.mutate(
                { language: shell.track, targetLevel: lv },
                {
                  onSuccess: (r) => {
                    sound.playCorrect();
                    setExam({ examId: r.exam.id, runId: r.runId, target: lv });
                    toast.success(`定级考已开考：目标${LEVEL_LABELS[lv]}，答完点交卷`);
                  },
                  onError: (e) => {
                    sound.playMistake();
                    toast.error(e instanceof Error ? e.message : '开考失败');
                  },
                }
              );
            }}
          >
            {startExam.isPending ? '开考中…' : `考${LEVEL_LABELS[lv]}`}
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-stone-400">
        通过阶段测评后升级；日常失误不降级。收藏数量不计入晋级。
      </p>
    </section>
  );
}
