import { useState } from 'react';

import { PkiGatewayProvider } from '@/application/engines/pki/PkiGatewayProvider';
import { usePkiIssuers, usePkiRoles } from '@/application/engines/pki/usePkiQueries';
import Button from '@/components/base/Button';
import type { PkiEngineGateway } from '@/domain/engines/pki/pki';
import EnginePageShell, { type EngineTab } from '../components/EnginePageShell';
import type { EnginePageProps } from '../engine-page';
import CertificateDetail from './components/CertificateDetail';
import CertificatesPanel from './components/CertificatesPanel';
import ConfigPanel from './components/ConfigPanel';
import GenerateRootDialog from './components/GenerateRootDialog';
import ImportBundleDialog from './components/ImportBundleDialog';
import IntermediateDialog from './components/IntermediateDialog';
import IssuerDetail from './components/IssuerDetail';
import IssuersPanel from './components/IssuersPanel';
import PkiOverview, { type CaDialog } from './components/PkiOverview';
import RoleDetail from './components/RoleDetail';
import RoleFormDialog from './components/RoleFormDialog';
import RolesPanel from './components/RolesPanel';
import { parsePkiRoute, pkiPath, type PkiTab } from './pki-route';
import { roleFormState } from './role-form';

interface PkiEnginePageProps extends EnginePageProps {
  /** Replaces the Vault adapter, e.g. with a fake in tests. */
  readonly gateway?: PkiEngineGateway;
}

function HeaderActions({ tab, onOpenDialog, onCreateRole }: {
  readonly tab: PkiTab;
  readonly onOpenDialog: (dialog: CaDialog) => void;
  readonly onCreateRole: () => void;
}) {
  if (tab === 'roles') {
    return (
      <Button size="sm" variant="primary" onClick={onCreateRole}>
        <i className="ri-add-line" aria-hidden="true" />
        Create role
      </Button>
    );
  }
  if (tab !== 'issuers') return null;
  return (
    <>
      <Button size="sm" onClick={() => onOpenDialog('import')}>
        <i className="ri-upload-2-line" aria-hidden="true" />
        <span className="hidden sm:inline">Import</span>
        <span className="sr-only sm:hidden">Import CA</span>
      </Button>
      <Button size="sm" onClick={() => onOpenDialog('intermediate')}>
        <i className="ri-git-branch-line" aria-hidden="true" />
        Intermediate
      </Button>
      <Button size="sm" variant="primary" onClick={() => onOpenDialog('root')}>
        <i className="ri-add-line" aria-hidden="true" />
        Root CA
      </Button>
    </>
  );
}

function PkiWorkspace({ engine, subPath, navigateTo }: EnginePageProps) {
  const mount = engine.path;
  const route = parsePkiRoute(subPath);
  const issuers = usePkiIssuers(mount);
  const roles = usePkiRoles(mount);
  const [dialog, setDialog] = useState<CaDialog>();
  const [creatingRole, setCreatingRole] = useState(false);
  const go = (tab: PkiTab, id?: string) => navigateTo(pkiPath(tab, id || undefined));
  const roleNames = roles.data ?? [];

  const tabs: readonly EngineTab[] = [
    { key: 'overview', label: 'Overview', icon: 'ri-dashboard-line' },
    { key: 'issuers', label: 'Issuers', icon: 'ri-shield-keyhole-line', count: issuers.data?.length },
    { key: 'roles', label: 'Roles', icon: 'ri-file-shield-2-line', count: roles.data?.length },
    { key: 'certificates', label: 'Certificates', icon: 'ri-file-list-3-line' },
    { key: 'config', label: 'Tidy & config', icon: 'ri-tools-line' },
  ];

  return (
    <EnginePageShell
      engine={engine}
      tabs={tabs}
      activeTab={route.tab}
      onTabChange={(key) => go(key as PkiTab)}
      actions={<HeaderActions tab={route.tab} onOpenDialog={setDialog} onCreateRole={() => setCreatingRole(true)} />}
    >
      {route.tab === 'overview' && <PkiOverview mount={mount} onOpenDialog={setDialog} onNavigate={go} />}
      {route.tab === 'issuers' && (route.id
        ? <IssuerDetail key={route.id} mount={mount} issuerRef={route.id} onBack={() => go('issuers')} />
        : <IssuersPanel mount={mount} onOpen={(id) => go('issuers', id)} onOpenDialog={setDialog} />)}
      {route.tab === 'roles' && (route.id
        ? <RoleDetail key={route.id} mount={mount} name={route.id} existingNames={roleNames} onBack={() => go('roles')} />
        : <RolesPanel mount={mount} onOpen={(name) => go('roles', name)} onCreate={() => setCreatingRole(true)} />)}
      {route.tab === 'certificates' && (route.id
        ? <CertificateDetail key={route.id} mount={mount} serial={route.id} onBack={() => go('certificates')} />
        : <CertificatesPanel mount={mount} onOpen={(serial) => go('certificates', serial)} />)}
      {route.tab === 'config' && <ConfigPanel mount={mount} />}

      <GenerateRootDialog mount={mount} open={dialog === 'root'} onClose={() => setDialog(undefined)} onCreated={(id) => { setDialog(undefined); go('issuers', id); }} />
      <IntermediateDialog mount={mount} open={dialog === 'intermediate'} onClose={() => setDialog(undefined)} onCreated={() => { setDialog(undefined); go('issuers'); }} />
      <ImportBundleDialog mount={mount} open={dialog === 'import'} onClose={() => setDialog(undefined)} />
      {creatingRole && (
        <RoleFormDialog
          mount={mount}
          open
          mode="create"
          initial={roleFormState('')}
          existingNames={roleNames}
          onClose={() => setCreatingRole(false)}
          onSaved={(name) => {
            setCreatingRole(false);
            go('roles', name);
          }}
        />
      )}
    </EnginePageShell>
  );
}

/** PKI workspace: CA setup, issuers, roles, certificates, and maintenance. */
export default function PkiEnginePage({ gateway, ...props }: PkiEnginePageProps) {
  return (
    <PkiGatewayProvider gateway={gateway}>
      <PkiWorkspace {...props} />
    </PkiGatewayProvider>
  );
}
