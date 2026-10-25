import { durationError, secondsToDuration } from '@/domain/engines/engines';
import { vaultPassword } from '@/domain/vault/sensitive-value';
import type {
  DatabaseConnection,
  DatabaseConnectionInput,
  DatabaseRole,
  DatabaseRoleInput,
  DatabaseStaticRole,
  DatabaseStaticRoleInput,
} from './database';
import {
  cronScheduleError,
  databaseNameError,
  parseDurationSeconds,
  parseNameList,
  statementsFromText,
  statementsToText,
  ttlPairError,
} from './database-validation';
import { databasePlugin, databaseUrlParameter, DEFAULT_DATABASE_PLUGIN } from './plugins';

export type FormErrors<Form> = Partial<Record<keyof Form, string>>;

export function hasFormErrors<Form>(errors: FormErrors<Form>): boolean {
  return Object.values(errors).some(Boolean);
}

/* ------------------------------------------------------------------ connections */

export interface ConnectionFormState {
  readonly name: string;
  readonly pluginName: string;
  readonly connectionUrl: string;
  readonly username: string;
  /** Write-only; empty on edit keeps the stored password. */
  readonly password: string;
  readonly allowedRoles: string;
  readonly verifyConnection: boolean;
  readonly passwordPolicy: string;
  readonly rootRotationStatements: string;
  /** JSON object of plugin-specific settings. */
  readonly extraSettings: string;
}

export function emptyConnectionForm(pluginName = DEFAULT_DATABASE_PLUGIN.id): ConnectionFormState {
  return {
    name: '',
    pluginName,
    connectionUrl: '',
    username: '',
    password: '',
    allowedRoles: '*',
    verifyConnection: true,
    passwordPolicy: '',
    rootRotationStatements: '',
    extraSettings: '',
  };
}

export function connectionFormFromConnection(connection: DatabaseConnection): ConnectionFormState {
  return {
    name: connection.name,
    pluginName: connection.pluginName,
    connectionUrl: connection.connectionUrl,
    username: connection.username,
    password: '',
    allowedRoles: connection.allowedRoles.join(', '),
    verifyConnection: connection.verifyConnection,
    passwordPolicy: connection.passwordPolicy,
    rootRotationStatements: statementsToText(connection.rootRotationStatements),
    extraSettings: '',
  };
}

/** Settings with their own form field; the plugin options JSON must not override them. */
const MANAGED_SETTINGS = new Set([
  'plugin_name',
  'connection_url',
  'url',
  'host',
  'username',
  'password',
  'allowed_roles',
  'verify_connection',
  'password_policy',
  'root_rotation_statements',
]);

export type ExtraSettingsResult =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly message: string };

export function parseExtraSettings(text: string): ExtraSettingsResult {
  if (!text.trim()) return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'Enter a JSON object, for example { "max_open_connections": 4 }.' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: 'Enter a JSON object, for example { "max_open_connections": 4 }.' };
  }
  const managed = Object.keys(parsed).find((key) => MANAGED_SETTINGS.has(key));
  if (managed) return { ok: false, message: `Set ${managed} with its own field above.` };
  return { ok: true, value: parsed as Record<string, unknown> };
}

export function connectionFormErrors(
  form: ConnectionFormState,
  options: { readonly creating: boolean; readonly existingNames: readonly string[] },
): FormErrors<ConnectionFormState> {
  const extra = parseExtraSettings(form.extraSettings);
  const urlLabel = databasePlugin(form.pluginName)?.urlLabel ?? 'Connection URL';
  return {
    name: options.creating ? databaseNameError(form.name, options.existingNames) : undefined,
    pluginName: form.pluginName.trim() ? undefined : 'Choose a plugin or enter its name.',
    connectionUrl: form.connectionUrl.trim() ? undefined : `Enter the ${urlLabel.toLowerCase()}.`,
    extraSettings: extra.ok ? undefined : extra.message,
  };
}

export function connectionInputFromForm(form: ConnectionFormState): DatabaseConnectionInput {
  const extra = parseExtraSettings(form.extraSettings);
  const pluginName = form.pluginName.trim();
  return {
    name: form.name.trim(),
    pluginName,
    urlParameter: databaseUrlParameter(pluginName),
    connectionUrl: form.connectionUrl.trim(),
    username: form.username.trim(),
    password: form.password ? vaultPassword(form.password) : undefined,
    allowedRoles: parseNameList(form.allowedRoles),
    verifyConnection: form.verifyConnection,
    passwordPolicy: form.passwordPolicy.trim(),
    rootRotationStatements: statementsFromText(form.rootRotationStatements),
    extraSettings: extra.ok ? extra.value : {},
  };
}

/* ------------------------------------------------------------------ dynamic roles */

export interface RoleFormState {
  readonly name: string;
  readonly dbName: string;
  readonly creationStatements: string;
  readonly revocationStatements: string;
  readonly rollbackStatements: string;
  readonly renewStatements: string;
  readonly defaultTtl: string;
  readonly maxTtl: string;
}

export function emptyRoleForm(dbName = ''): RoleFormState {
  return {
    name: '',
    dbName,
    creationStatements: '',
    revocationStatements: '',
    rollbackStatements: '',
    renewStatements: '',
    defaultTtl: '1h',
    maxTtl: '24h',
  };
}

