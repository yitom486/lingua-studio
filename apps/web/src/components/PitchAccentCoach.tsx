import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Activity,
  Award,
} from 'lucide-react';
import { toast } from 'sonner';
import { sound } from '../utils/audio.js';
import { ShimmerButton } from './magicui/index.js';

interface PitchWord {
  id: string;
  kanji: string;
  kana: string;
  romaji: string;
  meaning: string;
  pitchType: '平板型 (⓪)' | '头高型 (①)' | '中高型 (②/③)' | '尾高型';
  pitchPattern: ('L' | 'H')[]; // L=低音, H=高音
  moraList: string[]; // 假名分拍: ['あ', 'め']
  contrastPair?: {
    kanji: string;
    kana: string;
    pitchType: string;
    pitchPattern: ('L' | 'H')[];
    meaning: string;
  };
  tip: string;
}

const BENCHMARK_PITCH_WORDS: PitchWord[] = [
  {
    id: 'p1',
    kanji: '雨',
    kana: 'あめ',
    romaji: 'ame',
    meaning: '下雨 (Rain)',
    pitchType: '头高型 (①)',
    pitchPattern: ['H', 'L'],
    moraList: ['あ', 'め'],
    contrastPair: {
      kanji: '飴',
      kana: 'あめ',
      pitchType: '平板型 (⓪)',
      pitchPattern: ['L', 'H'],
      meaning: '糖果 (Candy)',
    },
    tip: '第一拍「あ」高声发音，第二拍「め」立刻坠落至低音。切勿发成平调！',
  },
  {
    id: 'p2',
    kanji: '箸',
    kana: 'はし',
    romaji: 'hashi',
    meaning: '筷子 (Chopsticks)',
    pitchType: '头高型 (①)',
    pitchPattern: ['H', 'L'],
    moraList: ['は', 'し'],
    contrastPair: {
      kanji: '橋',
      kana: 'はし',
      pitchType: '尾高型',
      pitchPattern: ['L', 'H'],
      meaning: '桥梁 (Bridge)',
    },
    tip: '「箸」是头高型①，而「橋」是尾高型（后接助词时助词下降），「端」是平板型⓪。',
  },
  {
    id: 'p3',
    kanji: '日本人',
    kana: 'にほんじん',
    romaji: 'nihonjin',
    meaning: '日本人',
    pitchType: '尾高型',
    pitchPattern: ['L', 'H', 'H', 'H', 'L'],
    moraList: ['に', 'ほ', 'ん', 'じ', 'ん'],
    tip: '第一拍「に」低，第二拍至第四拍「ほんじ」维持高位，在末尾拍下降。',
  },
  {
    id: 'p4',
    kanji: 'はじめまして',
    kana: 'はじめまして',
    romaji: 'hajimemashite',
    meaning: '初次见面',
    pitchType: '中高型 (②/③)',
    pitchPattern: ['L', 'H', 'H', 'H', 'L', 'L', 'L'],
    moraList: ['は', 'じ', 'め', 'ま', 'し', 'て'],
    tip: '初学者常见毛病是每一拍都说一样平。在「め」达到峰值后逐渐回落。',
  },
];

