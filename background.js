// Keeps the toolbar icon in the colours of the chosen theme.
// Draws a lightning bolt on a hard-shadow tile. Static PNGs in /icons are the fallback.
importScripts('shared.js');

const BOLT = [[.60, .10], [.26, .56], [.47, .56], [.38, .90], [.74, .40], [.53, .40]];

function drawIcon(n, t) {
  const c = new OffscreenCanvas(n, n), g = c.getContext('2d');
  const d = Math.max(1, Math.round(n * 0.07));       // hard shadow offset
  const w = n - d;                                    // tile size
  const b = Math.max(1, Math.round(n * 0.09));        // border
  g.fillStyle = t.line;   g.fillRect(d, d, w, w);     // shadow
  g.fillStyle = t.line;   g.fillRect(0, 0, w, w);     // border
  g.fillStyle = t.accent; g.fillRect(b, b, w - 2 * b, w - 2 * b);
  g.fillStyle = t.line;                               // bolt
  g.beginPath();
  BOLT.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * w) : g.moveTo(x * w, y * w)));
  g.closePath(); g.fill();
  return g.getImageData(0, 0, n, n);
}

async function paintIcon() {
  try {
    const { theme } = await GC.getPrefs();
    const t = GC.THEMES.find(x => x.id === theme) || GC.THEMES[0];
    const imageData = {};
    for (const n of [16, 32, 48, 128]) imageData[n] = drawIcon(n, t);
    await chrome.action.setIcon({ imageData });
  } catch (e) { console.warn('[EIS Quick Login] icon not updated:', e); }   // keep the static icon
}

chrome.runtime.onInstalled.addListener(paintIcon);
chrome.runtime.onStartup.addListener(paintIcon);
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.gridPrefs) paintIcon(); });
