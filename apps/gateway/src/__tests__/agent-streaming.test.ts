import { describe, it, expect, beforeEach } from 'bun:test';
import { GatewayServer } from '../runtime/gateway-runtime.js';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';
import { WsEventTypes, type WsEnvelope } from '@study-studio/protocol';
import { isOk } from '@study-studio/shared';
import { LearningContentTool } from '../transport/tools/learning-content-tool.js';
import { LearningAssessTool } from '../modules/practice/tools/learning-assess-tool.js';

describe('AI Native Agent Streaming & Parameterized Tools', () => {
  let server: GatewayServer;
  let repo: DrizzleLearnerRepository;

  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
    server = new GatewayServer(repo);
  });

  it('should stream agent turn with AGENT_TURN_START, AGENT_TEXT_DELTA, and AGENT_TURN_COMPLETED', async () => {
    const emittedEvents: WsEnvelope[] = [];
    const envelope: WsEnvelope = {
      version: '1.0',
      id: 'env_stream_test',
      sessionId: 'sess_user_test',
      type: WsEventTypes.CLIENT_TURN_SEND,
      payload: {
        userId: 'student_web_01',
        input: '请给我几个关于助词的例句',
        intent: 'EXPLAIN',
        contextSnapshot: {
          targetLanguage: 'ja',
          focus: {
            kind: 'QUESTION',
            surface: '助词「に」与「で」',
            skillTag: 'jp.particle.ni_vs_de',
          },
        },
      },
      timestamp: Date.now(),
    };

    const res = await server.handleClientMessage(envelope, (evt) => {
      emittedEvents.push(evt);
    });

    expect(isOk(res)).toBe(true);

    // 验证事件流序列
    const types = emittedEvents.map((e) => e.type);
    expect(types).toContain(WsEventTypes.AGENT_TURN_START);
    expect(types).toContain(WsEventTypes.AGENT_TEXT_DELTA);
    expect(types).toContain(WsEventTypes.AGENT_TURN_COMPLETED);

    // 验证 Delta 文本流非空
    const deltas = emittedEvents.filter((e) => e.type === WsEventTypes.AGENT_TEXT_DELTA);
    expect(deltas.length).toBeGreaterThan(1);
    const accumulatedText = deltas.map((d) => (d.payload as any).delta).join('');
    expect(accumulatedText).toContain('例句');

    // 验证最终完成事件
    const completeEvt = emittedEvents.find((e) => e.type === WsEventTypes.AGENT_TURN_COMPLETED);
    expect(completeEvt).toBeDefined();
    expect((completeEvt?.payload as any).status).toBe('COMPLETED');
    expect((completeEvt?.payload as any).finalOutput).toBe(accumulatedText);
    expect((completeEvt?.payload as any).codexOutcome).toBe('not_requested');
  });

  it('should allow CLIENT_TURN_INTERRUPT to halt streaming generation', async () => {
    const emittedEvents: WsEnvelope[] = [];
    const sessionId = 'sess_interrupt_test';

    const envelope: WsEnvelope = {
      version: '1.0',
      id: 'env_interrupt_test',
      sessionId,
      type: WsEventTypes.CLIENT_TURN_SEND,
      payload: {
        userId: 'student_web_01',
        input: '请详细讲透这个语法点的所有考点辨析和规则',
      },
      timestamp: Date.now(),
    };

    // 启动流式，并在第一次收到 delta 后立即发起打断
    const handlePromise = server.handleClientMessage(envelope, (evt) => {
      emittedEvents.push(evt);
      if (evt.type === WsEventTypes.AGENT_TEXT_DELTA && emittedEvents.length === 2) {
        // 立即触发打断
        void server.handleClientMessage({
          version: '1.0',
          id: 'env_interrupt_call',
          sessionId,
          type: WsEventTypes.CLIENT_TURN_INTERRUPT,
          payload: {},
          timestamp: Date.now(),
        });
      }
    });

    const res = await handlePromise;
    expect(isOk(res)).toBe(true);

    // 验证流被中止并且状态为 INTERRUPTED
    const completeEvt = emittedEvents.find(
      (e) => e.type === WsEventTypes.AGENT_TURN_COMPLETED && (e.payload as any).status === 'INTERRUPTED'
    );
    expect(completeEvt).toBeDefined();
  });

  it('should execute learning.content tool with parameterized actions', async () => {
    const tool = server.toolRegistry.get('learning.content') as LearningContentTool;
    expect(tool).toBeDefined();

    // 1. generate_quiz
    const quizRes = await tool.execute(
      {
        action: 'generate_quiz',
        count: 2,
        difficulty: 3,
        skillIds: ['jp.particle.ni_vs_de'],
        language: 'ja',
      },
      { userId: 'student_web_01', sessionId: 's1' }
    );
    expect(isOk(quizRes)).toBe(true);
    if (isOk(quizRes)) {
      expect(quizRes.value.questions).toHaveLength(2);
      expect(quizRes.value.questions?.[0]?.testedSkillId).toBe('jp.particle.ni_vs_de');
    }

    // 2. explain
    const explainRes = await tool.execute(
      {
        action: 'explain',
        topic: '格助词辨析',
        language: 'ja',
      },
      { userId: 'student_web_01', sessionId: 's1' }
    );
    expect(isOk(explainRes)).toBe(true);
    if (isOk(explainRes)) {
      expect(explainRes.value.explanation).toBeDefined();
      expect(explainRes.value.explanation?.rules.length).toBeGreaterThan(0);
      expect(explainRes.value.explanation?.mnemonicTip).toBeDefined();
    }

    // 3. example_set
    const exampleRes = await tool.execute(
      {
        action: 'example_set',
        topic: '助词',
        language: 'ja',
      },
      { userId: 'student_web_01', sessionId: 's1' }
    );
    expect(isOk(exampleRes)).toBe(true);
    if (isOk(exampleRes)) {
      expect(exampleRes.value.examples?.length).toBe(3);
    }
  });

  it('should execute learning.assess tool for objective matching and subjective diagnosis', async () => {
    const tool = server.toolRegistry.get('learning.assess') as LearningAssessTool;
    expect(tool).toBeDefined();

    // 1. 精确匹配
    const exactRes = await tool.execute(
      {
        prompt: '选择助词',
        standardAnswer: 'で',
        userSubmission: 'で',
        testedSkillId: 'jp.particle.ni_vs_de',
      },
      { userId: 'student_web_01', sessionId: 's1' }
    );
    expect(isOk(exactRes)).toBe(true);
    if (isOk(exactRes) && !('results' in exactRes.value)) {
      expect(exactRes.value.isCorrect).toBe(true);
      expect(exactRes.value.score).toBe(100);
      expect(exactRes.value.mistakeDetected).toBe(false);
    }

    // 2. 负迁移混淆诊断 (例如输入 'に' 对应正解 'で')
    const diagRes = await tool.execute(
      {
        prompt: '选择场所助词',
        standardAnswer: 'で',
        userSubmission: 'に',
        testedSkillId: 'jp.particle.ni_vs_de',
      },
      { userId: 'student_web_01', sessionId: 's1' }
    );
    expect(isOk(diagRes)).toBe(true);
    if (isOk(diagRes) && !('results' in diagRes.value)) {
      expect(diagRes.value.isCorrect).toBe(false);
      expect(diagRes.value.mistakeDetected).toBe(true);
      expect(diagRes.value.grammarFeedback).toContain('归着点');
      expect(diagRes.value.negativeTransferTag).toBe('PARTICLE_NI_INSTEAD_OF_DE');
    }
  });
});
