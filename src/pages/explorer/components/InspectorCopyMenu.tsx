import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import Tooltip from '@/components/base/Tooltip';
import {
  kvGetCliCommand,
  secretEnvExport,
  secretEnvExportBlocker,
  secretEnvExportBlockerMessage,
  secretJsonExport,
  secretLogicalPath,
} from '@/domain/vault/secret-export';
import type { SecretJsonObject } from '@/domain/vault/secret-json';
import { useInspectorClipboard } from './useInspectorClipboard';

interface InspectorCopyMenuProps {
  readonly mount: string;
  readonly path: string;
  /** The loaded version's data; exports are unavailable without it. */
  readonly data?: SecretJsonObject;
  readonly version?: number;
}

interface CopyItem {
  readonly key: string;
  readonly icon: string;
  readonly label: string;
  readonly description: string;
  readonly disabledReason?: string;
  readonly produce: () => string;
  readonly successMessage: string;
}

function copyItems({ mount, path, data, version }: InspectorCopyMenuProps): {
  readonly reference: readonly CopyItem[];
  readonly exports: readonly CopyItem[];
} {
  const unloaded = 'Secret data is not loaded.';
  const envBlocker = data ? secretEnvExportBlocker(data) : undefined;
  return {
    reference: [
      {
        key: 'path',
        icon: 'ri-route-line',
        label: 'Copy logical path',
        description: secretLogicalPath(mount, path),
        produce: () => secretLogicalPath(mount, path),
        successMessage: 'Logical path copied',
      },
      {
        key: 'cli',
        icon: 'ri-terminal-line',
        label: 'Copy CLI command',
        description: 'vault kv get for the current version',
        produce: () => kvGetCliCommand(mount, path),
        successMessage: 'Vault CLI command copied',
      },
    ],
    exports: [
      {
        key: 'env',
        icon: 'ri-file-text-line',
        label: 'Copy as .env',
        description: 'KEY=value lines',
        disabledReason: !data ? unloaded : envBlocker ? secretEnvExportBlockerMessage(envBlocker) : undefined,
        produce: () => {
          const result = data ? secretEnvExport(data) : undefined;
          if (!result?.ok) throw new Error('not exportable');
          return result.text;
        },
        successMessage: 'Copied as .env',
      },
      {
        key: 'json',
        icon: 'ri-braces-line',
        label: 'Copy as JSON',
        description: version ? `All fields of v${version}` : 'All fields',
        disabledReason: data ? undefined : unloaded,
        produce: () => {
          if (!data) throw new Error('not loaded');
          return secretJsonExport(data);
        },
        successMessage: 'Copied as JSON',
      },
    ],
  };
}

function focusSibling(menu: HTMLElement | null, current: Element | null, step: 1 | -1 | 'first' | 'last') {
  const items = [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
  if (items.length === 0) return;
  const index = items.indexOf(current as HTMLButtonElement);
  const next = step === 'first'
    ? 0
    : step === 'last'
      ? items.length - 1
      : (index + step + items.length) % items.length;
  items[next].focus();
}

const MENU_KEYS: Readonly<Record<string, 1 | -1 | 'first' | 'last'>> = {
  ArrowDown: 1,
  ArrowUp: -1,
  Home: 'first',
  End: 'last',
};

function MenuItem({ item, onSelect }: { readonly item: CopyItem; readonly onSelect: (item: CopyItem) => void }) {
  const disabled = item.disabledReason !== undefined;
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => onSelect(item)}
      className="flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <i className={`${item.icon} mt-0.5 text-sm ${disabled ? 'text-foreground-300' : 'text-foreground-500'}`} aria-hidden="true" />
      <span className="min-w-0">
        <strong className={`block text-xs font-medium ${disabled ? 'text-foreground-400' : 'text-foreground-800'}`}>{item.label}</strong>
        <span className={`block break-all text-[10px] ${disabled ? 'text-warning-700' : 'text-foreground-500'}`}>
          {item.disabledReason ?? item.description}
        </span>
      </span>
    </button>
  );
}

export default function InspectorCopyMenu(props: InspectorCopyMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const clipboard = useInspectorClipboard();
  const items = copyItems(props);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeFromOutside);
    focusSibling(menuRef.current, null, 'first');
    return () => document.removeEventListener('pointerdown', closeFromOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      close();
      return;
    }
    const step = MENU_KEYS[event.key];
    if (!step) return;
    event.preventDefault();
    focusSibling(menuRef.current, document.activeElement, step);
  };
  const select = (item: CopyItem) => {
    close();
    void clipboard.copy(item.produce, item.successMessage);
  };

  return (
    <div ref={containerRef} className="relative">
      <Tooltip content={clipboard.succeeded ? clipboard.status : 'Copy path, CLI command, or data'}>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Copy options"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-7 sm:w-7"
        >
          <i className={clipboard.succeeded ? 'ri-check-line text-success-600' : 'ri-file-copy-line'} aria-hidden="true" />
        </button>
      </Tooltip>
      {!clipboard.announcesWithToast && (
        <span role="status" aria-live="polite" className="sr-only">{clipboard.status}</span>
      )}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Copy options"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-12 z-popover w-72 max-w-[calc(100vw-32px)] overflow-hidden rounded-md border border-background-300 bg-background-50 py-1 shadow-xl sm:top-8"
        >
          {items.reference.map((item) => <MenuItem key={item.key} item={item} onSelect={select} />)}
          <div role="presentation" className="mt-1 border-t border-background-200 px-3 pb-1 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-500">
              Export {props.version ? `v${props.version}` : 'loaded version'}
            </p>
            <p className="text-[10px] text-foreground-500">Copies secret values to the clipboard.</p>
          </div>
          {items.exports.map((item) => <MenuItem key={item.key} item={item} onSelect={select} />)}
        </div>
      )}
    </div>
  );
}
