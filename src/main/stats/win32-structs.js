'use strict';

// Win32 struct layouts used by win32.js. Kept separate (no DLL loading) so
// tools/check-win32-layout.js can verify them on any platform.

const koffi = require('koffi');

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

module.exports = { PERFORMANCE_INFORMATION, MIB_IF_ROW2 };
