import { useState } from 'react';

import Button from '@/components/base/Button';

interface PasswordHandoffProps {
  readonly username: string;
  readonly password: string;
  readonly userpassMount: string;
  readonly onFinish: () => void;
}

export default function PasswordHandoff({
  username,
  password,
  userpassMount,
  onFinish,
}: PasswordHandoffProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState<'username' | 'password' | 'both' | null>(null);
  const copy = async (kind: 'username' | 'password' | 'both', value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
  };

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <i className="ri-check-line text-lg" aria-hidden="true" />
        </span>
        <div>
          <h4 className="text-sm font-semibold text-foreground-900">User created successfully</h4>
          <p className="mt-0.5 text-[11px] text-foreground-500">All required Vault operations completed.</p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3.5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-amber-900">One-time password handoff</p>
            <p className="mt-0.5 text-[10px] leading-4 text-amber-700">Leaving this dialog permanently removes the password from the UI state.</p>
          </div>
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800">Not stored</span>
        </div>

        <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
          <dt className="text-foreground-500">Auth path</dt>
          <dd className="font-mono text-foreground-700">auth/{userpassMount}</dd>
          <dt className="text-foreground-500">Username</dt>
          <dd className="font-mono font-medium text-foreground-800">{username}</dd>
          <dt className="self-center text-foreground-500">Password</dt>
          <dd className="flex min-w-0 items-center gap-1.5">
            <input
              aria-label="Created user password"
              type={visible ? 'text' : 'password'}
              readOnly
              value={password}
              className="h-8 min-w-0 flex-1 rounded-md border border-amber-300 bg-background-50 px-2.5 font-mono text-xs text-foreground-900 outline-none"
            />
            <button
              type="button"
              onClick={() => setVisible((current) => !current)}
              aria-label={visible ? 'Hide created password' : 'Show created password'}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-300 bg-background-50 text-foreground-500 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <i className={visible ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
            </button>
          </dd>
        </dl>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => copy('both', `Username: ${username}\nPassword: ${password}`)}>
            <i className="ri-file-copy-line" aria-hidden="true" /> {copied === 'both' ? 'Copied handoff' : 'Copy both'}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => copy('username', username)}>
            {copied === 'username' ? 'Username copied' : 'Copy username'}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => copy('password', password)}>
            {copied === 'password' ? 'Password copied' : 'Copy password'}
          </Button>
        </div>
      </div>

      <div className="flex justify-end border-t border-background-200 pt-4">
        <Button type="button" variant="primary" onClick={onFinish}>Done</Button>
      </div>
    </div>
  );
}
