import { describe, expect, it } from 'vitest';

import {
  kvActionPaths,
  kvMountConfigPath,
  resolveKvActionPermissions,
  resolveKvMountConfigPermissions,
  unavailableKvActionPermissions,
} from './useKvActionPermissions';

describe('KV action capabilities', () => {
  it('maps exact Vault endpoint capabilities to individual version controls', () => {
    const paths = kvActionPaths('applications', 'billing/database');
    const permissions = resolveKvActionPermissions({
      [paths.data]: ['read', 'create', 'update', 'delete'],
      [paths.deleteVersions]: ['update'],
      [paths.undelete]: ['update'],
      [paths.destroy]: ['deny'],
      [paths.metadata]: ['read', 'delete'],
    }, paths);

    expect(permissions).toEqual({
      scope: paths.data,
      discovery: 'resolved',
      canReadData: true,
      canReadMetadata: true,
      canCreate: true,
      canUpdate: true,
      canEdit: true,
      canDeleteLatest: true,
      canDeleteVersions: true,
      canUndelete: true,
      canDestroy: false,
      canUpdateMetadata: false,
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
    expect(permissions.canCreate).toBe(false);
    expect(permissions.canUpdate).toBe(false);
    expect(permissions.canEdit).toBe(false);
    expect(permissions.canReadMetadata).toBe(false);
  });

  it('keeps metadata update and delete capabilities independent', () => {
    const paths = kvActionPaths('applications', 'shared');
    const permissions = resolveKvActionPermissions({
      [paths.metadata]: ['read', 'update'],
    }, paths);

    expect(permissions.canReadMetadata).toBe(true);
    expect(permissions.canUpdateMetadata).toBe(true);
    expect(permissions.canDeleteMetadata).toBe(false);
  });

  it('maps mount configuration read and update independently', () => {
    const path = kvMountConfigPath('applications');

    expect(resolveKvMountConfigPermissions({
      [path]: ['read'],
    }, path)).toEqual({
      scope: path,
      discovery: 'resolved',
      canRead: true,
      canUpdate: false,
    });
  });

  it('represents unavailable discovery without claiming denial', () => {
    const paths = kvActionPaths('applications', 'shared');

    expect(unavailableKvActionPermissions(paths)).toEqual({
      scope: paths.data,
      discovery: 'unavailable',
    });
  });
});