export function roleFormFromRole(role: DatabaseRole): RoleFormState {
  return {
    name: role.name,
    dbName: role.dbName,
    creationStatements: statementsToText(role.creationStatements),
    revocationStatements: statementsToText(role.revocationStatements),
    rollbackStatements: statementsToText(role.rollbackStatements),
    renewStatements: statementsToText(role.renewStatements),
    defaultTtl: secondsToDuration(role.defaultTtlSeconds),
    maxTtl: secondsToDuration(role.maxTtlSeconds),
  };
}

export function roleFormErrors(
  form: RoleFormState,
  options: { readonly creating: boolean; readonly existingNames: readonly string[] },
): FormErrors<RoleFormState> {
  return {
    name: options.creating ? databaseNameError(form.name, options.existingNames) : undefined,
    dbName: form.dbName.trim() ? undefined : 'Choose the connection this role uses.',
    creationStatements: form.creationStatements.trim()
      ? undefined
      : 'Enter the statements that create the database user.',
    defaultTtl: durationError(form.defaultTtl),
    maxTtl: durationError(form.maxTtl) ?? ttlPairError(form.defaultTtl, form.maxTtl),
  };
}

export function roleInputFromForm(form: RoleFormState): DatabaseRoleInput {
  return {
    name: form.name.trim(),
    dbName: form.dbName.trim(),
    creationStatements: statementsFromText(form.creationStatements),
    revocationStatements: statementsFromText(form.revocationStatements),
    rollbackStatements: statementsFromText(form.rollbackStatements),
    renewStatements: statementsFromText(form.renewStatements),
    defaultTtl: form.defaultTtl.trim(),
    maxTtl: form.maxTtl.trim(),
  };
}

/* ------------------------------------------------------------------ static roles */

export interface StaticRoleFormState {
  readonly name: string;
  readonly dbName: string;
  readonly username: string;
  readonly rotationKind: 'period' | 'schedule';
  readonly rotationPeriod: string;
  readonly rotationSchedule: string;
  readonly rotationWindow: string;
  readonly rotationStatements: string;
}

/** Vault's lower bounds for static role rotation. */
export const MIN_ROTATION_PERIOD_SECONDS = 5;
export const MIN_ROTATION_WINDOW_SECONDS = 3_600;

export function emptyStaticRoleForm(dbName = ''): StaticRoleFormState {
  return {
    name: '',
    dbName,
    username: '',
    rotationKind: 'period',
    rotationPeriod: '24h',
    rotationSchedule: '',
    rotationWindow: '',
    rotationStatements: '',
  };
}

export function staticRoleFormFromRole(role: DatabaseStaticRole): StaticRoleFormState {
  const rotation = role.rotation;
  return {
    name: role.name,
    dbName: role.dbName,
    username: role.username,
    rotationKind: rotation.kind,
    rotationPeriod: rotation.kind === 'period' ? secondsToDuration(rotation.periodSeconds) : '24h',
    rotationSchedule: rotation.kind === 'schedule' ? rotation.schedule : '',
    rotationWindow: rotation.kind === 'schedule' && rotation.windowSeconds
      ? secondsToDuration(rotation.windowSeconds)
      : '',
    rotationStatements: statementsToText(role.rotationStatements),
  };
}

function rotationPeriodError(value: string): string | undefined {
  if (!value.trim()) return 'Enter how often Vault rotates the password, for example 24h.';
  const invalid = durationError(value);
  if (invalid) return invalid;
  return (parseDurationSeconds(value) ?? 0) < MIN_ROTATION_PERIOD_SECONDS
    ? 'Vault requires a rotation period of at least 5s.'
    : undefined;
}

function rotationWindowError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const invalid = durationError(value);
  if (invalid) return invalid;
  return (parseDurationSeconds(value) ?? 0) < MIN_ROTATION_WINDOW_SECONDS
    ? 'Vault requires a rotation window of at least 1h.'
    : undefined;
}

export function staticRoleFormErrors(
  form: StaticRoleFormState,
  options: { readonly creating: boolean; readonly existingNames: readonly string[] },
): FormErrors<StaticRoleFormState> {
  const period = form.rotationKind === 'period';
  return {
    name: options.creating ? databaseNameError(form.name, options.existingNames) : undefined,
    dbName: form.dbName.trim() ? undefined : 'Choose the connection this role uses.',
    username: form.username.trim() ? undefined : 'Enter the existing database user Vault will manage.',
    rotationPeriod: period ? rotationPeriodError(form.rotationPeriod) : undefined,
    rotationSchedule: period ? undefined : cronScheduleError(form.rotationSchedule),
    rotationWindow: period ? undefined : rotationWindowError(form.rotationWindow),
  };
}

export function staticRoleInputFromForm(form: StaticRoleFormState): DatabaseStaticRoleInput {
  return {
    name: form.name.trim(),
    dbName: form.dbName.trim(),
    username: form.username.trim(),
    rotation: form.rotationKind === 'period'
      ? { kind: 'period', period: form.rotationPeriod.trim() }
      : {
          kind: 'schedule',
          schedule: form.rotationSchedule.trim().split(/\s+/).join(' '),
          window: form.rotationWindow.trim(),
        },
    rotationStatements: statementsFromText(form.rotationStatements),
  };
}
