import {
  Component,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useVaultSession } from '@/application/vault/VaultSessionContext';
import {
  createSafeDiagnostic,
  serializeSafeDiagnostic,
} from './safe-diagnostic';

interface RenderBoundaryProps {
  readonly children: ReactNode;
  readonly resetKey: string;
  readonly fallback: (error: unknown, reset: () => void) => ReactNode;
}

interface RenderBoundaryState {
  readonly error?: unknown;
}

class RenderBoundary extends Component<RenderBoundaryProps, RenderBoundaryState> {
  state: RenderBoundaryState = {};

  static getDerivedStateFromError(error: unknown): RenderBoundaryState {
    return { error };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    // Diagnostics are intentionally user-mediated and never written to console or telemetry.
  }

  componentDidUpdate(previousProps: RenderBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: undefined });
    }
  }

  private readonly reset = () => this.setState({ error: undefined });

  render() {
    return this.state.error
      ? this.props.fallback(this.state.error, this.reset)
      : this.props.children;
  }
}

function RecoveryPanel({
  error,
  reset,
}: {
  readonly error: unknown;
  readonly reset: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const vault = useVaultSession();
  const [copyStatus, setCopyStatus] = useState('');
  const diagnostic = createSafeDiagnostic(error, location.pathname, {
    buildVersion: import.meta.env.VITE_APP_VERSION || 'development',
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serializeSafeDiagnostic(diagnostic));
      setCopyStatus('Safe diagnostics copied');
    } catch {
      setCopyStatus('Clipboard unavailable');
    }
  };
  const returnToExplorer = () => {
    reset();
    navigate('/explorer', { replace: true });
  };
  const signOut = () => {
    vault.signOut();
    reset();
    navigate('/login', { replace: true });
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-full items-center justify-center bg-background-100 p-5">
      <section role="alert" aria-labelledby="application-error-title" className="w-full max-w-xl rounded-xl border border-red-200 bg-background-50 p-5 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
          <i className="ri-error-warning-line text-xl" aria-hidden="true" />
        </div>
        <h1 id="application-error-title" className="mt-4 text-base font-semibold text-foreground-900">This screen stopped unexpectedly</h1>
        <p className="mt-1 text-sm leading-6 text-foreground-600">Your Vault session is still available. Retry this screen, return to Explorer, or sign out safely.</p>
        <p className="mt-3 rounded-md bg-background-100 px-3 py-2 font-mono text-[11px] text-foreground-500">Reference: {diagnostic.errorCode} · {diagnostic.route}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="h-8 rounded-md bg-primary-500 px-3 text-xs font-medium text-background-50 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">Retry screen</button>
          <button type="button" onClick={returnToExplorer} className="h-8 rounded-md border border-background-300 px-3 text-xs font-medium text-foreground-700 hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">Return to Explorer</button>
          <button type="button" onClick={() => void copy()} className="h-8 rounded-md border border-background-300 px-3 text-xs font-medium text-foreground-700 hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">Copy safe diagnostics</button>
          <button type="button" onClick={signOut} className="h-8 rounded-md px-3 text-xs font-medium text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">Sign out</button>
        </div>
        <p role="status" aria-live="polite" className="mt-3 min-h-4 text-xs text-foreground-500">{copyStatus}</p>
      </section>
    </main>
  );
}

export default function ApplicationErrorBoundary({ children }: { readonly children: ReactNode }) {
  const location = useLocation();
  return (
    <RenderBoundary
      resetKey={location.key}
      fallback={(error, reset) => <RecoveryPanel error={error} reset={reset} />}
    >
      {children}
    </RenderBoundary>
  );
}
