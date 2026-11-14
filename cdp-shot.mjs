// CDP screenshot driver (Node 24, built-in WebSocket, no deps).
// Usage: node cdp-shot.mjs <url> <out.png> [waitMs]
// Creates a fresh target per shot (so hash routing is read on load), hides
// scrollbars post-load, captures 1440x900 PNG. Assumes headless chrome is
// already running with --remote-debugging-port=9222.
const [url, out, waitMsArg] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node cdp-shot.mjs <url> <out.png> [waitMs]'); process.exit(2); }
const waitMs = Number(waitMsArg || 2500);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const { writeFileSync } = await import('node:fs');

// fresh target so the page loads with its hash from the start
const created = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
if (!created.webSocketDebuggerUrl) { console.error('could not create target', JSON.stringify(created)); process.exit(1); }

const ws = new WebSocket(created.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
};
function send(method, params = {}) {
  const mid = ++id;
  return new Promise((res, rej) => { pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
}

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(waitMs);
  for (let i = 0; i < 10; i++) {
    const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (r.result && r.result.value === 'complete') break;
    await sleep(500);
  }
  await sleep(800);
  // hide scrollbars + scroll to top before capture
  await send('Runtime.evaluate', { expression: `(function(){const s=document.createElement('style');s.textContent='::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}html,body{scrollbar-width:none!important}';document.head.appendChild(s);window.scrollTo(0,0);return document.title;})()`, returnByValue: true });
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('wrote', out);
} finally {
  ws.close();
  await fetch(`http://127.0.0.1:9222/json/close/${created.id}`).catch(() => {});
}
process.exit(0);
