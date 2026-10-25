import type { TransitKey } from '@/domain/engines/transit/transit';

export interface OperationFormProps {
  readonly mount: string;
  readonly transitKey: TransitKey;
}
