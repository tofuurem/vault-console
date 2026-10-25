import { describe, expect, it } from 'vitest';

import { VaultError } from '@/domain/vault/errors';
import {
  databaseErrorMessage,
  isNotFound,
  vaultReason,
} from './database-errors';
import {
  connectionAllowsRole,
  describeAllowedRoles,
  describeRotation,
} from './database-format';
import {
  connectionFormErrors,
  connectionFormFromConnection,
  connectionInputFromForm,
  emptyConnectionForm,
  emptyRoleForm,
  emptyStaticRoleForm,
  hasFormErrors,
  parseExtraSettings,
  roleFormErrors,
  roleFormFromRole,
  roleInputFromForm,
  staticRoleFormErrors,
  staticRoleFormFromRole,
  staticRoleInputFromForm,
} from './database-forms';
import {
  connectionUrlWarning,
  cronScheduleError,
  databaseNameError,
  parseDurationSeconds,
  parseNameList,
  statementsFromText,
  statementsToText,
  ttlPairError,
} from './database-validation';
import { DATABASE_PLUGINS, databasePlugin, databasePluginLabel, databaseUrlParameter } from './plugins';

describe('database plugins', () => {
  it('lists the common plugins with templates that use Vault placeholders', () => {
    expect(DATABASE_PLUGINS.map((plugin) => plugin.id)).toEqual([
      'postgresql-database-plugin',
      'mysql-database-plugin',
      'mysql-rds-database-plugin',
      'mysql-aurora-database-plugin',
      'mysql-legacy-database-plugin',
      'mssql-database-plugin',
      'mongodb-database-plugin',
      'oracle-database-plugin',
      'redis-database-plugin',
      'redshift-database-plugin',
      'snowflake-database-plugin',
      'elasticsearch-database-plugin',
    ]);
    for (const plugin of DATABASE_PLUGINS) {
      expect(plugin.creationStatements).not.toBe('');
      if (plugin.urlParameter === 'connection_url') expect(plugin.urlTemplate).toContain('{{password}}');
    }
    expect(databasePlugin('postgresql-database-plugin')?.creationStatements).toContain('VALID UNTIL \'{{expiration}}\'');
  });

  it('falls back to connection_url and the raw name for custom plugins', () => {
    expect(databaseUrlParameter('redis-database-plugin')).toBe('host');
    expect(databaseUrlParameter('elasticsearch-database-plugin')).toBe('url');
    expect(databaseUrlParameter('acme-database-plugin')).toBe('connection_url');
    expect(databasePluginLabel('acme-database-plugin')).toBe('acme-database-plugin');
    expect(databasePluginLabel('mssql-database-plugin')).toBe('Microsoft SQL Server');
  });
});

describe('database validation', () => {
  it('accepts the names Vault accepts', () => {
    expect(databaseNameError('web')).toBeUndefined();
    expect(databaseNameError('app.read-only_1')).toBeUndefined();
    expect(databaseNameError('')).toBe('Enter a name.');
    expect(databaseNameError('-web')).toMatch(/letters, numbers/);
    expect(databaseNameError('team/web')).toMatch(/letters, numbers/);
    expect(databaseNameError('web', ['web'])).toMatch(/already in use/);
  });

  it('parses durations and compares TTLs', () => {
    expect(parseDurationSeconds('1h30m')).toBe(5_400);
    expect(parseDurationSeconds('3600')).toBe(3_600);
    expect(parseDurationSeconds('500ms')).toBe(0.5);
    expect(parseDurationSeconds('')).toBeUndefined();
    expect(parseDurationSeconds('soon')).toBeUndefined();
    expect(ttlPairError('48h', '24h')).toMatch(/cannot be longer/);
    expect(ttlPairError('1h', '24h')).toBeUndefined();
    expect(ttlPairError('48h', '')).toBeUndefined();
  });

  it('checks cron schedules', () => {
    expect(cronScheduleError('0 3 * * SAT')).toBeUndefined();
    expect(cronScheduleError('*/15 * * * *')).toBeUndefined();
    expect(cronScheduleError('')).toMatch(/Enter a cron schedule/);
    expect(cronScheduleError('0 3 * *')).toMatch(/five cron fields/);
    expect(cronScheduleError('0 3 * * $(id)')).toMatch(/five cron fields/);
  });

  it('round-trips lists and statements', () => {
    expect(parseNameList('web, app\nweb ,,')).toEqual(['web', 'app']);
    expect(statementsFromText('  \n ')).toEqual([]);
    expect(statementsFromText(' CREATE ROLE x;\nGRANT y; ')).toEqual(['CREATE ROLE x;\nGRANT y;']);
    expect(statementsToText(['a;', 'b;'])).toBe('a;\nb;');
  });

  it('warns about literal passwords in connection URLs', () => {
    expect(connectionUrlWarning('postgresql://{{username}}:{{password}}@db:5432/app')).toBeUndefined();
    expect(connectionUrlWarning('postgresql://root:hunter2@db:5432/app')).toMatch(/literal password/);
    expect(connectionUrlWarning('root:hunter2@tcp(db:3306)/')).toMatch(/literal password/);
    expect(connectionUrlWarning('{{username}}:{{password}}@tcp(db:3306)/')).toBeUndefined();
    expect(connectionUrlWarning('https://elastic:9200')).toBeUndefined();
  });
});

