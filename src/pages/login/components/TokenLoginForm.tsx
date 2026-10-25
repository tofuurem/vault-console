import { useState, type FormEvent } from 'react';

import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';

interface TokenLoginFormProps {
  readonly authenticating: boolean;
  readonly onSubmit: (token: string) => Promise<void>;
}

export default function TokenLoginForm({ authenticating, onSubmit }: TokenLoginFormProps) {
  const [token, setToken] = useState('');
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSubmit(token.trim());
    } finally {
      setToken('');
    }
  };
  return (
    <form
      id="token-panel"
      name="vault-token-login"
      autoComplete="off"
      role="tabpanel"
      aria-labelledby="token-tab"
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-4"
    >
      <Input
        id="vault-token"
        name="vault-token"
        label="Vault token"
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="hvs.xxxxxxxxxxxxxxxxxxxx"
        autoComplete="off"
        spellCheck={false}
        monospace
        icon="ri-key-2-line"
        autoFocus
      />
      <Button type="submit" variant="primary" className="w-full" size="lg" loading={authenticating}>
        {!authenticating && <i className="ri-login-box-line text-sm" aria-hidden="true" />}
        Sign in
      </Button>
    </form>
  );
}
