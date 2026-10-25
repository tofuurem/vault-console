import GenericEngineBrowser from '../components/GenericEngineBrowser';
import type { EnginePageProps } from '../engine-page';

/** Placeholder until the dedicated database workspace lands. */
export default function DatabaseEnginePage(props: EnginePageProps) {
  return <GenericEngineBrowser {...props} />;
}
