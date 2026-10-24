'use strict';

// Builds the Windows x64 NSIS installer. On Linux/macOS hosts without wine,
// a shim (scripts/wine-shim) extracts the NSIS uninstaller in pure JS.

const path = require('path');
const { spawnSync } = require('child_process');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (process.platform !== 'win32' && !hasWine())
  env.PATH = `${path.join(__dirname, 'wine-shim')}${path.delimiter}${env.PATH}`;

const builder = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-builder');
const result = spawnSync(builder, ['--win', 'nsis', '--x64'], { stdio: 'inherit', env });
process.exit(result.status === null ? 1 : result.status);

function hasWine() {
  return spawnSync('sh', ['-c', 'command -v wine'], { stdio: 'ignore' }).status === 0;
}
