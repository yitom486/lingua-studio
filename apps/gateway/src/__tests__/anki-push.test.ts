import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { isOk } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../infrastructure/drizzle-learner-repository.js';
import {
  createAnkiClient,
  getAnkiVersion,
  ensureAnkiDeck,
  ensureAnkiModel,
  storeAnkiMedia,
  addAnkiNote,
} from '../modules/flashcards/application/anki-connect.js';
import { resolveAnkiEndpoint } from '../modules/flashcards/persistence/anki-settings.js';
import { FlashcardsAnkiPushTool } from '../modules/flashcards/tools/flashcards-anki-push-tool.js';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

type AnkiHandler = (params: Record<string, unknown>) => unknown;

/** AnkiConnect 桩：按 action 分发；/audio/speech 走 TTS 合成桩。 */
function makeStub(log: string[], handlers: Record<string, AnkiHandler>): typeof fetch {
  const impl = async (url: unknown, init?: { body?: unknown }): Promise<Response> => {
    const u = String(url);
    if (u.includes('/audio/speech')) {
      log.push('TTS:synthesize');
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      action: string;
      params: Record<string, unknown>;
    };
    log.push(`anki:${body.action}`);
    const handler = handlers[body.action];
    if (!handler) return jsonResponse({ result: null, error: `unknown action ${body.action}` });
    return jsonResponse({ result: handler(body.params), error: null });
  };
  return impl as typeof fetch;
}

describe('anki-connect transport', () => {
  it('version 正常返回', async () => {
    const log: string[] = [];
    const client = createAnkiClient(undefined, makeStub(log, { version: () => 6 }));
    const res = await getAnkiVersion(client);
    expect(isOk(res)).toBe(true);
    if (isOk(res)) expect(res.value).toBe(6);
  });

  it('连不上（抛错/非200）收敛为 E_ANKI_UNREACHABLE（可重试）', async () => {
    const throwing = (() => {
      throw new Error('refused');
    }) as unknown as typeof fetch;
    const r1 = await getAnkiVersion(createAnkiClient(undefined, throwing));
    expect(isOk(r1)).toBe(false);
    if (!isOk(r1)) {
      expect(r1.error.code).toBe('E_ANKI_UNREACHABLE');
      expect(r1.error.retryable).toBe(true);
    }
    const bad = (async () => new Response('x', { status: 502 })) as unknown as typeof fetch;
    const r2 = await getAnkiVersion(createAnkiClient(undefined, bad));
    expect(isOk(r2)).toBe(false);
  });

  it('Anki duplicate 映射为 E_ANKI_DUPLICATE；其他错误带动作名', async () => {
    const log: string[] = [];
    const dup = makeStub(log, {});
    const dupFetch = (async () =>
      jsonResponse({ result: null, error: 'cannot create note because it is a duplicate' })) as unknown as typeof fetch;
    void dup;
    const r1 = await addAnkiNote(createAnkiClient(undefined, dupFetch), {
      deckName: 'D',
      modelName: 'M',
      fields: {},
      tags: [],
    });
    expect(isOk(r1)).toBe(false);
    if (!isOk(r1)) expect(r1.error.code).toBe('E_ANKI_DUPLICATE');
    const other = (async () =>
      jsonResponse({ result: null, error: 'boom' })) as unknown as typeof fetch;
    const r2 = await addAnkiNote(createAnkiClient(undefined, other), {
      deckName: 'D',
      modelName: 'M',
      fields: {},
      tags: [],
    });
    expect(isOk(r2)).toBe(false);
    if (!isOk(r2)) expect(r2.error.userMessage).toContain('addNote');
  });

  it('endpoint 仅放行本机回环（SSRF 守卫）', () => {
    expect(() => resolveAnkiEndpoint('http://example.com:8765')).toThrow();
    expect(() => resolveAnkiEndpoint('ftp://127.0.0.1/x')).toThrow();
    expect(resolveAnkiEndpoint(undefined)).toBe('http://127.0.0.1:8765');
    expect(resolveAnkiEndpoint('http://localhost:8765/')).toBe('http://localhost:8765');
  });

  it('牌组/模型已存在则跳过创建；缺失则按我方模板创建', async () => {
    const log: string[] = [];
    let createdModel: unknown;
    const stub = makeStub(log, {
      deckNames: () => ['Lingua Studio'],
      modelNames: () => [],
      createModel: (p) => {
        createdModel = p;
        return null;
      },
    });
    const client = createAnkiClient(undefined, stub);
    const d = await ensureAnkiDeck(client, 'Lingua Studio');
    expect(isOk(d)).toBe(true);
    expect(log.includes('anki:createDeck')).toBe(false);
    const m = await ensureAnkiModel(client, {
      modelName: 'Lingua Basic',
      fields: ['Expression', 'Meaning'],
      css: '.card {}',
      front: 'F',
      back: 'B',
    });
    expect(isOk(m)).toBe(true);
    expect(log.includes('anki:createModel')).toBe(true);
    const spec = createdModel as { inOrderFields: string[]; cardTemplates: Array<{ Front: string }> };
    expect(spec.inOrderFields).toEqual(['Expression', 'Meaning']);
    expect(spec.cardTemplates[0]?.Front).toBe('F');
  });

  it('媒体文件名白名单（路径穿越拒绝且不发请求）', async () => {
    const log: string[] = [];
    const client = createAnkiClient(undefined, makeStub(log, { storeMediaFile: () => 'x' }));
    const res = await storeAnkiMedia(client, '../evil.mp3', 'AAA=');
    expect(isOk(res)).toBe(false);
    expect(log.length).toBe(0);
  });
});

