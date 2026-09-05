import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog.js';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../ui/select.js';
import { Slider } from '../ui/slider.js';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { useSavePracticeTemplateMutation } from '../../queries/useLearnerQueries.js';
import type { PracticePlanTemplate, PracticeBlockSpec, PracticeBlockKind, GradingMode } from '@study-studio/protocol';
import { generateId } from '@study-studio/shared';

/** P5：练习计划编辑器。配置有序练习块（1–8），预览题量/AI 批改次数/时长，保存为模板。 */

interface PracticePlanEditorProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  language: 'en' | 'ja' | 'ko';
  /** 编辑已有模板；不传则为新建 */
  template?: PracticePlanTemplate | null;
  /** P5-PhaseD：AI 建议草案预填（无 template 时生效） */
  proposal?: { suggestedName: string; blocks: PracticeBlockSpec[] } | null;
}

const BLOCK_KINDS: PracticeBlockKind[] = [
  'VOCAB_REVIEW',
  'VOCAB_NEW',
  'QUIZ',
  'TRANSLATION',
  'DICTATION',
  'READING',
  'WRITING',
];
const GRADING_MODES: GradingMode[] = ['AUTO_IMMEDIATE', 'AI_IMMEDIATE', 'AI_BATCH'];
const VOCAB_KINDS = new Set<PracticeBlockKind>(['VOCAB_REVIEW', 'VOCAB_NEW']);

function defaultBlock(kind: PracticeBlockKind, language: string): PracticeBlockSpec {
  const isObjective = kind === 'VOCAB_REVIEW' || kind === 'VOCAB_NEW' || kind === 'QUIZ';
  const grading: GradingMode = isObjective ? 'AUTO_IMMEDIATE' : 'AI_BATCH';
  const block: PracticeBlockSpec = { id: generateId('blk'), kind, count: 5, gradingMode: grading };
  if (kind === 'TRANSLATION') block.translationDirection = { sourceLanguage: 'zh', targetLanguage: language };
  if (VOCAB_KINDS.has(kind)) block.vocabularySource = 'DUE_CARDS';
  return block;
}

