export interface ScopedSecretSelection {
  readonly scope: string;
  readonly paths: readonly string[];
  readonly anchor?: string;
}

export function emptySecretSelection(scope: string): ScopedSecretSelection {
  return { scope, paths: [] };
}

export function selectionForScope(
  selection: ScopedSecretSelection,
  scope: string,
): ScopedSecretSelection {
  return selection.scope === scope ? selection : emptySecretSelection(scope);
}

export function updateSecretSelection(options: {
  readonly selection: ScopedSecretSelection;
  readonly scope: string;
  readonly visibleSecretPaths: readonly string[];
  readonly path: string;
  readonly checked: boolean;
  readonly range: boolean;
}): ScopedSecretSelection {
  const current = selectionForScope(options.selection, options.scope);
  if (!options.visibleSecretPaths.includes(options.path)) return current;
  const paths = new Set(current.paths);
  let affected = [options.path];
  if (options.range && current.anchor) {
    const anchorIndex = options.visibleSecretPaths.indexOf(current.anchor);
    const targetIndex = options.visibleSecretPaths.indexOf(options.path);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      affected = options.visibleSecretPaths.slice(
        Math.min(anchorIndex, targetIndex),
        Math.max(anchorIndex, targetIndex) + 1,
      );
    }
  }
  affected.forEach((candidate) => {
    if (options.checked) paths.add(candidate);
    else paths.delete(candidate);
  });
  return {
    scope: options.scope,
    paths: [...paths],
    anchor: options.range ? current.anchor ?? options.path : options.path,
  };
}

export function toggleAllVisibleSecrets(options: {
  readonly selection: ScopedSecretSelection;
  readonly scope: string;
  readonly visibleSecretPaths: readonly string[];
}): ScopedSecretSelection {
  const current = selectionForScope(options.selection, options.scope);
  const paths = new Set(current.paths);
  const allVisibleSelected = options.visibleSecretPaths.length > 0
    && options.visibleSecretPaths.every((path) => paths.has(path));
  options.visibleSecretPaths.forEach((path) => {
    if (allVisibleSelected) paths.delete(path);
    else paths.add(path);
  });
  return { scope: options.scope, paths: [...paths] };
}

export function hiddenSelectionCount(
  selectedPaths: readonly string[],
  visibleSecretPaths: readonly string[],
): number {
  const visible = new Set(visibleSecretPaths);
  return selectedPaths.filter((path) => !visible.has(path)).length;
}
