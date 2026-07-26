import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { resolveEffectiveKvTree } from '@/domain/access-control/effective-access';
import type { PolicyRule } from '@/domain/access-control/types';
import AccessExplanation from './AccessExplanation';

const groupSource = {
  kind: 'group' as const,
  id: 'platform-team',
  label: 'platform-team',
  via: 'Platform Readers',
};

function target(rules: readonly PolicyRule[]) {
  return {
    ...resolveEffectiveKvTree([{
      id: 'applications:folder:platform',
      label: 'platform',
      mount: 'applications',
      path: 'platform',
      target: 'folder' as const,
      children: [],
    }], rules)[0],
    patterns: rules.map((rule) => rule.pattern),
  };
}

describe('AccessExplanation', () => {
  it('shows exact endpoint paths, capabilities, patterns, and provenance', () => {
    const rules: readonly PolicyRule[] = [
      {
        pattern: 'applications/data/platform/*',
        capabilities: ['read'],
        source: groupSource,
      },
      {
        pattern: 'applications/metadata/platform/*',
        capabilities: ['read', 'list'],
        source: groupSource,
      },
      {
        pattern: 'applications/metadata/platform',
        capabilities: ['list'],
        source: groupSource,
      },
    ];

    render(<AccessExplanation target={target(rules)} />);

    expect(screen.getByRole('heading', { name: 'applications/platform/' })).toBeVisible();
    expect(screen.getByText('View')).toBeVisible();
    expect(screen.getAllByText('applications/data/platform/*')[0]).toBeVisible();
    expect(screen.getByText('applications/data/platform/__vault_console_probe__')).toBeVisible();
    expect(
      screen.getAllByLabelText('read from platform-team → Platform Readers')[0],
    ).toBeVisible();
    expect(screen.getAllByText('platform-team → Platform Readers').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Resolved KV endpoint capabilities')).toBeVisible();
  });

  it('makes a deny result explicit even when another rule grants access', () => {
    render(<AccessExplanation target={target([
      {
        pattern: 'applications/data/platform/*',
        capabilities: ['read'],
        source: groupSource,
      },
      {
        pattern: 'applications/data/platform/*',
        capabilities: ['deny'],
        source: {
          kind: 'user-rule',
          id: 'vc-user-alice',
          label: 'vc-user-alice',
        },
      },
    ])} />);

    expect(screen.getAllByText('Deny').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('deny from vc-user-alice')).toBeVisible();
  });
});
