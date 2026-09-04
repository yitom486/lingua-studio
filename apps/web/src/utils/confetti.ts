import confetti from 'canvas-confetti';

/**
 * 触发日常任务达成彩带庆祝效果
 */
export function fireTaskCompletedConfetti() {
  confetti({
    particleCount: 60,
    spread: 65,
    origin: { y: 0.7 },
    colors: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#f97316'],
    disableForReducedMotion: true,
  });
}

/**
 * 触发“超额连刷 / 状态极佳”金色微光彩带粒子爆破
 */
export function fireGoldenBurstConfetti() {
  const count = 100;
  const defaults = {
    origin: { y: 0.65 },
    disableForReducedMotion: true,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.3, {
    spread: 40,
    startVelocity: 45,
    colors: ['#ffd700', '#f59e0b', '#fbbf24'],
  });

  fire(0.25, {
    spread: 75,
    colors: ['#fef08a', '#ffd700', '#ea580c'],
  });

  fire(0.2, {
    spread: 100,
    decay: 0.92,
    scalar: 1.1,
    colors: ['#fbbf24', '#f59e0b', '#ffffff'],
  });
}