describe('anki settings', () => {
  let repo: DrizzleLearnerRepository;
  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  it('默认关闭；开关可写；非法端点拒绝', async () => {
    expect(await repo.getAnkiPushSettings()).toEqual({
      enabled: false,
      endpoint: 'http://127.0.0.1:8765',
    });
    const saved = await repo.saveAnkiPushSettings({ enabled: true });
    expect(isOk(saved)).toBe(true);
    expect((await repo.getAnkiPushSettings()).enabled).toBe(true);
    const bad = await repo.saveAnkiPushSettings({ endpoint: 'http://example.com/' });
    expect(isOk(bad)).toBe(false);
  });
});

function seedCard(repo: DrizzleLearnerRepository, row: { id: string; sourceEntryId?: string }) {
  repo
    .getRawDb()
    .prepare(
      `INSERT INTO flashcards (id, user_id, language, type, front, back, phonetic, audio_url, source_entry_id, tags, fsrs)
       VALUES (?, 'default_user', 'ja', 'VOCABULARY', '食べる', 'to eat', 'たべる', NULL, ?, '[]', '{}')`
    )
    .run(row.id, row.sourceEntryId ?? null);
}

function seedEntry(repo: DrizzleLearnerRepository) {
  repo
    .getRawDb()
    .prepare(
      `INSERT INTO local_dictionary_entries (id, language, headword, reading, romanization, meanings_json, pronunciation_json, part_of_speech, source_id, source_label, license_note, created_at)
       VALUES ('entry-1', 'ja', '食べる', 'たべる', NULL, '["to eat"]', '{"pitch":{"reading":"たべる","positions":[0],"label":"⓪"}}', '動詞', 'seed', 'seed', 'seed', '2026-09-07')`
    )
    .run();
}

describe('pushCardToAnki', () => {
  let repo: DrizzleLearnerRepository;
  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
  });

  it('未启用直接拒绝（不碰网络）', async () => {
    seedCard(repo, { id: 'card-0' });
    const res = await repo.pushCardToAnki({ userId: 'default_user', cardId: 'card-0' });
    expect(isOk(res)).toBe(false);
    if (!isOk(res)) expect(res.error.code).toBe('E_ANKI_DISABLED');
  });

  it('未知卡片/他人卡片拒绝（未启用检查之后、网络之前）', async () => {
    await repo.saveAnkiPushSettings({ enabled: true });
    const res = await repo.pushCardToAnki({ userId: 'default_user', cardId: 'missing' });
    expect(isOk(res)).toBe(false);
    if (!isOk(res)) expect(res.error.code).toBe('E_NOT_FOUND');
  });
});

