'use strict';

// Windows sampler. Mirrors what GNOME System Monitor reads through libgtop on
// Linux (cpu times, mem/swap, per-interface octets, per-disk byte counters),
// using Win32 APIs called through koffi.

const os = require('os');
const koffi = require('koffi');

const kernel32 = koffi.load('kernel32.dll');
const ntdll = koffi.load('ntdll.dll');
const iphlpapi = koffi.load('iphlpapi.dll');

const { PERFORMANCE_INFORMATION, MIB_IF_ROW2 } = require('./win32-structs');

const K32GetPerformanceInfo = kernel32.func(
  'int __stdcall K32GetPerformanceInfo(_Out_ PERFORMANCE_INFORMATION *info, uint32_t cb)');
const NtQuerySystemInformation = ntdll.func(
  'int32_t __stdcall NtQuerySystemInformation(int cls, void *buf, uint32_t len, _Out_ uint32_t *retLen)');
const GetIfTable2 = iphlpapi.func('uint32_t __stdcall GetIfTable2(_Out_ void **table)');
const FreeMibTable = iphlpapi.func('void __stdcall FreeMibTable(void *table)');
const CreateFileW = kernel32.func(
  'void * __stdcall CreateFileW(str16 name, uint32_t access, uint32_t share, void *sa, uint32_t disposition, uint32_t flags, void *tmpl)');
const DeviceIoControl = kernel32.func(
  'int __stdcall DeviceIoControl(void *dev, uint32_t code, void *inBuf, uint32_t inLen, void *outBuf, uint32_t outLen, _Out_ uint32_t *ret, void *ovl)');
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *h)');

const ROW_SIZE = koffi.sizeof(MIB_IF_ROW2);
const OFF_TYPE = koffi.offsetof(MIB_IF_ROW2, 'Type');
const OFF_FLAGS = koffi.offsetof(MIB_IF_ROW2, 'InterfaceAndOperStatusFlags');
const OFF_OPER = koffi.offsetof(MIB_IF_ROW2, 'OperStatus');
const OFF_IN = koffi.offsetof(MIB_IF_ROW2, 'InOctets');
const OFF_OUT = koffi.offsetof(MIB_IF_ROW2, 'OutOctets');
// MIB_IF_TABLE2 { ULONG NumEntries; MIB_IF_ROW2 Table[]; } -> rows start at 8.
const TABLE_ROWS_OFFSET = 8;

const IF_TYPE_SOFTWARE_LOOPBACK = 24;
const IF_OPER_STATUS_UP = 1;
const FLAG_FILTER_INTERFACE = 0x02;

const SystemPageFileInformation = 18;
const IOCTL_DISK_PERFORMANCE = 0x70020;
const OPEN_EXISTING = 3;
const FILE_SHARE_READ_WRITE = 3;
const DISK_PERFORMANCE_SIZE = 88;
const MAX_PHYSICAL_DRIVES = 32;
const DRIVE_RESCAN_MS = 10000;

function cpuTimes() {
  // libuv reports sys = KernelTime - IdleTime; irq is already inside KernelTime.
  return os.cpus().map(({ times }) => ({
    total: times.user + times.nice + times.sys + times.idle,
    idle: times.idle
  }));
}

function memory() {
  const info = {};
  if (!K32GetPerformanceInfo(info, koffi.sizeof(PERFORMANCE_INFORMATION))) {
    const total = os.totalmem();
    return { total, used: total - os.freemem(), cache: 0 };
  }
  const page = Number(info.PageSize);
  const total = Number(info.PhysicalTotal) * page;
  const avail = Number(info.PhysicalAvailable) * page;
  return { total, used: total - avail, cache: Number(info.SystemCache) * page };
}

const pageFileBuf = Buffer.alloc(64 * 1024);

