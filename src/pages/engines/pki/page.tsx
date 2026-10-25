import GenericEngineBrowser from '../components/GenericEngineBrowser';
import type { EnginePageProps } from '../engine-page';

/** Placeholder until the dedicated pki workspace lands. */
export default function PkiEnginePage(props: EnginePageProps) {
  return <GenericEngineBrowser {...props} />;
}
