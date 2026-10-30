import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('the publishing step creates and updates its data branch without changing main', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/refresh-narrowcast-data.yml', import.meta.url), 'utf8');
  const script = workflow.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'narrowcast-publish-'));
  const checkout = path.join(directory, 'checkout');
  const remote = path.join(directory, 'remote.git');
  const runner = path.join(directory, 'runner');
  const run = (cmd, args, cwd = checkout) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await fs.mkdir(checkout);
    await fs.mkdir(runner);
    run('git', ['init', '--bare', remote]);
    run('git', ['init', '--initial-branch=main']);
    run('git', ['config', 'user.name', 'Test']);
    run('git', ['config', 'user.email', 'test@example.com']);
    await fs.writeFile(path.join(checkout, 'site.txt'), 'Keep the website intact.');
    run('git', ['add', '.']);
    run('git', ['commit', '-m', 'Initial site']);
    run('git', ['remote', 'add', 'origin', remote]);
    run('git', ['push', 'origin', 'main']);
    const main = run('git', ['rev-parse', 'main']).trim();
    for (const count of [1, 2]) {
      if (count > 1) run('git', ['switch', 'main']);
      await fs.writeFile(path.join(runner, 'weekly-stats.json'), JSON.stringify({ count }));
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
        cwd: checkout, env: { ...process.env, RUNNER_TEMP: runner }, stdio: ['ignore', 'pipe', 'pipe']
      });
      assert.equal(run('git', ['--git-dir', remote, 'rev-parse', 'main']).trim(), main);
      assert.deepEqual(JSON.parse(run('git', ['--git-dir', remote, 'show', 'narrowcast-data:weekly-stats.json'])), { count });
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
