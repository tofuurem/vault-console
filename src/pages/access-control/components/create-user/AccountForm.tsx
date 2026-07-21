import { useState, type ChangeEvent } from 'react';

import Button from '@/components/base/Button';
import { assessPassword } from '@/domain/access-control/password';
import type { VaultAuthMount } from '@/domain/vault/contracts';
import { validateAccount, type AccountDraft } from './account';

interface AccountFormProps {
  readonly value: AccountDraft;
  readonly onChange: (next: AccountDraft) => void;
  readonly onRegeneratePassword: () => void;
  readonly userpassMounts: readonly VaultAuthMount[];
  readonly showErrors?: boolean;
}

export default function AccountForm({
  value,
  onChange,
  onRegeneratePassword,
  userpassMounts,
  showErrors = false,
}: AccountFormProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const validation = showErrors ? validateAccount(value) : {};
  const strength = assessPassword(value.password);
  const update = (field: keyof AccountDraft) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const nextValue = field === 'username' ? event.target.value.toLowerCase() : event.target.value;
    onChange({ ...value, [field]: nextValue });
  };

  return (
    <section aria-labelledby="account-heading" className="mx-auto w-full max-w-3xl px-6 py-7">
      <div className="mb-6">
        <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">
          Authentication
        </p>
        <h2 id="account-heading" className="text-base font-semibold text-foreground-900">
          Create the account
        </h2>
        <p className="mt-1 text-xs leading-5 text-foreground-500">
          Vault will create a userpass login and link it to an identity entity.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-background-300 bg-background-50">
        <div className="flex items-center justify-between border-b border-background-200 bg-background-100/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-background-300 bg-background-50 text-foreground-500">
              <i className="ri-key-2-line text-sm" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground-800">Username & password</p>
              <p className="text-[11px] text-foreground-400">Userpass · Community compatible</p>
            </div>
          </div>
          <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            Enabled
          </span>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="create-user-username" className="mb-1.5 block text-xs font-medium text-foreground-700">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                id="create-user-username"
                value={value.username}
                onChange={update('username')}
                autoComplete="off"
                spellCheck={false}
                placeholder="alice.johnson"
                aria-invalid={Boolean(validation.username)}
                aria-describedby={validation.username ? 'create-user-username-error' : 'create-user-username-help'}
                className={`h-9 w-full rounded-md border bg-background-50 px-3 font-mono text-sm text-foreground-900 outline-none transition focus:ring-2 focus:ring-primary-200 ${
                  validation.username ? 'border-red-400 focus:border-red-400' : 'border-background-300 focus:border-primary-400'
                }`}
              />
              <p id={validation.username ? 'create-user-username-error' : 'create-user-username-help'} className={`mt-1 text-[11px] ${validation.username ? 'text-red-600' : 'text-foreground-400'}`}>
                {validation.username ?? 'Vault stores userpass usernames in lowercase.'}
              </p>
            </div>

            <div>
              <label htmlFor="create-user-display-name" className="mb-1.5 block text-xs font-medium text-foreground-700">
                Display name <span className="font-normal text-foreground-400">optional</span>
              </label>
              <input
                id="create-user-display-name"
                value={value.displayName}
                onChange={update('displayName')}
                autoComplete="off"
                placeholder="Alice Johnson"
                className="h-9 w-full rounded-md border border-background-300 bg-background-50 px-3 text-sm text-foreground-900 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
              />
              <p className="mt-1 text-[11px] text-foreground-400">Used as the identity entity label.</p>
            </div>
          </div>

          <div>
            <label htmlFor="create-user-mount" className="mb-1.5 block text-xs font-medium text-foreground-700">
              Userpass mount <span className="text-red-500">*</span>
            </label>
            <div className="flex max-w-md items-center rounded-md border border-background-300 bg-background-50 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-200">
              <span className="border-r border-background-200 px-2.5 font-mono text-xs text-foreground-400">auth/</span>
              <select
                id="create-user-mount"
                value={value.userpassMount}
                onChange={update('userpassMount')}
                aria-invalid={Boolean(validation.userpassMount)}
                className="h-9 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-sm text-foreground-900 outline-none"
              >
                {userpassMounts.map((mount) => (
                  <option key={mount.path} value={mount.path}>{mount.path}</option>
                ))}
              </select>
            </div>
            {userpassMounts.length === 0 && <p className="mt-1 text-[11px] text-amber-700">No enabled userpass auth mount is visible to this token.</p>}
            {validation.userpassMount && <p className="mt-1 text-[11px] text-red-600">{validation.userpassMount}</p>}
          </div>

          <div className="border-t border-background-200 pt-5">
            <div className="mb-2 flex items-end justify-between gap-4">
              <div>
                <label htmlFor="create-user-password" className="block text-xs font-medium text-foreground-700">
                  Initial password <span className="text-red-500">*</span>
                </label>
                <p className="mt-0.5 text-[11px] text-foreground-400">Kept in memory until the one-time handoff.</p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">{strength.label}</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <input
                  id="create-user-password"
                  type={passwordVisible ? 'text' : 'password'}
                  value={value.password}
                  onChange={update('password')}
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-invalid={Boolean(validation.password)}
                  className={`h-9 w-full rounded-md border bg-background-50 px-3 pr-10 font-mono text-sm text-foreground-900 outline-none transition focus:ring-2 focus:ring-primary-200 ${
                    validation.password ? 'border-red-400 focus:border-red-400' : 'border-background-300 focus:border-primary-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  <i className={passwordVisible ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
                </button>
              </div>
              <Button type="button" variant="secondary" onClick={onRegeneratePassword} className="h-9">
                <i className="ri-refresh-line" aria-hidden="true" /> Regenerate
              </Button>
            </div>
            {validation.password && <p className="mt-1 text-[11px] text-red-600">{validation.password}</p>}
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background-200" aria-hidden="true">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(strength.score / 6) * 100}%` }} />
              </div>
              <span className="font-mono text-[10px] text-foreground-400">{value.password.length} chars</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
