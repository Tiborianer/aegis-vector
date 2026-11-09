import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await access(path.join(root, 'dist/index.html'));
// Electron 45 lazily downloads its development runtime. Keep that cache inside this project.
process.env.electron_config_cache = path.join(root, 'work/electron-cache');
const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, [path.join(root, 'desktop/main.mjs')], { stdio: 'inherit', env: process.env });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
