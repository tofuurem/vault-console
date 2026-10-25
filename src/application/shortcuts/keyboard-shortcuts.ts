export interface KeyboardShortcutDescription {
  readonly id: string;
  /** Several keys are alternatives (↑ or ↓) unless `combination` is set (⌘ + K). */
  readonly keys: readonly string[];
  readonly combination?: boolean;
  readonly description: string;
}

export interface KeyboardShortcutGroup {
  readonly title: string;
  readonly shortcuts: readonly KeyboardShortcutDescription[];
}

export const SEARCH_SHORTCUT_KEY = '/';
export const HELP_SHORTCUT_KEY = '?';
export const EDIT_SECRET_SHORTCUT_KEY = 'e';

export function isApplePlatform(
  navigatorLike: Pick<Navigator, 'platform' | 'userAgent'> | undefined =
  typeof navigator === 'undefined' ? undefined : navigator,
): boolean {
  if (!navigatorLike) return false;
  return /mac|iphone|ipad|ipod/i.test(navigatorLike.platform || navigatorLike.userAgent);
}

const SPOKEN_KEYS: Readonly<Record<string, string>> = {
  '⌘': 'Command',
  '↑': 'Up arrow',
  '↓': 'Down arrow',
  Esc: 'Escape',
  '/': 'Slash',
  '?': 'Question mark',
};

/** Words a screen reader should say for a key symbol. */
export function spokenKeyName(key: string): string {
  return SPOKEN_KEYS[key] ?? key;
}

export function paletteShortcutKeys(apple: boolean): readonly string[] {
  return apple ? ['⌘', 'K'] : ['Ctrl', 'K'];
}

/** Every keyboard shortcut the console supports, grouped for the help dialog. */
export function keyboardShortcutGroups(apple = isApplePlatform()): readonly KeyboardShortcutGroup[] {
  return [
    {
      title: 'Anywhere',
      shortcuts: [
        { id: 'palette', keys: paletteShortcutKeys(apple), combination: true, description: 'Open the command palette' },
        { id: 'help', keys: [HELP_SHORTCUT_KEY], description: 'Show keyboard shortcuts' },
        { id: 'escape', keys: ['Esc'], description: 'Close the open dialog or panel' },
      ],
    },
    {
      title: 'Explorer',
      shortcuts: [
        { id: 'search', keys: [SEARCH_SHORTCUT_KEY], description: 'Search secret paths' },
        { id: 'rows', keys: ['↑', '↓'], description: 'Move between rows in the folder table' },
        { id: 'first-last', keys: ['Home', 'End'], description: 'Jump to the first or last row' },
        { id: 'open', keys: ['Enter'], description: 'Open the folder or inspect the secret' },
        { id: 'edit', keys: [EDIT_SECRET_SHORTCUT_KEY], description: 'Edit the inspected secret, if your policy allows it' },
        { id: 'clear-selection', keys: ['Esc'], description: 'Clear selected secrets' },
      ],
    },
  ];
}
