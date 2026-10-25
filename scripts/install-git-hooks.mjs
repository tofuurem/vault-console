// Points Git at the versioned hooks in .githooks. Runs from `npm install`/`npm ci`
// and is a no-op outside a Git checkout (Docker builds, packed sources).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.git') && existsSync('.githooks')) {
  try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  } catch {
    // Git is not installed; hooks are a local convenience, not a build step.
  }
}
