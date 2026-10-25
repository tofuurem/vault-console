import type { ReactNode } from 'react';

import type { DatabaseRoute, DatabaseSection } from '../database-route';
import { routeName } from '../database-route';
import { EmptyState } from './DatabaseUi';
import ResourceList from './ResourceList';
import SplitLayout from './SplitLayout';

export interface NameListState {
  readonly names: readonly string[] | undefined;
  readonly loading: boolean;
  readonly error?: string;
}

interface SectionViewProps {
  readonly section: DatabaseSection;
  readonly title: string;
  readonly icon: string;
  readonly list: NameListState;
  readonly route: DatabaseRoute;
  readonly go: (route: DatabaseRoute) => void;
  /** Full-width guidance when nothing exists yet. */
  readonly empty: { readonly title: string; readonly body: ReactNode; readonly action?: ReactNode };
  readonly placeholder: string;
  readonly renderDetail: (name: string) => ReactNode;
  readonly renderEdit: (name: string) => ReactNode;
  readonly renderCreate: (connection?: string) => ReactNode;
}

/** One workspace section: list on the left, the selected item or an editor on the right. */
export default function SectionView({
  section,
  title,
  icon,
  list,
  route,
  go,
  empty,
  placeholder,
  renderDetail,
  renderEdit,
  renderCreate,
}: SectionViewProps) {
  const name = routeName(route);
  if (route.mode === 'list' && list.names?.length === 0) {
    return (
      <EmptyState icon={icon} title={empty.title} action={empty.action}>
        {empty.body}
      </EmptyState>
    );
  }

  let detail: ReactNode;
  if (route.mode === 'create') detail = renderCreate(route.connection);
  else if (route.mode === 'edit' && name) detail = renderEdit(name);
  else if (name) detail = renderDetail(name);
  else {
    detail = (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-background-300 px-4 text-center text-xs text-foreground-500">
        {placeholder}
      </div>
    );
  }

  return (
    <SplitLayout
      detailOpen={route.mode !== 'list'}
      backLabel={`All ${title.toLowerCase()}`}
      onBack={() => go({ section, mode: 'list' })}
      list={(
        <ResourceList
          title={title}
          icon={icon}
          names={list.names}
          selected={name}
          loading={list.loading}
          error={list.error}
          onSelect={(selected) => go({ section, mode: 'view', name: selected })}
          empty={<p className="text-xs text-foreground-500">None yet.</p>}
        />
      )}
      detail={detail}
    />
  );
}
