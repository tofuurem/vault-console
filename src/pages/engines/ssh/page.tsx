import GenericEngineBrowser from '../components/GenericEngineBrowser';
import type { EnginePageProps } from '../engine-page';

/** Placeholder until the dedicated ssh workspace lands. */
export default function SshEnginePage(props: EnginePageProps) {
  return <GenericEngineBrowser {...props} />;
}
