/**
 * Target Language UI Shell §7 手测脚本（可对 localhost:8080 实机验收）
 * 运行：bun apps/gateway/scripts/shell-acceptance.mjs
 */
import { getLearningShellConfig, resolveGuardTab } from '../../web/src/learning/learning-shell.ts';
import { findStudyGoalOption } from '../../web/src/config/learner-profile-options.ts';
import { SIDEBAR_NAV_GROUPS } from '../../web/src/config/sidebar-nav.ts';

const GATEWAY = process.env.GATEWAY_BASE_URL || 'http://localhost:8080';
const USER = process.env.ACCEPT_USER_ID || 'student_web_01';

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function json(method, path, body) {
  const res = await fetch(`${GATEWAY}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function visibleNavTabs(track) {
  const shell = getLearningShellConfig(track);
  const tabs = [];
  for (const g of SIDEBAR_NAV_GROUPS) {
    for (const item of g.items) {
      if (item.tracks && !item.tracks.includes(track)) continue;
      if (!shell.allowedTabs.includes(item.id)) continue;
      tabs.push(item.id);
    }
  }
  return tabs;
}

function wouldGuardTab(track, activeTab) {
  return resolveGuardTab(track, activeTab);
}

async function main() {
  console.log(`\n=== Shell §7 手测 @ ${GATEWAY} user=${USER} ===\n`);

  // --- 静态壳层不变量（不依赖服务） ---
  {
    const goal = findStudyGoalOption('KAOYAN_EN');
    if (goal?.lang === 'en') pass('KAOYAN_EN → lang=en', goal.label);
    else fail('KAOYAN_EN → lang=en', String(goal));

    const en = getLearningShellConfig('en');
    if (!en.allowedTabs.includes('KANA') && !en.allowedTabs.includes('PITCH')) {
      pass('EN 壳层不允许 KANA/PITCH');
    } else fail('EN 壳层不允许 KANA/PITCH', en.allowedTabs.join(','));

    const enNav = visibleNavTabs('en');
    if (!enNav.includes('KANA') && !enNav.includes('PITCH')) {
      pass('EN 侧栏过滤后无 KANA/PITCH', enNav.join(','));
    } else fail('EN 侧栏过滤后无 KANA/PITCH', enNav.join(','));

    if (en.defaultReadingLang === 'EN' && en.featureFlags.englishNewsMultiSource) {
      pass('阅读默认 EN + 英语多源新闻开关');
    } else fail('阅读默认 EN', JSON.stringify(en.copy));

    const ja = getLearningShellConfig('ja');
    if (ja.allowedTabs.includes('KANA') && ja.allowedTabs.includes('PITCH')) {
      pass('JA 壳层恢复五十音/声调');
    } else fail('JA 壳层恢复五十音/声调', ja.allowedTabs.join(','));

    if (wouldGuardTab('en', 'KANA') === 'QUIZ') {
      pass('EN 下非法 Tab KANA → fallback QUIZ');
    } else fail('EN Tab 守卫', wouldGuardTab('en', 'KANA'));

    const ko = getLearningShellConfig('ko');
    if (ko.allowedTabs.includes('HANGUL') && ko.featureFlags.hangulStudio) {
      pass('KO 壳层开放谚文工作室');
    } else fail('KO 壳层开放谚文工作室', ko.allowedTabs.join(','));

    if (wouldGuardTab('en', 'HANGUL') === 'QUIZ' && wouldGuardTab('ko', 'HANGUL') === 'HANGUL') {
      pass('HANGUL 守卫：EN→QUIZ，KO 保留');
    } else fail('HANGUL Tab 守卫', `${wouldGuardTab('en', 'HANGUL')}/${wouldGuardTab('ko', 'HANGUL')}`);

    if (wouldGuardTab('ko', 'WRITING') === 'READING') {
      pass('KO 下非法 Tab WRITING → fallback READING');
    } else fail('KO Tab 守卫', wouldGuardTab('ko', 'WRITING'));
  }

  // --- 健康检查 ---
  const health = await json('GET', '/api/health');
  if (health.status === 200) pass('Gateway /api/health', String(health.status));
  else {
    fail('Gateway /api/health', `${health.status}`);
    summarize();
    process.exit(1);
  }

  // 保存原始档案以便还原
  const before = await json('GET', `/api/profile/${USER}`);
  const original = before.data;
  if (before.status !== 200 || !original) {
    fail('读取原始 profile', `${before.status}`);
    summarize();
    process.exit(1);
  }
  pass('读取原始 profile', `goal=${original.studyGoal || '?'} lang=${original.targetLanguage}`);

  try {
    // 1) 保存 KAOYAN_EN
    const saveEn = await json('POST', `/api/profile/${USER}`, {
      studyGoal: 'KAOYAN_EN',
      targetLanguage: 'en',
      learnerLevel: original.learnerLevel || 'BEGINNER',
      overallLevel: original.overallLevel || 'B1',
      displayName: original.displayName || '学习者',
      dailyGoalQuizzes: original.dailyGoalQuizzes ?? 5,
      dailyGoalCards: original.dailyGoalCards ?? 10,
    });
    if (saveEn.status === 200 && saveEn.data?.targetLanguage === 'en') {
      pass('保存 KAOYAN_EN → targetLanguage=en', saveEn.data.studyGoal);
    } else {
      fail(
        '保存 KAOYAN_EN → targetLanguage=en',
        `${saveEn.status} ${JSON.stringify(saveEn.data)?.slice(0, 200)}`
      );
    }

    const snapEn = await json('GET', `/api/profile/${USER}?lang=en`);
    const metricsEn = snapEn.data?.allMetrics || snapEn.data?.weaknesses || [];
    const jpLeakEn = (Array.isArray(metricsEn) ? metricsEn : []).filter((m) =>
      String(m.id || m.skillId || '').startsWith('jp.')
    );
    // 雷达前端也会再 filter；服务端快照若仍含 jp 记为警告项
    if (jpLeakEn.length === 0) {
      pass('EN 档案快照无 jp.* 技能', `metrics=${metricsEn.length}`);
    } else {
      fail('EN 档案快照无 jp.* 技能', `leaked=${jpLeakEn.map((m) => m.id || m.skillId).join(',')}`);
    }

    const qEn = await json('GET', `/api/questions/${USER}?lang=en`);
    const questionsEn = Array.isArray(qEn.data) ? qEn.data : qEn.data?.questions || [];
    const enHasJpSkill = questionsEn.some((q) =>
      String(q.testedSkill || q.testedSkillId || '').startsWith('jp.')
    );
    if (qEn.status === 200 && !enHasJpSkill) {
      pass('EN 题库无 jp.* 考查点', `count=${questionsEn.length}`);
    } else {
      fail('EN 题库无 jp.* 考查点', `status=${qEn.status} leak=${enHasJpSkill}`);
    }

    // 2) 切回 JLPT_N2
    const saveJa = await json('POST', `/api/profile/${USER}`, {
      studyGoal: 'JLPT_N2',
      targetLanguage: 'ja',
      learnerLevel: original.learnerLevel || 'BEGINNER',
      overallLevel: 'N2',
      displayName: original.displayName || '学习者',
      dailyGoalQuizzes: original.dailyGoalQuizzes ?? 5,
      dailyGoalCards: original.dailyGoalCards ?? 10,
    });
    if (saveJa.status === 200 && saveJa.data?.targetLanguage === 'ja') {
      pass('切回 JLPT_N2 → targetLanguage=ja', saveJa.data.studyGoal);
    } else {
      fail('切回 JLPT_N2 → targetLanguage=ja', `${saveJa.status}`);
    }

    const qJa = await json('GET', `/api/questions/${USER}?lang=ja`);
    const questionsJa = Array.isArray(qJa.data) ? qJa.data : qJa.data?.questions || [];
    const jaHasEnSkill = questionsJa.some((q) =>
      String(q.testedSkill || q.testedSkillId || '').startsWith('en.')
    );
    if (qJa.status === 200 && !jaHasEnSkill) {
      pass('JA 题库无 en.* 考查点', `count=${questionsJa.length}`);
    } else {
      fail('JA 题库无 en.* 考查点', `status=${qJa.status} leak=${jaHasEnSkill}`);
    }

    // 阅读默认文案（静态）+ 新闻话题接口
    const topics = await json('GET', '/api/reading/news-topics');
    if (topics.status === 200) {
      pass('新闻栏目接口可用', `topics=${Array.isArray(topics.data) ? topics.data.length : '?'}`);
    } else fail('新闻栏目接口可用', `${topics.status}`);

    // 厂商 SDK 扫描已在本脚本外用 rg；此处记录壳层 copy toast 线索
    const enShell = getLearningShellConfig('en');
    if (
      enShell.copy.readingEmptyHint.includes('外媒') ||
      enShell.copy.readingEmptyHint.includes('英语')
    ) {
      pass('EN 阅读空态文案提及英语媒体向');
    } else fail('EN 阅读空态文案', enShell.copy.readingEmptyHint);
  } finally {
    // 还原档案
    if (original) {
      await json('POST', `/api/profile/${USER}`, {
        studyGoal: original.studyGoal || original.profile?.studyGoal || 'JLPT_N2',
        targetLanguage: original.targetLanguage || original.profile?.targetLanguage || 'ja',
        learnerLevel:
          original.learnerLevel || original.profile?.learnerLevel || 'BEGINNER',
        overallLevel: original.overallLevel || original.profile?.overallLevel || 'N3',
        displayName: original.displayName || original.profile?.displayName || '学习者',
        dailyGoalQuizzes:
          original.dailyGoalQuizzes ?? original.profile?.dailyGoalQuizzes ?? 5,
        dailyGoalCards: original.dailyGoalCards ?? original.profile?.dailyGoalCards ?? 10,
      });
      pass(
        '已还原原始 profile',
        `${original.studyGoal || original.profile?.studyGoal}/${original.targetLanguage}`
      );
    }
  }

  summarize();
}

function summarize() {
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n=== 汇总：${ok} pass / ${bad} fail / ${results.length} total ===\n`);
  if (bad > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
