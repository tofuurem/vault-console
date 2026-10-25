import { useState } from 'react';

import { useTransitKeys } from '@/application/engines/transit/useTransitKeys';
import Button from '@/components/base/Button';
import type { EnginePageProps } from '../../engine-page';
import EnginePageShell from '../../components/EnginePageShell';
import { keyPath, parseTransitRoute } from '../transit-route';
import CreateTransitKeyDialog from './CreateTransitKeyDialog';
import TransitKeyDetail from './TransitKeyDetail';
import TransitKeyList from './TransitKeyList';
import TransitTools from './TransitTools';

/** Keys list with the selected key's workbench, plus mount-level tools. */
export default function TransitWorkspace({ engine, subPath, navigateTo }: EnginePageProps) {
  const route = parseTransitRoute(subPath);
  const keys = useTransitKeys(engine.path);
  const [createOpen, setCreateOpen] = useState(false);
  const selected = route.view === 'keys' ? route.key : undefined;

  const tabs = [
    { key: 'keys', label: 'Keys', icon: 'ri-key-2-line', count: keys.data?.length },
    { key: 'tools', label: 'Tools', icon: 'ri-tools-line' },
  ];

  return (
    <EnginePageShell
      engine={engine}
      tabs={tabs}
      activeTab={route.view}
      onTabChange={(tab) => navigateTo(tab === 'tools' ? 'tools' : 'keys')}
      actions={(
        <Button type="button" size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
          <i className="ri-add-line" aria-hidden="true" />
          Create key
        </Button>
      )}
    >
      {route.view === 'tools' ? (
        <TransitTools mount={engine.path} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside aria-label="Keys" className={selected ? 'hidden lg:block' : undefined}>
            <TransitKeyList
              keys={keys.data}
              pending={keys.isPending}
              error={keys.error}
              selected={selected}
              onSelect={(name) => navigateTo(keyPath(name))}
              onCreate={() => setCreateOpen(true)}
            />
          </aside>
          {route.view === 'keys' && route.key ? (
            <TransitKeyDetail
              key={route.key}
              mount={engine.path}
              name={route.key}
              section={route.section}
              operation={route.operation}
              navigateTo={navigateTo}
            />
          ) : (
            <div className="hidden min-h-48 items-center justify-center rounded-lg border border-dashed border-background-300 p-6 text-center lg:flex">
              <div>
                <i className="ri-cursor-line text-xl text-foreground-400" aria-hidden="true" />
                <p className="mt-1 text-xs text-foreground-600">Select a key to encrypt, sign, rotate, or change its settings.</p>
              </div>
            </div>
          )}
        </div>
      )}
      <CreateTransitKeyDialog
        mount={engine.path}
        open={createOpen}
        existing={keys.data ?? []}
        onClose={() => setCreateOpen(false)}
        onCreated={(name) => {
          setCreateOpen(false);
          navigateTo(keyPath(name));
        }}
      />
    </EnginePageShell>
  );
}
