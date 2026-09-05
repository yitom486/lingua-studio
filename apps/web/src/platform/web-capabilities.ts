import type { DownloadPayload, PlatformCapabilities } from './capabilities.js';

/**
 * 浏览器平台能力实现：直接使用 Web API（Blob 下载、window.open、navigator.clipboard）。
 * 在 Tauri WebView 中这些 API 同样可用，故 Tauri 实现失败时也回退到这里。
 */
export class WebPlatformCapabilities implements PlatformCapabilities {
  readonly environment = 'web' as const;

  isDesktop(): boolean {
    return false;
  }

  getUserAgent(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    return navigator.userAgent || 'unknown';
  }

  async downloadFile(payload: DownloadPayload): Promise<void> {
    if (typeof document === 'undefined') {
      throw new Error('downloadFile 不可用：当前环境无 DOM。');
    }
    const blob = new Blob([payload.content], {
      type: payload.mimeType ?? 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.filename;
      a.rel = 'noopener';
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async openExternalUrl(url: string): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('openExternalUrl 不可用：当前环境无 window。');
    }
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      // 弹窗被拦截时回退到 location 跳转（仍优于静默失败）
      window.location.href = url;
    }
  }

  async clipboardWriteText(text: string): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      throw new Error('clipboardWriteText 不可用：当前环境无剪贴板 API。');
    }
    await navigator.clipboard.writeText(text);
  }
}
