import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy, Check, Home, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/badge.js';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * 显示模式：
   * - embedded: 嵌在工作台内部，发生异常时不破坏侧边栏与顶栏
   * - fullscreen: 全屏容灾，用于包裹根组件
   */
  variant?: 'embedded' | 'fullscreen';
  /** 发生错误时的自定义降级标题 */
  title?: string;
  /** 发生错误时的提示内容 */
  message?: string;
  /** 重试回调 */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      showDetails: false,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleCopyDetails = () => {
    const { error, errorInfo } = this.state;
    const diagnosticText = `Study Studio Error Diagnostic
Error: ${error?.name}: ${error?.message}
Stack: ${error?.stack || 'N/A'}
Component Stack: ${errorInfo?.componentStack || 'N/A'}
Timestamp: ${new Date().toISOString()}
UserAgent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(diagnosticText).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      });
    }
  };

  override render() {
    const { hasError, error, errorInfo, copied, showDetails } = this.state;
    const {
      children,
      variant = 'embedded',
      title = '工作区遇到了一点意外',
      message = '此模块在渲染过程中遇到了临时异常。您的个人学习数据与做题资产已安全保存，请尝试恢复。',
    } = this.props;

    if (!hasError) {
      return children;
    }

    const isFullscreen = variant === 'fullscreen';

    return (
      <div
        role="alert"
        aria-live="assertive"
        className={`flex items-center justify-center p-6 ${
          isFullscreen
            ? 'min-h-screen w-full bg-[#fbfaf8] dark:bg-[#141312] text-stone-800 dark:text-stone-200'
            : 'min-h-[22rem] w-full rounded-2xl border border-rose-200/80 dark:border-rose-900/40 bg-white/80 dark:bg-stone-900/60 backdrop-blur-md shadow-sm'
        }`}
      >
        <div className="max-w-lg w-full text-center space-y-4">
          {/* 异常警示徽章图标 */}
          <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/20 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <h3 className="text-lg font-bold font-serif text-stone-900 dark:text-stone-100">
                {title}
              </h3>
              <Badge variant="destructive" className="text-[10px]">
                {error?.name || 'Exception'}
              </Badge>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed px-4">
              {message}
            </p>
          </div>

          {/* 交互行动区 */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <Button
              variant="default"
              size="sm"
              onClick={this.handleReset}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>重新加载此区域</span>
            </Button>

            {isFullscreen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => (window.location.href = '/')}
                className="gap-1.5 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>返回主页</span>
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={this.handleCopyDetails}
              className="gap-1.5 text-stone-600 dark:text-stone-300 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">已复制诊断日志</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制错误日志</span>
                </>
              )}
            </Button>
          </div>

          {/* 可折叠的技术诊断详情 */}
          <div className="pt-2 text-left">
            <button
              type="button"
              onClick={() => this.setState({ showDetails: !showDetails })}
              className="text-[11px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 flex items-center gap-1 mx-auto cursor-pointer transition-colors"
            >
              {showDetails ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <span>{showDetails ? '收起技术详情' : '展开技术诊断详情'}</span>
            </button>

            {showDetails && (
              <div className="mt-2.5 p-3 rounded-xl bg-stone-100 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-[11px] font-mono text-stone-600 dark:text-stone-300 max-h-48 overflow-y-auto space-y-1.5 select-text">
                <div className="font-semibold text-rose-600 dark:text-rose-400">
                  {error?.toString()}
                </div>
                {error?.stack && (
                  <pre className="text-[10px] whitespace-pre-wrap text-stone-500 dark:text-stone-400">
                    {error.stack}
                  </pre>
                )}
                {errorInfo?.componentStack && (
                  <pre className="text-[10px] whitespace-pre-wrap text-stone-400 dark:text-stone-500 border-t border-stone-200 dark:border-stone-800 pt-1">
                    {errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
