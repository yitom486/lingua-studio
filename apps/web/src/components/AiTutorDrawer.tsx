import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Send, Bot, User, Square, Wifi, WifiOff } from 'lucide-react';
import type { ContextSnapshot } from '@study-studio/agent-core';
import { sound } from '../utils/audio.js';
import type { useGateway } from '../hooks/useGateway.js';
import { useStudySessionStore } from '../stores/useStudySessionStore.js';
import { useUserProfileStore } from '../stores/useUserProfileStore.js';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './ui/sheet.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { ErrorBoundary } from './common/ErrorBoundary.js';

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
  isStreaming?: boolean;
}

interface AiTutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  context: AiTutorContext | null;
  gateway?: ReturnType<typeof useGateway>;
}

function buildTutorClientSnapshot(
  ctx: AiTutorContext,
  activeTab: string,
  profile: { targetLanguage: 'ja' | 'en'; overallLevel: string }
): Partial<ContextSnapshot> {
  return {
    targetLanguage: profile.targetLanguage === 'en' ? 'en' : 'ja',
    learnerLevel: profile.overallLevel,
    locale: 'zh-CN',
    ui: {
      activeTab,
      openTutor: true,
    },
    focus: {
      kind: 'QUESTION',
      surface: ctx.questionText,
      correctAnswer: ctx.correctAnswer,
      userAnswer: ctx.userAnswer,
      explanation: ctx.explanation,
      skillTag: ctx.skillTag,
    },
    userIntentHint: 'EXPLAIN',
  };
}