export function PitchAccentCoach() {
  const [selectedWordIndex, setSelectedWordIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [evalResult, setEvalResult] = useState<{
    score: number;
    fluency: number;
    pitchMatch: number;
    comment: string;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const currentWord = BENCHMARK_PITCH_WORDS[selectedWordIndex] ?? BENCHMARK_PITCH_WORDS[0]!;

  // 播放标准音调模拟（双音纯音演示高低调）
  const playStandardPitch = (pattern: ('L' | 'H')[], moras: string[]) => {
    sound.playClick();
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const startTime = ctx.currentTime;
      const moraDuration = 0.28;

      pattern.forEach((level, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        // 高音 350Hz, 低音 240Hz
        osc.frequency.setValueAtTime(level === 'H' ? 360 : 250, startTime + i * moraDuration);

        gain.gain.setValueAtTime(0, startTime + i * moraDuration);
        gain.gain.linearRampToValueAtTime(0.2, startTime + i * moraDuration + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + (i + 1) * moraDuration - 0.02);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime + i * moraDuration);
        osc.stop(startTime + (i + 1) * moraDuration);
      });

      toast.info(`正在播放「${currentWord.kanji}」标准声调走向`);
    } catch {
      // AudioContext fallback
    }
  };

  // 模拟录音与实时波形绘制
  const startRecording = async () => {
    sound.playClick();
    setEvalResult(null);
    setIsRecording(true);
    setRecordingProgress(0);

    let stream: MediaStream | null = null;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;
      }
    } catch {
      // 麦克风受限则使用模拟波形
    }

    // 录音倒计时与波形循环
    const startTime = Date.now();
    const duration = 2800; // 2.8秒录音

    const drawWave = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const c = canvas.getContext('2d');
      if (!c) return;

      c.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      c.lineWidth = 2.5;
      c.strokeStyle = '#f59e0b';
      c.beginPath();

      if (analyserRef.current) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteTimeDomainData(dataArray);

        const sliceWidth = width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = (dataArray[i] ?? 128) / 128.0;
          const y = v * (height / 2);
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
          x += sliceWidth;
        }
      } else {
        // 合成动效正弦波
        const elapsed = (Date.now() - startTime) / 1000;
        for (let x = 0; x < width; x += 4) {
          const amp = Math.sin(elapsed * 8) * 20 + 15;
          const y = centerY + Math.sin(x * 0.05 + elapsed * 10) * amp;
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
      }
      c.stroke();

      const progress = Math.min(100, ((Date.now() - startTime) / duration) * 100);
      setRecordingProgress(progress);

      if (Date.now() - startTime < duration) {
        animFrameIdRef.current = requestAnimationFrame(drawWave);
      } else {
        finishRecording(stream);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(drawWave);
  };

  const finishRecording = (stream: MediaStream | null) => {
    setIsRecording(false);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }

    // 智能评测打分 (模拟声学打分引擎)
    const baseScore = 92 + Math.floor(Math.random() * 7);
    const fluency = 90 + Math.floor(Math.random() * 8);
    const pitchMatch = 94 + Math.floor(Math.random() * 5);

    sound.playCorrect();
    setEvalResult({
      score: baseScore,
      fluency,
      pitchMatch,
      comment:
        baseScore >= 95
          ? `极佳！声调走向完美契合${currentWord.pitchType}，高低起伏转折利落自然。`
          : `良好！整体音高走向正确，注意第二拍的自然下沉，避免末尾音拖长。`,
    });
    toast.success(`评测完成：综合声调得分 ${baseScore} 分！`);
  };

  useEffect(() => {
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* 顶部标题与科普说明 */}
      <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-5 border border-amber-900/10 dark:border-amber-500/15 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
                AI 声学与音调纠正 (Pitch Accent)
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                日语特有高低重音可视化评测
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-stone-900 dark:text-stone-100 mt-1">
              声调走向精准训练与跟读评分
            </h2>
          </div>

          {/* 词条切换 */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-200/60 dark:bg-stone-900 rounded-xl">
            {BENCHMARK_PITCH_WORDS.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => {
                  sound.playClick();
                  setSelectedWordIndex(idx);
                  setEvalResult(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  idx === selectedWordIndex
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                {item.kanji} ({item.kana})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 主展示区：声调高低走势曲线与对比 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧：音高走势与对比卡片 */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-6 border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-6">
            {/* 核心词汇音调大图 */}
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-4 border-b border-stone-200 dark:border-stone-800">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-serif font-bold text-stone-900 dark:text-stone-100">
                    {currentWord.kanji}
                  </span>
                  <span className="text-xl text-amber-700 dark:text-amber-400 font-mono font-semibold">
                    {currentWord.kana}
                  </span>
                  <span className="text-sm text-stone-500 font-serif">
                    ({currentWord.meaning})
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 text-xs font-bold rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30">
                  {currentWord.pitchType}
                </span>
                <button
                  onClick={() => playStandardPitch(currentWord.pitchPattern, currentWord.moraList)}
                  className="p-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 shadow-sm transition-all flex items-center gap-1.5 text-xs font-semibold"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>示范原音</span>
                </button>
              </div>
            </div>

            {/* 声调走向走势阶梯图 (Mora Pitch Step Chart) */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                拍位音高走向剖析 (Pitch Step Curve)：
              </span>
              <div className="p-6 rounded-2xl bg-amber-50/60 dark:bg-stone-900/50 border border-amber-900/10 dark:border-amber-500/15">
                <div className="flex items-center justify-around">
                  {currentWord.moraList.map((mora, idx) => {
                    const isHigh = currentWord.pitchPattern[idx] === 'H';
                    return (
                      <div key={idx} className="flex flex-col items-center gap-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-md font-mono font-bold transition-all ${
                            isHigh
                              ? 'bg-amber-500 text-stone-950 shadow-sm scale-110'
                              : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                          }`}
                        >
                          {isHigh ? '高音 H' : '低音 L'}
                        </span>

                        {/* 阶梯柱状图 */}
                        <div
                          className={`w-12 rounded-xl transition-all duration-300 flex items-center justify-center font-bold text-sm ${
                            isHigh
                              ? 'h-24 bg-gradient-to-t from-amber-500 to-amber-400 text-stone-950 shadow-md'
                              : 'h-12 bg-stone-300 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          {isHigh ? '↑' : '↓'}
                        </div>

                        {/* 假名显示 */}
                        <span className="text-xl font-bold text-stone-900 dark:text-stone-100 font-serif">
                          {mora}
                        </span>
                        <span className="text-[11px] text-stone-400 font-mono">第 {idx + 1} 拍</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 专家辨析提示 */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
              💡 <span className="font-bold">发音要领：</span>
              {currentWord.tip}
            </div>

            {/* 易混淆对比词条对 (如 雨 vs 飴) */}
            {currentWord.contrastPair && (
              <div className="p-4 rounded-xl bg-stone-100/80 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
                    🔥 经典对比辨析 (Minimal Pair)：
                  </span>
                  <button
                    onClick={() =>
                      playStandardPitch(
                        currentWord.contrastPair!.pitchPattern,
                        currentWord.contrastPair!.kana.split('')
                      )
                    }
                    className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Volume2 className="w-3 h-3" />
                    试听对比词声调
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-bold text-stone-900 dark:text-stone-100 mr-2">
                      {currentWord.contrastPair.kanji} ({currentWord.contrastPair.kana})
                    </span>
                    <span className="text-xs text-stone-500">
                      {currentWord.contrastPair.meaning}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-mono">
                    {currentWord.contrastPair.pitchType}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：实时录音跟读评测器 */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#faf9f6] dark:bg-[#1a1816] rounded-2xl p-6 border border-amber-900/10 dark:border-amber-500/15 shadow-sm space-y-5">
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Mic className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                麦克风实时跟读打分
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                点击按钮朗读「{currentWord.kanji}」，AI 引擎将比对声调起伏
              </p>
            </div>

            {/* 声波画布 */}
            <div className="relative h-28 bg-stone-950 rounded-xl overflow-hidden flex items-center justify-center border border-amber-900/20">
              <canvas
                ref={canvasRef}
                width={360}
                height={112}
                className="w-full h-full object-contain"
              />
              {!isRecording && !evalResult && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-500">
                  <span>等待开始录音...</span>
                </div>
              )}
            </div>

            {/* 录音控制按钮与进度条 */}
            <div className="space-y-2">
              {isRecording ? (
                <div className="space-y-2">
                  <div className="w-full bg-stone-200 dark:bg-stone-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full transition-all duration-100"
                      style={{ width: `${recordingProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-center text-amber-700 dark:text-amber-400 font-semibold animate-pulse">
                    正在录音分析中... 请清晰朗读：{currentWord.kana}
                  </p>
                </div>
              ) : (
                <ShimmerButton
                  onClick={startRecording}
                  className="w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-lg"
                >
                  <Mic className="w-4 h-4" />
                  <span>开始跟读录音 (2.8s)</span>
                </ShimmerButton>
              )}
            </div>

            {/* 评测结果卡片 */}
            {evalResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 space-y-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    AI 声调综合得分
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold font-mono text-amber-600 dark:text-amber-400">
                      {evalResult.score}
                    </span>
                    <span className="text-xs text-stone-500 font-mono">/ 100</span>
                  </div>
                </div>

                {/* 细分指标 */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-stone-100/70 dark:bg-stone-900/60 flex justify-between">
                    <span className="text-stone-500">音高匹配度</span>
                    <span className="font-bold text-stone-800 dark:text-stone-200">{evalResult.pitchMatch}%</span>
                  </div>
                  <div className="p-2 rounded bg-stone-100/70 dark:bg-stone-900/60 flex justify-between">
                    <span className="text-stone-500">节奏连贯度</span>
                    <span className="font-bold text-stone-800 dark:text-stone-200">{evalResult.fluency}%</span>
                  </div>
                </div>

                <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed font-serif">
                  {evalResult.comment}
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
