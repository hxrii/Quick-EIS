// State, routing and events. Markup lives in views.js.
const app = document.getElementById('app');
const S = { page: 'home', creds: null, card: null, theme: 'classic', editAcct: false, editCard: false, arm: null, anim: true };
let armTimer = null;

// ── render ────────────────────────────────────────────────────────────────
function render() {
  document.documentElement.style.cssText = GC.themeVars(S.theme);
  app.className = S.anim ? 'anim' : '';
  app.innerHTML = V[S.page](S);
  S.anim = false;

  const u = document.getElementById('in-user');
  if (u) {
    u.value = S.creds ? S.creds.user : '';
    document.getElementById('in-pass').value = S.creds ? S.creds.pass : '';
    if (!u.value) u.focus();
  }
  const ta = document.getElementById('paste');
  if (ta) { if (S.card) ta.value = GC.toText(S.card); checkPaste(); }
}

function go(page) {
  S.page = page; S.editAcct = false; S.editCard = false; S.arm = null; S.anim = true;
  render();
}

function checkPaste() {
  const ta = document.getElementById('paste'); if (!ta) return;
  const { missing } = GC.parse(ta.value);
  const st = document.getElementById('card-status'), found = 8 - missing.length;
  if (!missing.length) { st.textContent = '✓ 8/8 cells found'; st.className = 'status good'; }
  else if (found === 0) { st.textContent = ''; st.className = 'status'; }
  else { st.textContent = `${found}/8 found. Missing: ${missing.join(', ')}`; st.className = 'status bad'; }
  document.getElementById('card-save').disabled = missing.length > 0;
}

// two-step delete: first click arms for 3s, second click confirms
function confirmed(which) {
  if (S.arm === which) { clearTimeout(armTimer); S.arm = null; return true; }
  S.arm = which; render();
  clearTimeout(armTimer);
  armTimer = setTimeout(() => { S.arm = null; render(); }, 3000);
  return false;
}

// one click: open the login page; content.js does the rest
async function startLogin() {
  if (!S.creds) return;
  await GC.setFlow('start');
  const tabs = await chrome.tabs.query({ url: 'https://eis.cdot.in/*' });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { url: GC.URLS.login, active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: GC.URLS.login });
  }
  window.close();
}

// ── actions (data-act="...") ──────────────────────────────────────────────
const ACTIONS = {
  login: startLogin,
  go:    b => go(b.dataset.page),
  open:  b => { chrome.tabs.create({ url: GC.URLS[b.dataset.k] }); window.close(); },

  theme: async b => { S.theme = b.dataset.id; await GC.setPrefs({ theme: S.theme }); render(); },

  'copy-user': async b => GC.flash(b, await GC.copy(S.creds.user)),
  'copy-pass': async b => GC.flash(b, await GC.copy(S.creds.pass)),
  copy:        async b => GC.flash(b, await GC.copy(S.card[b.dataset.l])),
  'copy-all':  async b => GC.flash(b, await GC.copy(GC.toText(S.card))),

  'acct-edit':   () => { S.editAcct = true; render(); },
  'acct-cancel': () => { S.editAcct = false; render(); },
  'acct-save': async () => {
    const user = document.getElementById('in-user').value.trim();
    const pass = document.getElementById('in-pass').value;
    const st = document.getElementById('acct-status');
    if (!user || !pass) { st.textContent = 'Enter both the user id and the password.'; st.className = 'status bad'; return; }
    await GC.saveCreds(user, pass);
    S.creds = { user, pass }; S.editAcct = false; render();
  },
  'acct-del': async () => {
    if (!confirmed('acct')) return;
    await GC.removeCreds(); S.creds = null; S.editAcct = false; render();
  },

  'card-edit':   () => { S.editCard = true; render(); },
  'card-cancel': () => { S.editCard = false; render(); },
  'card-save': async () => {
    const { card, missing } = GC.parse(document.getElementById('paste').value);
    if (missing.length) return;
    await GC.save(card);
    S.card = card; S.editCard = false; render();
  },
  'card-del': async () => {
    if (!confirmed('card')) return;
    await GC.remove(); S.card = null; S.editCard = false; render();
  }
};

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && ACTIONS[b.dataset.act]) ACTIONS[b.dataset.act](b);
});
app.addEventListener('input', e => { if (e.target.id === 'paste') checkPaste(); });
app.addEventListener('change', e => {
  if (e.target.id === 'show-pw') document.getElementById('in-pass').type = e.target.checked ? 'text' : 'password';
});

// stay in sync with changes made from the on-page panels
chrome.storage.onChanged.addListener(async (_c, area) => {
  if (area !== 'local' || S.editAcct || S.editCard) return;
  S.creds = await GC.loadCreds(); S.card = await GC.load(); S.theme = (await GC.getPrefs()).theme;
  render();
});

(async () => {
  S.creds = await GC.loadCreds(); S.card = await GC.load(); S.theme = (await GC.getPrefs()).theme;
  render();
})();