describe('database forms', () => {
  it('builds connection input with a write-only password', () => {
    const form = {
      ...emptyConnectionForm(),
      name: ' pg ',
      connectionUrl: ' postgresql://{{username}}:{{password}}@db:5432/app ',
      username: 'vault',
      password: 's3cret',
      allowedRoles: 'web, app',
      extraSettings: '{ "max_open_connections": 4 }',
    };
    expect(hasFormErrors(connectionFormErrors(form, { creating: true, existingNames: [] }))).toBe(false);
    const input = connectionInputFromForm(form);
    expect(input).toMatchObject({
      name: 'pg',
      pluginName: 'postgresql-database-plugin',
      urlParameter: 'connection_url',
      connectionUrl: 'postgresql://{{username}}:{{password}}@db:5432/app',
      allowedRoles: ['web', 'app'],
      extraSettings: { max_open_connections: 4 },
    });
    expect(input.password?.reveal()).toBe('s3cret');
    expect(JSON.stringify(input)).not.toContain('s3cret');
    expect(connectionInputFromForm({ ...form, password: '' }).password).toBeUndefined();
  });

  it('validates connection forms and plugin options', () => {
    const errors = connectionFormErrors(
      { ...emptyConnectionForm('redis-database-plugin'), name: 'pg', extraSettings: '[1]' },
      { creating: true, existingNames: ['pg'] },
    );
    expect(errors.name).toMatch(/already in use/);
    expect(errors.connectionUrl).toBe('Enter the host.');
    expect(errors.extraSettings).toMatch(/JSON object/);
    expect(parseExtraSettings('{ "password": "x" }')).toEqual({ ok: false, message: 'Set password with its own field above.' });
    expect(parseExtraSettings('nope')).toMatchObject({ ok: false });
    expect(connectionFormErrors({ ...emptyConnectionForm(), pluginName: ' ' }, { creating: false, existingNames: [] }).pluginName)
      .toMatch(/Choose a plugin/);
  });

  it('prefills a connection form without the password', () => {
    const form = connectionFormFromConnection({
      name: 'pg',
      pluginName: 'postgresql-database-plugin',
      connectionUrl: 'postgresql://{{username}}:{{password}}@db/app',
      username: 'vault',
      allowedRoles: ['web', 'app'],
      verifyConnection: false,
      passwordPolicy: 'db-policy',
      rootRotationStatements: ['ALTER USER x;'],
      otherSettings: {},
    });
    expect(form).toMatchObject({ password: '', allowedRoles: 'web, app', verifyConnection: false, rootRotationStatements: 'ALTER USER x;' });
  });

  it('validates and converts dynamic roles', () => {
    const errors = roleFormErrors({ ...emptyRoleForm(), defaultTtl: '48h' }, { creating: true, existingNames: [] });
    expect(errors).toMatchObject({
      name: 'Enter a name.',
      dbName: 'Choose the connection this role uses.',
      creationStatements: 'Enter the statements that create the database user.',
      maxTtl: 'The default TTL cannot be longer than the max TTL.',
    });
    const form = roleFormFromRole({
      name: 'web',
      dbName: 'pg',
      creationStatements: ['CREATE ROLE x;'],
      revocationStatements: [],
      rollbackStatements: [],
      renewStatements: [],
      defaultTtlSeconds: 3_600,
      maxTtlSeconds: 0,
      credentialType: 'password',
    });
    expect(form).toMatchObject({ defaultTtl: '1h', maxTtl: '' });
    expect(hasFormErrors(roleFormErrors(form, { creating: false, existingNames: ['web'] }))).toBe(false);
    expect(roleInputFromForm(form)).toEqual({
      name: 'web',
      dbName: 'pg',
      creationStatements: ['CREATE ROLE x;'],
      revocationStatements: [],
      rollbackStatements: [],
      renewStatements: [],
      defaultTtl: '1h',
      maxTtl: '',
    });
  });

  it('validates and converts static roles for both rotation styles', () => {
    const base = { ...emptyStaticRoleForm('pg'), name: 'app', username: 'appuser' };
    expect(hasFormErrors(staticRoleFormErrors(base, { creating: true, existingNames: [] }))).toBe(false);
    expect(staticRoleFormErrors({ ...base, rotationPeriod: '2s' }, { creating: true, existingNames: [] }).rotationPeriod)
      .toMatch(/at least 5s/);
    const scheduled = { ...base, rotationKind: 'schedule' as const, rotationSchedule: ' 0  3 * * SAT ', rotationWindow: '30m' };
    expect(staticRoleFormErrors(scheduled, { creating: true, existingNames: [] }).rotationWindow).toMatch(/at least 1h/);
    expect(staticRoleInputFromForm({ ...scheduled, rotationWindow: '2h' }).rotation).toEqual({
      kind: 'schedule',
      schedule: '0 3 * * SAT',
      window: '2h',
    });
    expect(staticRoleInputFromForm(base).rotation).toEqual({ kind: 'period', period: '24h' });
    expect(staticRoleFormFromRole({
      name: 'app',
      dbName: 'pg',
      username: 'appuser',
      rotation: { kind: 'schedule', schedule: '0 * * * *', windowSeconds: 3_600 },
      rotationStatements: [],
      credentialType: 'password',
    })).toMatchObject({ rotationKind: 'schedule', rotationSchedule: '0 * * * *', rotationWindow: '1h' });
  });
});

