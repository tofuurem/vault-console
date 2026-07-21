import { KV_PERMISSION_PRESETS, type KvPermissionLevel } from './permission-presets';
import { normalizeVaultPath } from './policy-matcher';
import {
  VAULT_CAPABILITIES,
  type PolicyRule,
  type PolicySource,
  type VaultCapability,
} from './types';

export type KvAccessTarget = 'folder' | 'secret';

export interface LogicalKvAccessRule {
  readonly mount: string;
  readonly path: string;
  readonly target: KvAccessTarget;
  readonly level: KvPermissionLevel;
  readonly source: PolicySource;
}

export interface CompiledKvV2Policy {
  readonly rules: readonly PolicyRule[];
  readonly hcl: string;
}

function normalizeLogicalPath(value: string): string {
  return normalizeVaultPath(value).replace(/\/+$/, '');
}

function assertSafeLogicalPath(value: string, field: 'mount' | 'path'): void {
  if (field === 'mount' && value.length === 0) throw new Error('A KV v2 mount is required.');
  if (value.length > 0 && value.split('/').some((segment) => segment.length === 0)) {
    throw new Error(`Logical ${field} paths cannot contain empty segments.`);
  }
  if (value.includes('*') || value.split('/').includes('+')) {
    throw new Error(`Logical ${field} paths cannot contain policy wildcards.`);
  }
  if (value.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Logical ${field} paths cannot contain relative segments.`);
  }
}

function endpointPath(mount: string, endpoint: string, path: string, target: KvAccessTarget): string {
  const prefix = `${mount}/${endpoint}`;
  if (path.length === 0) return target === 'folder' ? `${prefix}/*` : prefix;
  return target === 'folder' ? `${prefix}/${path}/*` : `${prefix}/${path}`;
}

function metadataFolderPath(mount: string, path: string): string {
  return path.length === 0 ? `${mount}/metadata` : `${mount}/metadata/${path}`;
}

function ancestorMetadataPaths(mount: string, path: string, target: KvAccessTarget): readonly string[] {
  const segments = path.length === 0 ? [] : path.split('/');
  const ancestorCount = target === 'folder' ? segments.length : Math.max(segments.length - 1, 0);
  const paths = [metadataFolderPath(mount, '')];

  for (let index = 1; index <= ancestorCount; index += 1) {
    paths.push(metadataFolderPath(mount, segments.slice(0, index).join('/')));
  }

  return paths;
}

function createRule(
  pattern: string,
  capabilities: readonly VaultCapability[],
  source: PolicySource,
): PolicyRule {
  return { pattern, capabilities, source };
}

export function compileKvV2Rule(input: LogicalKvAccessRule): readonly PolicyRule[] {
  const mount = normalizeLogicalPath(input.mount);
  const path = normalizeLogicalPath(input.path);
  assertSafeLogicalPath(mount, 'mount');
  assertSafeLogicalPath(path, 'path');
  if (input.target === 'secret' && path.length === 0) {
    throw new Error('A secret access rule requires a path.');
  }

  if (input.level === 'inherited') return [];

  const preset = KV_PERMISSION_PRESETS[input.level];
  const rules: PolicyRule[] = [];
  const addEndpointRule = (endpoint: string, capabilities: readonly VaultCapability[]) => {
    if (capabilities.length === 0) return;
    rules.push(createRule(endpointPath(mount, endpoint, path, input.target), capabilities, input.source));
  };

  addEndpointRule('data', preset.data);
  addEndpointRule(
    'metadata',
    input.target === 'secret'
      ? preset.metadata.filter((capability) => capability !== 'list')
      : preset.metadata,
  );
  addEndpointRule('delete', preset.deleteVersions);
  addEndpointRule('undelete', preset.undeleteVersions);
  addEndpointRule('destroy', preset.destroyVersions);

  if (input.level !== 'deny') {
    for (const pattern of ancestorMetadataPaths(mount, path, input.target)) {
      rules.push(createRule(pattern, ['list'], input.source));
    }
  } else if (input.target === 'folder') {
    rules.push(createRule(metadataFolderPath(mount, path), ['deny'], input.source));
  }

  return rules;
}

function comparePaths(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function mergeRulesForHcl(rules: readonly PolicyRule[]): readonly Omit<PolicyRule, 'source'>[] {
  const capabilitiesByPattern = new Map<string, Set<VaultCapability>>();

  for (const rule of rules) {
    const capabilities = capabilitiesByPattern.get(rule.pattern) ?? new Set<VaultCapability>();
    rule.capabilities.forEach((capability) => capabilities.add(capability));
    capabilitiesByPattern.set(rule.pattern, capabilities);
  }

  return [...capabilitiesByPattern.entries()]
    .sort(([left], [right]) => comparePaths(left, right))
    .map(([pattern, capabilities]) => ({
      pattern,
      capabilities: capabilities.has('deny')
        ? ['deny']
        : VAULT_CAPABILITIES.filter(
            (capability) => capability !== 'deny' && capabilities.has(capability),
          ),
    }));
}

export function renderVaultPolicyHcl(rules: readonly PolicyRule[]): string {
  return mergeRulesForHcl(rules)
    .map(
      (rule) =>
        `path ${JSON.stringify(rule.pattern)} {\n  capabilities = [${rule.capabilities
          .map((capability) => JSON.stringify(capability))
          .join(', ')}]\n}`,
    )
    .join('\n\n');
}

export function compileKvV2Policy(inputs: readonly LogicalKvAccessRule[]): CompiledKvV2Policy {
  const rules = inputs.flatMap(compileKvV2Rule);
  return { rules, hcl: renderVaultPolicyHcl(rules) };
}
