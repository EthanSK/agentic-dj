import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.AGENTIC_DJ_PORT || 4371);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('AGENTIC_DJ_PORT must be between 1024 and 65535.');
const dataDir = path.join(root, '.agentic-dj');
if (fs.existsSync(dataDir) && fs.lstatSync(dataDir).isSymbolicLink())
  throw new Error('The private data folder must not be a symlink.');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

const available = await new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});
if (!available) {
  console.error(
    `Port ${port} is already in use. If Agentic DJ is already running, open http://127.0.0.1:${port}/. No process was stopped.`,
  );
  process.exit(1);
}
const metadata = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules/vinext/package.json'), 'utf8'),
);
const bin = path.join(
  root,
  'node_modules/vinext',
  typeof metadata.bin === 'string' ? metadata.bin : metadata.bin.vinext,
);
const runtimeFile = path.join(dataDir, `runtime-${port}.json`);
const child = spawn(process.execPath, [bin, 'dev', '--port', String(port)], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
fs.writeFileSync(
  runtimeFile,
  JSON.stringify({
    app: 'agentic-dj',
    root,
    pid: process.pid,
    childPid: child.pid,
    port,
    startedAt: new Date().toISOString(),
  }),
  { mode: 0o600 },
);
console.log(
  `\nAgentic DJ → http://127.0.0.1:${port}/\nPrivate data: .agentic-dj/ · Stop with Ctrl+C.\n`,
);
function cleanup() {
  try {
    if (JSON.parse(fs.readFileSync(runtimeFile, 'utf8')).pid === process.pid)
      fs.unlinkSync(runtimeFile);
  } catch {
    /* Another process must not be removed. */
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.once('error', (error) => {
  cleanup();
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  cleanup();
  process.exitCode = code || 0;
});
