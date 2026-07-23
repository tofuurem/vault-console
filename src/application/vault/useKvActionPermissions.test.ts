import { describe, expect, it } from 'vitest';

import { kvActionPaths, resolveKvActionPermissions } from './useKvActionPermissions';

describe('KV action capabilities', () => {
  it('maps exact Vault endpoint capabilities to individual version controls', () => {
    const paths = kvActionPaths('applications', 'billing/database');
    const permissions = resolveKvActionPermissions({
      [paths.data]: ['read', 'update', 'delete'],
      [paths.deleteVersions]: ['update'],
      [paths.undelete]: ['update'],
      [paths.destroy]: ['deny'],
      [paths.metadata]: ['read', 'delete'],
    }, paths);

    expect(permissions).toEqual({
      scope: paths.data,
      canReadData: true,
      canReadMetadata: true,
      canEdit: true,
      canDeleteLatest: true,
      canDeleteVersions: true,
      canUndelete: true,
      canDestroy: false,
      canDeleteMetadata: true,
    });
  });

  it('treats deny as authoritative even when another capability appears', () => {
    const paths = kvActionPaths('applications', 'shared');
    const permissions = resolveKvActionPermissions({
      [paths.data]: ['read', 'update', 'deny'],
      [paths.metadata]: ['list'],
    }, paths);

    expect(permissions.canReadData).toBe(false);
    expect(permissions.canEdit).toBe(false);
    expect(permissions.canReadMetadata).toBe(false);
  });
});