export function PracticePlanEditor({ isOpen, onClose, userId, language, template, proposal }: PracticePlanEditorProps) {
  const saveMutation = useSavePracticeTemplateMutation(userId);
  const [name, setName] = useState(template?.name ?? proposal?.suggestedName ?? '');
  const [blocks, setBlocks] = useState<PracticeBlockSpec[]>(template?.blocks ?? proposal?.blocks ?? []);
  const [enabled, setEnabled] = useState(template?.enabled ?? true);

  React.useEffect(() => {
    setName(template?.name ?? proposal?.suggestedName ?? '');
    setBlocks(template?.blocks ?? proposal?.blocks ?? []);
    setEnabled(template?.enabled ?? true);
  }, [template, proposal, isOpen]);

  const updateBlock = (id: string, patch: Partial<PracticeBlockSpec>) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const addBlock = (kind: PracticeBlockKind) => {
    if (blocks.length >= 8) {
      toast.info('一个模板最多 8 个练习块');
      return;
    }
    setBlocks((prev) => [...prev, defaultBlock(kind, language)]);
  };
  const removeBlock = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));
  const move = (id: string, dir: -1 | 1) =>
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });

  const preview = useMemo(() => {
    let total = 0;
    let ai = 0;
    let minutes = 0;
    for (const b of blocks) {
      total += b.count;
      if (b.gradingMode !== 'AUTO_IMMEDIATE') ai += b.count;
      const per = b.kind === 'TRANSLATION' || b.kind === 'WRITING' ? 2 : b.kind === 'READING' ? 1.5 : 0.5;
      minutes += b.count * per;
    }
    return { total, ai, minutes: Math.max(1, Math.round(minutes)) };
  }, [blocks]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('请填写模板名称');
      return;
    }
    if (blocks.length === 0) {
      toast.error('至少需要一个练习块');
      return;
    }
    const now = new Date().toISOString();
    const tpl: PracticePlanTemplate = {
      id: template?.id ?? generateId('tpl'),
      userId,
      language,
      name: name.trim(),
      enabled,
      revision: template?.revision ?? 0,
      blocks,
      createdAt: template?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      const saved = await saveMutation.mutateAsync(tpl);
      toast.success(`模板已保存（revision ${saved.revision}）`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? '编辑练习计划' : '新建练习计划'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：考研英语晚间 35 分钟"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              启用
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {BLOCK_KINDS.map((k) => (
              <Button key={k} size="sm" variant="outline" onClick={() => addBlock(k)}>
                <Plus className="mr-1 h-3 w-3" />
                {k}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {blocks.map((b, i) => (
              <BlockRow
                key={b.id}
                block={b}
                index={i}
                onUpdate={(patch) => updateBlock(b.id, patch)}
                onRemove={() => removeBlock(b.id)}
                onUp={() => move(b.id, -1)}
                onDown={() => move(b.id, 1)}
              />
            ))}
            {blocks.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                点击上方按钮添加练习块
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <Badge variant="secondary">预计 {preview.total} 题</Badge>
            <Badge variant="secondary">AI 批改 {preview.ai} 次</Badge>
            <Badge variant="secondary">约 {preview.minutes} 分钟</Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            保存模板
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BlockRowProps {
  block: PracticeBlockSpec;
  index: number;
  onUpdate: (patch: Partial<PracticeBlockSpec>) => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}

function BlockRow({ block, index, onUpdate, onRemove, onUp, onDown }: BlockRowProps) {
  const isVocab = VOCAB_KINDS.has(block.kind);
  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">块 {index + 1}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onUp}><ArrowUp className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={onDown}><ArrowDown className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={block.kind} onValueChange={(v) => v && onUpdate({ kind: v as PracticeBlockKind })}>
          <SelectTrigger className="w-[8.5rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {BLOCK_KINDS.map((k) => (
              <SelectItem key={k} value={k}>{k}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={block.gradingMode} onValueChange={(v) => v && onUpdate({ gradingMode: v as GradingMode })}>
          <SelectTrigger className="w-[8.5rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GRADING_MODES.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(block.difficulty ?? 3)}
          onValueChange={(v) => v && onUpdate({ difficulty: Number(v) })}
        >
          <SelectTrigger className="w-[6rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((d) => (
              <SelectItem key={d} value={String(d)}>难度 {d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-slate-500">题量 {block.count}</span>
        <Slider
          value={[block.count]}
          min={1}
          max={20}
          step={1}
          onValueChange={(val) => {
            const n = Array.isArray(val) ? val[0] : typeof val === 'number' ? val : undefined;
            if (typeof n === 'number') onUpdate({ count: n });
          }}
          className="flex-1"
        />
      </div>
      {isVocab && (
        <div className="mt-2">
          <Select
            value={block.vocabularySource ?? 'DUE_CARDS'}
            onValueChange={(v) => v && onUpdate({ vocabularySource: v as PracticeBlockSpec['vocabularySource'] })}
          >
            <SelectTrigger className="w-[12rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DUE_CARDS">FSRS 到期卡</SelectItem>
              <SelectItem value="COLLECTED_WORDS">已收集生词</SelectItem>
              <SelectItem value="TOPIC_WORDS">指定主题新词</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {block.kind === 'TRANSLATION' && (
        <div className="mt-2 flex gap-2">
          <input
            value={block.translationDirection?.sourceLanguage ?? 'zh'}
            onChange={(e) => onUpdate({ translationDirection: { sourceLanguage: e.target.value, targetLanguage: block.translationDirection?.targetLanguage ?? 'en' } })}
            placeholder="源语言"
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600"
          />
          <span className="self-center text-slate-400">→</span>
          <input
            value={block.translationDirection?.targetLanguage ?? 'en'}
            onChange={(e) => onUpdate({ translationDirection: { sourceLanguage: block.translationDirection?.sourceLanguage ?? 'zh', targetLanguage: e.target.value } })}
            placeholder="目标语言"
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600"
          />
        </div>
      )}
    </div>
  );
}
