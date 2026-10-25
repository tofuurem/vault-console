import { useState } from 'react';

import { SshGatewayProvider } from '@/application/engines/ssh/SshGatewayProvider';
import { useSshCa, useSshRoles } from '@/application/engines/ssh/useSsh';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type { SshEngineGateway } from '@/domain/engines/ssh/ssh';
import EnginePageShell, { type EngineTab } from '../components/EnginePageShell';
import type { EnginePageProps } from '../engine-page';
import SshCaPanel from './components/SshCaPanel';
import SshOtpPanel from './components/SshOtpPanel';
import SshRolesPanel from './components/SshRolesPanel';
import SshSignPanel from './components/SshSignPanel';
import { parseSshRoute, sshRoutePath, type SshRoute, type SshTab } from './ssh-route';

function SshWorkspace({ engine, subPath, navigateTo }: EnginePageProps) {
  const vault = useVaultSession();
  const route = parseSshRoute(subPath);
  const ca = useSshCa(engine.path);
  const roles = useSshRoles(engine.path);
  const [creating, setCreating] = useState(false);
  const caConfigured = ca.isSuccess ? ca.data !== null : undefined;
  const mount = engine.path;

  const go = (next: SshRoute) => {
    setCreating(false);
    navigateTo(sshRoutePath(next));
  };
  const createRole = () => {
    navigateTo('roles');
    setCreating(true);
  };

  const tabs: readonly EngineTab[] = [
    { key: 'ca', label: 'Signing CA', icon: 'ri-key-2-line' },
    { key: 'roles', label: 'Roles', icon: 'ri-file-shield-2-line', count: roles.data?.length },
    { key: 'sign', label: 'Sign key', icon: 'ri-quill-pen-line' },
    { key: 'otp', label: 'OTP', icon: 'ri-key-line' },
  ];

  return (
    <EnginePageShell engine={engine} tabs={tabs} activeTab={route.tab} onTabChange={(key) => go({ tab: key as SshTab })}>
      {route.tab === 'ca' && (
        <SshCaPanel
          mount={mount}
          serverUrl={vault.session?.serverUrl ?? ''}
          roleCount={roles.data?.length}
          onCreateRole={createRole}
        />
      )}
      {route.tab === 'roles' && (
        <SshRolesPanel
          mount={mount}
          selected={route.role}
          creating={creating}
          caConfigured={caConfigured}
          onSelect={(role) => go({ tab: 'roles', role })}
          onCreate={createRole}
          onCancelCreate={() => setCreating(false)}
          onOpenCa={() => go({ tab: 'ca' })}
          onSign={(role) => go({ tab: 'sign', role })}
          onOtp={(role) => go({ tab: 'otp', role })}
        />
      )}
      {route.tab === 'sign' && (
        <SshSignPanel
          mount={mount}
          role={route.role}
          caConfigured={caConfigured}
          onRoleChange={(role) => go({ tab: 'sign', role })}
          onOpenCa={() => go({ tab: 'ca' })}
          onOpenRoles={createRole}
        />
      )}
      {route.tab === 'otp' && (
        <SshOtpPanel
          mount={mount}
          role={route.role}
          onRoleChange={(role) => go({ tab: 'otp', role })}
          onOpenRoles={createRole}
        />
      )}
    </EnginePageShell>
  );
}

interface SshEnginePageProps extends EnginePageProps {
  /** Replaces the Vault adapter, e.g. with a fake in tests. */
  readonly gateway?: SshEngineGateway;
}

/** SSH secrets engine: signing CA, roles, certificate signing, and one-time passwords. */
export default function SshEnginePage({ gateway, ...props }: SshEnginePageProps) {
  return (
    <SshGatewayProvider gateway={gateway}>
      <SshWorkspace {...props} />
    </SshGatewayProvider>
  );
}
