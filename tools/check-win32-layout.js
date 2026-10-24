'use strict';

// Verifies the koffi struct layouts in src/main/stats/win32-structs.js against
// the sizes/offsets documented for x64 Windows. Runs on any OS: node tools/check-win32-layout.js

const koffi = require('koffi');
const { PERFORMANCE_INFORMATION, MIB_IF_ROW2 } = require('../src/main/stats/win32-structs');

const checks = [
  ['sizeof(PERFORMANCE_INFORMATION)', koffi.sizeof(PERFORMANCE_INFORMATION), 104],
  ['sizeof(MIB_IF_ROW2)', koffi.sizeof(MIB_IF_ROW2), 1352],
  ['MIB_IF_ROW2.Type', koffi.offsetof(MIB_IF_ROW2, 'Type'), 1128],
  ['MIB_IF_ROW2.InterfaceAndOperStatusFlags', koffi.offsetof(MIB_IF_ROW2, 'InterfaceAndOperStatusFlags'), 1152],
  ['MIB_IF_ROW2.OperStatus', koffi.offsetof(MIB_IF_ROW2, 'OperStatus'), 1156],
  ['MIB_IF_ROW2.InOctets', koffi.offsetof(MIB_IF_ROW2, 'InOctets'), 1208],
  ['MIB_IF_ROW2.OutOctets', koffi.offsetof(MIB_IF_ROW2, 'OutOctets'), 1280]
];

let failed = 0;
for (const [name, actual, expected] of checks) {
  const ok = actual === expected;
  failed += ok ? 0 : 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} = ${actual} (expected ${expected})`);
}
process.exit(failed ? 1 : 0);
