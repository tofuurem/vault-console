import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useRuntimeConfig } from '@/application/config/RuntimeConfigContext';
import { initialVaultServerUrl, requestedVaultServerUrl } from '@/application/config/runtime-config';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import CenteredPanelLayout from '@/components/base/CenteredPanelLayout';
import { normalizeVaultError } from '@/domain/vault/errors';
import { postLoginDestination } from '@/router/post-login-destination';
import AdvancedConnectionSettings from './components/AdvancedConnectionSettings';
import AuthMethodTabs, { type AuthTab } from './components/AuthMethodTabs';
import ConnectionStatusBar from './components/ConnectionStatusBar';
import TokenLoginForm from './components/TokenLoginForm';
import UserpassLoginForm, { type UserpassFields } from './components/UserpassLoginForm';
import { serverErrorMessage, useVaultConnection } from './useVaultConnection';

const SIGN_IN_NOTICES: Readonly<Record<string, string>> = {
  expired: 'Your Vault session expired. Sign in again.',
  revoked: 'Token revoked. Sign in with another Vault token or userpass account.',
};

function initialNotice(state: unknown): string {
  const reason = (state as { reason?: unknown } | null)?.reason;
  return typeof reason === 'string' ? SIGN_IN_NOTICES[reason] ?? '' : '';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const runtimeConfig = useRuntimeConfig();
  const session = useVaultSession();
  const [authTab, setAuthTab] = useState<AuthTab>('userpass');
  const [errorMessage, setErrorMessage] = useState(() => initialNotice(location.state));
  const [userpassPath, setUserpassPath] = useState(runtimeConfig.userpassMount);
  const connection = useVaultConnection({
    initialServerUrl: initialVaultServerUrl(runtimeConfig, requestedVaultServerUrl(location.state)),
    checkOnMount: !runtimeConfig.allowCustomVaultAddress,
    checkHealth: session.checkHealth,
    onError: setErrorMessage,
  });
  const destination = postLoginDestination(location.state);
  const authenticating = session.status === 'authenticating';

  const signIn = async (authenticate: (serverUrl: string, signal: AbortSignal) => Promise<void>) => {
    const normalized = connection.validatedServerUrl();
    if (!normalized) return;
    const controller = connection.beginRequest();
    setErrorMessage('');
    try {
      await authenticate(normalized, controller.signal);
      navigate(destination, { replace: true });
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code !== 'aborted') setErrorMessage(serverErrorMessage(error));
    }
  };

  const signInWithToken = async (token: string) => {
    if (!token) {
      setErrorMessage('Enter a Vault token.');
      return;
    }
    await signIn((serverUrl, signal) => session.signInWithToken(serverUrl, token, signal));
  };

  const signInWithUserpass = async ({ username, password }: UserpassFields) => {
    if (!userpassPath.trim() || !username || !password) {
      setErrorMessage(runtimeConfig.allowCustomUserpassMount
        ? 'Enter the auth mount, username, and password.'
        : 'Enter the username and password.');
      return;
    }
    await signIn((serverUrl, signal) => session.signInWithUserpass({
      serverUrl,
      mount: userpassPath.trim(),
      username,
      password,
    }, signal));
  };

  const selectAuthTab = (tab: AuthTab) => {
    setAuthTab(tab);
    setErrorMessage('');
  };

  return (
    <CenteredPanelLayout labelledBy="login-heading">
      <header className="border-b border-background-200 px-6 pb-5 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 text-background-50">
            <i className="ri-shield-keyhole-fill text-base" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-primary-600">Self-hosted control plane</p>
            <h1 id="login-heading" className="text-lg font-semibold tracking-tight text-foreground-900">Vault Console</h1>
          </div>
        </div>
        <p className="text-xs leading-5 text-foreground-500">Sign in directly to the Vault server configured for this console. The session token stays scoped to this tab; the console never stores your password.</p>
      </header>

      <AdvancedConnectionSettings
        showAddress={runtimeConfig.allowCustomVaultAddress}
        showMount={runtimeConfig.allowCustomUserpassMount && authTab === 'userpass'}
        serverUrl={connection.serverUrl}
        serverError={connection.serverError}
        checking={connection.status === 'checking'}
        userpassPath={userpassPath}
        onServerUrlChange={connection.setServerUrl}
        onTest={() => void connection.checkConnection()}
        onUserpassPathChange={setUserpassPath}
      />

      <ConnectionStatusBar status={connection.status} health={connection.health} serverUrl={connection.serverUrl} />

      <AuthMethodTabs selected={authTab} onSelect={selectAuthTab} />

      <div className="p-6">
        {errorMessage && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-700">
            <i className="ri-error-warning-line mt-0.5 shrink-0 text-sm" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        <UserpassLoginForm
          hidden={authTab !== 'userpass'}
          authenticating={authenticating}
          onUnavailable={() => setErrorMessage('The userpass login form is unavailable. Reload the page and try again.')}
          onSubmit={signInWithUserpass}
        />
        {authTab === 'token' && (
          <TokenLoginForm authenticating={authenticating} onSubmit={signInWithToken} />
        )}
      </div>

      <footer className="flex items-center justify-center gap-2 border-t border-background-200 bg-background-100 px-6 py-3 text-[11px] text-foreground-500">
        <i className="ri-shield-check-line text-success-600" aria-hidden="true" />
        {session.sessionPersistenceAvailable
          ? 'Token stays in this tab; password storage follows your browser settings'
          : 'Session restore is unavailable; credentials remain in memory only'}
      </footer>
    </CenteredPanelLayout>
  );
}
