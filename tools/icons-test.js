// Shows the data URLs produced by src/items/icons.js on a checkerboard grid.
// URL params: ?item=160&portrait=256 (sizes)
import { renderItemIcons, renderPortraits } from '../src/items/icons.js';

const q = new URLSearchParams(location.search);
const itemSize = Number(q.get('item') || 160);
const portraitSize = Number(q.get('portrait') || 256);
const err = document.getElementById('err');
window.addEventListener('error', (e) => { err.textContent += String(e.error?.stack || e.message) + '\n'; });
window.addEventListener('unhandledrejection', (e) => { err.textContent += String(e.reason?.stack || e.reason) + '\n'; });

function show(el, urls, size) {
  for (const [name, url] of Object.entries(urls)) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const img = new Image();
    img.src = url;
    img.width = size;
    img.height = size;
    const label = document.createElement('span');
    label.textContent = name;
    cell.append(img, label);
    el.appendChild(cell);
  }
}

(async () => {
  const t0 = performance.now();
  if (q.get('item') !== '0') show(document.getElementById('items'), await renderItemIcons(itemSize), itemSize);
  const t1 = performance.now();
  if (q.get('portrait') !== '0') show(document.getElementById('portraits'), await renderPortraits(portraitSize), portraitSize);
  const t2 = performance.now();
  console.log('[icons-test] items', Math.round(t1 - t0), 'ms, portraits', Math.round(t2 - t1), 'ms');
  window.__ready = true;
})();