export function AiTutorDrawer({ isOpen, onClose, context, gateway }: AiTutorDrawerProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeStreamMsgIdRef = useRef<string | null>(null);
  const bootstrappedRef = useRef<string | null>(null);

  const activeTab = useStudySessionStore((s) => s.activeTab);
  const profile = useUserProfileStore((s) => s.profile);

  const buildSnapshot = useCallback((): Partial<ContextSnapshot> | undefined => {
    if (!context) return undefined;
    return buildTutorClientSnapshot(context, activeTab, {
      targetLanguage: profile.targetLanguage === 'en' ? 'en' : 'ja',
      overallLevel: profile.overallLevel,
    });
  }, [context, activeTab, profile.targetLanguage, profile.overallLevel]);

  const attachStreamToMessage = useCallback(
    (aiMsgId: string, input: string, intent: 'EXPLAIN' | 'FREE_COACH' = 'EXPLAIN') => {
      if (!gateway?.isConnected) return false;

      return gateway.sendTurnStream({
        input,
        intent,
        contextSnapshot: buildSnapshot(),
        onDelta: (_delta, accumulated) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsgId ? { ...m, text: accumulated } : m))
          );
        },
        onComplete: (data) => {
          sound.playCorrect();
          setIsTyping(false);
          activeStreamMsgIdRef.current = null;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    text: data.finalOutput || m.text,
                    isStreaming: false,
                  }
                : m
            )
          );
        },
        onError: () => {
          setIsTyping(false);
          activeStreamMsgIdRef.current = null;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    text:
                      m.text ||
                      '抱歉，导师连接遇到网络异常，请确认网关已启动后重试。',
                    isStreaming: false,
                  }
                : m
            )
          );
        },
      });
    },
    [gateway, buildSnapshot]
  );

  useEffect(() => {
    if (!isOpen || !context) {
      bootstrappedRef.current = null;
      return;
    }

    const sessionKey = `${context.skillTag}|${context.questionText}`;
    if (bootstrappedRef.current === sessionKey) return;
    bootstrappedRef.current = sessionKey;

    sound.playClick();
    setInputText('');
    setIsTyping(false);
    activeStreamMsgIdRef.current = null;

    if (gateway?.isConnected) {
      const aiMsgId = `ai-boot-${Date.now()}`;
      activeStreamMsgIdRef.current = aiMsgId;
      setMessages([
        {
          id: aiMsgId,
          sender: 'ai',
          text: '',
          timestamp: '刚刚',
          isStreaming: true,
        },
      ]);
      setIsTyping(true);
      const prompt =
        `请根据当前题目做简短导入讲解（3–6 句），点明考点「${context.skillTag}」，` +
        `并邀请我继续追问。题干：${context.questionText}。` +
        (context.userAnswer ? `我的作答：${context.userAnswer}。` : '') +
        `参考解析：${context.explanation}`;
      const sent = attachStreamToMessage(aiMsgId, prompt, 'EXPLAIN');
      if (!sent) {
        setMessages([
          {
            id: 'msg-init-offline',
            sender: 'ai',
            text: `你好！我是你的专属 AI 导师。针对「${context.skillTag}」：\n\n📌 ${context.questionText}\n\n💡 ${context.explanation}\n\n（Gateway 未连通，可先离线追问。）`,
            timestamp: '刚刚',
          },
        ]);
        setIsTyping(false);
      }
      return;
    }

    setMessages([
      {
        id: 'msg-init',
        sender: 'ai',
        text: `你好！我是你的专属 AI 导师。针对刚刚在「${context.skillTag}」中的题目：\n\n📌 **题目**：\n${context.questionText}\n\n💡 **标准解析**：\n${context.explanation}\n\n你可以直接点击下方快捷追问，或输入你的疑问！`,
        timestamp: '刚刚',
      },
    ]);
  }, [isOpen, context, gateway?.isConnected, attachStreamToMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleInterrupt = () => {
    if (gateway) {
      gateway.interruptTurn();
    }
    setIsTyping(false);
    if (activeStreamMsgIdRef.current) {
      const msgId = activeStreamMsgIdRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                isStreaming: false,
                text: m.text ? m.text + '\n\n*(已终止生成)*' : '*(生成已取消)*',
              }
            : m
        )
      );
      activeStreamMsgIdRef.current = null;
    }
  };

  const handleSendMessage = (textToSend?: string) => {
    const content = (textToSend || inputText).trim();
    if (!content || isTyping) return;

    sound.playClick();
    const userMsgId = `user-${Date.now()}`;
    const aiMsgId = `ai-${Date.now()}`;
    activeStreamMsgIdRef.current = aiMsgId;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: content,
        timestamp: '刚刚',
      },
      {
        id: aiMsgId,
        sender: 'ai',
        text: '',
        timestamp: '刚刚',
        isStreaming: true,
      },
    ]);
    setInputText('');
    setIsTyping(true);

    if (gateway && gateway.isConnected) {
      const sent = attachStreamToMessage(aiMsgId, content, 'EXPLAIN');
      if (sent) return;
    }

    setTimeout(() => {
      let replyText = '';
      if (content.includes('例句') || content.includes('造句')) {
        replyText = `为你提供 3 个地道生活化例句：\n1. **日曜日、図書館へ行きます。**\n2. **友達とカフェで勉強します。**\n3. **明日の朝、会議に参加します。**`;
      } else if (
        content.includes('为什么') ||
        content.includes('辨析') ||
        content.includes('区分')
      ) {
        replyText = `这是最容易混淆的痛点！\n- **「で」**：动作发生场所或手段。\n- **「に」**：静态存在/归着点。\n移动方向也可用「へ」(读え)。`;
      } else {
        replyText = `收到你的追问！关于「${content}」：建议结合当前考点「${context?.skillTag ?? ''}」做对照练习，并把易错点加入错题本。`;
      }

      sound.playCorrect();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                text: replyText,
                isStreaming: false,
              }
            : m
        )
      );
      setIsTyping(false);
      activeStreamMsgIdRef.current = null;
    }, 650);
  };

  const quickPrompts = [
    '为什么不能用别的助词？',
    '请给我造三个地道例句',
    '请总结该考点的速记口诀',
  ];

  const isGatewayConnected = gateway?.isConnected ?? false;

  return (
    <Sheet open={isOpen && !!context} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="p-0 flex flex-col h-full w-full sm:max-w-md md:max-w-lg" showClose>
        {context && (
          <>
            <SheetHeader className="bg-amber-500/10 dark:bg-amber-500/15 p-4 border-b border-amber-900/10 dark:border-amber-500/10 shrink-0">
              <div className="flex items-center justify-between pr-8">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500 text-stone-950 shadow-sm">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <SheetTitle className="flex items-center gap-1.5 text-base">
                      AI 智能导师专属追问室
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    </SheetTitle>
                    <SheetDescription className="text-xs">当前聚焦：{context.skillTag}</SheetDescription>
                  </div>
                </div>
                <Badge
                  variant={isGatewayConnected ? 'emerald' : 'outline'}
                  className="text-[10px] gap-1 px-2 py-0.5"
                >
                  {isGatewayConnected ? (
                    <>
                      <Wifi className="w-2.5 h-2.5" />
                      Gateway 实时流式
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-2.5 h-2.5 text-stone-400" />
                      离线演练
                    </>
                  )}
                </Badge>
              </div>
            </SheetHeader>

            <div className="p-3 bg-amber-50/70 dark:bg-stone-900/70 border-b border-amber-900/10 dark:border-amber-500/10 text-xs space-y-1 shrink-0">
              <Badge variant="amber" className="mb-1">
                📌 正在剖析题干
              </Badge>
              <p className="text-stone-800 dark:text-stone-200 font-medium">
                {context.questionText}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-stone-500 pt-0.5">
                <span>
                  标准答案：
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    {context.correctAnswer}
                  </strong>
                </span>
                {context.userAnswer && (
                  <span>
                    你的提交：
                    <strong className="text-rose-600">{context.userAnswer}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <ErrorBoundary
                variant="embedded"
                title="对话渲染遇到临时异常"
                message="导师气泡渲染出现异常，已保护对话资产，可点击重新加载。"
              >
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
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-4 ml-1 bg-amber-500 animate-pulse align-middle" />
                      )}
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 animate-spin" />
                    <span>AI 导师正在实时组织讲解与分析...</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleInterrupt}
                    className="h-6 px-2 text-[11px] text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 gap-1 rounded"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    停止生成
                  </Button>
                </div>
              )}
              <div ref={messagesEndRef} />
              </ErrorBoundary>
            </div>

            <div className="px-4 py-2 bg-stone-100/60 dark:bg-stone-900/40 border-t border-amber-900/10 dark:border-amber-500/10 flex flex-wrap gap-1.5 shrink-0">
              {quickPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendMessage(prompt)}
                  disabled={isTyping}
                  className="h-7 rounded-full text-[11px] px-2.5"
                >
                  💬 {prompt}
                </Button>
              ))}
            </div>

            <div className="p-3 border-t border-amber-900/10 dark:border-amber-500/15 shrink-0">
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
                  placeholder="向 AI 导师追问（例如：请解释和『に関して』的区别）..."
                  className="flex-1 py-2.5 px-3.5 bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 rounded-xl border border-stone-200 dark:border-stone-800 text-xs sm:text-sm outline-none focus:border-amber-500 transition-all"
                />
                {isTyping ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleInterrupt}
                    aria-label="停止"
                    className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!inputText.trim()}
                    aria-label="发送"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </form>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
