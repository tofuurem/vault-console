import {
  compileKvV2Policy,
  type KvAccessTarget,
  type LogicalKvAccessRule,
} from './kv-v2-policy-compiler';
import { parseManagedPolicyHcl } from './managed-resources';
import type { KvPermissionLevel } from './permission-presets';
import type {
  PolicySource,
  VaultCapability,
} from './types';

function ruleMap(
  rules: readonly {
    readonly pattern: string;
    readonly capabilities: readonly VaultCapability[];
  }[],
): ReadonlyMap<string, string> {
  return new Map(rules.map((rule) => [
    rule.pattern,
    [...new Set(rule.capabilities)].sort().join(','),
  ]));
}

function sameRuleMaps(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>,
): boolean {
  return left.size === right.size
    && [...left].every(([pattern, capabilities]) => right.get(pattern) === capabilities);
}

function matchMount(
  dataPattern: string,
  mounts: readonly string[],
): string | undefined {
  return [...mounts]
    .sort((left, right) => right.length - left.length)
    .find((mount) => (
      dataPattern === `${mount}/data`
      || dataPattern.startsWith(`${mount}/data/`)
    ));
}

function permissionLevel(
  capabilities: readonly VaultCapability[],
  allRules: ReadonlyMap<string, string>,
  mount: string,
  logicalPath: string,
  target: KvAccessTarget,
): Exclude<KvPermissionLevel, 'inherited'> | null {
  const values = [...new Set(capabilities)].sort().join(',');
  if (values === 'deny') return 'deny';
  if (values === 'read') return 'view';
  if (values === 'create,patch,read,update') return 'edit';
  if (values !== 'create,delete,patch,read,update') return null;

  const endpoint = (name: string) => {
    const prefix = `${mount}/${name}`;
    if (!logicalPath) return target === 'folder' ? `${prefix}/*` : prefix;
    return target === 'folder'
      ? `${prefix}/${logicalPath}/*`
      : `${prefix}/${logicalPath}`;
  };
  if (allRules.get(endpoint('destroy')) === 'update') return 'owner';
  if (
    allRules.get(endpoint('delete')) === 'update'
    && allRules.get(endpoint('undelete')) === 'update'
  ) return 'manage-versions';
  return null;
}

export function decompileKvV2Policy(
  hcl: string,
  mounts: readonly string[],
  source: PolicySource,
): readonly LogicalKvAccessRule[] | null {
  const parsed = parseManagedPolicyHcl(hcl);
  if (!parsed) return null;
  const actual = ruleMap(parsed);
  const logical: LogicalKvAccessRule[] = [];

  for (const rule of parsed) {
    const mount = matchMount(rule.pattern, mounts);
    if (!mount) continue;
    const dataPrefix = `${mount}/data`;
    if (rule.pattern !== dataPrefix && !rule.pattern.startsWith(`${dataPrefix}/`)) continue;
    const remainder = rule.pattern.slice(dataPrefix.length).replace(/^\/+/, '');
    const target: KvAccessTarget = remainder.endsWith('*') ? 'folder' : 'secret';
    const path = target === 'folder'
      ? remainder.replace(/\/?\*$/, '').replace(/\/+$/, '')
      : remainder;
    if (target === 'secret' && !path) return null;
    const level = permissionLevel(
      rule.capabilities,
      actual,
      mount,
      path,
      target,
    );
    if (!level) return null;
    logical.push({ mount, path, target, level, source });
  }
  if (logical.length === 0) return null;
  const compiled = compileKvV2Policy(logical);
  return sameRuleMaps(actual, ruleMap(compiled.rules)) ? logical : null;
}
