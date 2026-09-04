import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight, Command } from 'lucide-react';
import { sound } from '../utils/audio.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './ui/dialog.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { cn } from '../lib/utils.js';

export interface CommandAction {
  id: string;
  category: '导航' | '专项攻坚' | '教材直达' | '系统设置';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  actions: CommandAction[];
}

export function CommandPalette({ isOpen, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      sound.playClick();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredActions = actions.filter((item) => {
    if (!query.trim()) return true;
    const lower = query.toLowerCase();
    return (
      item.title.toLowerCase().includes(lower) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(lower)) ||
      item.category.toLowerCase().includes(lower)
    );
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        sound.playClick();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredActions.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        sound.playClick();
        setSelectedIndex(
          (prev) => (prev - 1 + filteredActions.length) % Math.max(1, filteredActions.length)
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredActions[selectedIndex];
        if (selected) {
          selected.onSelect();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredActions, selectedIndex, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="top-[18%] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-2xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">快捷指令面板</DialogTitle>
        <DialogDescription className="sr-only">
          搜索并执行导航、教材直达与系统设置指令
        </DialogDescription>

        <div className="flex items-center px-4 border-b border-amber-900/10 dark:border-amber-500/15 bg-amber-500/5">
          <Search className="w-5 h-5 text-amber-600 dark:text-amber-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入指令、功能名、助词/语法搜索 (如: 助词, FSRS, 标日, 深色)..."
            className="w-full py-4 bg-transparent text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 outline-none text-base"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-mono text-stone-500 bg-stone-200/60 dark:bg-stone-800/80 rounded border border-stone-300/60 dark:border-stone-700">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filteredActions.length === 0 ? (
            <div className="py-12 text-center text-stone-500 dark:text-stone-400">
              <p className="text-sm">未找到与 &quot;{query}&quot; 相关的指令或学习资源</p>
              <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                尝试输入：做题、卡片、标日、助词、主题
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredActions.map((action, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <Button
                    key={action.id}
                    variant="ghost"
                    onClick={() => {
                      action.onSelect();
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      'h-auto w-full justify-between px-3 py-2.5 rounded-xl text-left font-normal',
                      isSelected
                        ? 'bg-amber-500/15 dark:bg-amber-500/25 text-amber-950 dark:text-amber-100 border border-amber-500/30'
                        : 'border border-transparent hover:bg-stone-200/40 dark:hover:bg-stone-800/40'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          'p-2 rounded-lg shrink-0',
                          isSelected
                            ? 'bg-amber-500 text-stone-950'
                            : 'bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                        )}
                      >
                        {action.icon}
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate">{action.title}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {action.category}
                          </Badge>
                        </div>
                        {action.subtitle && (
                          <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                            {action.subtitle}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {action.shortcut && (
                        <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[11px] font-mono text-stone-500 dark:text-stone-400 bg-stone-200/60 dark:bg-stone-800/80 rounded border border-stone-300/60 dark:border-stone-700">
                          {action.shortcut}
                        </kbd>
                      )}
                      {isSelected && (
                        <ArrowRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      )}
                    </div>
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 text-[11px] text-stone-400 dark:text-stone-500 bg-stone-100/70 dark:bg-stone-900/60 border-t border-amber-900/10 dark:border-amber-500/10">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono bg-stone-200 dark:bg-stone-800 px-1 rounded">↑</kbd>{' '}
              <kbd className="font-mono bg-stone-200 dark:bg-stone-800 px-1 rounded">↓</kbd>{' '}
              切换选项
            </span>
            <span>
              <kbd className="font-mono bg-stone-200 dark:bg-stone-800 px-1 rounded">Enter</kbd>{' '}
              执行跳转
            </span>
          </div>
          <div className="flex items-center gap-1 text-amber-600/80 dark:text-amber-400/80">
            <Command className="w-3.5 h-3.5" />
            <span>快捷指令面板</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
