import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useTheme } from '@/application/theme/ThemeContext';
import type { VaultSessionRenewalState } from '@/application/vault/VaultSessionContext';
import type { VaultSession } from '@/domain/vault/contracts';

const MENU_ITEM = 'flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-xs focus-visible:bg-background-100 focus-visible:outline-none sm:min-h-8';

const RENEWAL_LABELS: Readonly<Record<VaultSessionRenewalState['status'], string>> = {
  succeeded: 'Last renewal succeeded',
  failed: 'Last renewal failed',
  renewing: 'Renewing now',
  idle: 'Not renewed in this session',
};

const APPEARANCE_OPTIONS = [
  ['system', 'ri-computer-line', 'System'],
  ['light', 'ri-sun-line', 'Light'],
  ['dark', 'ri-moon-line', 'Dark'],
] as const;

export interface SessionMenuProps {
  readonly session: VaultSession;
  readonly identity: string;
  readonly remainingLabel: string;
  readonly renewal: VaultSessionRenewalState;
  readonly onRenewSession?: () => Promise<void>;
  readonly autoRenew?: boolean;
  readonly onAutoRenewChange?: (enabled: boolean) => void;
  readonly onRequestRevoke?: () => void;
  readonly onRequestSeal?: () => void;
  readonly onClearNavigationData?: () => void;
  readonly onSignOut: () => void;
}

