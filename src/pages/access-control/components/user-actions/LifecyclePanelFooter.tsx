import type { ReactNode } from 'react';

import Button from '@/components/base/Button';

interface LifecyclePanelFooterProps {
  readonly applying: boolean;
  readonly onBack: () => void;
  readonly children: ReactNode;
}

export default function LifecyclePanelFooter({
  applying,
  onBack,
  children,
}: LifecyclePanelFooterProps) {
  return (
    <div className="flex justify-between border-t border-background-200 pt-4">
      <Button type="button" size="sm" onClick={onBack} disabled={applying}>Back</Button>
      {children}
    </div>
  );
}
