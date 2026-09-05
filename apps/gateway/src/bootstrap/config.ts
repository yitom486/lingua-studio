import path from 'node:path';

/**
 * 网关启动配置（G2）：环境变量与稳定资源路径集中在此。
 * 注意 import.meta.dir 以本文件为准（src/bootstrap/），向上四级到仓库根。
 */
export const isTestEnv = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';

const rootDbFile = path.resolve(import.meta.dir, '../../../..', 'study-studio.db');
const defaultDbPath = isTestEnv ? ':memory:' : rootDbFile;

/** SQLite 文件路径：STUDY_STUDIO_DB 优先，测试环境默认内存库 */
export const dbPath = process.env.STUDY_STUDIO_DB || defaultDbPath;

/** 监听端口：GATEWAY_PORT，默认 8080 */
export const PORT = Number(process.env.GATEWAY_PORT || 8080);
