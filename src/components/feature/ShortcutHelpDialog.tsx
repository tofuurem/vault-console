import { Fragment, useCallback, useId, useMemo, useState } from 'react';

import { useShortcutCommands } from '@/application/shortcuts/ShortcutContext';
import {
  HELP_SHORTCUT_KEY,
  keyboardShortcutGroups,
  spokenKeyName,
  type KeyboardShortcutDescription,
  type KeyboardShortcutGroup,
} from '@/application/shortcuts/keyboard-shortcuts';
import { useKeyboardShortcut } from '@/application/shortcuts/useKeyboardShortcut';
import Modal from '@/components/base/Modal';

interface ShortcutHelpDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Defaults to the shortcuts for the current platform. */
  readonly groups?: readonly KeyboardShortcutGroup[];
}

function KeyCaps({ shortcut }: { readonly shortcut: KeyboardShortcutDescription }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[10px] text-foreground-400">
      {shortcut.keys.map((key, index) => (
        <Fragment key={`${key}-${index}`}>
          {index > 0 && <span>{shortcut.combination ? '+' : 'or'}</span>}
          <kbd className="min-w-6 rounded border border-background-300 bg-background-100 px-1.5 py-0.5 text-center font-mono text-[11px] text-foreground-700">
            {spokenKeyName(key) === key ? key : (
              <>
                <span aria-hidden="true">{key}</span>
                <span className="sr-only">{spokenKeyName(key)}</span>
              </>
            )}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}

export default function ShortcutHelpDialog({ open, onClose, groups }: ShortcutHelpDialogProps) {
  const shortcutGroups = useMemo(() => groups ?? keyboardShortcutGroups(), [groups]);
  const idPrefix = useId();
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width="md">
      <div className="space-y-5 p-4">
        {shortcutGroups.map((group, index) => (
          <section key={group.title} aria-labelledby={`${idPrefix}-${index}`}>
            <h4 id={`${idPrefix}-${index}`} className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-500">
              {group.title}
            </h4>
            <dl className="divide-y divide-background-200 rounded-md border border-background-200">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.id} className="flex items-center justify-between gap-4 px-3 py-2">
                  <dt className="text-xs text-foreground-700">{shortcut.description}</dt>
                  <dd><KeyCaps shortcut={shortcut} /></dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="text-[11px] leading-5 text-foreground-500">
          Single-key shortcuts are paused while you type in a field or while a dialog is open.
        </p>
      </div>
    </Modal>
  );
}

/**
 * Mount once inside `ShortcutProvider`: opens the help dialog with `?` and adds
 * “Show keyboard shortcuts” to the command palette.
 */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  useKeyboardShortcut([HELP_SHORTCUT_KEY], show);
  const commands = useMemo(() => [{
    id: 'help-keyboard-shortcuts',
    label: 'Show keyboard shortcuts',
    group: 'Help',
    keywords: ['keys', 'hotkeys', 'help', 'keyboard'],
    icon: 'ri-keyboard-line',
    shortcut: HELP_SHORTCUT_KEY,
    run: show,
  }], [show]);
  useShortcutCommands(commands);
  return <ShortcutHelpDialog open={open} onClose={() => setOpen(false)} />;
}
