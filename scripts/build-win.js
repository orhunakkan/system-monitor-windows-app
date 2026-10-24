'use strict';

// Builds the Windows x64 NSIS installer. On Linux/macOS hosts without wine,
// a shim (scripts/wine-shim) extracts the NSIS uninstaller in pure JS.

const path = require('path');
const { spawnSync } = require('child_process');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (process.platform !== 'win32' && !hasWine())
  env.PATH = `${path.join(__dirname, 'wine-shim')}${path.delimiter}${env.PATH}`;

// Run the CLI through node: on Windows .bin/electron-builder is a shell script
// that spawnSync cannot execute.
const builder = require.resolve('electron-builder/cli.js');
const result = spawnSync(process.execPath, [builder, '--win', 'nsis', '--x64'], { stdio: 'inherit', env });
if (result.error)
  console.error('electron-builder failed to start:', result.error.message);
process.exit(result.status === null ? 1 : result.status);

function hasWine() {
  return spawnSync('sh', ['-c', 'command -v wine'], { stdio: 'ignore' }).status === 0;
}
