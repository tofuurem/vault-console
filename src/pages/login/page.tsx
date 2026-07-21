import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import type { VaultConnection } from '@/mocks/vault';
import { vaultConnection, restrictedConnection } from '@/mocks/vault';

export default function LoginPage() {
  const navigate = useNavigate();
  const [authTab, setAuthTab] = useState<'token' | 'userpass'>('token');
  const [serverUrl, setServerUrl] = useState('https://vault.internal.prod:8200');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [vaultSealed, setVaultSealed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [token, setToken] = useState('');
  const [rememberToken, setRememberToken] = useState(false);

  const [userpassPath, setUserpassPath] = useState('userpass');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const checkConnection = () => {
    setConnectionStatus('checking');
    setErrorMsg('');
    setTimeout(() => {
      setConnectionStatus('connected');
      setVaultSealed(false);
    }, 800);
  };

  const handleTokenLogin = (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setErrorMsg('Token is required');
      return;
    }
    setErrorMsg('');
    navigate('/explorer', { state: { isRestricted: false } });
  };

  const handleUserpassLogin = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Username and password are required');
      return;
    }
    setErrorMsg('');

    if (username === 'dev-readonly') {
      navigate('/explorer', { state: { isRestricted: true } });
    } else {
      navigate('/explorer', { state: { isRestricted: false } });
    }
  };

  const statusColors = {
    idle: 'bg-background-300',
    checking: 'bg-amber-400 animate-pulse',
    connected: 'bg-emerald-500',
    error: 'bg-red-500',
  };

  return (
    <div className="h-full flex items-center justify-center bg-background-100">
      <div className="w-[400px] bg-background-50 rounded-lg border border-background-300 overflow-hidden">
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="w-10 h-10 mx-auto mb-3 flex items-center justify-center rounded-lg bg-primary-500">
            <i className="ri-shield-keyhole-fill text-background-50 text-lg" />
          </div>
          <h1 className="text-lg font-semibold text-foreground-900">Vault Console</h1>
          <p className="text-xs text-foreground-500 mt-1">Connect to a self-hosted Vault server</p>
        </div>

        <div className="px-6 pb-4">
          <div className="flex items-center gap-2 text-xs">
            <label className="font-medium text-foreground-700 shrink-0">Server</label>
            <div className="flex-1 flex items-center gap-1.5">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => { setServerUrl(e.target.value); setConnectionStatus('idle'); }}
                  className="w-full h-7 px-2 text-xs font-mono rounded border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-primary-400"
                />
              </div>
              <button
                onClick={checkConnection}
                disabled={connectionStatus === 'checking'}
                className="h-7 px-2.5 text-xs rounded-md bg-background-100 text-foreground-600 hover:bg-background-200 border border-background-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                {connectionStatus === 'checking' ? 'Checking...' : 'Test'}
              </button>
            </div>
          </div>

          {connectionStatus !== 'idle' && (
            <div className="mt-2 flex items-center gap-3 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${statusColors[connectionStatus]}`} />
                <span className="text-foreground-600">
                  {connectionStatus === 'checking' && 'Connecting...'}
                  {connectionStatus === 'connected' && 'Connected'}
                  {connectionStatus === 'error' && 'Connection failed'}
                </span>
              </div>
              {connectionStatus === 'connected' && (
                <>
                  <span className="text-foreground-400">|</span>
                  <span className="text-foreground-500">TLS: Verified</span>
                  <span className="text-foreground-400">|</span>
                  <span className="text-emerald-600 font-medium">Unsealed</span>
                </>
              )}
            </div>
          )}

          {vaultSealed && (
            <div className="mt-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
              <i className="ri-alert-line text-sm" />
              Vault is sealed. Unseal it before authenticating.
            </div>
          )}
        </div>

        <div className="border-t border-background-200">
          <div className="flex border-b border-background-200">
            <button
              onClick={() => { setAuthTab('token'); setErrorMsg(''); }}
              className={`flex-1 py-2 text-xs font-medium cursor-pointer transition-colors ${
                authTab === 'token'
                  ? 'text-primary-600 border-b-2 border-primary-500'
                  : 'text-foreground-500 hover:text-foreground-700'
              }`}
            >
              Token
            </button>
            <button
              onClick={() => { setAuthTab('userpass'); setErrorMsg(''); }}
              className={`flex-1 py-2 text-xs font-medium cursor-pointer transition-colors ${
                authTab === 'userpass'
                  ? 'text-primary-600 border-b-2 border-primary-500'
                  : 'text-foreground-500 hover:text-foreground-700'
              }`}
            >
              Username &amp; Password
            </button>
          </div>

          <div className="p-6">
            {errorMsg && (
              <div className="mb-4 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <i className="ri-error-warning-line text-sm shrink-0" />
                {errorMsg}
              </div>
            )}

            {authTab === 'token' && (
              <form onSubmit={handleTokenLogin} className="space-y-4">
                <Input
                  label="Vault Token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="hvs.xxxxxxxxxxxxxxxxxxxx"
                  monospace
                  icon="ri-key-2-line"
                  autoFocus
                />
                <label className="flex items-center gap-2 text-xs text-foreground-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberToken}
                    onChange={(e) => setRememberToken(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-background-300 text-primary-500 focus:ring-primary-400 cursor-pointer"
                  />
                  Remember for this browser session
                </label>
                <Button type="submit" variant="primary" className="w-full" size="md">
                  <i className="ri-login-box-line text-sm" />
                  Sign in
                </Button>
              </form>
            )}

            {authTab === 'userpass' && (
              <form onSubmit={handleUserpassLogin} className="space-y-3">
                <Input
                  label="Auth mount path"
                  value={userpassPath}
                  onChange={(e) => setUserpassPath(e.target.value)}
                  placeholder="userpass"
                  monospace
                  icon="ri-folder-3-line"
                />
                <Input
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ops-team"
                  icon="ri-user-line"
                  autoFocus
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="············"
                  icon="ri-lock-line"
                />
                <Button type="submit" variant="primary" className="w-full" size="md">
                  <i className="ri-login-box-line text-sm" />
                  Sign in
                </Button>
              </form>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-background-200 bg-background-100 text-[10px] text-foreground-400 text-center">
          Connection is encrypted with TLS · Credentials are never stored
        </div>
      </div>
    </div>
  );
}
