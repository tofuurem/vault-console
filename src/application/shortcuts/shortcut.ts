export interface ShortcutCommand {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly keywords?: readonly string[];
  readonly icon?: string;
  readonly shortcut?: string;
  readonly disabledReason?: string;
  run(): void;
}

interface KeyboardShortcutLike {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export function isPaletteShortcut(event: KeyboardShortcutLike): boolean {
  return event.key.toLowerCase() === 'k'
    && (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey;
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
  ));
}

export function commandSearchText(command: ShortcutCommand): string {
  return [
    command.label,
    command.group,
    ...(command.keywords ?? []),
  ].join(' ').toLocaleLowerCase();
}
