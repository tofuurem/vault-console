import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useVaultSession } from '@/application/vault/VaultSessionContext';

function RestoringSession() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-busy="true"
      className="flex h-full items-center justify-center bg-background-100"
    >
      <div className="text-center text-xs text-foreground-500">
        <i className="ri-loader-4-line animate-spin text-lg text-primary-500" aria-hidden="true" />
        <p className="mt-2">Restoring Vault session…</p>
      </div>
    </main>
  );
}

export function HomeRoute() {
  const { status } = useVaultSession();
  if (status === 'restoring') return <RestoringSession />;
  return <Navigate to={status === 'authenticated' ? '/explorer' : '/login'} replace />;
}

export function LoginRoute({ children }: { readonly children: ReactNode }) {
  const { status } = useVaultSession();
  if (status === 'restoring') return <RestoringSession />;
  if (status === 'authenticated') return <Navigate to="/explorer" replace />;
  return children;
}

interface RequireSessionProps {
  readonly children: ReactNode;
  readonly accessControl?: boolean;
}

export function RequireSession({ children, accessControl = false }: RequireSessionProps) {
  const { status, accessControlPermission } = useVaultSession();
  const location = useLocation();

  if (status === 'restoring') return <RestoringSession />;
  if (status !== 'authenticated') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ reason: status === 'expired' ? 'expired' : 'required', from: location.pathname }}
      />
    );
  }
  if (accessControl && accessControlPermission.state === 'denied') {
    return <Navigate to="/explorer" replace state={{ notice: 'access-control-denied' }} />;
  }
  return children;
}
