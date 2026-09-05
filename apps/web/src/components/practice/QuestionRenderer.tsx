import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button.js';
import type { GeneratedQuestion } from '@study-studio/protocol';

/** 单题渲染器：按题型呈现，客观题即时判定由父组件处理，主观题只暂存草稿。 */

interface RendererProps {
  question: GeneratedQuestion;
  userAnswer: string;
  onAnswerChange: (v: string) => void;
  onSubmitObjective: (answer: string) => void;
  onSaveDraft: (answer: string) => void;
  disabled: boolean;
  busy: boolean;
}

export function QuestionRenderer({
  question: q,
  userAnswer,
  onAnswerChange,
  onSubmitObjective,
  onSaveDraft,
  disabled,
  busy,
}: RendererProps) {
  const [answer, setAnswer] = useState(userAnswer);
  useEffect(() => setAnswer(userAnswer), [userAnswer]);

  const update = (v: string) => {
    setAnswer(v);
    onAnswerChange(v);
  };

  if (q.type === 'MULTIPLE_CHOICE' && q.options) {
    return (
      <div className="flex flex-col gap-2">
        {q.options.map((opt, i) => {
          const key = String.fromCharCode(65 + i);
          const selected = answer === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => update(key)}
              disabled={disabled}
              className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                selected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700'
              }`}
            >
              <span className="mr-2 font-semibold">{key}.</span>
              {opt}
            </button>
          );
        })}
        <Button size="sm" className="mt-1 w-fit" disabled={!answer || disabled || busy} onClick={() => onSubmitObjective(answer)}>
          提交
        </Button>
      </div>
    );
  }

  if (q.type === 'FILL_IN_BLANK') {
    return (
      <div className="flex flex-col gap-2">
        <input
          value={answer}
          onChange={(e) => update(e.target.value)}
          disabled={disabled}
          placeholder="填入答案"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
        />
        <Button size="sm" className="w-fit" disabled={!answer.trim() || disabled || busy} onClick={() => onSubmitObjective(answer)}>
          提交
        </Button>
      </div>
    );
  }

  if (q.type === 'SENTENCE_REORDER') {
    const chunks = q.content.split(/\s+/).filter(Boolean);
    const [picked, setPicked] = useState<string[]>([]);
    const toggle = (c: string) => {
      const next = picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c];
      setPicked(next);
      update(next.join(' '));
    };
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {chunks.map((c, i) => (
            <button
              key={`${c}-${i}`}
              type="button"
              onClick={() => toggle(c)}
              disabled={disabled}
              className={`rounded-md border px-2 py-1 text-sm ${
                picked.includes(c) ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300">当前顺序：{answer || '（点击上方词块排序）'}</div>
        <Button size="sm" className="w-fit" disabled={!answer.trim() || disabled || busy} onClick={() => onSubmitObjective(answer)}>
          提交
        </Button>
      </div>
    );
  }

  // TRANSLATION / LISTENING_DICTATION / WRITING：主观题，草稿暂存
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={answer}
        onChange={(e) => update(e.target.value)}
        disabled={disabled}
        onBlur={() => answer.trim() && onSaveDraft(answer)}
        placeholder={q.type === 'TRANSLATION' ? '输入译文' : '输入听写/写作内容'}
        rows={4}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
      />
      <div className="text-xs text-slate-500">主观题在“批量提交主观题”时统一评测；输入失焦自动保存草稿。</div>
    </div>
  );
}
