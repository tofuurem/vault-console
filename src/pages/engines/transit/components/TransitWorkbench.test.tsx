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
} from '../testing/fake-transit-gateway';
import { TransitHarness } from '../testing/TransitHarness';

function renderTransit(url: string, gateway: FakeTransitGateway = fakeTransitGateway()) {
  const result = renderWithEngines(<TransitHarness gateway={gateway} />, { url, route: '/engines/transit/*' });
  return { ...result, gateway };
}

function operationPanel() {
  return screen.getByRole('heading', { level: 3 }).closest('section') as HTMLElement;
}

describe('Transit operations workbench', () => {
  it('encrypts text as base64, copies the ciphertext, and keeps it out of the URL and query cache', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { gateway, client } = renderTransit('/engines/transit/keys/app');

    await user.type(await screen.findByLabelText('Plaintext'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Encrypt' }));
    await waitFor(() => expect(gateway.encrypt).toHaveBeenCalledWith(
      expect.anything(),
      'transit',
      'app',
      { plaintext: 'aGVsbG8=', context: undefined, keyVersion: undefined },
    ));
    const output = await screen.findByRole('status', { name: 'Ciphertext' });
    expect(output).toHaveTextContent('vault:v1:aGVsbG8=');
    expect(screen.getByText('key version 1')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Copy ciphertext' }));
    expect(writeText).toHaveBeenCalledWith('vault:v1:aGVsbG8=');

    expect(screen.getByLabelText('Current location')).toHaveTextContent('/engines/transit/keys/app');
    expect(JSON.stringify(client.getQueryCache().getAll().map((query) => query.state.data))).not.toContain('aGVsbG8=');

    // Switching operation drops the result.
    await user.click(screen.getByRole('radio', { name: 'Decrypt' }));
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/engines/transit/keys/app/decrypt');
    expect(screen.queryByRole('status', { name: 'Ciphertext' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Encrypt' }));
    expect(screen.getByLabelText('Plaintext')).toHaveValue('');
  });

  it('rejects invalid base64 when the input is marked as base64', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTransit('/engines/transit/keys/app/encrypt');
    await user.type(await screen.findByLabelText('Plaintext'), 'not base64!');
    await user.click(screen.getByRole('checkbox', { name: 'Input is already base64' }));
    await user.click(screen.getByRole('button', { name: 'Encrypt' }));
    expect(screen.getByText(/This is not valid base64/)).toBeVisible();
    expect(gateway.encrypt).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Plaintext'));
    await user.type(screen.getByLabelText('Plaintext'), 'aGk=');
    await user.click(screen.getByRole('button', { name: 'Encrypt' }));
    await waitFor(() => expect(gateway.encrypt).toHaveBeenCalledWith(expect.anything(), 'transit', 'app', expect.objectContaining({ plaintext: 'aGk=' })));
  });

  it('decrypts to masked text with reveal and a raw base64 view', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTransit('/engines/transit/keys/app/decrypt');
    await user.click(await screen.findByRole('button', { name: 'Decrypt' }));
    expect(screen.getByText('Paste the ciphertext to decrypt.')).toBeVisible();

    await user.type(screen.getByLabelText('Ciphertext'), 'vault:v1:aGVsbG8gd29ybGQ=');
    await user.click(screen.getByRole('button', { name: 'Decrypt' }));
    await waitFor(() => expect(gateway.decrypt).toHaveBeenCalledWith(expect.anything(), 'transit', 'app', {
      ciphertext: 'vault:v1:aGVsbG8gd29ybGQ=',
      context: undefined,
    }));
    const output = await screen.findByRole('status', { name: 'Plaintext' });
    expect(output).not.toHaveTextContent('hello world');
    await user.click(screen.getByRole('button', { name: 'Reveal plaintext' }));
    expect(output).toHaveTextContent('hello world');

    await user.click(screen.getByRole('checkbox', { name: 'Show raw base64' }));
    const raw = screen.getByRole('status', { name: 'Plaintext (base64)' });
    expect(raw).not.toHaveTextContent('aGVsbG8gd29ybGQ=');
    await user.click(screen.getByRole('button', { name: 'Reveal plaintext (base64)' }));
    expect(raw).toHaveTextContent('aGVsbG8gd29ybGQ=');

    await user.click(within(screen.getByRole('region', { name: 'Decrypted plaintext' })).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('region', { name: 'Decrypted plaintext' })).not.toBeInTheDocument();
  });

  it('shows binary plaintext as base64 only', async () => {
    const user = userEvent.setup();
    renderTransit('/engines/transit/keys/app/decrypt');
    await user.type(await screen.findByLabelText('Ciphertext'), 'vault:v1:/wD+AQ==');
    await user.click(screen.getByRole('button', { name: 'Decrypt' }));
    expect(await screen.findByText(/The plaintext is binary data \(4 bytes\)/)).toBeVisible();
    expect(screen.getByRole('status', { name: 'Plaintext (base64)' })).toBeInTheDocument();
  });

  it('requires a context for derived keys and encodes it', async () => {
    const user = userEvent.setup();
    const gateway = fakeTransitGateway([transitKey('tenant', { derived: true })]);
    renderTransit('/engines/transit/keys/tenant', gateway);
    await user.type(await screen.findByLabelText('Plaintext'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Encrypt' }));
    expect(screen.getByText('This key is derived, so a context is required.')).toBeVisible();
    expect(gateway.encrypt).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Context'), 'tenant-42');
    await user.click(screen.getByRole('button', { name: 'Encrypt' }));
    await waitFor(() => expect(gateway.encrypt).toHaveBeenCalledWith(expect.anything(), 'transit', 'tenant', {
      plaintext: 'c2VjcmV0',
      context: 'dGVuYW50LTQy',
      keyVersion: undefined,
    }));
  });

  it('pins an older key version when the encryption floor allows it', async () => {
    const user = userEvent.setup();
    const gateway = fakeTransitGateway([transitKey('app', { latestVersion: 3, minDecryptionVersion: 2, minEncryptionVersion: 2 })]);
    renderTransit('/engines/transit/keys/app', gateway);
    const version = await screen.findByLabelText('Key version');
    expect(within(version).getAllByRole('option').map((option) => option.textContent)).toEqual(['Latest (v3)', 'v2']);
    await user.selectOptions(version, '2');
    await user.type(screen.getByLabelText('Plaintext'), 'x');
    await user.click(screen.getByRole('button', { name: 'Encrypt' }));
    await waitFor(() => expect(gateway.encrypt).toHaveBeenCalledWith(expect.anything(), 'transit', 'app', expect.objectContaining({ keyVersion: 2 })));
  });

  it('rewraps ciphertext and generates data keys', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTransit('/engines/transit/keys/app/rewrap');
    await user.type(await screen.findByLabelText('Ciphertext'), 'vault:v1:old');
    await user.click(screen.getByRole('button', { name: 'Rewrap' }));
    expect(await screen.findByRole('status', { name: 'Ciphertext' })).toHaveTextContent('vault:v2:rewrapped');

    await user.click(screen.getByRole('radio', { name: 'Data key' }));
    await user.selectOptions(screen.getByLabelText('Return'), 'plaintext');
    await user.selectOptions(screen.getByLabelText('Key length'), '512');
    await user.click(screen.getByRole('button', { name: 'Generate data key' }));
    await waitFor(() => expect(gateway.generateDataKey).toHaveBeenCalledWith(expect.anything(), 'transit', 'app', {
      kind: 'plaintext',
      bits: 512,
      context: undefined,
    }));
    expect(await screen.findByRole('status', { name: 'Ciphertext' })).toHaveTextContent('vault:v1:datakey');
    expect(screen.getByRole('status', { name: 'Plaintext key (base64)' })).not.toHaveTextContent('cGxhaW4ta2V5');
    expect(screen.getByText(/Store only the ciphertext/)).toBeVisible();
  });

  it('signs and verifies with a clear valid or invalid verdict', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTransit('/engines/transit/keys/signer');
    await user.type(await screen.findByLabelText('Message'), 'release-1.2.3');
    expect(screen.queryByLabelText('Hash algorithm')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign' }));
    await waitFor(() => expect(gateway.sign).toHaveBeenCalledWith(expect.anything(), 'transit', SIGNING_KEY.name, expect.objectContaining({
      input: 'cmVsZWFzZS0xLjIuMw==',
      hashAlgorithm: undefined,
    })));
    expect(await screen.findByRole('status', { name: 'Signature' })).toHaveTextContent('vault:v1:signature');

    await user.click(screen.getByRole('radio', { name: 'Verify' }));
    await user.type(screen.getByLabelText('Message'), 'release-1.2.3');
    await user.type(screen.getByLabelText('Signature'), 'vault:v1:signature');
    await user.click(screen.getByRole('button', { name: 'Verify signature' }));
    expect(await screen.findByText('Valid signature')).toBeVisible();

    await user.clear(screen.getByLabelText('Signature'));
    await user.type(screen.getByLabelText('Signature'), 'vault:v1:forged');
    await user.click(screen.getByRole('button', { name: 'Verify signature' }));
    expect(await screen.findByText('Invalid signature')).toBeVisible();
  });

  it('offers RSA and ECDSA signing options', async () => {
    const user = userEvent.setup();
    const gateway = fakeTransitGateway([
      transitKey('rsa', { type: 'rsa-2048', supportsSigning: true }),
      transitKey('ec', { type: 'ecdsa-p256', supportsEncryption: false, supportsDecryption: false, supportsSigning: true }),
    ]);
    renderTransit('/engines/transit/keys/rsa/sign', gateway);
    await user.type(await screen.findByLabelText('Message'), 'x');
    await user.selectOptions(screen.getByLabelText('Hash algorithm'), 'sha2-512');
    await user.selectOptions(screen.getByLabelText('Signature algorithm'), 'pkcs1v15');
    expect(screen.queryByLabelText('Signature format')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign' }));
    await waitFor(() => expect(gateway.sign).toHaveBeenCalledWith(expect.anything(), 'transit', 'rsa', expect.objectContaining({
      hashAlgorithm: 'sha2-512',
      signatureAlgorithm: 'pkcs1v15',
      prehashed: false,
      marshalingAlgorithm: undefined,
    })));

    await user.click(screen.getByRole('button', { name: 'All keys' }));
    await user.click(await screen.findByRole('button', { name: 'ec' }));
    await user.type(await screen.findByLabelText('Message'), 'x');
    await user.selectOptions(screen.getByLabelText('Signature format'), 'jws');
    await user.click(screen.getByRole('checkbox', { name: /Input is already hashed/ }));
    await user.click(screen.getByRole('button', { name: 'Sign' }));
    await waitFor(() => expect(gateway.sign).toHaveBeenLastCalledWith(expect.anything(), 'transit', 'ec', expect.objectContaining({
      marshalingAlgorithm: 'jws',
      prehashed: true,
      signatureAlgorithm: undefined,
    })));
  });

  it('computes and verifies HMACs', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTransit('/engines/transit/keys/app/hmac');
    await user.type(await screen.findByLabelText('Message'), 'payload');
    await user.selectOptions(screen.getByLabelText('Hash algorithm'), 'sha2-384');
    await user.click(screen.getByRole('button', { name: 'Compute HMAC' }));
    await waitFor(() => expect(gateway.hmac).toHaveBeenCalledWith(expect.anything(), 'transit', 'app', {
      input: 'cGF5bG9hZA==',
      algorithm: 'sha2-384',
      keyVersion: undefined,
    }));
    expect(await screen.findByRole('status', { name: 'HMAC' })).toHaveTextContent('vault:v1:hmac');

    await user.click(screen.getByRole('radio', { name: 'Verify HMAC' }));
    await user.type(screen.getByLabelText('Message'), 'payload');
    await user.type(screen.getByLabelText('HMAC'), 'vault:v1:other');
    await user.click(screen.getByRole('button', { name: 'Verify HMAC' }));
    expect(await screen.findByText('Invalid HMAC')).toBeVisible();
  });

  it('explains permission and validation failures plainly', async () => {
    const user = userEvent.setup();
    const gateway = fakeTransitGateway();
    gateway.encrypt.mockRejectedValueOnce(new VaultError('authorization'));
    gateway.encrypt.mockRejectedValueOnce(new VaultError('invalid-request', { reason: "missing 'context' for key derivation" }));
    renderTransit('/engines/transit/keys/app', gateway);

    await user.type(await screen.findByLabelText('Plaintext'), 'x');
    await user.click(screen.getByRole('button', { name: 'Encrypt' }));
    expect(await within(operationPanel()).findByRole('alert')).toHaveTextContent(
      'Your token is not allowed to encrypt with this key. Ask an operator for a policy that grants it.',
    );
    await user.click(screen.getByRole('button', { name: 'Encrypt' }));
    await waitFor(() => expect(within(operationPanel()).getByRole('alert')).toHaveTextContent("Missing 'context' for key derivation"));
  });
});
