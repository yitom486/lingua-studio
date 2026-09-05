import type { DownloadPayload, PlatformCapabilities } from './capabilities.js';
import { WebPlatformCapabilities } from './web-capabilities.js';

/**
 * Tauri 桌面壳平台能力实现。
 *
 * 优先经 `window.__TAURI__.core.invoke` 调用桌面壳注册的 Rust 命令：
 *   - `platform_open_external_url`  { url: string }
 *   - `platform_clipboard_write_text` { text: string }
 *   - `platform_save_text_file`       { filename, content, mimeType }
 * 任意 invoke 不可用或失败时，平滑回退到 Web 实现（Tauri WebView 同样支持这些 Web API）。
 *
 * 桌面壳命令由 `apps/desktop/src-tauri` 注册（P4-B 后续步骤），未落地前以 Web 回退运行，
 * 因此本实现可先在 Web 构建中安全存在（detectTauri 为 false 时不会被实例化）。
 */
export class TauriPlatformCapabilities implements PlatformCapabilities {
  readonly environment = 'tauri' as const;
  private readonly fallback = new WebPlatformCapabilities();

  isDesktop(): boolean {
    return true;
  }

  getUserAgent(): string {
    return this.fallback.getUserAgent();
  }

  async downloadFile(payload: DownloadPayload): Promise<void> {
    try {
      await tauriInvoke('platform_save_text_file', {
        filename: payload.filename,
        content: payload.content,
        mimeType: payload.mimeType ?? 'application/octet-stream',
      });
    } catch {
      await this.fallback.downloadFile(payload);
    }
  }

  async openExternalUrl(url: string): Promise<void> {
    try {
      await tauriInvoke('platform_open_external_url', { url });
    } catch {
      await this.fallback.openExternalUrl(url);
    }
  }

  async clipboardWriteText(text: string): Promise<void> {
    try {
      await tauriInvoke('platform_clipboard_write_text', { text });
    } catch {
      await this.fallback.clipboardWriteText(text);
    }
  }
}

/** 调用 Tauri 全局 invoke；未注入时抛错以触发回退。 */
function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Tauri invoke 不可用：无 window'));
  }
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
  };
  const invoke = w.__TAURI__?.core?.invoke;
  if (typeof invoke !== 'function') {
    return Promise.reject(new Error('Tauri invoke 不可用：未注入 __TAURI__.core.invoke'));
  }
  return invoke(cmd, args);
}
