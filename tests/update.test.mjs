import assert from 'node:assert/strict';
import test from 'node:test';
import { isOfficialOrigin, privatePathsInTree } from '../scripts/update.mjs';

test('updater accepts only the canonical public repository', () => {
  assert.equal(
    isOfficialOrigin('https://github.com/EthanSK/agentic-dj.git'),
    true,
  );
  assert.equal(isOfficialOrigin('git@github.com:EthanSK/agentic-dj.git'), true);
  assert.equal(
    isOfficialOrigin('https://github.com/attacker/agentic-dj.git'),
    false,
  );
  assert.equal(
    isOfficialOrigin('https://user:token@github.com/EthanSK/agentic-dj.git'),
    false,
  );
});
test('updater rejects source trees that claim private paths', () => {
  assert.deepEqual(
    privatePathsInTree([
      'README.md',
      '.agentic-dj/state/db.sqlite',
      '.env.local',
      'app/page.tsx',
    ]),
    ['.agentic-dj/state/db.sqlite', '.env.local'],
  );
});