describe('database formatting and errors', () => {
  it('describes rotation and allowed roles', () => {
    expect(describeRotation({ kind: 'period', periodSeconds: 86_400 })).toBe('Every 1d');
    expect(describeRotation({ kind: 'schedule', schedule: '0 * * * *', windowSeconds: 3_600 })).toBe('Cron 0 * * * *, within 1h');
    expect(describeAllowedRoles([])).toBe('None, so no role can use it');
    expect(describeAllowedRoles(['*'])).toBe('Any role');
    expect(connectionAllowsRole(['app-*'], 'app-web')).toBe(true);
    expect(connectionAllowsRole(['app-*'], 'web')).toBe(false);
    expect(connectionAllowsRole(['web'], 'web')).toBe(true);
  });

  it('explains permission errors plainly and surfaces Vault reasons', () => {
    expect(databaseErrorMessage(new VaultError('authorization'), 'listing roles')).toBe('Your policy does not allow listing roles.');
    const reasoned = new VaultError('invalid-request', { reason: 'error verifying connection' });
    expect(databaseErrorMessage(reasoned, 'saving')).toBe('Vault reported: error verifying connection');
    expect(vaultReason(reasoned)).toBe('error verifying connection');
    expect(databaseErrorMessage(new VaultError('unavailable'), 'saving')).toBe('Vault is currently unavailable.');
    expect(isNotFound(new VaultError('not-found'))).toBe(true);
    expect(isNotFound(null)).toBe(false);
  });
});
