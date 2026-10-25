import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VaultError } from '@/domain/vault/errors';
import { renderWithEngines } from '@/test/engines';
import {
  fakeTransitGateway,
  SIGNING_KEY,
  transitKey,
  type FakeTransitGateway,
} from './testing/fake-transit-gateway';
import { TransitHarness } from './testing/TransitHarness';

function renderTransit(url: string, gateway: FakeTransitGateway = fakeTransitGateway()) {
  const result = renderWithEngines(<TransitHarness gateway={gateway} />, { url, route: '/engines/transit/*' });
  return { ...result, gateway };
}

function location() {
  return screen.getByLabelText('Current location');
}

function mockClipboard() {
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}

describe('Transit workspace keys', () => {
  it('lists keys and opens the workbench with only the operations the key supports', async () => {
    const user = userEvent.setup();
    renderTransit('/engines/transit');

    const list = await screen.findByRole('list', { name: 'Transit keys' });
    expect(within(list).getAllByRole('button').map((button) => button.textContent)).toEqual(['app', 'signer']);
    expect(screen.getByText('Select a key to encrypt, sign, rotate, or change its settings.')).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'app' }));
    expect(location()).toHaveTextContent('/engines/transit/keys/app');
    const operations = await screen.findByRole('radiogroup', { name: 'Operation' });
    expect(within(operations).getAllByRole('radio').map((radio) => radio.textContent))
      .toEqual(['Encrypt', 'Decrypt', 'Rewrap', 'Data key', 'HMAC', 'Verify HMAC']);
    expect(within(operations).getByRole('radio', { name: 'Encrypt' })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(list).getByRole('button', { name: 'signer' }));
    const signing = await screen.findByRole('radiogroup', { name: 'Operation' });
    await waitFor(() => expect(within(signing).getAllByRole('radio').map((radio) => radio.textContent))
      .toEqual(['Sign', 'Verify', 'HMAC', 'Verify HMAC']));
  });

  it('explains a missing key and a token that cannot list keys', async () => {
    const user = userEvent.setup();
    const gateway = fakeTransitGateway();
    gateway.listKeys.mockRejectedValue(new VaultError('authorization'));
    renderTransit('/engines/transit/keys/ghost', gateway);

    expect(await screen.findByRole('heading', { name: 'Key not found' })).toBeVisible();
    expect(await screen.findByText(/Your token is not allowed to list keys on this mount/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Open a key by name'), 'app');
    await user.click(screen.getByRole('button', { name: 'Open key' }));
    expect(location()).toHaveTextContent('/engines/transit/keys/app');
    expect(await screen.findByRole('heading', { name: 'app' })).toBeVisible();
  });

  it('creates a key with the chosen options and opens it', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTransit('/engines/transit');
    await screen.findByRole('list', { name: 'Transit keys' });

    await user.click(screen.getByRole('button', { name: 'Create key' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create transit key' });
    await user.click(within(dialog).getByRole('button', { name: 'Create key' }));
    expect(within(dialog).getByText('Enter a key name.')).toBeVisible();

    await user.type(within(dialog).getByLabelText('Key name'), 'app');
    expect(within(dialog).getByText('A key with this name already exists.')).toBeVisible();
    await user.clear(within(dialog).getByLabelText('Key name'));
    await user.type(within(dialog).getByLabelText('Key name'), 'orders');
    const convergent = within(dialog).getByRole('checkbox', { name: /Convergent encryption/ });
    expect(convergent).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /Derive a key per context/ }));
    await user.click(convergent);
    await user.type(within(dialog).getByLabelText('Automatic rotation period'), '30m');
    await user.click(within(dialog).getByRole('button', { name: 'Create key' }));
    expect(within(dialog).getByText('Use 0 to turn automatic rotation off, or at least 1h.')).toBeVisible();
    await user.clear(within(dialog).getByLabelText('Automatic rotation period'));
    await user.type(within(dialog).getByLabelText('Automatic rotation period'), '720h');
    await user.click(within(dialog).getByRole('button', { name: 'Create key' }));

    await waitFor(() => expect(gateway.createKey).toHaveBeenCalledWith(expect.anything(), 'transit', {
      name: 'orders',
      type: 'aes256-gcm96',
      derived: true,
      convergentEncryption: true,
      exportable: false,
      allowPlaintextBackup: false,
      autoRotatePeriod: '720h',
      keySize: undefined,
    }));
    await waitFor(() => expect(location()).toHaveTextContent('/engines/transit/keys/orders'));
    expect(await screen.findByRole('heading', { name: 'orders' })).toBeVisible();
  });

  it('asks for a key size when creating an HMAC key', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTransit('/engines/transit');
    await user.click(await screen.findByRole('button', { name: 'Create key' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create transit key' });
    await user.type(within(dialog).getByLabelText('Key name'), 'mac');
    await user.selectOptions(within(dialog).getByLabelText('Key type'), 'hmac');
    expect(within(dialog).queryByRole('checkbox', { name: /Derive/ })).not.toBeInTheDocument();
    const size = within(dialog).getByLabelText('Key size in bytes');
    await user.clear(size);
    await user.type(size, '16');
    await user.click(within(dialog).getByRole('button', { name: 'Create key' }));
    expect(within(dialog).getByText('Use a whole number of bytes from 32 to 512.')).toBeVisible();
    await user.clear(size);
    await user.type(size, '64');
    await user.click(within(dialog).getByRole('button', { name: 'Create key' }));
    await waitFor(() => expect(gateway.createKey).toHaveBeenCalledWith(
      expect.anything(),
      'transit',
      expect.objectContaining({ name: 'mac', type: 'hmac', keySize: 64 }),
    ));
  });

  it('rotates after confirmation and shows the version timeline', async () => {
    const user = userEvent.setup();
    const gateway = fakeTransitGateway([
      transitKey('app', {
        latestVersion: 3,
        minDecryptionVersion: 2,
        minEncryptionVersion: 3,
        versions: [
          { version: 3, createdAt: '2026-10-03T10:00:00Z' },
          { version: 2, createdAt: '2026-10-02T10:00:00Z' },
        ],
      }),
    ]);
    renderTransit('/engines/transit/keys/app/versions', gateway);

    const timeline = await screen.findByRole('list', { name: 'Key versions' });
    const rows = within(timeline).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^v3ActiveLatestOldest that can encrypt/),
      expect.stringMatching(/^v2Decrypt onlyOldest that can decrypt/),
      expect.stringMatching(/^v1ArchivedCreation time not available/),
    ]);

    await user.click(screen.getByRole('button', { name: 'Rotate' }));
    const confirm = await screen.findByRole('dialog', { name: 'Rotate app' });
    expect(within(confirm).getByText(/Create version 4/)).toBeVisible();
    await user.click(within(confirm).getByRole('button', { name: 'Rotate key' }));
    await waitFor(() => expect(gateway.rotateKey).toHaveBeenCalledWith(expect.anything(), 'transit', 'app'));
    expect(await screen.findByText('Rotated app to version 4.')).toBeVisible();
    await waitFor(() => expect(within(timeline).getAllByRole('listitem')).toHaveLength(4));
  });

  it('copies public keys of asymmetric keys', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    renderTransit('/engines/transit/keys/signer/versions');
    await user.click(await screen.findByText('Public key'));
    await user.click(screen.getByRole('button', { name: 'Copy public key for version 1' }));
    expect(writeText).toHaveBeenCalledWith(SIGNING_KEY.versions[0].publicKey);
    expect(screen.getByText('Copied')).toBeVisible();
  });

  it('trims only after explicit floors and an irreversible-action confirmation', async () => {
    const user = userEvent.setup();
    const gateway = fakeTransitGateway([
      transitKey('app', { latestVersion: 4, minDecryptionVersion: 3, minEncryptionVersion: 4 }),
      transitKey('loose', { latestVersion: 2 }),
    ]);
    renderTransit('/engines/transit/keys/loose/versions', gateway);
    expect(await screen.findByText('Set both minimum versions explicitly before trimming.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'All keys' }));
    await user.click(await screen.findByRole('button', { name: 'app' }));
    await user.click(await screen.findByRole('button', { name: 'Versions' }));
    expect(location()).toHaveTextContent('/engines/transit/keys/app/versions');
    const keep = await screen.findByLabelText('Keep versions from');
    expect(within(keep).getAllByRole('option').map((option) => option.textContent)).toEqual(['v3', 'v2']);
    await user.click(screen.getByRole('button', { name: 'Trim versions' }));
    const confirm = await screen.findByRole('dialog', { name: 'Trim app' });
    expect(within(confirm).getByText(/This cannot be undone/)).toBeVisible();
    await user.click(within(confirm).getByRole('button', { name: 'Trim versions' }));
    await waitFor(() => expect(gateway.trimKey).toHaveBeenCalledWith(expect.anything(), 'transit', 'app', 3));
  });

  it('saves settings and validates version floors', async () => {
    const user = userEvent.setup();
    const gateway = fakeTransitGateway([transitKey('app', { latestVersion: 3 })]);
    renderTransit('/engines/transit/keys/app/settings', gateway);

    const save = await screen.findByRole('button', { name: 'Save settings' });
    expect(save).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Minimum decryption version'), '3');
    await user.selectOptions(screen.getByLabelText('Minimum encryption version'), '2');
    expect(screen.getByText('Minimum encryption version cannot be lower than the minimum decryption version.')).toBeVisible();
    expect(save).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Minimum encryption version'), '3');
    await user.type(screen.getByLabelText('Automatic rotation period'), '24h');
    await user.click(save);
    await waitFor(() => expect(gateway.updateKeyConfig).toHaveBeenCalledWith(expect.anything(), 'transit', 'app', {
      minDecryptionVersion: 3,
      minEncryptionVersion: 3,
      deletionAllowed: false,
      exportable: false,
      allowPlaintextBackup: false,
      autoRotatePeriod: '24h',
    }));
  });

  it('enables deletion first and then deletes after the name is typed', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTransit('/engines/transit/keys/app/settings');

    expect(await screen.findByText(/Vault protects this key from deletion/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Delete app' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Allow deletion' }));
    await waitFor(() => expect(gateway.updateKeyConfig).toHaveBeenCalledWith(
      expect.anything(),
      'transit',
      'app',
      expect.objectContaining({ deletionAllowed: true }),
    ));

    const remove = await screen.findByRole('button', { name: 'Delete app' });
    expect(remove).toBeDisabled();
    await user.type(screen.getByLabelText('Type app to confirm'), 'app');
    await user.click(remove);
    await waitFor(() => expect(gateway.deleteKey).toHaveBeenCalledWith(expect.anything(), 'transit', 'app'));
    await waitFor(() => expect(location()).toHaveTextContent(/\/engines\/transit\/keys$/));
    const list = await screen.findByRole('list', { name: 'Transit keys' });
    await waitFor(() => expect(within(list).queryByRole('button', { name: 'app' })).not.toBeInTheDocument());
  });

  it('switches to the tools tab for random bytes and hashing', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTransit('/engines/transit');
    await user.click(await screen.findByRole('button', { name: /Tools/ }));
    expect(location()).toHaveTextContent('/engines/transit/tools');

    const random = screen.getByRole('region', { name: 'Random bytes' });
    await user.clear(within(random).getByLabelText('Bytes'));
    await user.type(within(random).getByLabelText('Bytes'), '0');
    expect(within(random).getByText(/Use a whole number from 1/)).toBeVisible();
    await user.clear(within(random).getByLabelText('Bytes'));
    await user.type(within(random).getByLabelText('Bytes'), '16');
    await user.selectOptions(within(random).getByLabelText('Format'), 'hex');
    await user.click(within(random).getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(gateway.randomBytes).toHaveBeenCalledWith(expect.anything(), 'transit', { bytes: 16, format: 'hex', source: 'platform' }));
    const output = await within(random).findByRole('status', { name: 'Random bytes' });
    expect(output).not.toHaveTextContent('cmFuZG9t');
    await user.click(within(random).getByRole('button', { name: 'Reveal random bytes' }));
    expect(output).toHaveTextContent('cmFuZG9t');

    const hash = screen.getByRole('region', { name: 'Hash' });
    await user.type(within(hash).getByLabelText('Input'), 'hello');
    await user.selectOptions(within(hash).getByLabelText('Algorithm'), 'sha3-256');
    await user.click(within(hash).getByRole('button', { name: 'Hash' }));
    await waitFor(() => expect(gateway.hash).toHaveBeenCalledWith(expect.anything(), 'transit', { input: 'aGVsbG8=', algorithm: 'sha3-256', format: 'hex' }));
    expect(await within(hash).findByText('abc123')).toBeVisible();
  });
});
