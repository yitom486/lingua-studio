import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { isOk, BusinessError } from '@study-studio/shared';
import { formatBusinessErrorResponse } from '../../../errors/http-error-handler.js';
import {
  installDictionaryPackage,
  listDictionaryPackages,
} from '../../../services/dictionary-packages.js';
import type { GatewayDeps } from '../../../transport/http/gateway-deps.js';

// 词典安装任务表：进程级单例（随模块常驻，不随请求重建），G2 迁移时原样搬入本域。
const dictionaryInstallTasks = new Map<string, ReturnType<typeof installDictionaryPackage>>();

/** 词典域路由（G2：由 index.ts 链式注册迁移而来，行为不变）。 */
export function createDictionaryRoutes(deps: GatewayDeps) {
  return new Hono()
  // 词典包默认不预装；客户端可先查询状态，再由用户显式触发一次下载与 SQLite 导入。
  .get('/api/dictionary/packages', (c) =>
    c.json({ packages: listDictionaryPackages(deps.repo.getRawDb()) })
  )
  .post('/api/dictionary/packages/:packageId/install', async (c) => {
    const packageId = c.req.param('packageId');
    let task = dictionaryInstallTasks.get(packageId);
    if (!task) {
      task = installDictionaryPackage(deps.repo.getRawDb(), packageId);
      dictionaryInstallTasks.set(packageId, task);
      void task.finally(() => dictionaryInstallTasks.delete(packageId));
    }

    const result = await task;
    if (isOk(result)) return c.json(result.value);
    return formatBusinessErrorResponse(c, result.error, 'dictionaryPackageInstall');
  })
  // 本地词典优先；仅在日语本地未命中时提供 OJAD 外链，不代理或抓取 OJAD。
  .get('/api/dictionary/:language', async (c) => {
    const result = await deps.server.toolRegistry.execute(
      'dictionary.lookup',
      {
        language: c.req.param('language'),
        query: c.req.query('q') ?? '',
      },
      { userId: 'dictionary_http', sessionId: 'dictionary_http' }
    );
    if (!isOk(result)) {
      return formatBusinessErrorResponse(c, result.error, 'dictionaryLookup');
    }
    return c.json(result.value);
  })
  // 将公共词典资产收集为用户自己的 FSRS 生词卡；Web、桌面端与未来 Agent Tool 共用。
  .post('/api/vocabulary/:userId/entries/:entryId/collect', async (c) => {
    const result = await deps.repo.collectDictionaryEntry(
      c.req.param('userId'),
      c.req.param('entryId')
    );
    if (isOk(result)) return c.json(result.value);
    return formatBusinessErrorResponse(c, result.error, 'collectDictionaryEntry');
  })
  // 1. 学习者全景画像与打卡进度
;
}
