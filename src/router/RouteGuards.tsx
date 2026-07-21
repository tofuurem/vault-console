import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useVaultSession } from '@/application/vault/VaultSessionContext';

export function HomeRoute() {
  const { status } = useVaultSession();
  return <Navigate to={status === 'authenticated' ? '/explorer' : '/login'} replace />;
}

export function LoginRoute({ children }: { readonly children: ReactNode }) {
  const { status } = useVaultSession();
  if (status === 'authenticated') return <Navigate to="/explorer" replace />;
  return children;
}

interface RequireSessionProps {
  readonly children: ReactNode;
  readonly accessControl?: boolean;
}

export function RequireSession({ children, accessControl = false }: RequireSessionProps) {
  const { status, canManageAccess } = useVaultSession();
  const location = useLocation();

  if (status !== 'authenticated') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ reason: status === 'expired' ? 'expired' : 'required', from: location.pathname }}
      />
    );
  }
  if (accessControl && !canManageAccess) {
    return <Navigate to="/explorer" replace state={{ notice: 'access-control-denied' }} />;
  }
  return children;
}
