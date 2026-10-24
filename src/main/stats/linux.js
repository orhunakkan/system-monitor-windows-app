'use strict';

// Development sampler for Linux, reading the same /proc sources libgtop uses,
// so the port can be compared side by side with GNOME System Monitor.

const fs = require('fs');

function read(path) {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function cpuTimes() {
  const cpus = [];
  for (const line of read('/proc/stat').split('\n')) {
    if (!/^cpu\d+ /.test(line))
      continue;
    const [user, nice, sys, idle, iowait, irq, softirq] = line.trim().split(/\s+/).slice(1).map(Number);
    cpus.push({ total: user + nice + sys + idle + iowait + irq + softirq, idle });
  }
  return cpus;
}

function meminfo() {
  const info = {};
  for (const line of read('/proc/meminfo').split('\n')) {
    const m = /^(\w+):\s+(\d+)/.exec(line);
    if (m)
      info[m[1]] = Number(m[2]) * 1024;
  }
  return info;
}

function network() {
  let rx = 0;
  let tx = 0;
  for (const line of read('/proc/net/dev').split('\n').slice(2)) {
    const m = /^\s*([^:]+):\s*(.*)$/.exec(line);
    if (!m || m[1] === 'lo')
      continue;
    const f = m[2].trim().split(/\s+/).map(Number);
    rx += f[0];
    tx += f[8];
  }
  return { in: rx, out: tx };
}

function disk() {
  let read_ = 0;
  let written = 0;
  for (const line of read('/proc/diskstats').split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10)
      continue;
    const name = f[2];
    if (/^(loop|ram|zram|dm-|sr)/.test(name) || !fs.existsSync(`/sys/block/${name}`))
      continue;
    read_ += Number(f[5]) * 512;
    written += Number(f[9]) * 512;
  }
  return { read: read_, write: written };
}

function sample() {
  const m = meminfo();
  const cached = (m.Cached || 0) + (m.SReclaimable || 0);
  const buffers = m.Buffers || 0;
  return {
    time: performance.now(),
    cpu: cpuTimes(),
    mem: { total: m.MemTotal, used: m.MemTotal - m.MemFree - buffers - cached, cache: cached + buffers },
    swap: { total: m.SwapTotal, used: m.SwapTotal - m.SwapFree },
    net: network(),
    disk: disk()
  };
}

module.exports = { sample };
