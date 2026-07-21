import { useState, useCallback } from 'react';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import Tooltip from '@/components/base/Tooltip';
import Badge from '@/components/base/Badge';
import PermissionTree from './PermissionTree';
import type { PermissionLevel, PathPermission } from '@/mocks/vault-acl';
import { vaultMountTree, vaultGroups, vaultRoles, generatePassword, passwordStrength, permissionLevels } from '@/mocks/vault-acl';

interface CreateUserWizardProps {
  onDone: () => void;
  onCancel: () => void;
}

type WizardStep = 'account' | 'groups' | 'access' | 'review' | 'apply' | 'success';

interface OperationStatus {
  name: string;
  status: 'pending' | 'progress' | 'completed' | 'failed' | 'rolled-back';
}

const defaultOps: OperationStatus[] = [
  { name: 'Create ACL policy', status: 'pending' },
  { name: 'Create userpass account', status: 'pending' },
  { name: 'Create identity entity', status: 'pending' },
  { name: 'Find userpass mount accessor', status: 'pending' },
  { name: 'Create entity alias', status: 'pending' },
  { name: 'Add entity to internal groups', status: 'pending' },
  { name: 'Attach selected policies', status: 'pending' },
];

export default function CreateUserWizard({ onDone, onCancel }: CreateUserWizardProps) {
  const [step, setStep] = useState<WizardStep>('account');

  // Step 1 - Account
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [userpassMount, setUserpassMount] = useState('userpass');
  const [password, setPassword] = useState(generatePassword());
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  // Step 2 - Groups & Roles
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');

  // Step 3 - Direct KV Access
  const [directPermissions, setDirectPermissions] = useState<PathPermission[]>([]);

  // Step 4 - Review (generated automatically)

  // Step 5 - Apply
  const [operations, setOperations] = useState<OperationStatus[]>(defaultOps);
  const [applyStarted, setApplyStarted] = useState(false);

  // Show inline group/role creation
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewRole, setShowNewRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');

  const pwStrength = passwordStrength(password);

  const generateNewPassword = () => {
    setPassword(generatePassword());
    setPasswordRevealed(false);
  };

  const validateStep1 = (): boolean => {
    if (!username.trim()) { setUsernameError('Username is required'); return false; }
    if (!/^[a-z][a-z0-9._-]*$/.test(username.trim())) { setUsernameError('Username must start with a letter and contain only lowercase letters, numbers, dots, underscores, and hyphens'); return false; }
    setUsernameError('');
    return true;
  };

  const handleNext = () => {
    if (step === 'account' && !validateStep1()) return;
    if (step === 'account') { setStep('groups'); return; }
    if (step === 'groups') { setStep('access'); return; }
    if (step === 'access') { setStep('review'); return; }
    if (step === 'review') { setStep('apply'); runApply(); return; }
    if (step === 'success') { onDone(); return; }
  };

  const handleBack = () => {
    if (step === 'groups') { setStep('account'); return; }
    if (step === 'access') { setStep('groups'); return; }
    if (step === 'review') { setStep('access'); return; }
  };

  const toggleGroup = (name: string) => {
    setSelectedGroups((prev) => prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name]);
  };

  const toggleRole = (name: string) => {
    setSelectedRoles((prev) => prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]);
  };

  const handlePermissionChange = useCallback((path: string, level: PermissionLevel) => {
    setDirectPermissions((prev) => {
      const existing = prev.findIndex((p) => p.path === path);
      if (existing >= 0) {
        if (level === 'none') {
          const next = [...prev];
          next[existing] = { ...next[existing], level: 'none', explicitDeny: true, source: `vc-user-${username}` };
          return next;
        }
        const next = [...prev];
        next[existing] = { ...next[existing], level, explicitDeny: false };
        return next;
      }
      if (level === 'none') {
        return [...prev, { path: path, level: 'none', explicitDeny: true, source: `vc-user-${username}` }];
      }
      return [...prev, { path, level, source: `vc-user-${username}` }];
    });
  }, [username]);

  const runApply = async () => {
    setApplyStarted(true);
    const ops = [...defaultOps];
    let hasFailure = false;

    for (let i = 0; i < ops.length; i++) {
      if (hasFailure) break;
      setOperations([...ops]);
      ops[i].status = 'progress';
      setOperations([...ops]);
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
      // Simulate potential failure on step 5 for demo
      if (i === 4 && Math.random() < 0) {
        ops[i].status = 'failed';
        setOperations([...ops]);
        // Mark remaining as rolled back
        for (let j = i + 1; j < ops.length; j++) ops[j].status = 'rolled-back';
        for (let j = 0; j < i; j++) ops[j].status = 'completed';
        setOperations([...ops]);
        hasFailure = true;
        break;
      }
      ops[i].status = 'completed';
      setOperations([...ops]);
    }

    if (!hasFailure) {
      setTimeout(() => setStep('success'), 500);
    }
  };

  const getEffectivePermsForReview = (): PathPermission[] => {
    const allPerms: Map<string, PathPermission> = new Map();

    // Add direct permissions
    directPermissions.forEach((p) => {
      allPerms.set(p.path, { ...p });
    });

    // Add role permissions
    selectedRoles.forEach((roleName) => {
      const role = vaultRoles.find((r) => r.name === roleName);
      if (role) {
        role.permissions.forEach((p) => {
          const existing = allPerms.get(p.path);
          if (!existing) {
            allPerms.set(p.path, { ...p, source: role.display_name, inherited: true });
          }
        });
      }
    });

    return Array.from(allPerms.values());
  };

  const generateHCL = (): string => {
    const lines: string[] = [`# ${username ? `vc-user-${username}` : 'vc-user-<username>'}`];
    directPermissions.forEach((perm) => {
      const caps = perm.level === 'view' ? ['read', 'list'] :
        perm.level === 'edit' ? ['create', 'read', 'update', 'list'] :
        perm.level === 'manage' ? ['create', 'read', 'update', 'delete', 'list'] :
        perm.level === 'owner' ? ['create', 'read', 'update', 'delete', 'list'] : ['deny'];
      if (perm.level === 'none' && perm.explicitDeny) {
        lines.push(`\n# Explicit deny`);
        lines.push(`path "${perm.path.slice(0, -1)}" {`);
        lines.push(`  capabilities = ["deny"]`);
        lines.push(`}`);
      } else if (perm.level !== 'none') {
        lines.push(`\npath "${perm.path}" {`);
        lines.push(`  capabilities = [${caps.map((c) => `"${c}"`).join(', ')}]`);
        lines.push(`}`);
      }
    });
    return lines.join('\n');
  };

  const fullPath = `${userpassMount}/${username}`;
  const stepLabels: { key: WizardStep; label: string }[] = [
    { key: 'account', label: 'Account' },
    { key: 'groups', label: 'Groups & Roles' },
    { key: 'access', label: 'KV Access' },
    { key: 'review', label: 'Review' },
    { key: 'apply', label: 'Apply' },
  ];

  const currentStepIdx = stepLabels.findIndex((s) => s.key === step);

  const accountTab = (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground-900">Account Setup</h3>
        <p className="text-xs text-foreground-500 mt-1">Create the userpass account and set up authentication.</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-foreground-500 w-24 shrink-0">Auth method</span>
          <span className="font-mono text-foreground-800 bg-background-100 px-1.5 py-0.5 rounded">Userpass</span>
          <span className="text-foreground-400">(fixed for this version)</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-foreground-700 w-24 shrink-0">Mount path</label>
          <input
            type="text"
            value={userpassMount}
            onChange={(e) => setUserpassMount(e.target.value)}
            className="h-8 px-2.5 text-sm font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900 w-48 focus:outline-none focus:border-primary-400"
          />
        </div>

        <div className="flex items-start gap-2">
          <label className="text-xs font-medium text-foreground-700 w-24 shrink-0 pt-2">Username</label>
          <div className="flex-1 max-w-xs">
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setUsernameError(''); }}
              placeholder="alice.johnson"
              className="w-full h-8 px-2.5 text-sm font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900 focus:outline-none focus:border-primary-400"
            />
            {usernameError && <p className="text-xs text-red-500 mt-1">{usernameError}</p>}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <label className="text-xs font-medium text-foreground-700 w-24 shrink-0 pt-2">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Alice Johnson"
            className="h-8 px-2.5 text-sm rounded-md border border-background-300 bg-background-50 text-foreground-900 w-56 focus:outline-none focus:border-primary-400"
          />
        </div>

        <div className="border-t border-background-200 pt-4">
          <label className="text-xs font-semibold text-foreground-700">Password</label>
          <div className="mt-2 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <input
                  type={passwordRevealed ? 'text' : 'password'}
                  value={password}
                  readOnly
                  className="w-full h-8 px-2.5 pr-16 text-sm font-mono rounded-md border border-background-300 bg-background-50 text-foreground-900"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <Tooltip content={passwordRevealed ? 'Hide password' : 'Reveal password'}>
                    <button onClick={() => setPasswordRevealed(!passwordRevealed)} className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
                      <i className={`${passwordRevealed ? 'ri-eye-off-line' : 'ri-eye-line'} text-xs`} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Copy password">
                    <button onClick={() => navigator.clipboard.writeText(password)} className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
                      <i className="ri-file-copy-line text-xs" />
                    </button>
                  </Tooltip>
                </div>
              </div>
              <button onClick={generateNewPassword} className="h-8 px-2.5 text-xs rounded-md bg-background-100 text-foreground-600 hover:bg-background-200 border border-background-300 cursor-pointer whitespace-nowrap flex items-center gap-1">
                <i className="ri-refresh-line text-sm" /> Regenerate
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 max-w-sm h-1.5 rounded-full bg-background-200 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pwStrength.color}`} style={{ width: `${(pwStrength.score / 6) * 100}%` }} />
              </div>
              <span className="text-[11px] font-medium text-foreground-600">{pwStrength.label}</span>
              <span className="text-[11px] text-foreground-400">{password.length} chars</span>
            </div>
          </div>
          <p className="text-[11px] text-foreground-400 mt-2">
            Generated passwords are not stored in browser storage. Copy or save this password now.
          </p>
        </div>
      </div>
    </div>
  );

  const groupsTab = (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground-900">Groups & Roles</h3>
        <p className="text-xs text-foreground-500 mt-1">Add this user to internal groups and assign access roles.</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-foreground-700">Groups</label>
            <button onClick={() => setShowNewGroup(!showNewGroup)} className="text-[10px] text-primary-600 hover:text-primary-700 cursor-pointer flex items-center gap-0.5">
              <i className="ri-add-line" /> New group
            </button>
          </div>
          {showNewGroup && (
            <div className="mb-2 flex items-center gap-1.5">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="new-group-name"
                className="flex-1 h-7 px-2 text-xs font-mono rounded border border-background-300 bg-background-50 focus:outline-none focus:border-primary-400"
              />
              <button onClick={() => { setShowNewGroup(false); setNewGroupName(''); }} className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
                <i className="ri-close-line text-xs" />
              </button>
            </div>
          )}
          <div className="relative mb-2">
            <i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-foreground-400" />
            <input
              type="text"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Search groups..."
              className="w-full h-7 pl-5 pr-2 text-xs rounded-md border border-background-300 bg-background-50 focus:outline-none focus:border-primary-400"
            />
          </div>
          <div className="space-y-0.5 max-h-48 overflow-y-auto border border-background-200 rounded-md">
            {vaultGroups
              .filter((g) => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
              .map((g) => (
                <label key={g.name} className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-background-100 transition-colors text-xs ${selectedGroups.includes(g.name) ? 'bg-primary-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g.name)}
                    onChange={() => toggleGroup(g.name)}
                    className="w-3.5 h-3.5 rounded border-background-300 text-primary-500 focus:ring-primary-400 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground-800">{g.name}</span>
                    <span className="text-foreground-400 ml-1.5">{g.member_count} members</span>
                  </div>
                </label>
              ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-foreground-700">Roles</label>
            <button onClick={() => setShowNewRole(!showNewRole)} className="text-[10px] text-primary-600 hover:text-primary-700 cursor-pointer flex items-center gap-0.5">
              <i className="ri-add-line" /> New role
            </button>
          </div>
          {showNewRole && (
            <div className="mb-2 flex items-center gap-1.5">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="vc-role-..."
                className="flex-1 h-7 px-2 text-xs font-mono rounded border border-background-300 bg-background-50 focus:outline-none focus:border-primary-400"
              />
              <button onClick={() => { setShowNewRole(false); setNewRoleName(''); }} className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
                <i className="ri-close-line text-xs" />
              </button>
            </div>
          )}
          <div className="relative mb-2">
            <i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-foreground-400" />
            <input
              type="text"
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              placeholder="Search roles..."
              className="w-full h-7 pl-5 pr-2 text-xs rounded-md border border-background-300 bg-background-50 focus:outline-none focus:border-primary-400"
            />
          </div>
          <div className="space-y-0.5 max-h-48 overflow-y-auto border border-background-200 rounded-md">
            {vaultRoles
              .filter((r) => r.display_name.toLowerCase().includes(roleSearch.toLowerCase()) || r.name.toLowerCase().includes(roleSearch.toLowerCase()))
              .map((role) => (
                <label key={role.name} className={`flex items-start gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-background-100 transition-colors text-xs ${selectedRoles.includes(role.name) ? 'bg-primary-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role.name)}
                    onChange={() => toggleRole(role.name)}
                    className="w-3.5 h-3.5 mt-0.5 rounded border-background-300 text-primary-500 focus:ring-primary-400 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground-800">{role.display_name}</div>
                    <div className="text-[10px] text-foreground-400 mt-0.5">{role.access_summary}</div>
                  </div>
                </label>
              ))}
          </div>
        </div>
      </div>

      {(selectedGroups.length > 0 || selectedRoles.length > 0) && (
        <div className="border-t border-background-200 pt-3">
          <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Summary</span>
          <div className="mt-1.5 space-y-1 text-xs">
            {selectedGroups.map((g) => (
              <div key={g} className="flex items-center gap-1.5">
                <i className="ri-group-line text-foreground-400 text-sm" />
                <span className="text-foreground-700">{g}</span>
                <span className="text-[10px] text-foreground-400">
                  → {vaultGroups.find((x) => x.name === g)?.roles.map((r) => vaultRoles.find((x) => x.name === r)?.display_name).join(', ')}
                </span>
              </div>
            ))}
            {selectedRoles.map((r) => (
              <div key={r} className="flex items-center gap-1.5">
                <i className="ri-shield-check-line text-foreground-400 text-sm" />
                <span className="text-foreground-700">{vaultRoles.find((x) => x.name === r)?.display_name}</span>
                <Badge variant="info">Direct</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const accessTab = (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground-900">Direct KV Access</h3>
        <p className="text-xs text-foreground-500 mt-1">
          Grant user-specific permissions on KV v2 paths. Selecting a folder applies recursively. Use explicit denies to override group or role grants.
        </p>
      </div>

      <div className="border border-background-200 rounded-md p-3 bg-background-50 max-h-[420px] overflow-y-auto">
        <PermissionTree
          tree={vaultMountTree}
          permissions={directPermissions}
          onPermissionChange={handlePermissionChange}
          compact={false}
        />
      </div>

      <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
        <strong>Important:</strong> Explicit denies (No access) override any permissions granted through groups or roles. A deny on a child path will block access even if a parent path grants broader permissions.
      </div>

      {directPermissions.some((p) => p.level === 'owner') && (
        <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700">
          <strong>Danger:</strong> You are granting Owner access on one or more paths. This allows permanent destruction of versions and metadata. Ensure this is intentional.
        </div>
      )}
    </div>
  );

  const reviewTab = (
    <div className="p-6 space-y-5 overflow-y-auto">
      <div>
        <h3 className="text-sm font-semibold text-foreground-900">Review Summary</h3>
        <p className="text-xs text-foreground-500 mt-1">Review the user configuration before applying changes.</p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-[140px_1fr] gap-2 text-xs">
          <span className="text-foreground-500">Username</span>
          <span className="font-mono text-foreground-800 font-medium">{username || '—'}</span>

          <span className="text-foreground-500">Display name</span>
          <span className="text-foreground-800">{displayName || '—'}</span>

          <span className="text-foreground-500">Auth mount</span>
          <span className="font-mono text-foreground-800">{userpassMount}/</span>

          <span className="text-foreground-500">Password</span>
          <span className="text-foreground-500 font-mono">••••••••••••••• ({password.length} chars, {pwStrength.label})</span>

          <span className="text-foreground-500">Groups</span>
          <span className="text-foreground-800">
            {selectedGroups.length > 0 ? selectedGroups.join(', ') : <span className="text-foreground-400">None</span>}
          </span>

          <span className="text-foreground-500">Roles</span>
          <span className="text-foreground-800">
            {selectedRoles.length > 0 ? selectedRoles.map((r) => vaultRoles.find((x) => x.name === r)?.display_name).join(', ') : <span className="text-foreground-400">None</span>}
          </span>
        </div>

        {directPermissions.length > 0 && (
          <div className="border-t border-background-200 pt-3">
            <span className="text-[11px] font-semibold text-foreground-500 uppercase tracking-wider">Direct Path Permissions</span>
            <div className="mt-1.5 space-y-0.5">
              {directPermissions.map((perm) => (
                <div key={perm.path} className="flex items-center gap-2 text-xs pl-2 border-l-2 border-primary-400">
                  <span className="font-mono text-foreground-700">{perm.path}</span>
                  <Badge variant={perm.explicitDeny ? 'danger' : perm.level === 'owner' ? 'danger' : 'info'}>
                    {perm.explicitDeny ? 'Denied' : permissionLevels.find((l) => l.value === perm.level)?.label || 'View'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="border border-background-200 rounded-md">
          <summary className="px-3 py-1.5 text-xs font-medium text-foreground-600 cursor-pointer hover:text-foreground-800 select-none">
            <i className="ri-code-line text-sm mr-1.5" />
            Generated Vault policy (HCL)
          </summary>
          <div className="px-3 py-2 border-t border-background-200 bg-background-100">
            <pre className="text-[11px] font-mono text-foreground-700 whitespace-pre overflow-x-auto">{generateHCL() || '# No direct access policy will be created'}</pre>
          </div>
        </details>

        <details className="border border-background-200 rounded-md">
          <summary className="px-3 py-1.5 text-xs font-medium text-foreground-600 cursor-pointer hover:text-foreground-800 select-none">
            <i className="ri-terminal-line text-sm mr-1.5" />
            Vault operations
          </summary>
          <div className="px-3 py-2 border-t border-background-200 space-y-0.5">
            {defaultOps.map((op, idx) => (
              <div key={idx} className="text-[11px] text-foreground-600 flex items-center gap-1.5">
                <span className="text-foreground-400">{idx + 1}.</span>
                {op.name}
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );

  const applyTab = (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground-900">Applying changes</h3>
        <p className="text-xs text-foreground-500 mt-1">Vault operations are in progress. Do not close this page.</p>
      </div>

      <div className="space-y-1.5">
        {operations.map((op, idx) => (
          <div key={idx} className={`flex items-center gap-2.5 px-3 py-2 rounded-md border text-xs ${
            op.status === 'failed' ? 'border-red-200 bg-red-50' :
            op.status === 'rolled-back' ? 'border-amber-200 bg-amber-50' :
            op.status === 'completed' ? 'border-emerald-200 bg-emerald-50' :
            op.status === 'progress' ? 'border-primary-200 bg-primary-50' :
            'border-background-200 bg-background-50'
          }`}>
            <span className={`w-4 h-4 flex items-center justify-center shrink-0 ${
              op.status === 'completed' ? 'text-emerald-600' :
              op.status === 'failed' ? 'text-red-600' :
              op.status === 'rolled-back' ? 'text-amber-600' :
              op.status === 'progress' ? 'text-primary-600' :
              'text-foreground-300'
            }`}>
              <i className={`${
                op.status === 'completed' ? 'ri-checkbox-circle-fill' :
                op.status === 'failed' ? 'ri-close-circle-fill' :
                op.status === 'rolled-back' ? 'ri-arrow-go-back-fill' :
                op.status === 'progress' ? 'ri-loader-4-line animate-spin' :
                'ri-checkbox-blank-circle-line'
              } text-sm`} />
            </span>
            <span className={`font-medium ${
              op.status === 'failed' ? 'text-red-700' :
              op.status === 'completed' ? 'text-emerald-700' :
              op.status === 'progress' ? 'text-primary-700' :
              'text-foreground-600'
            }`}>{op.name}</span>
            <span className="text-[10px] text-foreground-400 ml-auto capitalize">{op.status.replace('-', ' ')}</span>
          </div>
        ))}
      </div>

      {operations.some((o) => o.status === 'failed') && (
        <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 space-y-2">
          <p className="text-xs text-red-700 font-medium">Partial failure — some operations did not complete.</p>
          <p className="text-[11px] text-red-600">
            Completed operations may have left objects in Vault. You can retry from the failed step or perform a best-effort rollback.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary">Retry</Button>
            <Button size="sm" variant="danger">Rollback all</Button>
          </div>
        </div>
      )}
    </div>
  );

  const successTab = (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
          <i className="ri-check-line text-emerald-600 text-lg" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground-900">User created successfully</h3>
          <p className="text-xs text-foreground-500">All Vault operations completed</p>
        </div>
      </div>

      <div className="border border-background-200 rounded-md p-4 space-y-3 bg-background-50">
        <div className="grid grid-cols-[120px_1fr] gap-2 text-xs">
          <span className="text-foreground-500">Username</span>
          <span className="font-mono text-foreground-800 font-medium">{username}</span>
          <span className="text-foreground-500">Auth mount</span>
          <span className="font-mono text-foreground-800">{userpassMount}/</span>
          <span className="text-foreground-500">Groups</span>
          <span className="text-foreground-800">{selectedGroups.length > 0 ? selectedGroups.join(', ') : 'None'}</span>
          <span className="text-foreground-500">Roles</span>
          <span className="text-foreground-800">{selectedRoles.length > 0 ? selectedRoles.map((r) => vaultRoles.find((x) => x.name === r)?.display_name).join(', ') : 'None'}</span>
        </div>

        <div className="border-t border-background-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground-700">One-time password handoff</span>
            <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
              <i className="ri-alert-line" /> Will not be shown again
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={passwordRevealed ? 'text' : 'password'}
                value={password}
                readOnly
                className="w-full h-9 px-3 pr-20 text-sm font-mono rounded-md border border-amber-300 bg-amber-50/50 text-foreground-900"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <Tooltip content={passwordRevealed ? 'Hide' : 'Reveal'}>
                  <button onClick={() => setPasswordRevealed(!passwordRevealed)} className="w-7 h-7 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
                    <i className={`${passwordRevealed ? 'ri-eye-off-line' : 'ri-eye-line'} text-sm`} />
                  </button>
                </Tooltip>
                <Tooltip content="Copy password">
                  <button onClick={() => navigator.clipboard.writeText(password)} className="w-7 h-7 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 cursor-pointer">
                    <i className="ri-file-copy-line text-sm" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(`Username: ${username}\nPassword: ${password}`)}>
              <i className="ri-file-copy-line" /> Copy handoff
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(username)}>
              <i className="ri-user-line" /> Copy username
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="primary" size="md" onClick={onDone}>Create another user</Button>
        <Button variant="secondary" size="md" onClick={onDone}>View users list</Button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-background-200 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={onCancel} className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer">
              <i className="ri-arrow-left-line text-sm" />
            </button>
            <h2 className="text-sm font-semibold text-foreground-900">Create user</h2>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {stepLabels.map((s, idx) => (
            <div key={s.key} className="flex items-center gap-1">
              {idx > 0 && <span className="w-8 h-px bg-background-300" />}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                idx === currentStepIdx ? 'bg-primary-500 text-background-50' :
                idx < currentStepIdx ? 'bg-emerald-100 text-emerald-700' :
                'bg-background-200 text-foreground-500'
              }`}>
                {idx < currentStepIdx ? (
                  <i className="ri-check-line text-[10px]" />
                ) : (
                  <span className="text-[10px]">{idx + 1}</span>
                )}
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {step === 'account' && accountTab}
        {step === 'groups' && groupsTab}
        {step === 'access' && accessTab}
        {step === 'review' && reviewTab}
        {step === 'apply' && applyTab}
        {step === 'success' && successTab}
      </div>

      {step !== 'success' && step !== 'apply' && (
        <div className="px-5 py-3 border-t border-background-200 shrink-0 flex items-center justify-between bg-background-50">
          <div>
            {step !== 'account' && (
              <Button variant="secondary" size="sm" onClick={handleBack}>
                <i className="ri-arrow-left-line" /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 'review' && (
              <span className="text-[11px] text-foreground-400">Review before applying</span>
            )}
            <Button variant="primary" size="sm" onClick={handleNext}>
              {step === 'review' ? (
                <><i className="ri-play-circle-line" /> Apply changes</>
              ) : (
                <>Next <i className="ri-arrow-right-line" /></>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}