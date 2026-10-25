import { useAuthenticatedShell } from '@/app/authenticated-shell';
import { useNavigationHistory } from '@/application/navigation-history/NavigationHistoryContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { useSessionClock } from '@/application/vault/useSessionClock';
import {
  AccessCenterCard,
  MountsCard,
  PathListCard,
} from './components/NavigationCards';
import { EnginesCard } from './components/EnginesCard';
import { SessionCard, VaultStatusCard } from './components/StatusCards';

// The authenticated shell owns session expiry; this clock only displays time left.
const DISPLAY_ONLY = () => undefined;

/** Overview shown after sign-in. Renders inside `AuthenticatedAppShell`'s outlet. */
export default function HomePage() {
  const vault = useVaultSession();
  const shell = useAuthenticatedShell();
  const { favorites, recents } = useNavigationHistory();
  const session = vault.session!;
  const clock = useSessionClock({
    expiresAt: session.expiresAt,
    leaseDurationSeconds: session.leaseDurationSeconds,
    onExpire: DISPLAY_ONLY,
  });

  return (
    <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5 sm:px-6">
        <header>
          <h1 className="text-base font-semibold text-foreground-900">Overview</h1>
          <p className="mt-0.5 text-xs text-foreground-500">
            Vault health, your session and the places you use most.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          <VaultStatusCard health={vault.health} serverUrl={session.serverUrl} />
          <SessionCard session={session} clock={clock} />
          <PathListCard
            title="Favorites"
            icon="ri-star-line"
            paths={favorites}
            emptyTitle="No favorites yet"
            emptyText="Pin a folder or secret with the star in Explorer to keep it here."
          />
          <PathListCard
            title="Recent secrets"
            icon="ri-history-line"
            paths={recents}
            emptyTitle="Nothing opened yet"
            emptyText="Secrets you inspect in Explorer will appear here."
          />
          <MountsCard mountsState={shell.mountsState} refreshMounts={shell.refreshMounts} />
          {shell.engines && <EnginesCard engines={shell.engines} onEnableEngine={shell.onEnableEngine} />}
          {vault.accessControlPermission.state !== 'denied' && <AccessCenterCard />}
        </div>
      </div>
    </main>
  );
}