function DetailRow({ label, children, mono = false }: {
  readonly label: string;
  readonly children: ReactNode;
  readonly mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-foreground-500">{label}</dt>
      <dd className={`min-w-0 truncate text-right font-medium text-foreground-800 ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

function SessionDetails({ session, identity, remainingLabel, renewal }: Pick<
  SessionMenuProps,
  'session' | 'identity' | 'remainingLabel' | 'renewal'
>) {
  return (
    <div className="border-b border-background-200 px-3 py-2">
      <div className="truncate text-xs font-medium text-foreground-900">{identity}</div>
      <dl className="mt-2 space-y-1 text-[11px]">
        <DetailRow label="Authentication">{session.authMethod}</DetailRow>
        <DetailRow label="Vault address" mono><span title={session.serverUrl}>{session.serverUrl}</span></DetailRow>
        <DetailRow label="Expires">{remainingLabel}</DetailRow>
        <DetailRow label="Renewable">{session.renewable === true ? 'Yes' : 'No'}</DetailRow>
        <DetailRow label="Renewal">{RENEWAL_LABELS[renewal.status]}</DetailRow>
      </dl>
      {renewal.status === 'succeeded' && (
        <p className="mt-1 text-[11px] font-medium text-success-700">
          Session renewed with Vault&apos;s returned TTL.
        </p>
      )}
      {renewal.status === 'failed' && (
        <p className="mt-1 text-[11px] font-medium text-danger-700" role="alert">
          Renewal failed; this session remains active until expiry.
        </p>
      )}
    </div>
  );
}

function AppearancePicker() {
  const theme = useTheme();
  return (
    <fieldset className="border-b border-background-200 px-3 py-2">
      <legend className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-500">
        Appearance
      </legend>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Appearance">
        {APPEARANCE_OPTIONS.map(([preference, icon, label]) => (
          <button
            key={preference}
            type="button"
            role="radio"
            aria-checked={theme.preference === preference}
            onClick={() => theme.setPreference(preference)}
            className={`flex h-11 items-center justify-center gap-1 rounded border text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-8 ${
              theme.preference === preference
                ? 'border-primary-300 bg-primary-100 text-primary-700'
                : 'border-background-200 text-foreground-600 hover:bg-background-100 hover:text-foreground-800'
            }`}
          >
            <i className={`${icon} text-xs`} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      {!theme.persistenceAvailable && (
        <p className="mt-1.5 text-[11px] leading-4 text-warning-700">
          This choice applies only until the page closes.
        </p>
      )}
    </fieldset>
  );
}

function useCopyToken(session: VaultSession) {
  const [copyStatus, setCopyStatus] = useState('');
  useEffect(() => {
    if (!copyStatus) return undefined;
    const timer = window.setTimeout(() => setCopyStatus(''), 4_000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(session.token.reveal());
      setCopyStatus('Token copied');
    } catch {
      setCopyStatus('Clipboard unavailable');
    }
  };
  return [copyStatus, copyToken] as const;
}

/** The dropdown body of the session menu; the trigger and positioning live in TopBar. */
export default function SessionMenu({
  session,
  identity,
  remainingLabel,
  renewal,
  onRenewSession,
  autoRenew = false,
  onAutoRenewChange,
  onRequestRevoke,
  onRequestSeal,
  onClearNavigationData,
  onSignOut,
}: SessionMenuProps) {
  const [copyStatus, copyToken] = useCopyToken(session);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  useEffect(() => firstItemRef.current?.focus(), []);

  return (
    <div className="popover-enter absolute right-0 top-full z-popover mt-1 w-72 max-w-[calc(100vw-16px)] origin-top-right rounded-md border border-background-300 bg-background-50 py-1 shadow-lg shadow-overlay/10">
      <SessionDetails session={session} identity={identity} remainingLabel={remainingLabel} renewal={renewal} />
      <AppearancePicker />
      <button
        ref={firstItemRef}
        type="button"
        onClick={() => void copyToken()}
        className={`${MENU_ITEM} text-foreground-700 hover:bg-background-100`}
      >
        <i className={`${copyStatus === 'Token copied' ? 'ri-check-line text-success-600' : 'ri-file-copy-line'} text-sm`} aria-hidden="true" />
        {copyStatus || 'Copy token'}
      </button>
      {session.renewable === true && onRenewSession && (
        <button
          type="button"
          disabled={renewal.status === 'renewing'}
          onClick={() => void onRenewSession().catch(() => undefined)}
          className={`${MENU_ITEM} text-foreground-700 hover:bg-background-100 disabled:cursor-wait disabled:text-foreground-400`}
        >
          <i
            className={`${renewal.status === 'renewing' ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} text-sm`}
            aria-hidden="true"
          />
          {renewal.status === 'renewing' ? 'Renewing token…' : 'Renew token'}
        </button>
      )}
      {session.renewable === true && onAutoRenewChange && (
        <button
          type="button"
          role="switch"
          aria-checked={autoRenew}
          onClick={() => onAutoRenewChange(!autoRenew)}
          className={`${MENU_ITEM} justify-between text-foreground-700 hover:bg-background-100`}
        >
          <span className="flex items-center gap-2">
            <i className="ri-timer-flash-line text-sm" aria-hidden="true" />
            Renew automatically
          </span>
          <span
            aria-hidden="true"
            className={`relative h-4 w-7 rounded-full transition-colors motion-reduce:transition-none ${autoRenew ? 'bg-primary-500' : 'bg-background-300'}`}
          >
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-background-50 shadow-sm transition-transform motion-reduce:transition-none ${autoRenew ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
          </span>
        </button>
      )}
      {onRequestRevoke && (
        <button type="button" onClick={onRequestRevoke} className={`${MENU_ITEM} text-danger-700 hover:bg-danger-50`}>
          <i className="ri-shield-cross-line text-sm" aria-hidden="true" />
          Revoke token…
        </button>
      )}
      {onRequestSeal && (
        <button type="button" onClick={onRequestSeal} className={`${MENU_ITEM} text-danger-700 hover:bg-danger-50`}>
          <i className="ri-lock-2-line text-sm" aria-hidden="true" />
          Seal Vault…
        </button>
      )}
      {onClearNavigationData && (
        <button type="button" onClick={onClearNavigationData} className={`${MENU_ITEM} text-foreground-700 hover:bg-background-100`}>
          <i className="ri-eraser-line text-sm" aria-hidden="true" />
          Clear recent &amp; favorite paths
        </button>
      )}
      <button type="button" onClick={onSignOut} className={`${MENU_ITEM} cursor-pointer text-foreground-700 hover:bg-background-100`}>
        <i className="ri-logout-box-r-line text-sm" aria-hidden="true" />
        <span><span className="block">Sign out</span><span className="block text-[10px] text-foreground-500">Clear this browser tab only</span></span>
      </button>
    </div>
  );
}
