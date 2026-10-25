import type { FormEvent } from 'react';

import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';

export interface UserpassFields {
  readonly username: string;
  readonly password: string;
}

interface UserpassLoginFormProps {
  readonly hidden: boolean;
  readonly authenticating: boolean;
  readonly onUnavailable: () => void;
  readonly onSubmit: (fields: UserpassFields) => Promise<void>;
}

/**
 * Uncontrolled so browser password managers can fill it natively; the
 * password never enters React state and is cleared after every attempt.
 */
export default function UserpassLoginForm({
  hidden,
  authenticating,
  onUnavailable,
  onSubmit,
}: UserpassLoginFormProps) {
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const usernameInput = event.currentTarget.elements.namedItem('username');
    const passwordInput = event.currentTarget.elements.namedItem('password');
    if (!(usernameInput instanceof HTMLInputElement) || !(passwordInput instanceof HTMLInputElement)) {
      onUnavailable();
      return;
    }
    try {
      await onSubmit({ username: usernameInput.value.trim(), password: passwordInput.value });
    } finally {
      passwordInput.value = '';
    }
  };

  return (
    <form
      id="userpass-panel"
      name="vault-userpass-login"
      method="post"
      autoComplete="on"
      role="tabpanel"
      aria-labelledby="userpass-tab"
      hidden={hidden}
      inert={hidden}
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3"
    >
      <Input
        id="userpass-username"
        name="username"
        label="Username"
        type="text"
        placeholder="ops-team"
        autoComplete="username"
        autoCapitalize="off"
        spellCheck={false}
        icon="ri-user-line"
        required
        autoFocus
      />
      <Input
        id="userpass-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        icon="ri-lock-line"
        required
      />
      <Button type="submit" variant="primary" className="mt-1 w-full" size="lg" loading={authenticating}>
        {!authenticating && <i className="ri-login-box-line text-sm" aria-hidden="true" />}
        Sign in
      </Button>
    </form>
  );
}
