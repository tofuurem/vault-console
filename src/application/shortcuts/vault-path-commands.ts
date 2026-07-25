import type {
  FavoriteNavigationPath,
  NavigationPath,
  RecentNavigationPath,
} from '@/application/navigation-history/navigation-history';
import type { KvSearchMountState } from '@/application/vault/search/KvSearchContext';
import type { KvPathEntry } from '@/domain/vault/search';
import type { ShortcutCommand } from './shortcut';

interface VaultPathCommandSources {
  readonly favorites: readonly FavoriteNavigationPath[];
  readonly recents: readonly RecentNavigationPath[];
  readonly indexed: readonly KvPathEntry[];
  readonly onOpen: (path: NavigationPath) => void;
}

interface PathCandidate {
  readonly path: NavigationPath;
  readonly name: string;
  readonly source: 'favorite' | 'recent' | 'indexed';
}

interface KvIndexCommandOptions {
  readonly mount: string;
  readonly state: KvSearchMountState;
  readonly onStart: () => void;
  readonly onContinue: () => void;
  readonly onRestart: () => void;
  readonly onCancel: () => void;
}

function identity(path: NavigationPath): string {
  return `${path.mount}\u001f${path.kind}\u001f${path.path}`;
}

function basename(path: NavigationPath): string {
  return path.path.split('/').filter(Boolean).at(-1) ?? path.mount;
}

function commandId(path: NavigationPath): string {
  return [
    'kv-path',
    encodeURIComponent(path.mount),
    path.kind,
    encodeURIComponent(path.path),
  ].join(':');
}

export function buildVaultPathCommands({
  favorites,
  recents,
  indexed,
  onOpen,
}: VaultPathCommandSources): readonly ShortcutCommand[] {
  const candidates = new Map<string, PathCandidate>();
  const add = (
    path: NavigationPath,
    source: PathCandidate['source'],
    name = basename(path),
  ) => {
    const key = identity(path);
    if (candidates.has(key)) return;
    candidates.set(key, {
      path: { mount: path.mount, path: path.path, kind: path.kind },
      source,
      name,
    });
  };

  favorites.forEach((path) => add(path, 'favorite'));
  recents.forEach((path) => add(path, 'recent'));
  indexed.forEach((entry) => add(entry, 'indexed', entry.name));

  return [...candidates.values()].map(({ path, source, name }) => {
    const sourceLabel = source === 'favorite'
      ? 'Favorite'
      : source === 'recent' ? 'Recent' : 'Indexed';
    const typeLabel = path.kind === 'folder' ? 'folder' : 'secret';
    return {
      id: commandId(path),
      label: `${path.mount}/${path.path}`,
      group: `${sourceLabel} ${typeLabel}`,
      keywords: [name, path.mount, path.path, typeLabel, source],
      icon: path.kind === 'folder' ? 'ri-folder-3-line' : 'ri-key-2-line',
      searchTieBreaker: source === 'favorite' ? 2 : source === 'recent' ? 1 : 0,
      run: () => onOpen(path),
    };
  });
}

export function buildKvIndexCommand({
  mount,
  state,
  onStart,
  onContinue,
  onRestart,
  onCancel,
}: KvIndexCommandOptions): ShortcutCommand | null {
  if (!mount || state.status === 'complete') return null;
  if (state.status === 'scanning') {
    return {
      id: `kv-index-cancel:${encodeURIComponent(mount)}`,
      label: `Cancel search in ${mount}/`,
      group: `KV search · ${state.entries.length} indexed paths`,
      keywords: ['stop', 'scan', 'index', mount],
      icon: 'ri-stop-circle-line',
      run: onCancel,
    };
  }

  const continuing = state.pendingPrefixes.length > 0;
  return {
    id: `kv-index-start:${encodeURIComponent(mount)}`,
    label: continuing ? `Continue searching ${mount}/` : `Search entire ${mount}/`,
    group: state.status === 'idle'
      ? 'KV search · Index not started'
      : `KV search · Incomplete index (${state.entries.length} paths)`,
    keywords: ['scan', 'index', 'recursive', 'entire mount', mount],
    icon: continuing ? 'ri-play-circle-line' : 'ri-search-eye-line',
    run: state.status === 'idle'
      ? onStart
      : continuing ? onContinue : onRestart,
  };
}
