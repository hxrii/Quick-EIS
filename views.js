// Pure view functions: state in, HTML string out. No DOM access, no storage.
// popup.js owns state, routing and events.
const V = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rise = i => `class="rise" style="--i:${i}"`;
  const sec = (text, i) => `<div class="sec rise" style="--i:${i}">// ${text}</div>`;

  // ── building blocks ──────────────────────────────────────────────────────
  function hero(S) {
    if (!S.creds) {
      return `<button class="hero setup rise" style="--i:0" data-act="go" data-page="account">
        <span class="hero-ico">🔑</span>
        <span class="hero-txt"><b>SET UP LOGIN</b><small>Save your LDAP login once</small></span>
        <span class="hero-go">→</span></button>`;
    }
    return `<button class="hero rise" style="--i:0" data-act="login">
      <span class="hero-ico">⚡</span>
      <span class="hero-txt"><b>LOGIN TO EIS</b><small>as ${esc(S.creds.user)}</small></span>
      <span class="hero-go">→</span></button>`;
  }

  function pills(S) {
    const pill = (ok, yes, no) => `<span class="pill ${ok ? 'ok' : 'no'}">${ok ? yes : no}</span>`;
    return `<div class="pills rise" style="--i:1">${pill(!!S.creds, 'LOGIN SAVED', 'LOGIN MISSING')}${pill(!!S.card, 'GRID SAVED', 'GRID MISSING')}</div>`;
  }

  const OPEN = [
    ['home',   '🏠', 'HOME',   't-p'],
    ['punch',  '⏱', 'PUNCH',  't-a'],
    ['salary', '💰', 'SALARY', 't-bar'],
    ['leave',  '🌴', 'LEAVE',  't-b'],
    ['bio',    '👤', 'BIO',    't-p']
  ];
  const openTiles = () => `${sec('open eis', 2)}
    <div class="tiles">${OPEN.map(([k, ico, name, cls], i) => `
      <button class="tile ${cls} rise" style="--i:${3 + i}" data-act="open" data-k="${k}">
        <span class="t-ico">${ico}</span><span class="t-name">${name}</span></button>`).join('')}
    </div>`;

  function settingTiles(S) {
    const theme = (GC.THEMES.find(t => t.id === S.theme) || GC.THEMES[0]).name;
    return `${sec('settings', 8)}
      <div class="stiles">
        <button class="stile s-b rise" style="--i:9" data-act="go" data-page="account">
          <span class="t-ico">🔑</span>
          <span class="s-txt"><b>ACCOUNT</b><small>${S.creds ? esc(S.creds.user) : 'not set'}</small></span></button>
        <button class="stile s-a rise" style="--i:10" data-act="go" data-page="look">
          <span class="t-ico">🎨</span>
          <span class="s-txt"><b>LOOK</b><small>${esc(theme)}</small></span></button>
      </div>`;
  }

  // grid card: always the last block on the home screen
  function gridCard(S) {
    if (S.card && !S.editCard) {
      return `${sec('grid card', 11)}
        <section class="box rise" style="--i:12">
          <div class="box-head"><span>8 cells · click to copy</span>
            <span class="acts">
              <button class="lk" data-act="copy-all">Copy all</button>
              <button class="lk" data-act="card-edit">Edit</button>
              <button class="lk danger ${S.arm === 'card' ? 'armed' : ''}" data-act="card-del">${S.arm === 'card' ? 'Sure?' : 'Delete'}</button>
            </span></div>
          <div class="grid">
            ${GC.LABELS.map((l, i) => `
              <div class="cell" style="--j:${i}"><div class="cell-l">${l}</div><div class="cell-v">${S.card[l]}</div>
                <button class="mini" data-act="copy" data-l="${l}">COPY</button></div>`).join('')}
          </div>
        </section>`;
    }
    return `${sec('grid card', 11)}
      <section class="box rise" style="--i:12">
        <p class="tip">Paste it like <b>A-40 B-15 C-12 D-10</b> then <b>E-49 F-39 G-18 H-50</b>. Coming from the old grid extension? Use its COPY ALL and paste here.</p>
        <textarea id="paste" rows="3" spellcheck="false" placeholder="A-40  B-15  C-12  D-10&#10;E-49  F-39  G-18  H-50"></textarea>
        <div class="status" id="card-status"></div>
        <div class="row">
          <button class="btn" id="card-save" data-act="card-save" disabled>SAVE CARD</button>
          ${S.card ? '<button class="btn dark" data-act="card-cancel">CANCEL</button>' : ''}
        </div>
      </section>`;
  }

  const pageHead = (title, sub) => `
    <div class="pagehead rise">
      <button class="back" data-act="go" data-page="home">← BACK</button>
      <div class="ptitle"><b>${title}</b><small>${sub}</small></div>
    </div>`;

  // ── pages ────────────────────────────────────────────────────────────────
  const home = S => hero(S) + pills(S) + openTiles() + settingTiles(S) + gridCard(S);

  function account(S) {
    const body = (S.creds && !S.editAcct)
      ? `<section class="box rise" style="--i:1">
          <div class="box-head"><span>saved login</span>
            <span class="acts">
              <button class="lk" data-act="acct-edit">Edit</button>
              <button class="lk danger ${S.arm === 'acct' ? 'armed' : ''}" data-act="acct-del">${S.arm === 'acct' ? 'Sure?' : 'Delete'}</button>
            </span></div>
          <div class="kv"><span>USER</span><b>${esc(S.creds.user)}</b><button class="mini" data-act="copy-user">COPY</button></div>
          <div class="kv"><span>PASS</span><b>••••••••</b><button class="mini" data-act="copy-pass">COPY</button></div>
        </section>`
      : `<section class="box rise" style="--i:1">
          <div class="box-head"><span>${S.creds ? 'edit' : 'save'} ldap login</span></div>
          <div class="lbl">LDAP user id</div>
          <input class="text" id="in-user" autocomplete="off" spellcheck="false"/>
          <div class="lbl">LDAP password</div>
          <input class="text" id="in-pass" type="password" autocomplete="off"/>
          <label class="chk"><input type="checkbox" id="show-pw"/>SHOW PASSWORD</label>
          <div class="status" id="acct-status"></div>
          <div class="row">
            <button class="btn" data-act="acct-save">SAVE LOGIN</button>
            ${S.creds ? '<button class="btn dark" data-act="acct-cancel">CANCEL</button>' : ''}
          </div>
        </section>`;
    return pageHead('ACCOUNT', 'ldap login') + body + `
      <p class="note rise" style="--i:2">Saved unencrypted in this browser profile. Not synced, never sent anywhere. Use it on your own machine only.</p>`;
  }

  function look(S) {
    return pageHead('LOOK', 'colour theme') + `
      <div class="themes">${GC.THEMES.map((t, i) => `
        <button class="tcard ${S.theme === t.id ? 'on' : ''} rise" style="--i:${i + 1}" data-act="theme" data-id="${t.id}">
          <span class="tprev" style="--c:${t.bg};--p:${t.paper};--a:${t.accent};--b:${t.bar}"><i></i><i></i><i></i><i></i></span>
          <span class="tname">${t.name}${S.theme === t.id ? ' ✓' : ''}</span>
        </button>`).join('')}
      </div>`;
  }

  return { home, account, look };
})();