describe('pushCardToAnki end-to-end (stub AnkiConnect over loopback HTTP)', () => {
  let repo: DrizzleLearnerRepository;
  const calls: string[] = [];
  let noteFields: Record<string, string> | undefined;
  let mediaFiles: Array<{ filename: string; data: string }> = [];
  let server: ReturnType<typeof Bun.serve> | undefined;

  beforeEach(() => {
    repo = new DrizzleLearnerRepository(':memory:');
    calls.length = 0;
    noteFields = undefined;
    mediaFiles = [];
  });

  function startStub(extra: { failVersion?: boolean } = {}) {
    server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname === '/tts') {
          calls.push('TTS:synthesize');
          return new Response(new Uint8Array([1, 2, 3, 4]), {
            headers: { 'Content-Type': 'audio/mpeg' },
          });
        }
        const body = (await req.json()) as { action: string; params: Record<string, unknown> };
        calls.push(`anki:${body.action}`);
        if (extra.failVersion && body.action === 'version') {
          return new Response('down', { status: 502 });
        }
        const okResult = (result: unknown) =>
          Response.json({ result, error: null });
        switch (body.action) {
          case 'version':
            return okResult(6);
          case 'deckNames':
            return okResult([]);
          case 'createDeck':
            return okResult(1);
          case 'modelNames':
            return okResult([]);
          case 'createModel':
            return okResult(null);
          case 'storeMediaFile': {
            const p = body.params as { filename: string; data: string };
            mediaFiles.push({ filename: p.filename, data: p.data });
            return okResult(p.filename);
          }
          case 'addNote': {
            const note = (body.params as { note: { fields: Record<string, string> } }).note;
            noteFields = note.fields;
            return okResult(42);
          }
          default:
            return okResult(null);
        }
      },
    });
    return `http://127.0.0.1:${server.port}`;
  }

  afterEach(() => {
    server?.stop(true);
    server = undefined;
  });

  // bun:test 的 afterEach 需显式导入
  it('全链路（无 TTS）：建牌组建模型 addNote，音频留空并明说', async () => {
    const endpoint = startStub();
    await repo.saveAnkiPushSettings({ enabled: true, endpoint });
    seedCard(repo, { id: 'card-1' });
    const res = await repo.pushCardToAnki({ userId: 'default_user', cardId: 'card-1' });
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.noteId).toBe(42);
    expect(res.value.deckName).toBe('Lingua Studio');
    expect(res.value.modelName).toBe('Lingua Basic');
    expect(res.value.audioStored).toBe(false);
    expect(res.value.audioSkippedReason).toContain('TTS');
    expect(calls).toContain('anki:createDeck');
    expect(calls).toContain('anki:createModel');
    expect(noteFields?.['Expression']).toBe('食べる');
    expect(noteFields?.['Audio']).toBeUndefined();
  });

  it('来源词条 enrichment + TTS 音频入库 [sound:]', async () => {
    const endpoint = startStub();
    await repo.saveAnkiPushSettings({ enabled: true, endpoint });
    seedEntry(repo);
    seedCard(repo, { id: 'card-2', sourceEntryId: 'entry-1' });
    const res = await repo.pushCardToAnki({
      userId: 'default_user',
      cardId: 'card-2',
      tts: { provider: 'openai-compatible', baseUrl: `${endpoint}/tts` },
    });
    expect(isOk(res)).toBe(true);
    if (!isOk(res)) return;
    expect(res.value.audioStored).toBe(true);
    expect(res.value.audioSkippedReason).toBeUndefined();
    expect(calls).toContain('TTS:synthesize');
    expect(mediaFiles.length).toBe(1);
    expect(mediaFiles[0]?.filename).toMatch(/^ss-card2\.mp3$/);
    expect(noteFields?.['Reading']).toBe('たべる');
    expect(noteFields?.['Meaning']).toContain('to eat');
    expect(noteFields?.['Audio']).toBe(`[sound:${mediaFiles[0]?.filename}]`);
    // 声调阶梯图随 Pitch 字段推送
    expect(noteFields?.['Pitch']).toContain('⓪');
    expect(noteFields?.['Pitch']).toContain('<svg');
  });

  it('Anki 未打开 → E_ANKI_UNREACHABLE（可重试中文错）', async () => {
    const endpoint = startStub({ failVersion: true });
    await repo.saveAnkiPushSettings({ enabled: true, endpoint });
    seedCard(repo, { id: 'card-3' });
    const res = await repo.pushCardToAnki({ userId: 'default_user', cardId: 'card-3' });
    expect(isOk(res)).toBe(false);
    if (isOk(res)) return;
    expect(res.error.code).toBe('E_ANKI_UNREACHABLE');
    expect(res.error.retryable).toBe(true);
    expect(res.error.userMessage).toContain('AnkiConnect');
  });
});

describe('FlashcardsAnkiPushTool', () => {
  it('未启用时友好拒绝（不碰网络）', async () => {
    const repo = new DrizzleLearnerRepository(':memory:');
    const tool = new FlashcardsAnkiPushTool(repo);
    expect(tool.name).toBe('flashcards.anki_push');
    const res = await tool.execute(
      { userId: 'default_user', cardId: 'card-x' },
      { userId: 'default_user', sessionId: 's1' }
    );
    expect(isOk(res)).toBe(false);
    if (!isOk(res)) expect(res.error.code).toBe('E_ANKI_DISABLED');
  });
});
