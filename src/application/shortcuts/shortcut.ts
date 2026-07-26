export interface ShortcutCommand {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly keywords?: readonly string[];
  readonly icon?: string;
  readonly shortcut?: string;
  readonly disabledReason?: string;
  readonly searchTieBreaker?: number;
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

function commandMatchScore(command: ShortcutCommand, query: string): number | null {
  const label = command.label.toLocaleLowerCase();
  const group = command.group.toLocaleLowerCase();
  const keywords = (command.keywords ?? []).map((keyword) => keyword.toLocaleLowerCase());
  if (label === query || keywords.some((keyword) => keyword === query)) return 0;
  if (label.startsWith(query) || keywords.some((keyword) => keyword.startsWith(query))) return 10;
  if (label.includes(query) || keywords.some((keyword) => keyword.includes(query))) return 20;
  if (group.includes(query)) return 40;
  return commandSearchText(command).includes(query) ? 50 : null;
}

export function rankShortcutCommands(
  commands: readonly ShortcutCommand[],
  rawQuery: string,
): readonly ShortcutCommand[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return commands;
  const queryTerms = query.split(/\s+/);
  return commands
    .flatMap((command, index) => {
      const phraseScore = commandMatchScore(command, query);
      const termScores = queryTerms.map((term) => commandMatchScore(command, term));
      const score = phraseScore ?? (
        queryTerms.length > 1 && termScores.every((termScore) => termScore !== null)
          ? 60 + termScores.reduce((total, termScore) => total + termScore!, 0)
          : null
      );
      return score === null ? [] : [{
        command,
        index,
        score,
        tieBreaker: command.searchTieBreaker ?? 0,
      }];
    })
    .sort((left, right) => (
      left.score - right.score
      || right.tieBreaker - left.tieBreaker
      || left.index - right.index
    ))
    .map(({ command }) => command);
}
