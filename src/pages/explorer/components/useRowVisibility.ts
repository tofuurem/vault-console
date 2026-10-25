import { useCallback, useEffect, useRef } from 'react';

export const ROW_PATH_ATTRIBUTE = 'data-row-path';

/**
 * Reports secret rows the first time they scroll into view so their metadata
 * can load lazily. Each row element is reported once; remount the table to
 * start over. Without IntersectionObserver nothing is reported and the
 * metadata columns stay as dashes.
 */
export function useRowVisibility(
  onRowsSeen: ((paths: readonly string[]) => void) | undefined,
): (element: HTMLTableRowElement | null) => (() => void) | undefined {
  const onRowsSeenRef = useRef(onRowsSeen);
  onRowsSeenRef.current = onRowsSeen;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const enabled = Boolean(onRowsSeen) && typeof IntersectionObserver !== 'undefined';

  useEffect(() => () => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  return useCallback((element: HTMLTableRowElement | null) => {
    if (!element || !enabled || !element.hasAttribute(ROW_PATH_ATTRIBUTE)) return undefined;
    observerRef.current ??= new IntersectionObserver((records, observer) => {
      const paths: string[] = [];
      records.forEach((record) => {
        const path = record.target.getAttribute(ROW_PATH_ATTRIBUTE);
        if (!record.isIntersecting || !path) return;
        observer.unobserve(record.target);
        paths.push(path);
      });
      if (paths.length > 0) onRowsSeenRef.current?.(paths);
    });
    const observer = observerRef.current;
    observer.observe(element);
    return () => observer.unobserve(element);
  }, [enabled]);
}
