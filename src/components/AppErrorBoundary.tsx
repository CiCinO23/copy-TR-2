import React from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitleAr?: string;
  onReset?: () => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: null,
    };
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : 'خطأ عارض في عرض البيانات';
    return {
      hasError: true,
      errorMessage: msg,
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.warn('Recovered from UI render error:', error, info?.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: null });
    this.props.onReset?.();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          data-testid="app_error_recovery_card"
          className="bg-[#12171D] border border-[#01BC8D]/40 rounded-2xl p-5 my-4 text-right space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0D2B24] border border-[#01BC8D]/40 flex items-center justify-center text-[#01BC8D] shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {this.props.fallbackTitleAr ||
                    'تمت حماية التطبيق من خطأ عارض دون إغلاق الحسابات أو الصفقات'}
                </h3>
                <p className="text-xs text-[#8A99AD] mt-0.5">
                  جميع صفقاتك وحساباتك الافتراضية والمزامنة في الخلفية مستمرة بأمان.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-3.5 py-2 rounded-xl bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>متابعة العرض فوراً</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
