import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function isOfficialOrigin(origin) {
  return /^(https:\/\/github\.com\/EthanSK\/agentic-dj(?:\.git)?\/?|git@github\.com:EthanSK\/agentic-dj(?:\.git)?)$/.test(
    origin,
  );
}
export function privatePathsInTree(paths) {
  return paths.filter((name) =>
    /^(?:\.agentic-dj(?:-backups)?|\.outstanding-items|\.env(?:\..*)?)(?:\/|$)/.test(
      name,
    ),
  );
}
function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let done = false;
    const finish = (value) => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(value);
      }
    };
    socket.setTimeout(700, () => finish(false));
    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
  });
}
export async function update(args = process.argv.slice(2)) {
  if (args.some((arg) => !['--check', '--help'].includes(arg)))
    throw new Error('Use npm run update, or npm run update -- --check.');
  if (args.includes('--help')) {
    console.log(
      'Check with --check. To update, stop Agentic DJ and run npm run update. Dirty source, non-main branches, unexpected origins and running local servers are refused. Private data is backed up, never reset or deleted.',
    );
    return;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const git = (...gitArgs) =>
    execFileSync('git', gitArgs, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  if (!isOfficialOrigin(git('remote', 'get-url', 'origin')))
    throw new Error(
      'Refusing an unexpected update origin. This updater only trusts the official EthanSK/agentic-dj repository; maintain forks with your normal Git workflow.',
    );
  const current = git('rev-parse', 'HEAD');
  const remote = git('ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0];
  if (!/^[a-f0-9]{40,64}$/.test(remote))
    throw new Error(
      'Could not verify the remote main branch. No files changed.',
    );
  if (args.includes('--check')) {
    console.log(
      current === remote
        ? `Up to date (${current.slice(0, 12)}).`
        : `Update available: ${current.slice(0, 12)} → ${remote.slice(0, 12)}. Stop the app, then run npm run update.`,
    );
    return;
  }
  if (git('branch', '--show-current') !== 'main')
    throw new Error(
      'Switch to main yourself before updating. No branch was changed.',
    );
  if (git('status', '--porcelain').length)
    throw new Error(
      'Your source has uncommitted or untracked changes. Commit or preserve them yourself first. The updater never resets, stashes or deletes work.',
    );
  const privateDir = path.join(root, '.agentic-dj');
  const runtimeFiles = fs.existsSync(privateDir)
    ? fs
        .readdirSync(privateDir)
        .filter((name) => /^runtime-\d+\.json$/.test(name))
    : [];
  const ports = new Set([4371, Number(process.env.AGENTIC_DJ_PORT || 4371)]);
  for (const file of runtimeFiles) {
    const runtime = JSON.parse(
      fs.readFileSync(path.join(privateDir, file), 'utf8'),
    );
    if (runtime.root !== root || runtime.app !== 'agentic-dj')
      throw new Error(
        'Unexpected runtime metadata. Inspect the local data folder before updating.',
      );
    ports.add(runtime.port);
    try {
      process.kill(runtime.pid, 0);
      throw new Error(
        'Agentic DJ is running. Stop every instance with Ctrl+C before updating. No process was stopped.',
      );
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
  }
  for (const port of ports)
    if (await isListening(port))
      throw new Error(
        `Port ${port} has an active listener. Stop your Agentic DJ instances before updating. Nothing was stopped automatically.`,
      );
  if (current === remote) {
    console.log(
      `Already up to date (${current.slice(0, 12)}). Your data was not changed.`,
    );
    return;
  }
  git('fetch', '--no-tags', 'origin', 'main');
  if (git('rev-parse', 'FETCH_HEAD') !== remote)
    throw new Error(
      'Remote main changed during this check. Retry; your worktree has not changed.',
    );
  if (
    privatePathsInTree(
      git('ls-tree', '-r', '--name-only', 'FETCH_HEAD').split('\n'),
    ).length
  )
    throw new Error(
      'Incoming code contains protected private-data paths. Refusing to update.',
    );
  git('merge-base', '--is-ancestor', current, remote);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const recoveryBranch = `agentic-dj-backup/${stamp}`;
  git('branch', recoveryBranch, current);
  const backup = path.join(root, '.agentic-dj-backups', stamp);
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  if (fs.existsSync(privateDir)) {
    if (fs.lstatSync(privateDir).isSymbolicLink())
      throw new Error('Refusing to back up a symlinked private folder.');
    fs.cpSync(privateDir, path.join(backup, 'data'), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
  }
  fs.writeFileSync(
    path.join(backup, 'recovery.json'),
    JSON.stringify(
      {
        previousCommit: current,
        targetCommit: remote,
        recoveryBranch,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  try {
    git('merge', '--ff-only', remote);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    for (const command of [
      ['ci'],
      ['test'],
      ['run', 'typecheck'],
      ['run', 'build'],
    ])
      execFileSync(npm, command, { cwd: root, stdio: 'inherit' });
    console.log(
      `Updated to ${remote.slice(0, 12)}. Backup: ${backup}\nStart with npm start. No listening data was deleted.`,
    );
  } catch (error) {
    console.error(
      `Update verification did not complete. Do not start the app until you inspect the failure. Previous code is retained at ${recoveryBranch}; data is backed up at ${backup}. No automatic destructive rollback was attempted.`,
    );
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  update().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
