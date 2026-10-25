import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { fakeEnginesGateway, fakeVaultApi, renderWithEngines, testEngine } from '@/test/engines';
import EnginesPage from './page';

const ENGINES = [
  testEngine('apps', 'kv'),
  testEngine('aws', 'aws', { description: 'Cloud credentials' }),
  testEngine('pki/int', 'pki'),
];

function renderPage(url: string, api = fakeVaultApi(), engines = fakeEnginesGateway(ENGINES)) {
  return renderWithEngines(<EnginesPage />, { url, route: '/engines/*', api, engines });
}

describe('EnginesPage', () => {
  it('redirects KV v2 mounts to Explorer', async () => {
    renderPage('/engines/apps/team');
    await waitFor(() => expect(screen.getByLabelText('Current location')).toHaveTextContent('/explorer/apps/team'));
  });

  it('explains when no engine is mounted at the path', async () => {
    renderPage('/engines/missing');
    expect(await screen.findByRole('heading', { name: 'Engine not found' })).toBeVisible();
  });

  it('browses an engine without a workspace with LIST and reads only on request', async () => {
    const user = userEvent.setup();
    const api = fakeVaultApi({
      list: vi.fn(async (_session, path: string) => (path === 'aws' ? ['roles/', 'config'] : [])),
      read: vi.fn(async () => ({
        data: { access_key: 'AKIAEXAMPLE' },
        leaseId: 'aws/creds/deploy/abc',
        leaseDurationSeconds: 3600,
        renewable: true,
        warnings: [],
      })),
    });
    renderPage('/engines/aws', api);

    expect(await screen.findByRole('heading', { name: 'aws/' })).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'roles/' }));
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/engines/aws/roles');
    expect(api.read).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'Read' }));
    const panel = await screen.findByRole('region', { name: 'Read aws/roles' });
    expect(within(panel).getByText('aws/creds/deploy/abc')).toBeVisible();
    expect(within(panel).queryByText('AKIAEXAMPLE')).not.toBeInTheDocument();

    // Navigating away drops the response.
    await user.click(screen.getByRole('button', { name: 'aws/' }));
    expect(screen.queryByRole('region', { name: 'Read aws/roles' })).not.toBeInTheDocument();
  });

  it('writes a JSON body and rejects invalid JSON', async () => {
    const user = userEvent.setup();
    const api = fakeVaultApi();
    renderPage('/engines/aws/roles/deploy', api);

    await user.click(await screen.findByRole('button', { name: 'Write' }));
    const body = screen.getByLabelText('Request body (JSON)');
    await user.clear(body);
    await user.type(body, '{{"ttl": "1h",}');
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Write' })).toBeDisabled();
    await user.clear(body);
    await user.type(body, '{{"ttl": "1h"}');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Write' }));
    await waitFor(() => expect(api.write).toHaveBeenCalledWith(expect.anything(), 'aws/roles/deploy', { ttl: '1h' }));
  });

  it('opens settings, saves lease limits, and disables after typing the mount path', async () => {
    const user = userEvent.setup();
    const engines = fakeEnginesGateway(ENGINES);
    renderPage('/engines/pki/int', fakeVaultApi(), engines);

    await user.click(await screen.findByRole('button', { name: 'Engine settings' }));
    const drawer = await screen.findByRole('dialog', { name: 'pki/int/ settings' });
    const maxTtl = await within(drawer).findByLabelText('Max lease TTL');
    await user.type(maxTtl, 'forever');
    expect(within(drawer).getByText('Use a duration such as 30m, 24h, or 720h.')).toBeVisible();
    await user.clear(maxTtl);
    await user.type(maxTtl, '87600h');
    await user.click(within(drawer).getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(engines.tuneEngine).toHaveBeenCalledWith(
      expect.anything(),
      'pki/int',
      { description: '', defaultLeaseTtl: undefined, maxLeaseTtl: '87600h' },
    ));

    const disable = within(drawer).getByRole('button', { name: 'Disable pki/int' });
    expect(disable).toBeDisabled();
    await user.type(within(drawer).getByLabelText('Type pki/int to confirm'), 'pki/int');
    await user.click(disable);
    await waitFor(() => expect(engines.disableEngine).toHaveBeenCalledWith(expect.anything(), 'pki/int'));
    await waitFor(() => expect(screen.getByLabelText('Current location')).toHaveTextContent('/home'));
  });
});
