import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback; a readable default is shown otherwise. */
  fallback?: ReactNode;
  label?: string;
}

interface State {
  error: string | null;
}

/**
 * Low-end devices are the target here, so a GPU/WebGL failure must degrade to a
 * readable panel — never a white screen that hides the user's lab values.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the diagnostic visible in the console without crashing the page.
    console.error(`[Diagnosix] ${this.props.label ?? 'component'} failed:`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error && this.props.fallback) return this.props.fallback;
    if (this.state.error) {
      return (
        <div className="h-full w-full flex items-center justify-center p-4">
          <div className="max-w-sm text-center space-y-2">
            <p className="text-sm text-amber-300">
              This visualisation could not start on this device.
            </p>
            <p className="text-[11px] text-slate-500 font-mono break-words">{this.state.error}</p>
            <p className="text-[11px] text-slate-500">
              Your values and symptoms are unaffected — they are still listed below.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
