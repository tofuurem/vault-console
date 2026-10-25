import type { SecretEngine } from '@/domain/engines/engines';

/**
 * Props every engine workspace receives from the `/engines/*` route. Engine
 * pages own everything below their mount; `subPath` mirrors the URL so links,
 * reloads, and the back button keep the operator where they were.
 */
export interface EnginePageProps {
  readonly engine: SecretEngine;
  /** Path below the mount from the URL, without leading or trailing slashes. */
  readonly subPath: string;
  /** Navigate within this engine, e.g. `navigateTo('roles/web')`; '' opens the engine root. */
  readonly navigateTo: (subPath: string) => void;
}
