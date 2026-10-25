import { Link } from 'react-router-dom';

import Button from '@/components/base/Button';
import { engineIcon, type SecretEngine } from '@/domain/engines/engines';
import { engineRoute } from '@/router/engine-route';
import { EmptyNote, HOME_FOCUS_RING, HomeCard } from './HomeCard';

const LIST_LINK = `flex min-h-11 items-center gap-2 rounded-md px-2 text-xs text-foreground-700 hover:bg-background-100 hover:text-foreground-900 sm:min-h-9 ${HOME_FOCUS_RING}`;

export function EnginesCard({
  engines,
  onEnableEngine,
}: {
  readonly engines: readonly SecretEngine[];
  readonly onEnableEngine?: () => void;
}) {
  return (
    <HomeCard
      title="Secrets engines"
      icon="ri-instance-line"
      action={onEnableEngine && (
        <Button size="sm" variant="ghost" onClick={onEnableEngine}>
          <i className="ri-add-line" aria-hidden="true" />
          Enable
        </Button>
      )}
    >
      {engines.length === 0 ? (
        <EmptyNote icon="ri-instance-line" title="No other engines visible">
          Enable Database, Transit, PKI, or SSH to manage dynamic credentials, encryption, and certificates here.
        </EmptyNote>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {engines.map((engine) => (
            <li key={engine.path}>
              <Link to={engineRoute(engine.path)} className={LIST_LINK}>
                <i className={`${engineIcon(engine.kind)} text-sm text-foreground-400`} aria-hidden="true" />
                <span className="font-mono font-medium">{engine.path}/</span>
                <span className="min-w-0 flex-1 truncate text-foreground-500">{engine.description || engine.type}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
