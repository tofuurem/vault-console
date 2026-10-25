import { useState } from 'react';

import { useSshZeroAddress, useWriteSshZeroAddress } from '@/application/engines/ssh/useSsh';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { Checkbox, ErrorNotice, Panel } from './ssh-ui';

function ZeroAddressForm({ mount, otpRoles, current }: {
  readonly mount: string;
  readonly otpRoles: readonly string[];
  readonly current: readonly string[];
}) {
  const toast = useToast();
  const mutation = useWriteSshZeroAddress(mount);
  const [selected, setSelected] = useState<readonly string[]>(current);
  const changed = selected.length !== current.length || selected.some((role) => !current.includes(role));
  // Roles that were deleted stay listed so saving does not silently drop them.
  const choices = [...new Set([...otpRoles, ...current])];
  return (
    <div className="space-y-3">
      <fieldset className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="sr-only">Roles allowed for any IP address</legend>
        {choices.map((role) => (
          <Checkbox
            key={role}
            label={role}
            checked={selected.includes(role)}
            onChange={(on) => setSelected((items) => (on ? [...items, role] : items.filter((item) => item !== role)))}
          />
        ))}
      </fieldset>
      {mutation.isError && (
        <ErrorNotice title="The list was not saved" error={mutation.error} permissionHint={`Your token needs update and delete on ${mount}/config/zeroaddress.`} />
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!changed}
          loading={mutation.isPending}
          onClick={() => mutation.mutate(selected, { onSuccess: () => toast.success('Saved the roles allowed for any IP address.') })}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/** `config/zeroaddress`: OTP roles that may issue passwords for any IP address. */
export default function SshZeroAddressSection({ mount, otpRoles }: { readonly mount: string; readonly otpRoles: readonly string[] }) {
  const zero = useSshZeroAddress(mount);
  return (
    <Panel
      labelledBy="ssh-zero-address-title"
      title="Roles allowed for any IP address"
      description="Normally Vault only issues a password for IPs inside a role's CIDR list. Roles checked here accept any address."
    >
      {zero.isPending && <p className="text-xs text-foreground-500">Loading…</p>}
      {zero.isError && (
        <ErrorNotice title="The list could not be read" error={zero.error} permissionHint={`Your token needs read on ${mount}/config/zeroaddress.`} />
      )}
      {zero.isSuccess && <ZeroAddressForm key={zero.data.join(',')} mount={mount} otpRoles={otpRoles} current={zero.data} />}
    </Panel>
  );
}
