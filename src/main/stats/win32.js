'use strict';

// Windows sampler. Mirrors what GNOME System Monitor reads through libgtop on
// Linux (cpu times, mem/swap, per-interface octets, per-disk byte counters),
// using Win32 APIs called through koffi.

const os = require('os');
const koffi = require('koffi');

const kernel32 = koffi.load('kernel32.dll');
const ntdll = koffi.load('ntdll.dll');
const iphlpapi = koffi.load('iphlpapi.dll');

const PERFORMANCE_INFORMATION = koffi.struct('PERFORMANCE_INFORMATION', {
  cb: 'uint32',
  CommitTotal: 'size_t',
  CommitLimit: 'size_t',
  CommitPeak: 'size_t',
  PhysicalTotal: 'size_t',
  PhysicalAvailable: 'size_t',
  SystemCache: 'size_t',
  KernelTotal: 'size_t',
  KernelPaged: 'size_t',
  KernelNonpaged: 'size_t',
  PageSize: 'size_t',
  HandleCount: 'uint32',
  ProcessCount: 'uint32',
  ThreadCount: 'uint32'
});

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

// MIB_IF_ROW2 (netioapi.h). Declared so koffi computes the C layout; the
// documented size is 1352 bytes on x64.
const MIB_IF_ROW2 = koffi.struct('MIB_IF_ROW2', {
  InterfaceLuid: 'uint64',
  InterfaceIndex: 'uint32',
  InterfaceGuid: koffi.array('uint8', 16),
  Alias: koffi.array('uint16', 257),
  Description: koffi.array('uint16', 257),
  PhysicalAddressLength: 'uint32',
  PhysicalAddress: koffi.array('uint8', 32),
  PermanentPhysicalAddress: koffi.array('uint8', 32),
  Mtu: 'uint32',
  Type: 'uint32',
  TunnelType: 'int32',
  MediaType: 'int32',
  PhysicalMediumType: 'int32',
  AccessType: 'int32',
  DirectionType: 'int32',
  InterfaceAndOperStatusFlags: 'uint8',
  OperStatus: 'int32',
  AdminStatus: 'int32',
  MediaConnectState: 'int32',
  NetworkGuid: koffi.array('uint8', 16),
  ConnectionType: 'int32',
  TransmitLinkSpeed: 'uint64',
  ReceiveLinkSpeed: 'uint64',
  InOctets: 'uint64',
  InUcastPkts: 'uint64',
  InNUcastPkts: 'uint64',
  InDiscards: 'uint64',
  InErrors: 'uint64',
  InUnknownProtos: 'uint64',
  InUcastOctets: 'uint64',
  InMulticastOctets: 'uint64',
  InBroadcastOctets: 'uint64',
  OutOctets: 'uint64',
  OutUcastPkts: 'uint64',
  OutNUcastPkts: 'uint64',
  OutDiscards: 'uint64',
  OutErrors: 'uint64',
  OutUcastOctets: 'uint64',
  OutMulticastOctets: 'uint64',
  OutBroadcastOctets: 'uint64',
  OutQLen: 'uint64'
});

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
    const view = new DataView(koffi.view(table, TABLE_ROWS_OFFSET + count * ROW_SIZE));
    let rx = 0;
    let tx = 0;
    for (let i = 0; i < count; i++) {
      const row = TABLE_ROWS_OFFSET + i * ROW_SIZE;
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
