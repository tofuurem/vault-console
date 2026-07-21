import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useVaultSession } from '@/application/vault/VaultSessionContext';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import type { VaultHealth } from '@/domain/vault/contracts';
import { normalizeVaultError, type VaultError } from '@/domain/vault/errors';

type AuthTab = 'token' | 'userpass';
type ConnectionStatus = 'idle' | 'checking' | 'ready' | 'sealed' | 'uninitialized' | 'unavailable';

const DEFAULT_VAULT_ADDRESS = import.meta.env.VITE_VAULT_ADDR || 'http://127.0.0.1:8200';

function normalizeServerUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid Vault address');
  }
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
  return url.toString().replace(/\/$/, '');
}

function serverErrorMessage(error: VaultError): string {
  if (error.code === 'unavailable') {
    return 'Vault could not be reached. Check the address, certificate, network, and CORS configuration.';
  }
  return error.message;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useVaultSession();
  const requestRef = useRef<AbortController | null>(null);
  const [authTab, setAuthTab] = useState<AuthTab>('token');
  const [serverUrl, setServerUrl] = useState(DEFAULT_VAULT_ADDRESS);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [health, setHealth] = useState<VaultHealth>();
  const [errorMessage, setErrorMessage] = useState(
    (location.state as { reason?: string } | null)?.reason === 'expired'
      ? 'Your Vault session expired. Sign in again.'
      : '',
  );
  const [serverError, setServerError] = useState('');
  const [token, setToken] = useState('');
  const [userpassPath, setUserpassPath] = useState('userpass');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => () => requestRef.current?.abort(), []);

  const beginRequest = () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    return controller;
  };

  const validatedServerUrl = (): string | null => {
    try {
      const normalized = normalizeServerUrl(serverUrl);
      setServerError('');
      return normalized;
    } catch {
      setServerError('Enter a complete HTTP or HTTPS Vault address.');
      return null;
    }
  };

  const checkConnection = async () => {
    const normalized = validatedServerUrl();
    if (!normalized) return;
    const controller = beginRequest();
    setConnectionStatus('checking');
    setErrorMessage('');
    setHealth(undefined);
    try {
      const result = await session.checkHealth(normalized, controller.signal);
      setHealth(result);
      if (!result.initialized) setConnectionStatus('uninitialized');
      else if (result.sealed) setConnectionStatus('sealed');
      else setConnectionStatus('ready');
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'aborted') return;
      setConnectionStatus('unavailable');
      setErrorMessage(serverErrorMessage(error));
    }
  };

  const handleTokenLogin = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = validatedServerUrl();
    if (!normalized) return;
    if (!token.trim()) {
      setErrorMessage('Enter a Vault token.');
      return;
    }
    const controller = beginRequest();
    setErrorMessage('');
    try {
      await session.signInWithToken(normalized, token.trim(), controller.signal);
      setToken('');
      navigate('/explorer', { replace: true });
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code !== 'aborted') setErrorMessage(serverErrorMessage(error));
      setToken('');
    }
  };

  const handleUserpassLogin = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = validatedServerUrl();
    if (!normalized) return;
    if (!userpassPath.trim() || !username.trim() || !password) {
      setErrorMessage('Enter the auth mount, username, and password.');
      return;
    }
    const controller = beginRequest();
    setErrorMessage('');
    try {
      await session.signInWithUserpass({
        serverUrl: normalized,
        mount: userpassPath.trim(),
        username: username.trim(),
        password,
      }, controller.signal);
      setPassword('');
      navigate('/explorer', { replace: true });
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code !== 'aborted') setErrorMessage(serverErrorMessage(error));
      setPassword('');
    }
  };

  const statusContent: Readonly<Record<Exclude<ConnectionStatus, 'idle'>, { dot: string; title: string }>> = {
    checking: { dot: 'bg-amber-400 animate-pulse', title: 'Checking Vault…' },
    ready: { dot: 'bg-emerald-500', title: health?.standby ? 'Connected to standby' : 'Vault is ready' },
    sealed: { dot: 'bg-amber-500', title: 'Vault is sealed' },
    uninitialized: { dot: 'bg-red-500', title: 'Vault is not initialized' },
    unavailable: { dot: 'bg-red-500', title: 'Vault is unavailable' },
  };
  const status = connectionStatus === 'idle' ? null : statusContent[connectionStatus];
  const isAuthenticating = session.status === 'authenticating';

  return (
    <main className="relative flex h-full items-center justify-center overflow-auto bg-background-100 px-4 py-8">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,oklch(var(--background-300)/.35)_1px,transparent_1px),linear-gradient(to_bottom,oklch(var(--background-300)/.35)_1px,transparent_1px)] [background-size:32px_32px]" />
      <section aria-labelledby="login-heading" className="relative w-full max-w-[430px] overflow-hidden rounded-xl border border-background-300 bg-background-50 shadow-[0_16px_50px_rgba(30,28,38,0.08)]">
        <header className="border-b border-background-200 px-6 pb-5 pt-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 text-background-50">
              <i className="ri-shield-keyhole-fill text-base" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-primary-600">Self-hosted control plane</p>
              <h1 id="login-heading" className="text-lg font-semibold tracking-tight text-foreground-900">Vault Console</h1>
            </div>
          </div>
          <p className="text-xs leading-5 text-foreground-500">Connect directly to your Vault Community server. Credentials stay in this tab's memory.</p>
        </header>

        <div className="border-b border-background-200 px-6 py-4">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Input
              id="vault-address"
              label="Vault server"
              type="url"
              value={serverUrl}
              onChange={(event) => {
                setServerUrl(event.target.value);
                setConnectionStatus('idle');
                setHealth(undefined);
                setServerError('');
              }}
              error={serverError}
              placeholder="https://vault.example.com:8200"
              monospace
              spellCheck={false}
            />
            <Button type="button" size="md" onClick={() => void checkConnection()} loading={connectionStatus === 'checking'}>
              Test
            </Button>
          </div>

          {status && (
            <div className="mt-2.5 flex items-center gap-2 text-[11px]" aria-live="polite">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
              <span className="font-medium text-foreground-700">{status.title}</span>
              {health?.version && <span className="font-mono text-foreground-400">v{health.version}</span>}
              {connectionStatus === 'ready' && (
                <span className="ml-auto text-foreground-400">{serverUrl.trim().startsWith('https://') ? 'TLS' : 'No TLS'}</span>
              )}
            </div>
          )}
        </div>

        <div role="tablist" aria-label="Authentication method" className="grid grid-cols-2 border-b border-background-200 bg-background-100/50 px-6 pt-2">
          <button
            id="token-tab"
            type="button"
            role="tab"
            aria-selected={authTab === 'token'}
            aria-controls="token-panel"
            onClick={() => { setAuthTab('token'); setErrorMessage(''); }}
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${authTab === 'token' ? 'border-primary-500 text-primary-700' : 'border-transparent text-foreground-500 hover:text-foreground-800'}`}
          >
            Token
          </button>
          <button
            id="userpass-tab"
            type="button"
            role="tab"
            aria-selected={authTab === 'userpass'}
            aria-controls="userpass-panel"
            onClick={() => { setAuthTab('userpass'); setErrorMessage(''); }}
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${authTab === 'userpass' ? 'border-primary-500 text-primary-700' : 'border-transparent text-foreground-500 hover:text-foreground-800'}`}
          >
            Username &amp; password
          </button>
        </div>

        <div className="p-6">
          {errorMessage && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
              <i className="ri-error-warning-line mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {authTab === 'token' ? (
            <form id="token-panel" role="tabpanel" aria-labelledby="token-tab" onSubmit={(event) => void handleTokenLogin(event)} className="space-y-4">
              <Input
                id="vault-token"
                label="Vault token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="hvs.xxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
                monospace
                icon="ri-key-2-line"
                autoFocus
              />
              <Button type="submit" variant="primary" className="w-full" size="lg" loading={isAuthenticating}>
                <i className="ri-login-box-line text-sm" aria-hidden="true" />
                Sign in
              </Button>
            </form>
          ) : (
            <form id="userpass-panel" role="tabpanel" aria-labelledby="userpass-tab" onSubmit={(event) => void handleUserpassLogin(event)} className="space-y-3">
              <Input
                id="userpass-mount"
                label="Auth mount path"
                value={userpassPath}
                onChange={(event) => setUserpassPath(event.target.value)}
                placeholder="userpass"
                autoComplete="off"
                monospace
                icon="ri-folder-3-line"
              />
              <Input
                id="userpass-username"
                label="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="ops-team"
                autoComplete="username"
                icon="ri-user-line"
                autoFocus
              />
              <Input
                id="userpass-password"
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                icon="ri-lock-line"
              />
              <Button type="submit" variant="primary" className="mt-1 w-full" size="lg" loading={isAuthenticating}>
                <i className="ri-login-box-line text-sm" aria-hidden="true" />
                Sign in
              </Button>
            </form>
          )}
        </div>

        <footer className="flex items-center justify-center gap-2 border-t border-background-200 bg-background-100 px-6 py-3 text-[10px] text-foreground-400">
          <i className="ri-shield-check-line text-emerald-600" aria-hidden="true" />
          Tokens and passwords are never written to browser storage
        </footer>
      </section>
    </main>
  );
}
