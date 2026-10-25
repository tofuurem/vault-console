import { useRotateTransitKey, useTransitKey } from '@/application/engines/transit/useTransitKeys';
import { useToast } from '@/application/notifications/ToastContext';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import { formatTtlSeconds } from '@/domain/engines/engines';
import { transitErrorText, type TransitKey } from '@/domain/engines/transit/transit';
import { transitKeyTypeLabel, type TransitOperation } from '@/domain/engines/transit/transit-key-types';
import { normalizeVaultError } from '@/domain/vault/errors';
import { keyPath, type KeySection } from '../transit-route';
import { OperationError } from './fields';
import TransitKeySettings from './TransitKeySettings';
import TransitKeyVersions from './TransitKeyVersions';
import TransitWorkbench from './TransitWorkbench';

const SECTIONS: readonly (readonly [KeySection, string, string])[] = [
  ['operations', 'Operations', 'ri-flask-line'],
  ['versions', 'Versions', 'ri-history-line'],
  ['settings', 'Settings', 'ri-settings-4-line'],
];

interface TransitKeyDetailProps {
  readonly mount: string;
  readonly name: string;
  readonly section: KeySection;
  readonly operation?: TransitOperation;
  readonly navigateTo: (subPath: string) => void;
}

function KeyBadges({ transitKey }: { readonly transitKey: TransitKey }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="info">{transitKeyTypeLabel(transitKey.type)}</Badge>
      <Badge>{`v${transitKey.latestVersion}`}</Badge>
      {transitKey.derived && <Badge>Derived</Badge>}
      {transitKey.convergentEncryption && <Badge>Convergent</Badge>}
      {transitKey.exportable && <Badge variant="warning">Exportable</Badge>}
      {transitKey.allowPlaintextBackup && <Badge variant="warning">Plaintext backup</Badge>}
      {transitKey.importedKey && <Badge>Imported</Badge>}
      {transitKey.deletionAllowed && <Badge variant="danger">Deletion allowed</Badge>}
      {transitKey.autoRotatePeriodSeconds > 0 && <Badge variant="success">{`Rotates every ${formatTtlSeconds(transitKey.autoRotatePeriodSeconds)}`}</Badge>}
    </div>
  );
}

function KeyHeader({ mount, transitKey, onBack }: { readonly mount: string; readonly transitKey: TransitKey; readonly onBack: () => void }) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirmDialog();
  const rotate = useRotateTransitKey(mount, transitKey.name);
  const requestRotate = async () => {
    const confirmed = await confirm({
      title: `Rotate ${transitKey.name}`,
      message: `Create version ${transitKey.latestVersion + 1}. New data uses it right away; existing ciphertext and signatures keep working with older versions.`,
      confirmLabel: 'Rotate key',
    });
    if (!confirmed) return;
    rotate.mutate(undefined, { onSuccess: () => toast.success(`Rotated ${transitKey.name} to version ${transitKey.latestVersion + 1}.`) });
  };
  return (
    <header className="space-y-2">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 lg:hidden"
      >
        <i className="ri-arrow-left-s-line" aria-hidden="true" />
        All keys
      </button>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <h2 className="break-all font-mono text-sm font-semibold text-foreground-900">{transitKey.name}</h2>
          <KeyBadges transitKey={transitKey} />
        </div>
        <Button type="button" size="sm" onClick={() => void requestRotate()} loading={rotate.isPending}>
          {!rotate.isPending && <i className="ri-loop-right-line" aria-hidden="true" />}
          Rotate
        </Button>
      </div>
      <OperationError error={rotate.error} action="rotate this key" />
      {confirmDialog}
    </header>
  );
}

function SectionNav({ active, onChange }: { readonly active: KeySection; readonly onChange: (section: KeySection) => void }) {
  return (
    <nav aria-label="Key sections" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-background-200">
      {SECTIONS.map(([key, label, icon]) => (
        <button
          key={key}
          type="button"
          aria-current={key === active ? 'page' : undefined}
          onClick={() => onChange(key)}
          className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-9 ${
            key === active ? 'border-primary-500 text-primary-700' : 'border-transparent text-foreground-600 hover:text-foreground-900'
          }`}
        >
          <i className={`${icon} text-sm`} aria-hidden="true" />
          {label}
        </button>
      ))}
    </nav>
  );
}

function KeyLoadError({ error, name, onBack }: { readonly error: unknown; readonly name: string; readonly onBack: () => void }) {
  const normalized = normalizeVaultError(error);
  const message = normalized.code === 'not-found'
    ? `There is no key named ${name} on this mount. It may have been deleted.`
    : transitErrorText(normalized, 'read this key').message;
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-background-300 bg-background-50 p-4">
      <h2 className="text-sm font-semibold text-foreground-900">{normalized.code === 'not-found' ? 'Key not found' : 'Key could not be loaded'}</h2>
      <p className="text-xs leading-5 text-foreground-600">{message}</p>
      <Button type="button" size="sm" onClick={onBack}>Back to keys</Button>
    </div>
  );
}

/** Header, section tabs, and the selected section for one key. */
export default function TransitKeyDetail({ mount, name, section, operation, navigateTo }: TransitKeyDetailProps) {
  const query = useTransitKey(mount, name);
  const back = () => navigateTo('keys');
  if (query.isPending) return <ContentSkeleton variant="detail" label={`Loading ${name}`} />;
  if (query.isError) return <KeyLoadError error={query.error} name={name} onBack={back} />;
  const transitKey = query.data;
  return (
    <div className="space-y-4">
      <KeyHeader mount={mount} transitKey={transitKey} onBack={back} />
      <SectionNav active={section} onChange={(next) => navigateTo(keyPath(name, next))} />
      {section === 'operations' && (
        <TransitWorkbench
          mount={mount}
          transitKey={transitKey}
          operation={operation}
          onOperationChange={(next) => navigateTo(keyPath(name, next))}
        />
      )}
      {section === 'versions' && (
        <TransitKeyVersions mount={mount} transitKey={transitKey} onOpenSettings={() => navigateTo(keyPath(name, 'settings'))} />
      )}
      {section === 'settings' && <TransitKeySettings mount={mount} transitKey={transitKey} onDeleted={back} />}
    </div>
  );
}
