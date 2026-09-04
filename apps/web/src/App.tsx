import React, { useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  XCircle,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  RotateCw,
  Award,
  Layers,
  ChevronRight,
} from 'lucide-react';
import {
  initFsrsState,
  scheduleNextReview,
  type SkillMetric,
} from '@study-studio/learner-core';
import type { CardReviewRating } from '@study-studio/protocol';

export function App() {
  const [activeTab, setActiveTab] = useState<'QUIZ' | 'CARDS' | 'MISTAKES' | 'RADAR'>('QUIZ');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [cardState, setCardState] = useState(initFsrsState());

  // 模拟做题示例 (考查助词に vs で)
  const currentQuestion = {
    id: 'q_demo_01',
    prompt: '选择最恰当的助词填空',
    content: '夏休みに、友だちと京都____行きました。',
    options: [
      { key: 'A', text: 'で' },
      { key: 'B', text: 'に' },
      { key: 'C', text: 'を' },
      { key: 'D', text: 'から' },
    ],
    correctAnswer: 'B',
    explanation: '表示移动的目的地、着落点时使用助词「に」；「で」则表示动作进行的场所。',
    testedSkill: 'jp.particle.destination_ni',
  };

  // 学习者技能画像示例
  const skillMetrics: SkillMetric[] = [
    {
      id: 'jp.particle.destination_ni',
      dimension: 'GRAMMAR',
      name: '目的地与着落点助词「に」',
      proficiency: 0.88,
      totalAttempts: 12,
      correctAttempts: 11,
      consecutiveErrors: 0,
      status: 'STRENGTH',
    },
    {
      id: 'jp.particle.action_de',
      dimension: 'GRAMMAR',
      name: '动作发生场所助词「で」',
      proficiency: 0.52,
      totalAttempts: 8,
      correctAttempts: 4,
      consecutiveErrors: 2,
      status: 'WEAKNESS',
    },
    {
      id: 'jp.listening.sokuon',
      dimension: 'LISTENING',
      name: '长音与促音听辨',
      proficiency: 0.45,
      totalAttempts: 10,
      correctAttempts: 4,
      consecutiveErrors: 3,
      status: 'WEAKNESS',
    },
    {
      id: 'jp.vocab.n3_verbs',
      dimension: 'VOCABULARY',
      name: 'N3 核心动词搭配',
      proficiency: 0.92,
      totalAttempts: 30,
      correctAttempts: 28,
      consecutiveErrors: 0,
      status: 'STRENGTH',
    },
  ];

  const handleReviewRating = (rating: CardReviewRating) => {
    const next = scheduleNextReview(cardState, rating);
    setCardState(next);
    setCardFlipped(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 顶部导航栏 */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Study Studio
              </span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-medium">
                AI 学习中枢
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-slate-400 font-medium">当前目标</div>
              <div className="text-sm font-semibold text-indigo-400">日本語 JLPT N3</div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs font-medium">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>连续学习 5 天</span>
            </div>
          </div>
        </div>
      </header>

      {/* 主工作区 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        {/* 标签栏 */}
        <div className="flex items-center gap-2 p-1 bg-slate-900/80 rounded-xl border border-slate-800 w-fit">
          <button
            onClick={() => setActiveTab('QUIZ')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'QUIZ'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            自适应做题
          </button>
          <button
            onClick={() => setActiveTab('CARDS')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'CARDS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            卡片复习 (FSRS)
          </button>
          <button
            onClick={() => setActiveTab('MISTAKES')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'MISTAKES'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            全功能错题本
          </button>
          <button
            onClick={() => setActiveTab('RADAR')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'RADAR'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-4 h-4" />
            能力画像 (优势/缺陷)
          </button>
        </div>

        {/* 做题标签页 */}
        {activeTab === 'QUIZ' && (
          <div className="flex flex-col gap-6 max-w-3xl">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500" />
              
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-950/60 px-2.5 py-1 rounded-md border border-indigo-800/40">
                  AI 靶向出题 · 语法辨析
                </span>
                <span className="text-xs text-slate-400">考点：助词用法</span>
              </div>

              <h2 className="text-sm font-medium text-slate-400 mb-2">{currentQuestion.prompt}</h2>
              <div className="text-2xl font-bold text-slate-100 my-4 tracking-wide font-serif">
                {currentQuestion.content}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                {currentQuestion.options.map((opt) => {
                  const isSelected = selectedOption === opt.key;
                  const isCorrect = opt.key === currentQuestion.correctAnswer;
                  let borderStyle = 'border-slate-800 bg-slate-800/50 hover:bg-slate-800';

                  if (quizSubmitted) {
                    if (isCorrect) {
                      borderStyle = 'border-emerald-500/80 bg-emerald-950/30 text-emerald-300';
                    } else if (isSelected) {
                      borderStyle = 'border-rose-500/80 bg-rose-950/30 text-rose-300';
                    }
                  } else if (isSelected) {
                    borderStyle = 'border-indigo-500 bg-indigo-950/40 text-indigo-200';
                  }

                  return (
                    <button
                      key={opt.key}
                      disabled={quizSubmitted}
                      onClick={() => setSelectedOption(opt.key)}
                      className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${borderStyle}`}
                    >
                      <span className="font-semibold">{opt.key}. {opt.text}</span>
                      {quizSubmitted && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                      {quizSubmitted && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-400" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800">
                <div className="text-xs text-slate-500">客观题由客户端即时秒判，不消耗冗余 Token</div>
                {!quizSubmitted ? (
                  <button
                    disabled={!selectedOption}
                    onClick={() => setQuizSubmitted(true)}
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/30"
                  >
                    提交判定
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setQuizSubmitted(false);
                      setSelectedOption(null);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition-all flex items-center gap-2"
                  >
                    <RotateCw className="w-4 h-4" /> 下一题
                  </button>
                )}
              </div>
            </div>

            {/* AI 批改与深度解析卡片 */}
            {quizSubmitted && (
              <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-2xl p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                  <Sparkles className="w-4 h-4" />
                  AI 智能导师解析与错因诊断
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {currentQuestion.explanation}
                </p>
                <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs text-slate-400 flex items-start gap-2">
                  <span className="font-semibold text-indigo-400 whitespace-nowrap">错因归纳：</span>
                  <span>助词混淆（容易受母语“在/去”思维负迁移影响，注意区分移动终点与动作发生点）。已自动计入学习者画像。</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 卡片复习标签页 */}
        {activeTab === 'CARDS' && (
          <div className="flex flex-col items-center gap-6 max-w-xl mx-auto w-full">
            <div
              onClick={() => setCardFlipped(!cardFlipped)}
              className="w-full h-80 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer shadow-2xl transition-all relative overflow-hidden group"
            >
              <span className="absolute top-4 right-4 text-xs text-slate-500 flex items-center gap-1 group-hover:text-indigo-400 transition-colors">
                点击翻转卡片 <ChevronRight className="w-3 h-3" />
              </span>

              {!cardFlipped ? (
                <div className="flex flex-col items-center gap-3">
                  <span className="text-xs text-indigo-400 bg-indigo-950 px-3 py-1 rounded-full font-medium">
                    核心生词
                  </span>
                  <div className="text-4xl font-bold font-serif text-slate-100">
                    降る
                  </div>
                  <div className="text-sm text-slate-400">
                    ふる (自动词)
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 animate-in fade-in duration-200">
                  <div className="text-xl font-semibold text-emerald-400">
                    释义：下 (雨、雪等)
                  </div>
                  <p className="text-sm text-slate-300 mt-2 max-w-sm">
                    例句：明日、雨が<span className="text-indigo-400 font-semibold">降ったら</span>、試合は中止です。
                  </p>
                  <p className="text-xs text-slate-400">
                    (明天要是下雨的话，比赛就中止。)
                  </p>
                </div>
              )}
            </div>

            {/* FSRS 评分按钮 */}
            {cardFlipped && (
              <div className="flex items-center gap-3 w-full justify-between animate-in fade-in slide-in-from-bottom-2">
                <button
                  onClick={() => handleReviewRating('AGAIN')}
                  className="flex-1 py-3 px-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 font-medium text-xs flex flex-col items-center gap-1 transition-all"
                >
                  <span>生疏 (Again)</span>
                  <span className="text-[10px] text-rose-400/80">1 天后</span>
                </button>
                <button
                  onClick={() => handleReviewRating('HARD')}
                  className="flex-1 py-3 px-2 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/50 text-amber-300 font-medium text-xs flex flex-col items-center gap-1 transition-all"
                >
                  <span>困难 (Hard)</span>
                  <span className="text-[10px] text-amber-400/80">2 天后</span>
                </button>
                <button
                  onClick={() => handleReviewRating('GOOD')}
                  className="flex-1 py-3 px-2 rounded-xl bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-800/50 text-indigo-300 font-medium text-xs flex flex-col items-center gap-1 transition-all"
                >
                  <span>良好 (Good)</span>
                  <span className="text-[10px] text-indigo-400/80">4 天后</span>
                </button>
                <button
                  onClick={() => handleReviewRating('EASY')}
                  className="flex-1 py-3 px-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-300 font-medium text-xs flex flex-col items-center gap-1 transition-all"
                >
                  <span>简单 (Easy)</span>
                  <span className="text-[10px] text-emerald-400/80">7 天后</span>
                </button>
              </div>
            )}

            <div className="text-xs text-slate-500">
              FSRS 记忆稳定性：{cardState.stability.toFixed(1)} · 复习次数：{cardState.reps} 次
            </div>
          </div>
        )}

        {/* 错题本标签页 */}
        {activeTab === 'MISTAKES' && (
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-200">待攻克错题 (1 题)</h2>
              <span className="text-xs text-slate-400">连续订正正确 2 次即可自动移出</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-rose-400 bg-rose-950/50 px-2.5 py-1 rounded border border-rose-800/40">
                  错因分类：助词混淆
                </span>
                <span className="text-xs text-slate-500">上次重做：未攻克 (0/2)</span>
              </div>
              <div className="text-base font-medium text-slate-200">
                図書館____本を読みます。
              </div>
              <div className="text-xs text-slate-400">
                上次错误答案：<span className="text-rose-400">に</span> · 正确答案：<span className="text-emerald-400">で</span>
              </div>
              <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                AI 批改备注：在图书馆进行“读书”这一动作，强调动作发生场所，必须用「で」。
              </div>
            </div>
          </div>
        )}

        {/* 能力画像标签页 */}
        {activeTab === 'RADAR' && (
          <div className="flex flex-col gap-6 max-w-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-200">学习者优势与缺陷雷达</h2>
              <span className="text-xs text-slate-400">基于近 50 次练习动态计算</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {skillMetrics.map((metric) => {
                const isStrength = metric.status === 'STRENGTH';
                const isWeakness = metric.status === 'WEAKNESS';

                return (
                  <div
                    key={metric.id}
                    className={`p-4 rounded-xl border flex flex-col gap-2 ${
                      isStrength
                        ? 'bg-slate-900/80 border-emerald-900/40'
                        : isWeakness
                        ? 'bg-slate-900/80 border-rose-900/40'
                        : 'bg-slate-900/50 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-200">{metric.name}</span>
                      {isStrength && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                          相对优势
                        </span>
                      )}
                      {isWeakness && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800/40">
                          当前薄弱项
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                      <span>掌握度</span>
                      <span className="font-semibold text-slate-300">{(metric.proficiency * 100).toFixed(0)}%</span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isStrength
                            ? 'bg-emerald-500'
                            : isWeakness
                            ? 'bg-rose-500'
                            : 'bg-indigo-500'
                        }`}
                        style={{ width: `${metric.proficiency * 100}%` }}
                      />
                    </div>

                    <div className="text-[11px] text-slate-500 flex justify-between">
                      <span>总练习 {metric.totalAttempts} 次</span>
                      <span>连续错误 {metric.consecutiveErrors} 次</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
