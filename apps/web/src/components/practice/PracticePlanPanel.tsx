import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Play, Loader2 } from 'lucide-react';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';
import { usePracticeTemplatesQuery, useDeletePracticeTemplateMutation, useStartPracticeRunMutation } from '../../queries/useLearnerQueries.js';
import { PracticePlanEditor } from './PracticePlanEditor.js';
import type { PracticePlanTemplate } from '@study-studio/protocol';

/** P5：练习计划面板。模板列表 + 新建/编辑/删除/开始今日运行。 */

interface PracticePlanPanelProps {
  userId: string;
  language: 'en' | 'ja' | 'ko';
  /** 开始运行后回调（携带 runId，由父组件装配题目并打开 PracticeRunner） */
  onStartRun?: (runId: string, template: PracticePlanTemplate) => void;
}

export function PracticePlanPanel({ userId, language, onStartRun }: PracticePlanPanelProps) {
  const { data: templates = [], isLoading } = usePracticeTemplatesQuery(userId, language);
  const deleteMutation = useDeletePracticeTemplateMutation(userId);
  const startMutation = useStartPracticeRunMutation(userId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PracticePlanTemplate | null>(null);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (tpl: PracticePlanTemplate) => {
    setEditing(tpl);
    setEditorOpen(true);
  };
  const handleDelete = async (tpl: PracticePlanTemplate) => {
    try {
      await deleteMutation.mutateAsync(tpl.id);
      toast.success('模板已删除');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const handleStart = async (tpl: PracticePlanTemplate) => {
    try {
      const run = await startMutation.mutateAsync({ language, templateId: tpl.id });
      toast.success('已开始练习运行');
      onStartRun?.(run.id, tpl);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">我的练习计划</h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-3 w-3" />新建
        </Button>
      </div>

      {isLoading && <div className="text-xs text-slate-400">加载中…</div>}

      <div className="flex flex-col gap-2">
        {templates.map((tpl) => (
          <div key={tpl.id} className="flex items-center justify-between rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{tpl.name}</span>
                {!tpl.enabled && <Badge variant="outline">已停用</Badge>}
                <Badge variant="secondary">revision {tpl.revision}</Badge>
              </div>
              <span className="text-xs text-slate-500">
                {tpl.blocks.map((b) => `${b.kind}×${b.count}`).join(' · ')}
              </span>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => openEdit(tpl)}><Pencil className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(tpl)}><Trash2 className="h-3 w-3" /></Button>
              <Button
                size="sm"
                onClick={() => handleStart(tpl)}
                disabled={!tpl.enabled || startMutation.isPending}
              >
                {startMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
                开始
              </Button>
            </div>
          </div>
        ))}
        {templates.length === 0 && !isLoading && (
          <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            还没有练习计划，点击「新建」创建第一个
          </div>
        )}
      </div>

      <PracticePlanEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        userId={userId}
        language={language}
        template={editing}
      />
    </div>
  );
}
