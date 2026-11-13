// Shared by popup.js and content.js (loaded first in both).
const GC = (() => {
  const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const K = { card: 'gridCard', prefs: 'gridPrefs', creds: 'eisCreds', flow: 'loginFlow' };

  // Flow from the portal app: loginld.asp -> loginldvldnew.asp (mlogin, mpass)
  //   -> gridentry.asp -> gridval.asp (gv1..gvN, cname) -> eisform1.asp
  // If the host changes, update this AND "matches"/"host_permissions" in manifest.json.
  const BASE = 'https://eis.cdot.in';
  const URLS = {
    login:  BASE + '/loginld.asp',
    home:   BASE + '/eisform1.asp',
    punch:  BASE + '/viewpunch.asp',
    salary: BASE + '/salc.asp',
    leave:  BASE + '/leave.asp',
    bio:    BASE + '/biocry.asp'
  };
  const FLOW_TTL = 120000;   // a one-click login must finish within 2 minutes

  const get = async k => (await chrome.storage.local.get(k))[k];

  // ── grid card ──
  const cardOk = c => !!c && LABELS.every(l => /^\d{2}$/.test(String(c[l] || '')));
  async function load() { const c = await get(K.card); return cardOk(c) ? c : null; }
  const save = card => chrome.storage.local.set({ [K.card]: card });
  const remove = () => chrome.storage.local.remove(K.card);

  // ── LDAP login (plain text in chrome.storage.local; never chrome.storage.sync) ──
  async function loadCreds() { const c = await get(K.creds); return c && c.user && c.pass ? c : null; }
  const saveCreds = (user, pass) => chrome.storage.local.set({ [K.creds]: { user, pass } });
  const removeCreds = () => chrome.storage.local.remove(K.creds);


  // ── colour themes (popup + on-page panels read these as CSS variables) ──
  const THEMES = [
    { id:'classic',   name:'Classic',   bg:'#e2c7c7', paper:'#f5f0e8', cell:'#ffffff', text:'#0a0a0a', muted:'#555555', line:'#0a0a0a', bar:'#0a0a0a', barText:'#ffe135', accent:'#ffe135', accentText:'#0a0a0a', accent2:'#00e5d4', danger:'#ff3b3b', ok:'#00c853', good:'#0a7a0a' },
    { id:'mint',      name:'Mint',      bg:'#c9ecdc', paper:'#f3fff9', cell:'#ffffff', text:'#07251b', muted:'#3d5f52', line:'#07251b', bar:'#07251b', barText:'#7dffc0', accent:'#2bd47d', accentText:'#07251b', accent2:'#ffe135', danger:'#e63946', ok:'#00a85a', good:'#067a3f' },
    { id:'ocean',     name:'Ocean',     bg:'#c7e0ff', paper:'#f2f8ff', cell:'#ffffff', text:'#0a1a33', muted:'#41577a', line:'#0a1a33', bar:'#0a1a33', barText:'#8cc4ff', accent:'#2f6bff', accentText:'#ffffff', accent2:'#00e5d4', danger:'#e11d48', ok:'#12b76a', good:'#0b7a4d' },
    { id:'bubblegum', name:'Bubblegum', bg:'#ffc9e6', paper:'#fff2fa', cell:'#ffffff', text:'#26081c', muted:'#7a3f63', line:'#26081c', bar:'#26081c', barText:'#ff8fd0', accent:'#ff4fa3', accentText:'#ffffff', accent2:'#ffe135', danger:'#d90429', ok:'#12b76a', good:'#0b7a4d' },
    { id:'grape',     name:'Grape',     bg:'#dccbff', paper:'#f7f2ff', cell:'#ffffff', text:'#1c0b3a', muted:'#5e4a8a', line:'#1c0b3a', bar:'#1c0b3a', barText:'#d9b8ff', accent:'#8b4dff', accentText:'#ffffff', accent2:'#ffe135', danger:'#e11d48', ok:'#12b76a', good:'#0b7a4d' },
    { id:'lime',      name:'Lime',      bg:'#e1f5a6', paper:'#fbfff0', cell:'#ffffff', text:'#14200a', muted:'#4c5f35', line:'#14200a', bar:'#14200a', barText:'#c6ff3d', accent:'#c6ff3d', accentText:'#14200a', accent2:'#ff5fa2', danger:'#e11d48', ok:'#12b76a', good:'#2d7a0b' },
    { id:'mono',      name:'Mono',      bg:'#e4e4e4', paper:'#fafafa', cell:'#ffffff', text:'#111111', muted:'#666666', line:'#111111', bar:'#111111', barText:'#fafafa', accent:'#ff3b30', accentText:'#ffffff', accent2:'#ffd60a', danger:'#ff3b30', ok:'#1fb356', good:'#0b7a3a' },
    { id:'cocoa',     name:'Cocoa',     bg:'#d9c3ae', paper:'#faf3ea', cell:'#ffffff', text:'#2b1a10', muted:'#6b4e3a', line:'#2b1a10', bar:'#2b1a10', barText:'#f2c27b', accent:'#f0b35a', accentText:'#2b1a10', accent2:'#7fd1b9', danger:'#c1121f', ok:'#2a9d4a', good:'#1d7a35' }
  ];
  function themeVars(id) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    return Object.entries(t).filter(([k]) => k !== 'id' && k !== 'name')
      .map(([k, v]) => `--${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${v}`).join(';') + ';';
  }

  // ── prefs ──
  async function getPrefs() {
    const p = { autofill: false, theme: 'classic', ...((await get(K.prefs)) || {}) };
    if (!THEMES.some(t => t.id === p.theme)) p.theme = 'classic';
    return p;
  }
  async function setPrefs(p) { return chrome.storage.local.set({ [K.prefs]: { ...(await getPrefs()), ...p } }); }

  // ── one-click login flow state: start -> login_submitted -> grid_submitted -> (home: cleared)
  // Each step is only auto-submitted once, so a wrong password or grid value can never loop.
  async function getFlow() {
    const f = await get(K.flow);
    if (!f) return null;
    if (Date.now() - f.ts > FLOW_TTL) { await chrome.storage.local.remove(K.flow); return null; }
    return f;
  }
  const setFlow = state => chrome.storage.local.set({ [K.flow]: { state, ts: Date.now() } });
  const clearFlow = () => chrome.storage.local.remove(K.flow);

  // "A-40 B-15 C-12 D-10 / E-49 ..." tabs, spaces, commas, newlines all fine
  function parse(text) {
    const card = {};
    const re = /(?<![A-Z])([A-H])\s*[-:=\u2013\u2014]?\s*(\d{2})(?!\d)/g;
    for (const m of String(text).toUpperCase().matchAll(re)) card[m[1]] = m[2];
    return { card, missing: LABELS.filter(l => !card[l]) };
  }

  function toText(card) {
    const rows = [];
    for (let i = 0; i < LABELS.length; i += 4)
      rows.push(LABELS.slice(i, i + 4).map(l => `${l}-${card[l]}`).join('\t'));
    return rows.join('\n');
  }

  function setField(el, v) {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    (document.body || document.documentElement).appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
    return ok;
  }

  function flash(btn, ok) {
    if (!btn.dataset.t) btn.dataset.t = btn.textContent;
    btn.textContent = ok ? '✓ COPIED' : '✗ FAILED';
    btn.classList.toggle('ok', ok);
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = btn.dataset.t; btn.classList.remove('ok'); }, 1100);
  }

  return {
    LABELS, URLS, THEMES, themeVars, load, save, remove, loadCreds, saveCreds, removeCreds,
    getPrefs, setPrefs, getFlow, setFlow, clearFlow, parse, toText, setField, copy, flash
  };
})();