function swap() {
  const ret = [0];
  const status = NtQuerySystemInformation(SystemPageFileInformation, pageFileBuf, pageFileBuf.length, ret);
  if (status !== 0 || ret[0] === 0)
    return { total: 0, used: 0 };
  const page = 4096;
  let total = 0;
  let used = 0;
  // SYSTEM_PAGEFILE_INFORMATION { ULONG NextEntryOffset, TotalSize, TotalInUse, PeakUsage; UNICODE_STRING name; }
  for (let off = 0; ;) {
    total += pageFileBuf.readUInt32LE(off + 4) * page;
    used += pageFileBuf.readUInt32LE(off + 8) * page;
    const next = pageFileBuf.readUInt32LE(off);
    if (next === 0)
      break;
    off += next;
  }
  return { total, used };
}

function network() {
  const out = [null];
  if (GetIfTable2(out) !== 0 || !out[0])
    return { in: 0, out: 0 };
  const table = out[0];
  try {
    const count = koffi.decode(table, 'uint32');
    // Copy the rows out: koffi.view() makes an external ArrayBuffer, which
    // Electron's V8 memory cage rejects with an uncatchable fatal error.
    const bytes = koffi.decode(table, TABLE_ROWS_OFFSET, 'uint8', count * ROW_SIZE);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let rx = 0;
    let tx = 0;
    for (let i = 0; i < count; i++) {
      const row = i * ROW_SIZE;
      if (view.getUint32(row + OFF_TYPE, true) === IF_TYPE_SOFTWARE_LOOPBACK)
        continue;
      if (view.getUint8(row + OFF_FLAGS) & FLAG_FILTER_INTERFACE)
        continue;
      if (view.getInt32(row + OFF_OPER, true) !== IF_OPER_STATUS_UP)
        continue;
      rx += Number(view.getBigUint64(row + OFF_IN, true));
      tx += Number(view.getBigUint64(row + OFF_OUT, true));
    }
    return { in: rx, out: tx };
  } finally {
    FreeMibTable(table);
  }
}

const drives = new Map();
let lastDriveScan = 0;
const diskPerfBuf = Buffer.alloc(DISK_PERFORMANCE_SIZE);

function isInvalidHandle(h) {
  const addr = koffi.address(h);
  return !h || addr === 0n || addr === 0xffffffffffffffffn;
}

function scanDrives() {
  lastDriveScan = Date.now();
  for (let i = 0; i < MAX_PHYSICAL_DRIVES; i++) {
    if (drives.has(i))
      continue;
    const h = CreateFileW(`\\\\.\\PhysicalDrive${i}`, 0, FILE_SHARE_READ_WRITE, null, OPEN_EXISTING, 0, null);
    if (!isInvalidHandle(h))
      drives.set(i, h);
  }
}

function disk() {
  if (Date.now() - lastDriveScan > DRIVE_RESCAN_MS)
    scanDrives();
  let read = 0;
  let written = 0;
  for (const [index, h] of drives) {
    const ret = [0];
    if (!DeviceIoControl(h, IOCTL_DISK_PERFORMANCE, null, 0, diskPerfBuf, DISK_PERFORMANCE_SIZE, ret, null)) {
      CloseHandle(h);
      drives.delete(index);
      continue;
    }
    read += Number(diskPerfBuf.readBigInt64LE(0));
    written += Number(diskPerfBuf.readBigInt64LE(8));
  }
  return { read, write: written };
}

const reported = new Set();

// One failing API must not blank the whole view; log it once and report zeros.
function guarded(name, fn, fallback) {
  try {
    return fn();
  } catch (err) {
    if (!reported.has(name)) {
      reported.add(name);
      console.error(`System Monitor: ${name} sampling failed:`, err);
    }
    return fallback;
  }
}

function sample() {
  return {
    time: performance.now(),
    cpu: guarded('cpu', cpuTimes, []),
    mem: guarded('memory', memory, { total: 0, used: 0, cache: 0 }),
    swap: guarded('swap', swap, { total: 0, used: 0 }),
    net: guarded('network', network, { in: 0, out: 0 }),
    disk: guarded('disk', disk, { read: 0, write: 0 })
  };
}

module.exports = { sample };
