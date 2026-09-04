import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { PenLine, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { sound } from '../utils/audio.js';
import { SubjectiveWritingWorkbench } from './SubjectiveWritingWorkbench.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';
import type { QuizGradingResult } from '@study-studio/protocol';

interface WritingStudioWorkbenchProps {
  onGradeSubjective: (data: {
    questionId: string;
    prompt: string;
    standardAnswer: string;
    userSubmission: string;
    testedSkillId: string;
  }) => Promise<QuizGradingResult>;
}

/**
 * 写作工作室外壳：难度 / 体裁偏好 + 复用主观批改工作台。
 * 后续接 learning.content generate_writing_prompt。
 */
export function WritingStudioWorkbench({ onGradeSubjective }: WritingStudioWorkbenchProps) {
  const [genre, setGenre] = useState('translation');
  const [difficulty, setDifficulty] = useState('3');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4 max-w-3xl w-full"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-amber-900/10 dark:border-amber-500/15 bg-[#faf9f6] dark:bg-[#1a1816] shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-300 flex items-center justify-center">
            <PenLine className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold font-serif text-stone-900 dark:text-stone-100">
                写作与翻译工作室
              </h2>
              <Badge variant="amber" className="text-[10px]">
                流式批改就绪
              </Badge>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              可调体裁与难度 · 提交后多维诊断 · 后续支持读后续写
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={genre} onValueChange={(v) => v && setGenre(v)}>
            <SelectTrigger className="w-[8.5rem]">
              <SelectValue placeholder="体裁" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="translation">中译日/英</SelectItem>
              <SelectItem value="email">邮件</SelectItem>
              <SelectItem value="essay">短议论文</SelectItem>
              <SelectItem value="diary">日记</SelectItem>
              <SelectItem value="news_response">读后续写</SelectItem>
            </SelectContent>
          </Select>
          <Select value={difficulty} onValueChange={(v) => v && setDifficulty(v)}>
            <SelectTrigger className="w-[7rem]">
              <SelectValue placeholder="难度" />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((d) => (
                <SelectItem key={d} value={String(d)}>
                  难度 {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              sound.playClick();
              toast.info(
                `演示：将按「${genre} · 难度 ${difficulty}」生成新题干（待接 learning.content）`
              );
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            生成题干
          </Button>
        </div>
      </div>

      <SubjectiveWritingWorkbench onGradeSubjective={onGradeSubjective} />
    </motion.div>
  );
}
