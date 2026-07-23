import { useEffect, useRef, useState } from 'react';

import Tooltip from '@/components/base/Tooltip';
import {
  isSecretJsonObject,
  secretContainerSize,
  secretValueType,
  type SecretJsonObject,
} from '@/domain/vault/secret-json';

interface SecretDataTreeProps {
  readonly data: SecretJsonObject;
  readonly revealAll?: boolean;
}

interface SecretTreeNodeProps {
  readonly label: string;
  readonly value: unknown;
  readonly path: string;
  readonly depth: number;
  readonly revealAll: boolean;
  readonly revealed: ReadonlySet<string>;
  readonly copiedPath: string;
  readonly onToggleReveal: (path: string) => void;
  readonly onCopy: (path: string, value: unknown) => void;
}

function encodePathPart(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function printablePrimitive(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  return JSON.stringify(value) ?? String(value);
}

function SecretTreeNode({
  label,
  value,
  path,
  depth,
  revealAll,
  revealed,
  copiedPath,
  onToggleReveal,
  onCopy,
}: SecretTreeNodeProps) {
  const type = secretValueType(value);
  const container = type === 'object' || type === 'array';
  const [expanded, setExpanded] = useState(depth < 2);
  const visible = revealAll || revealed.has(path);
  const children = Array.isArray(value)
    ? value.map((child, index) => [`[${index}]`, child] as const)
    : isSecretJsonObject(value)
      ? Object.entries(value)
      : [];

  return (
    <li>
      <div
        className="group flex min-h-8 min-w-max items-center gap-2 border-b border-background-100 pr-3 text-xs hover:bg-background-100/70"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {container ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${path}`}
            onClick={() => setExpanded((current) => !current)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-foreground-400 hover:bg-background-200 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <i className={`${expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} text-sm`} aria-hidden="true" />
          </button>
        ) : <span className="h-6 w-6 shrink-0" aria-hidden="true" />}

        <span className="max-w-[min(42vw,440px)] break-all font-mono font-medium text-foreground-800">{label}</span>
        <span className="rounded bg-background-200 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-foreground-500">{type}</span>

        {container ? (
          <span className="font-mono text-[10px] text-foreground-400">
            {secretContainerSize(value)} {secretContainerSize(value) === 1 ? 'item' : 'items'}
          </span>
        ) : (
          <>
            <span className={`min-w-[120px] flex-1 break-all font-mono ${visible ? 'whitespace-pre-wrap text-foreground-800' : 'select-none tracking-[0.12em] text-foreground-400'}`}>
              {visible ? printablePrimitive(value) : '••••••••'}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <Tooltip content={visible ? 'Hide value' : 'Reveal value'}>
                <button
                  type="button"
                  aria-label={`${visible ? 'Hide' : 'Reveal'} ${path}`}
                  onClick={() => onToggleReveal(path)}
                  disabled={revealAll}
                  className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-background-200 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <i className={`${visible ? 'ri-eye-off-line' : 'ri-eye-line'} text-xs`} aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip content={copiedPath === path ? 'Copied' : 'Copy value'}>
                <button
                  type="button"
                  aria-label={`Copy ${path}`}
                  onClick={() => onCopy(path, value)}
                  className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-background-200 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  <i className={`${copiedPath === path ? 'ri-check-line text-emerald-600' : 'ri-file-copy-line'} text-xs`} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          </>
        )}
      </div>

      {container && expanded && children.length > 0 && (
        <ul>
          {children.map(([childLabel, child]) => {
            const childPath = `${path}/${encodePathPart(childLabel)}`;
            return (
              <SecretTreeNode
                key={childPath}
                label={childLabel}
                value={child}
                path={childPath}
                depth={depth + 1}
                revealAll={revealAll}
                revealed={revealed}
                copiedPath={copiedPath}
                onToggleReveal={onToggleReveal}
                onCopy={onCopy}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}

export default function SecretDataTree({ data, revealAll = false }: SecretDataTreeProps) {
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [copiedPath, setCopiedPath] = useState('');
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
  }, []);

  const toggleReveal = (path: string) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const copy = async (path: string, value: unknown) => {
    try {
      await navigator.clipboard.writeText(printablePrimitive(value));
      setCopiedPath(path);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopiedPath(''), 1_500);
    } catch {
      setCopiedPath('');
    }
  };

  return (
    <div className="min-w-full overflow-auto rounded-lg border border-background-200 bg-background-50">
      <ul aria-label="Secret data tree" className="min-w-max">
        {Object.entries(data).map(([key, value]) => (
          <SecretTreeNode
            key={key}
            label={key}
            value={value}
            path={key}
            depth={0}
            revealAll={revealAll}
            revealed={revealed}
            copiedPath={copiedPath}
            onToggleReveal={toggleReveal}
            onCopy={(path, child) => void copy(path, child)}
          />
        ))}
      </ul>
    </div>
  );
}
