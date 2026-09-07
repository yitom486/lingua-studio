import { homedir } from 'node:os';
import path from 'node:path';

/**
 * 应用数据目录解析（基础设施，无领域依赖）。
 * STUDY_STUDIO_RUNTIME_DIR 覆盖；缺省用户主目录 ~/.study-studio。
 */
export function defaultAppDataDir(): string {
  return path.join(homedir(), '.study-studio');
}

/** 运行时构件目录（OCR/PDFium/ORT/媒体），默认 ~/.study-studio/runtime，不过包。 */
export function defaultRuntimeDir(): string {
  const override = process.env.STUDY_STUDIO_RUNTIME_DIR;
  if (override && override.trim()) return override.trim();
  return path.join(defaultAppDataDir(), 'runtime');
}

/** 用户媒体库目录（词典/Anki 图片音频落盘；SQLite 只存路径与哈希）。 */
export function defaultMediaDir(runtimeDir?: string): string {
  return path.join(runtimeDir ?? defaultRuntimeDir(), 'media');
}
