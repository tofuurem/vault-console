export type PkiTab = 'overview' | 'issuers' | 'roles' | 'certificates' | 'config';

export const PKI_TABS: readonly PkiTab[] = ['overview', 'issuers', 'roles', 'certificates', 'config'];

export interface PkiRoute {
  readonly tab: PkiTab;
  /** Selected issuer reference, role name, or certificate serial. */
  readonly id?: string;
}

/** Maps the URL below the mount (`roles/web`, `certificates/6a:36`) to a tab and selection. */
export function parsePkiRoute(subPath: string): PkiRoute {
  const [first, ...rest] = subPath.split('/').filter(Boolean);
  const tab = PKI_TABS.find((candidate) => candidate === first);
  if (!tab) return { tab: 'overview' };
  const id = rest.join('/');
  return id && tab !== 'overview' && tab !== 'config' ? { tab, id } : { tab };
}

export function pkiPath(tab: PkiTab, id?: string): string {
  if (tab === 'overview') return '';
  return id ? `${tab}/${id}` : tab;
}
