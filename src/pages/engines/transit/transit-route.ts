import { isTransitOperation, type TransitOperation } from '@/domain/engines/transit/transit-key-types';

export type KeySection = 'operations' | 'versions' | 'settings';

export type TransitRoute =
  | { readonly view: 'tools' }
  | { readonly view: 'keys'; readonly key?: undefined }
  | {
    readonly view: 'keys';
    readonly key: string;
    readonly section: KeySection;
    readonly operation?: TransitOperation;
  };

/**
 * URL layout below the mount: `keys/<name>[/<operation>|/versions|/settings]`
 * and `tools`. Only names and section identifiers ever appear in the URL;
 * payloads and results stay in component state.
 */
export function parseTransitRoute(subPath: string): TransitRoute {
  const [root, name, section] = subPath.split('/').filter(Boolean);
  if (root === 'tools') return { view: 'tools' };
  if (root !== 'keys' || !name) return { view: 'keys' };
  if (section === 'versions' || section === 'settings') return { view: 'keys', key: name, section };
  if (section && isTransitOperation(section)) return { view: 'keys', key: name, section: 'operations', operation: section };
  return { view: 'keys', key: name, section: 'operations' };
}

export function keyPath(name: string, section?: KeySection | TransitOperation): string {
  return section && section !== 'operations' ? `keys/${name}/${section}` : `keys/${name}`;
}
