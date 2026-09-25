#!/usr/bin/env node
// Headless Chrome screenshot helper (uses the real GPU via ANGLE/Metal on macOS).
//
// Usage:
//   node tools/shot.mjs <url> <out.png> [--w 1280] [--h 720] [--wait 3000]
//                        [--eval "<js expression run after wait>"] [--keys "ArrowUp:2000,Space:500"]
//
// Prints console messages / page errors, and the result of --eval (if given).
// Each run uses its own temporary Chrome profile, so several runs can happen in parallel.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: node tools/shot.mjs <url> <out.png> [--w 1280] [--h 720] [--wait 3000] [--eval js] [--keys "Key:ms,..."]');
  process.exit(1);
}
const url = args[0];
const out = args[1];
const opt = { w: 1280, h: 720, wait: 3000, eval: null, keys: null, timeout: 60000 };
for (let i = 2; i < args.length; i += 2) {
  const k = args[i].replace(/^--/, '');
  const v = args[i + 1];
  opt[k] = ['w', 'h', 'wait', 'timeout'].includes(k) ? Number(v) : v;
}

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--autoplay-policy=no-user-gesture-required',
  '--ignore-gpu-blocklist',
  '--enable-gpu',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  `--window-size=${opt.w},${opt.h}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let finished = false;
function cleanup(code) {
  if (finished) return;
  finished = true;
  try { chrome.kill('SIGKILL'); } catch {}
  setTimeout(() => {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    process.exit(code);
  }, 200);
}
const earlyLogs = [];
const hardTimeout = setTimeout(() => {
  for (const l of earlyLogs) console.log(l);
  console.error('[shot] timeout');
  cleanup(2);
}, opt.wait + opt.timeout);

async function waitForPort() {
  const f = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200; i++) {
    if (fs.existsSync(f)) {
      const txt = fs.readFileSync(f, 'utf8').trim().split('\n');
      if (txt.length >= 1 && txt[0]) return Number(txt[0]);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Chrome did not start');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const port = await waitForPort();
  let targets = [];
  for (let i = 0; i < 50; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (targets.find((t) => t.type === 'page')) break;
    } catch {}
    await sleep(100);
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const logs = earlyLogs;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const a = msg.params.args.map((x) => (x.value !== undefined ? x.value : x.description || x.type)).join(' ');
      logs.push(`[console.${msg.params.type}] ${a}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push(`[exception] ${d.exception ? d.exception.description : d.text} @${d.url || ''}:${d.lineNumber}`);
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      logs.push(`[log.${e.level}] ${e.text} ${e.url || ''}`);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: opt.w, height: opt.h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(opt.wait);

  if (opt.keys) {
    // format: "ArrowUp:2000,ArrowUp+ArrowLeft:800,Space:300" -> hold key(s) for the given ms, sequentially
    const keyInfo = (k) => {
      if (k === 'Space') return { key: ' ', code: 'Space' };
      if (k.length === 1) return { key: k.toLowerCase(), code: /[0-9]/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}` };
      return { key: k, code: k };
    };
    for (const part of opt.keys.split(',')) {
      const [combo, ms] = part.split(':');
      const keys = combo.split('+').map(keyInfo);
      for (const k of keys) await send('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
      await sleep(Number(ms || 100));
      for (const k of keys) await send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
    }
  }

  if (opt.eval) {
    try {
      const r = await send('Runtime.evaluate', { expression: opt.eval, awaitPromise: true, returnByValue: true });
      console.log('[eval]', JSON.stringify(r.result && r.result.value !== undefined ? r.result.value : r.result));
    } catch (e) {
      console.log('[eval error]', e.message);
    }
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  for (const l of logs) console.log(l);
  logs.length = 0;
  console.log(`[shot] saved ${out}`);
  ws.close();
  clearTimeout(hardTimeout);
  cleanup(0);
}

main().catch((e) => { console.error('[shot] error', e); cleanup(1); });
