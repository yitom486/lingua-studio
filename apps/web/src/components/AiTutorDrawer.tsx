import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  HelpCircle,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { sound } from '../utils/audio.js';

export interface AiTutorContext {
  questionText: string;
  userAnswer?: string | undefined;
  correctAnswer: string;
  skillTag: string;
  explanation: string;
}

interface MessageItem {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
}

interface AiTutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  context: AiTutorContext | null;
}

export function AiTutorDrawer({ isOpen, onClose, context }: AiTutorDrawerProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化上下文分析与导师首条消息
  useEffect(() => {
    if (isOpen && context) {
      sound.playClick();
      const initialAiMsg: MessageItem = {
        id: 'msg-init',
        sender: 'ai',
        text: `你好！我是你的自适应日语导师。针对刚刚这道关于【${context.skillTag}】的题目：
        
📌 **核心考点剖析**：
本题考查重点在格助词或动词的特定搭配。标准答案为「${context.correctAnswer}」。

💡 **记忆与运用锦囊**：
${context.explanation}

你可以直接点击下方的快捷追问，或在输入框中向我提出任何困惑！`,
        timestamp: '刚刚',
      };
      setMessages([initialAiMsg]);
    }
  }, [isOpen, context]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = (textToSend?: string) => {
    const content = (textToSend || inputText).trim();
    if (!content || isTyping) return;

    sound.playClick();
    const userMsg: MessageItem = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: content,
      timestamp: '刚刚',
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    // 模拟 AI 流式打字机响应
    setTimeout(() => {
      let replyText = '';
      if (content.includes('例句') || content.includes('造句')) {
        replyText = `为你提供 3 个地道生活化例句：
1. **日曜日、図書館へ行きます。** (星期天去图书馆。——「へ」表示移动方向)
2. **友達とカフェで勉強します。** (和朋友在咖啡馆学习。——「で」表示动作场所)
3. **明日の朝、会議に参加します。** (明天早晨参加会议。——「に」表示归着点)`;
      } else if (content.includes('为什么') || content.includes('辨析') || content.includes('区分')) {
        replyText = `这是最容易混淆的痛点！
- **「で」的核心逻辑**：是【动作发生的作用力场所】或【手段/工具】，例如「ナイフで切る」(用刀切)。
- **「に」的核心逻辑**：是【静态存在的落脚点/归着点】，例如「机の上に本がある」(桌上有书)。
在表示“移动前往”时，虽然口语中常用「に」，但在强调“朝向该方向”时，格助词「へ」读作「え」，更加书面且正式。`;
      } else {
        replyText = `收到你的追问！关于「${content}」：
在外语学习中，避免死记硬背中文对译，而是去感知动作的“矢量方向”与“状态属性”。建议把这道题加入你的专项弱项复习池，明天艾宾浩斯曲线拐点时系统会为你自动推送巩固练习！`;
      }

      sound.playCorrect();
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: replyText,
          timestamp: '刚刚',
        },
      ]);
      setIsTyping(false);
    }, 750);
  };

  if (!isOpen || !context) return null;

  const quickPrompts = [
    '为什么不能用别的助词？',
    '请给我造三个地道例句',
    '请总结该考点的速记口诀',
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end">
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-stone-950/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* 侧滑抽屉面板 */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 240 }}
          className="relative w-full max-w-lg h-full bg-[#faf9f6] dark:bg-[#1a1816] shadow-2xl border-l border-amber-900/15 dark:border-amber-500/20 flex flex-col z-10"
        >
          {/* 抽屉头部 */}
          <div className="p-4 border-b border-amber-900/10 dark:border-amber-500/15 flex items-center justify-between bg-amber-500/10 dark:bg-amber-500/15">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500 text-stone-950 font-bold shadow-sm">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5 font-serif">
                  AI 智能导师专属追问室
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  当前聚焦：{context.skillTag}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 题目上下文引用卡片 */}
          <div className="p-3 bg-amber-50/70 dark:bg-stone-900/70 border-b border-amber-900/10 dark:border-amber-500/10 text-xs space-y-1">
            <span className="font-semibold text-amber-900 dark:text-amber-300">
              📌 正在剖析题干：
            </span>
            <p className="text-stone-800 dark:text-stone-200 font-medium">
              {context.questionText}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-stone-500 pt-0.5">
              <span>标准答案：<strong className="text-emerald-700 dark:text-emerald-400">{context.correctAnswer}</strong></span>
              {context.userAnswer && (
                <span>你的提交：<strong className="text-rose-600">{context.userAnswer}</strong></span>
              )}
            </div>
          </div>

          {/* 消息对话流 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => {
              const isAi = msg.sender === 'ai';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isAi ? '' : 'flex-row-reverse'}`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs ${
                      isAi
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'bg-stone-700 text-white'
                    }`}
                  >
                    {isAi ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>

                  <div
                    className={`max-w-[85%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                      isAi
                        ? 'bg-white dark:bg-stone-900/90 text-stone-800 dark:text-stone-200 border border-amber-900/10 dark:border-amber-500/15 shadow-sm rounded-tl-none font-serif'
                        : 'bg-amber-500 text-stone-950 font-medium rounded-tr-none shadow-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <Bot className="w-4 h-4 animate-spin" />
                <span>AI 导师正在分析语法结构与例句...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 快捷追问胶囊 */}
          <div className="px-4 py-2 bg-stone-100/60 dark:bg-stone-900/40 border-t border-amber-900/10 dark:border-amber-500/10 flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                disabled={isTyping}
                className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-stone-800 hover:bg-amber-500/15 text-stone-700 dark:text-stone-300 border border-amber-900/10 dark:border-amber-500/20 transition-all font-medium"
              >
                💬 {prompt}
              </button>
            ))}
          </div>

          {/* 底部输入框 */}
          <div className="p-3 border-t border-amber-900/10 dark:border-amber-500/15 bg-[#faf9f6] dark:bg-[#1a1816]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="向 AI 导师提问（例如：请解释和『に関して』的区别）..."
                className="flex-1 py-2.5 px-3.5 bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 rounded-xl border border-stone-200 dark:border-stone-800 text-xs sm:text-sm outline-none focus:border-amber-500 transition-all"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isTyping}
                className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-stone-950 font-bold transition-all shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
