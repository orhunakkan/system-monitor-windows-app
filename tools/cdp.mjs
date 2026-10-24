// Drive a running instance over the Chrome DevTools Protocol.
// Start the app with:  npm start -- --remote-debugging-port=9333
//
// Usage: node tools/cdp.mjs <port> <urlSubstring> <outPng|-> [jsExpression]
//   urlSubstring picks the window: view=main, view=preferences, view=shortcuts, view=about
//   outPng       screenshot of that page after the expression runs ("-" for none)
//
// Examples:
//   node tools/cdp.mjs 9333 view=main shot.png
//   node tools/cdp.mjs 9333 view=main - "document.querySelector('.menu-button').click()"
//   node tools/cdp.mjs 9333 view=main - "sysmon.openDialog('preferences')"
// Wrap multi-statement expressions in { ... }: each call shares one console scope.

import fs from 'node:fs';

const [port, match, out, expr] = process.argv.slice(2);
if (!port || !match) {
  console.error('usage: node tools/cdp.mjs <port> <urlSubstring> <outPng|-> [jsExpression]');
  process.exit(2);
}
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find((t) => t.type === 'page' && t.url.includes(match));
if (!target) {
  console.error('no matching page; open pages:\n' + targets.map((t) => t.url).join('\n'));
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
await new Promise((resolve) => (ws.onopen = resolve));
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

if (expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? r));
}
if (out && out !== '-') {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', out);
}
ws.close();
