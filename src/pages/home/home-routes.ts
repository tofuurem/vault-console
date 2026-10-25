import type { NavigationPath } from '@/application/navigation-history/navigation-history';
import { directoryPathForSecret, explorerRoute } from '@/router/explorer-route';

/** Explorer URL for a favorite or recent path: folders open, secrets are inspected. */
export function navigationPathRoute(target: NavigationPath): string {
  return target.kind === 'folder'
    ? explorerRoute(target.mount, target.path)
    : explorerRoute(target.mount, directoryPathForSecret(target.path), target.path);
}
