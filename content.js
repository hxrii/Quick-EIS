// Runs on https://eis.cdot.in/* (all frames). Handles three pages of the EIS login flow:
//   loginld.asp    (inputs mlogin + mpass)  -> fills LDAP login
//   gridentry.asp  (inputs gv1..gvN)        -> fills the asked grid cells
//   eisform1.asp   (home)                   -> confirms the login finished
// A one-click login is started from the popup (flow state "start"). Each step is
// auto-submitted at most once, so a wrong password or grid value can't loop.
(() => {
  const STYLE = `
    *{box-sizing:border-box;margin:0;padding:0;}
    .p{width:300px;background:var(--paper);border:3px solid var(--line);box-shadow:6px 6px 0 var(--line);font-family:'Space Mono','Courier New',monospace;font-size:12px;color:var(--text);}
    .h{display:flex;justify-content:space-between;align-items:center;background:var(--bar);color:var(--bar-text);padding:8px 10px;font-weight:700;letter-spacing:.05em;font-size:12px;}
    .h button{background:none;border:none;color:var(--bar-text);font:inherit;font-size:16px;cursor:pointer;line-height:1;}
    .b{padding:10px;}
    .lbl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 6px;}
    .need{display:flex;gap:8px;margin-bottom:10px;}
    .need .c{flex:1;background:var(--accent);color:var(--accent-text);box-shadow:3px 3px 0 var(--line);}
    .need .cl{color:var(--accent-text);opacity:.75;}
    .g{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;}
    .c{border:2px solid var(--line);background:var(--cell);text-align:center;padding:5px 3px 4px;}
    .cl{font-size:10px;font-weight:700;color:var(--muted);}
    .cv{font-size:22px;font-weight:700;line-height:1.1;margin:2px 0 5px;}
    .need .cv{font-size:28px;}
    .m{width:100%;font:inherit;font-size:9px;font-weight:700;border:2px solid var(--line);background:var(--bar);color:var(--bar-text);cursor:pointer;padding:3px 0;}
    .m:hover{background:var(--accent2);color:#0a0a0a;}
    .m.ok{background:var(--ok);color:#0a0a0a;}
    .row{display:flex;gap:8px;margin-bottom:8px;}
    .btn{flex:1;font:inherit;font-size:11px;font-weight:700;letter-spacing:.05em;padding:8px 6px;border:3px solid var(--line);background:var(--accent);color:var(--accent-text);cursor:pointer;box-shadow:3px 3px 0 var(--line);}
    .btn:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 var(--line);}
    .btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--line);}
    .btn.d{background:var(--bar);color:var(--bar-text);}
    .btn:disabled{opacity:.45;cursor:not-allowed;}
    .btn.big{font-size:14px;padding:12px 6px;}
    .lk{background:none;border:none;border-bottom:2px solid var(--line);font:inherit;font-size:10px;font-weight:700;cursor:pointer;color:var(--text);padding:0;}
    .lk:hover{background:var(--accent);color:var(--accent-text);}
    .chk{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;margin-top:6px;cursor:pointer;}
    .chk input{accent-color:var(--accent);width:14px;height:14px;}
    .in,textarea{width:100%;border:3px solid var(--line);padding:6px;font:inherit;font-size:12px;font-weight:700;outline:none;border-radius:0;background:var(--cell);color:var(--text);}
    textarea{resize:none;}
    .st{font-size:10px;font-weight:700;min-height:14px;margin:6px 0;color:var(--danger);}
    .st.good{color:var(--good);}
    .tab{font:inherit;font-size:12px;font-weight:700;padding:8px 12px;border:3px solid var(--line);background:var(--accent);box-shadow:4px 4px 0 var(--line);cursor:pointer;color:var(--accent-text);}
    .note{font-size:10px;color:var(--muted);line-height:1.5;margin-bottom:8px;}
    .note b{background:var(--accent);color:var(--accent-text);padding:0 3px;}
    .err{border:3px solid var(--line);background:var(--danger);color:#fff;font-size:11px;font-weight:700;padding:6px 8px;margin-bottom:8px;line-height:1.4;}
    .busy{font-size:12px;font-weight:700;line-height:1.5;}
    .toast{background:var(--bar);color:var(--bar-text);border:3px solid var(--accent);box-shadow:4px 4px 0 var(--accent);padding:10px 14px;font-family:'Space Mono','Courier New',monospace;font-size:12px;font-weight:700;}
    .kv{display:flex;gap:8px;align-items:center;margin-bottom:10px;font-size:11px;}
    .kv b{font-size:13px;overflow:hidden;text-overflow:ellipsis;}
  `;
  let theme = 'classic';
  let redraw = () => {};
  const styleTag = () => `<style>:host{all:initial;${GC.themeVars(theme)}}${STYLE}</style>`;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mount() {
    if (document.getElementById('eis-qlogin-host')) return null;
    const host = document.createElement('div');
    host.id = 'eis-qlogin-host';
    host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    (document.body || document.documentElement).appendChild(host);
    return { host, root };
  }

  // Submit like a real click would (runs the page's own onsubmit="return check();")
  function submitForm(form) {
    try { if (form && form.requestSubmit) { form.requestSubmit(); return; } } catch (e) { /* fall through */ }
    const b = (form || document).querySelector('input[type="submit"],button[type="submit"]');
    if (b) b.click(); else if (form) form.submit();
  }

  // ═════════════ LOGIN PAGE ═════════════
  async function loginPage(userEl, passEl) {
    const m = mount(); if (!m) return;
    const root = m.root, form = passEl.form || userEl.form;
    let creds = await GC.loadCreds();
    let flow = await GC.getFlow();
    let mode = 'idle', banner = '';              // idle | busy | edit

    if (flow && flow.state === 'login_submitted') {   // we already sent it once and EIS brought us back
      await GC.clearFlow(); flow = null;
      mode = 'edit';
      banner = 'EIS sent you back to the login page. Check the saved user id and password.';
    }

    async function doLogin() {
      if (!creds) return;
      GC.setField(userEl, creds.user);
      GC.setField(passEl, creds.pass);
      await GC.setFlow('login_submitted');
      mode = 'busy'; draw();
      submitForm(form);
      // if the page is still here, the submit was blocked
      setTimeout(async () => {
        await GC.clearFlow();
        mode = 'idle'; banner = 'The login form did not submit. Try again, or log in by hand.'; draw();
      }, 3000);
    }

    function draw() {
      const err = banner ? `<div class="err">${esc(banner)}</div>` : '';
      let body;
      if (mode === 'busy') {
        body = `<div class="busy">Logging in as ${esc(creds.user)}…</div>`;
      } else if (mode === 'edit' || !creds) {
        body = `${err}
          <div class="lbl">LDAP user id</div><input class="in" id="u" autocomplete="off" spellcheck="false"/>
          <div class="lbl" style="margin-top:8px;">LDAP password</div><input class="in" id="pw" type="password" autocomplete="off"/>
          <label class="chk"><input type="checkbox" id="show"/>SHOW PASSWORD</label>
          <div class="st" id="st"></div>
          <div class="row"><button class="btn" data-act="save">SAVE</button>${creds ? '<button class="btn d" data-act="cancel">CANCEL</button>' : ''}</div>
          <p class="note">Saved in this browser only.</p>`;
      } else {
        body = `${err}
          <div class="kv">USER <b>${esc(creds.user)}</b></div>
          <div class="row"><button class="btn big" data-act="login">⚡ LOGIN</button></div>
          <button class="lk" data-act="edit">Edit saved login</button>`;
      }
      root.innerHTML = `${styleTag()}<div class="p"><div class="h"><span>EIS QUICK LOGIN</span></div><div class="b">${body}</div></div>`;
      const u = root.querySelector('#u');
      if (u) { u.value = creds ? creds.user : ''; root.querySelector('#pw').value = creds ? creds.pass : ''; }
    }

    root.addEventListener('change', e => { if (e.target.id === 'show') root.querySelector('#pw').type = e.target.checked ? 'text' : 'password'; });
    root.addEventListener('click', async e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'login')  return doLogin();
      if (act === 'edit')   { mode = 'edit'; banner = ''; return draw(); }
      if (act === 'cancel') { mode = 'idle'; banner = ''; return draw(); }
      if (act === 'save') {
        const user = root.querySelector('#u').value.trim(), pass = root.querySelector('#pw').value;
        const st = root.querySelector('#st');
        if (!user || !pass) { st.textContent = 'Enter both the user id and the password.'; return; }
        await GC.saveCreds(user, pass);
        creds = { user, pass }; mode = 'idle'; banner = '';
        draw();
      }
    });

    redraw = draw;
    draw();
    if (flow && flow.state === 'start') {
      if (creds) doLogin();
      else { await GC.clearFlow(); mode = 'edit'; banner = 'Save your LDAP login to use one-click login.'; draw(); }
    }
  }

  // ═════════════ GRID PAGE ═════════════
  async function gridPage(gv) {
    const m = mount(); if (!m) return;
    const root = m.root, form = gv[0].form;
    const cnameEl = document.querySelector('input[name="cname"]');
    const needed = [...((cnameEl && cnameEl.value) || '').toUpperCase()].filter(l => GC.LABELS.includes(l));

    let card = await GC.load();
    let prefs = await GC.getPrefs();
    let flow = await GC.getFlow();
    let collapsed = false, showFull = false, editing = false, busy = false, banner = '';

    if (flow && flow.state === 'grid_submitted') {    // sent once already and EIS asked again
      await GC.clearFlow(); flow = null;
      showFull = true;
      banner = 'EIS rejected the grid values. Check the saved card against your printed one.';
    }
    let flowActive = !!(flow && flow.state === 'login_submitted');

    const cell = l => `
      <div class="c"><div class="cl">${l}</div><div class="cv">${card[l]}</div>
        <button class="m" data-act="copy" data-l="${l}">COPY</button></div>`;

    function body() {
      const err = banner ? `<div class="err">${esc(banner)}</div>` : '';
      if (busy) return `<div class="busy">Sending grid values…</div>`;
      if (!card || editing) {
        return `${err}
          <div class="lbl">${card ? 'edit card' : (flowActive ? 'paste your grid card to finish login' : 'save your grid card')}</div>
          <p class="note">Paste like <b>A-40 B-15 C-12 D-10</b> then <b>E-49 F-39 G-18 H-50</b>. Saved in this browser only.</p>
          <textarea id="paste" rows="3" spellcheck="false" placeholder="A-40  B-15  C-12  D-10&#10;E-49  F-39  G-18  H-50"></textarea>
          <div class="st" id="st"></div>
          <div class="row">
            <button class="btn" id="save" data-act="save" disabled>SAVE</button>
            ${card ? '<button class="btn d" data-act="cancel">CANCEL</button>' : ''}
          </div>`;
      }
      const asked = needed.length
        ? `<div class="lbl">asked this time</div><div class="need">${needed.map(cell).join('')}</div>`
        : `<p class="note">Couldn't read which cells are asked. Use the full card below.</p>`;
      const full = showFull || !needed.length;
      return `${err}
        <div class="row">
          ${needed.length ? '<button class="btn" data-act="fill">AUTO-FILL</button>' : ''}
          <button class="btn d" data-act="toggle">${full ? 'HIDE CARD' : 'FULL CARD'}</button>
        </div>
        ${asked}
        <label class="chk"><input type="checkbox" id="auto" ${prefs.autofill ? 'checked' : ''}/>AUTO-FILL WHEN THIS PAGE OPENS</label>
        ${full ? `<div class="lbl" style="margin-top:12px;">full card</div>
          <div class="g">${GC.LABELS.map(cell).join('')}</div>
          <div class="row" style="margin-bottom:0;"><button class="btn d" data-act="copy-all">COPY ALL</button><button class="btn d" data-act="edit">EDIT</button></div>` : ''}`;
    }

    function draw() {
      if (collapsed) { root.innerHTML = `${styleTag()}<button class="tab" data-act="open">GRID CARD</button>`; return; }
      root.innerHTML = `${styleTag()}
        <div class="p"><div class="h"><span>EIS GRID CARD</span><button data-act="close" title="Minimise">–</button></div>
        <div class="b">${body()}</div></div>`;
      if (!card || editing) { const ta = root.querySelector('#paste'); if (ta) { if (card) ta.value = GC.toText(card); check(); } }
    }

    function check() {
      const ta = root.querySelector('#paste'); if (!ta) return;
      const { missing } = GC.parse(ta.value);
      const st = root.querySelector('#st'), sv = root.querySelector('#save');
      const found = 8 - missing.length;
      if (!missing.length) { st.textContent = '✓ 8/8 cells found'; st.className = 'st good'; }
      else if (found === 0) { st.textContent = ''; st.className = 'st'; }
      else { st.textContent = `${found}/8 found. Missing: ${missing.join(', ')}`; st.className = 'st'; }
      sv.disabled = missing.length > 0;
    }

    function fill() {
      if (!card) return;
      needed.forEach((l, i) => { if (gv[i] && card[l]) GC.setField(gv[i], card[l]); });
      const sub = document.querySelector('input[type="submit"]');
      if (sub) sub.focus();                     // manual fill never submits
    }

    // part of one-click login: fill, then submit exactly once
    async function finishLogin() {
      fill();
      await GC.setFlow('grid_submitted');
      busy = true; draw();
      submitForm(form);
      setTimeout(async () => {
        await GC.clearFlow();
        busy = false; flowActive = false; banner = 'The grid form did not submit. Press Submit yourself.'; draw();
      }, 3000);
    }

    root.addEventListener('input', e => { if (e.target.id === 'paste') check(); });
    root.addEventListener('change', async e => {
      if (e.target.id === 'auto') { prefs.autofill = e.target.checked; await GC.setPrefs({ autofill: prefs.autofill }); }
    });
    root.addEventListener('click', async e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'close')  { collapsed = true;  return draw(); }
      if (act === 'open')   { collapsed = false; return draw(); }
      if (act === 'toggle') { showFull = !showFull; return draw(); }
      if (act === 'edit')   { editing = true; return draw(); }
      if (act === 'cancel') { editing = false; return draw(); }
      if (act === 'fill')   return fill();
      if (act === 'copy')     return GC.flash(btn, await GC.copy(card[btn.dataset.l]));
      if (act === 'copy-all') return GC.flash(btn, await GC.copy(GC.toText(card)));
      if (act === 'save') {
        const { card: parsed, missing } = GC.parse(root.querySelector('#paste').value);
        if (missing.length) return;
        await GC.save(parsed);
        card = parsed; editing = false; banner = '';
        if (flowActive && needed.length) return finishLogin();
        draw();
        if (prefs.autofill) fill();
      }
    });

    // card changed from the toolbar popup: refresh (don't clobber an open editor)
    chrome.storage.onChanged.addListener(async (_c, area) => {
      if (area !== 'local' || editing || busy) return;
      card = await GC.load(); prefs = await GC.getPrefs();
      draw();
    });

    if (flowActive && !card) banner = 'Paste your grid card once and login finishes by itself.';
    redraw = draw;
    draw();
    if (flowActive && card && needed.length) finishLogin();
    else if (card && prefs.autofill && gv.every(i => !i.value)) fill();
  }

  // ═════════════ HOME PAGE ═════════════
  async function homePage() {
    const flow = await GC.getFlow();
    if (!flow) return;
    await GC.clearFlow();
    const mt = (document.body && document.body.innerText || '').match(/([A-Z][A-Z\s]{3,})\s*\(\s*(\d{3,6})\s*\)/);
    const m = mount(); if (!m) return;
    m.root.innerHTML = `${styleTag()}<div class="toast">✓ LOGGED IN${mt ? ': ' + esc(mt[1].trim()) : ''}</div>`;
    setTimeout(() => m.host.remove(), 3500);
  }

  // ═════════════ ROUTER ═════════════
  const userEl = document.querySelector('input[name="mlogin"]');
  const passEl = document.querySelector('input[name="mpass"]');
  const gv = [...document.querySelectorAll('input[name^="gv"]')]
    .filter(i => /^gv\d+$/.test(i.name))
    .sort((a, b) => parseInt(a.name.slice(2), 10) - parseInt(b.name.slice(2), 10));

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !ch.gridPrefs) return;
    const t = (ch.gridPrefs.newValue || {}).theme || 'classic';
    if (t !== theme) { theme = t; redraw(); }
  });

  (async () => {
    theme = (await GC.getPrefs()).theme;
    let run = null;
    if (userEl && passEl)      run = loginPage(userEl, passEl);
    else if (gv.length)        run = gridPage(gv);
    else if (/\/eisform1\.asp$/i.test(location.pathname)) run = homePage();
    if (run) await run;
  })().catch(err => console.error('[EIS Quick Login]', err));
})();
