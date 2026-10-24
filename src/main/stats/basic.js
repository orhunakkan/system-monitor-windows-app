'use strict';

// Fallback sampler using only Node's os module, for when the native Win32
// bindings cannot be loaded. Swap, network and disk read as zero.

const os = require('os');

function sample() {
  const total = os.totalmem();
  return {
    time: performance.now(),
    cpu: os.cpus().map(({ times }) => ({ total: times.user + times.nice + times.sys + times.idle, idle: times.idle })),
    mem: { total, used: total - os.freemem(), cache: 0 },
    swap: { total: 0, used: 0 },
    net: { in: 0, out: 0 },
    disk: { read: 0, write: 0 }
  };
}

module.exports = { sample };
