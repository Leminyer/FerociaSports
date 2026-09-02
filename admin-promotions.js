/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PROMOTIONS
   Depends on: config.js, db.js, admin-state.js, admin-email-utils.js
   Load order: admin-state.js -> admin-email-utils.js ->
               admin-promotions.js -> app.js

   Extracted from app.js's PROMOTIONS section. Uses the shared
   sendOneEmail()/AdminState.emailInFlight from admin-email-utils.js,
   same as Tournament Notify and Email Notifications.

   _subsShown is local module state (how many subscriber rows are
   currently shown) — the status-filter and search inputs need to reset
   it and re-render on every keystroke/change, so this file wires those
   two listeners itself instead of leaving them in app.js's BOOT trying
   to reach into a private variable in a different closure.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js must load before admin-promotions.js');
    return;
  }
  const AdminState = window.AdminState;

  /* ─── PROMOTIONS ───────────────────────────────────────── */

  // ── Promotions page state ─────────────────────────────────────────────
  let _allSubs       = [];
  /* Keys of everyone who is already a player, so each subscriber row can
     show the right icon without a lookup per row. Built once per load. */
  let _playerIndex   = new Map();
  let _subsShown     = 25;

  const _renderSubsTable = () => {
    const search = (document.getElementById('sub-search')?.value || '').toLowerCase().trim();
    const filter = document.getElementById('sub-status-filter')?.value || 'all';
    const filtered = _allSubs.filter(s => {
      const nameMatch = `${s.first_name} ${s.last_name} ${s.email} ${s.phone || ''} ${FerociaPhone.searchable(s.country_code, s.phone)}`.toLowerCase().includes(search);
      const statusMatch = filter === 'all' || s.status === filter;
      return nameMatch && statusMatch;
    });
    const slice   = filtered.slice(0, _subsShown);
    const total   = filtered.length;

    const avColors = ['var(--blue)','var(--teal)','var(--orange)','#7c3aed','#0891b2','#d97706'];
    const getAv = (s) => {
      const str = `${s.first_name}${s.last_name}`;
      let h = 0; for (let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h);
      return avColors[Math.abs(h) % avColors.length];
    };
    const pillCSS = (status) => {
      if (status === 'active')       return 'background:rgba(36,188,150,0.12);color:#085041;';
      if (status === 'pending')      return 'background:rgba(242,96,36,0.12);color:#7a3d00;';
      return 'background:rgba(107,122,153,0.12);color:var(--text-muted);';
    };
    const tableHTML = slice.length ? `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Subscriber</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Email</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Phone</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Skill</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Status</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Joined</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${slice.map(s => {
            const initials = `${s.first_name?.[0]||''}${s.last_name?.[0]||''}`.toUpperCase();
            return `<tr style="cursor:default;" onmouseover="this.querySelectorAll('td').forEach(t=>t.style.background='rgba(23,76,204,0.025)')" onmouseout="this.querySelectorAll('td').forEach(t=>t.style.background='')">
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;vertical-align:middle;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:30px;height:30px;border-radius:50%;background:${getAv(s)};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:white;flex-shrink:0;">${esc(initials)}</div>
                  <div style="font-size:13px;font-weight:700;color:var(--text);">${esc(s.first_name)} ${esc(s.last_name)}</div>
                </div>
              </td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:var(--text-muted);">${esc(s.email || '—')}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:var(--text-muted);">${s.phone ? esc(FerociaPhone.format(s.country_code, s.phone)) : '—'}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:var(--text-muted);text-transform:capitalize;">${esc(s.skill_level || '—')}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;">
                <span style="font-size:9px;font-weight:800;padding:3px 9px;border-radius:99px;letter-spacing:.5px;text-transform:uppercase;${pillCSS(s.status)}">${esc(s.status || '—')}</span>
              </td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:11px;color:var(--text-muted);">${fmtDate(s.subscribed_at) || '—'}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;text-align:right;white-space:nowrap;">
                ${subActionIcons(s)}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : `<div class="empty" style="padding:20px;">No subscribers found.</div>`;

    document.getElementById('subscribers-table').innerHTML = tableHTML;

    // Load more row
    const lmRow = document.getElementById('sub-load-more-row');
    const lmInfo = document.getElementById('sub-results-info');
    const lmBtn  = document.getElementById('sub-load-more-btn');
    if (lmRow) {
      lmRow.style.display = 'flex';
      if (lmInfo) lmInfo.textContent = `Showing ${Math.min(_subsShown, total)} of ${total} subscribers`;
      if (lmBtn) {
        if (slice.length < total) {
          lmBtn.style.display = '';
          lmBtn.textContent = `Load ${Math.min(25, total - slice.length)} more`;
          lmBtn.onclick = () => { _subsShown += 25; _renderSubsTable(); };
        } else {
          lmBtn.style.display = 'none';
        }
      }
    }
  };

  const loadPromotionsPage = async () => {
    await loadSubscribers();
    // Auto-generate QR code on page load
    generateQR();
  };

  /* Mirrors _normName in admin-players.js and normalize_name_for_matching()
     in the database: lower → strip accents → collapse spaces. Kept local so
     this module has no load-order dependency on admin-players.js. */
  const _norm = (v) =>
    String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();

  /* Same three-field rule used everywhere else: email + first + last.
     Email alone would be wrong — a parent and child can share an inbox. */
  const _personKey = (r) =>
    `${(r.email || '').trim().toLowerCase()}|${_norm(r.first_name)}|${_norm(r.last_name)}`;

  /* Icons for the actions column.

     Three states, decided per row:
       · always      an eye → read-only details
       · already a player   → person-with-check, goes to their profile
       · unsubscribed       → NO convert icon at all (approved): someone
                              who left the mailing list is not converted
                              into a player from here
       · otherwise          → person-with-plus, opens the convert modal */
  const ICON_EYE   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICON_ADD   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>';
  const ICON_CHECK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>';

  const iconBtn = (action, extra, title, icon, color) =>
    `<button type="button" data-action="${action}" ${extra} title="${title}"
       style="background:none;border:none;padding:4px 6px;cursor:pointer;color:${color};vertical-align:middle;"
       onmouseover="this.style.opacity='0.6'" onmouseout="this.style.opacity='1'">${icon}</button>`;

  const subActionIcons = (s) => {
    let html = iconBtn('viewSubscriber', `data-subid="${s.id}"`,
                       'View details', ICON_EYE, 'var(--text-muted)');

    if (s.status === 'unsubscribed') return html;   // no conversion

    const pid = _playerIndex.get(_personKey(s));
    html += pid
      ? iconBtn('showPage', `data-page="player-profile" data-pid="${pid}"`,
                'Already a player — view profile', ICON_CHECK, 'var(--teal)')
      : iconBtn('convertSubscriber', `data-subid="${s.id}"`,
                'Convert to player', ICON_ADD, 'var(--blue)');
    return html;
  };


  /* ─── SUBSCRIBER DETAILS & CONVERSION ────────────────────────
     Two separate modals on purpose: the details one gets opened far more
     often, and loading it with the conversion form would make the common
     case slower and more fragile.
     ──────────────────────────────────────────────────────────── */

  const svRow = (label, value) => `
    <div style="display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:0.5px solid var(--divider-color);">
      <div style="font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);flex-shrink:0;">${label}</div>
      <div style="font-size:13px;font-weight:600;color:var(--text);text-align:right;word-break:break-word;">${value || '—'}</div>
    </div>`;

  const svSection = (title) => `
    <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--blue);margin:18px 0 4px;">${title}</div>`;

  const subAge = (iso) => {
    if (!iso) return null;
    const b = new Date(iso + 'T00:00:00');
    if (isNaN(b.getTime())) return null;
    const n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return a;
  };

  const subDob = (iso) => {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    const txt = m ? `${m[2]}/${m[3]}/${m[1]}` : String(iso);
    const age = subAge(iso);
    return age !== null ? `${txt} (${age})` : txt;
  };

  window.viewSubscriber = (subId) => {
    const s = _allSubs.find(x => String(x.id) === String(subId));
    if (!s) { toast('Subscriber not found. Refresh the page.', true); return; }

    document.getElementById('sv-name').textContent = `${s.first_name} ${s.last_name}`;
    document.getElementById('sv-body').innerHTML =
        svSection('Contact')
      + svRow('Email', esc(s.email))
      + svRow('Phone', s.phone ? esc(FerociaPhone.format(s.country_code, s.phone)) : '')
      + svSection('Personal')
      + svRow('Gender', esc(s.gender))
      + svRow('Date of Birth', esc(subDob(s.date_of_birth)))
      + svRow('Location', esc(FerociaLocation.formatLocation(s.city, s.state)))
      + svRow('Skill Level', esc(s.skill_level))
      + svSection('Subscription')
      + svRow('Status', esc(s.status))
      + svRow('Subscribed', fmtDate(s.subscribed_at))
      + svRow('Confirmed', s.confirm_token ? 'Pending confirmation' : 'Yes')
      // Surfaces the legacy rows that have no token and therefore cannot
      // use the unsubscribe link in a campaign.
      + svRow('Can unsubscribe', s.unsubscribe_token ? 'Yes' : '<span style="color:#c04a0e;">No — no token</span>');

    document.getElementById('sub-view-modal').classList.add('open');
  };

  window.closeSubView = () =>
    document.getElementById('sub-view-modal').classList.remove('open');

  window.convertSubscriber = (subId) => {
    const s = _allSubs.find(x => String(x.id) === String(subId));
    if (!s) { toast('Subscriber not found. Refresh the page.', true); return; }

    document.getElementById('sc-subtitle').textContent = `${s.first_name} ${s.last_name} · ${s.email}`;
    const body = document.getElementById('sc-body');

    // Already a player? Checked against the index loaded with the page,
    // then confirmed against the database when Create is pressed — the
    // index could be a few minutes stale.
    const existingId = _playerIndex.get(_personKey(s));
    if (existingId) {
      body.innerHTML = `
        <div style="padding:16px;background:rgba(36,188,150,0.06);border:1px solid rgba(36,188,150,0.25);border-radius:10px;font-size:13px;font-weight:600;color:var(--text);line-height:1.6;">
          This person already has a player record. Converting again would create a duplicate.
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
          <button type="button" data-action="closeSubConvert" style="padding:10px 18px;border:1px solid var(--divider-color);border-radius:99px;background:white;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Close</button>
          <button type="button" data-action="showPage" data-page="player-profile" data-pid="${existingId}"
            style="padding:10px 22px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3,var(--blue));color:white;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">View Profile</button>
        </div>`;
      document.getElementById('sub-convert-modal').classList.add('open');
      return;
    }

    const lbl = (t, req) => `<div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">${t}${req ? ' <span style="color:#e53935;">*</span>' : ''}</div>`;
    const inp = 'width:100%;padding:9px 12px;border:1px solid var(--divider-color);border-radius:8px;font-family:\'Inter\',sans-serif;font-size:13px;font-weight:600;color:var(--text);outline:none;';

    body.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--text-muted);line-height:1.6;margin-bottom:14px;">
        Fields are prefilled from the subscription. Complete what is missing — a player record needs all of it.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>${lbl('Phone', true)}<div id="sc-phone-field"></div></div>
        <div>${lbl('Date of Birth', true)}<input type="date" id="sc-dob" style="${inp}" value="${s.date_of_birth || ''}"></div>
        <div>${lbl('City', true)}<input type="text" id="sc-city" list="city-suggestions" style="${inp}" value="${esc(s.city || '')}" placeholder="Boca Raton"></div>
        <div>${lbl('State', true)}<select id="sc-state" style="${inp}"></select></div>
        <div>${lbl('Gender')}<select id="sc-gender" style="${inp}">
          <option value="">Select</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select></div>
        <div>${lbl('Skill Level')}<select id="sc-skill" style="${inp}">
          <option value="">Select level</option>
          <option value="Beginner">Beginner</option>
          <option value="Intermediate">Intermediate</option>
          <option value="Advanced">Advanced</option>
        </select></div>
        <div>${lbl('Coach Rating', true)}<input type="number" id="sc-rating" min="1" max="8" step="0.001" placeholder="3.500" style="${inp}"></div>
        <div>${lbl('Player Status', true)}<select id="sc-status" style="${inp}">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select></div>
      </div>
      <div style="margin-top:16px;padding:12px 14px;background:#fff4e6;border-left:3px solid var(--orange);border-radius:0 8px 8px 0;font-size:12px;font-weight:600;color:#9a6200;line-height:1.6;">
        ⚠️ This cannot be undone from the app — there is no option to delete a player. Reversing it would need direct database access.
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button type="button" data-action="closeSubConvert" style="padding:10px 18px;border:1px solid var(--divider-color);border-radius:99px;background:white;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Cancel</button>
        <button type="button" id="sc-create-btn" data-action="doConvertSubscriber" data-subid="${s.id}"
          style="padding:10px 22px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3,var(--blue));color:white;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Create Player</button>
      </div>`;

    document.getElementById('sub-convert-modal').classList.add('open');

    // Mount the shared widgets after the markup exists.
    FerociaPhone.mount({
      container: 'sc-phone-field',
      required:  true,
      value:     { country_code: s.country_code, phone: s.phone },
    });
    document.getElementById('sc-state').innerHTML = FerociaLocation.stateOptions(s.state || '');
    if (s.gender)      document.getElementById('sc-gender').value = s.gender;
    if (s.skill_level) document.getElementById('sc-skill').value  = s.skill_level;
    FerociaLocation.loadCitySuggestions('city-suggestions', api);
  };

  window.closeSubConvert = () =>
    document.getElementById('sub-convert-modal').classList.remove('open');

  window.doConvertSubscriber = async (subId) => {
    const s = _allSubs.find(x => String(x.id) === String(subId));
    if (!s) { toast('Subscriber not found.', true); return; }

    const phone = FerociaPhone.validate('sc-phone-field', { required: true });
    if (!phone.ok) { toast(phone.error, true); return; }
    const phoneVal = FerociaPhone.getValue('sc-phone-field');

    const dob = document.getElementById('sc-dob').value;
    if (!dob) { toast('Date of birth is required.', true); return; }

    const city = FerociaLocation.validateCity(document.getElementById('sc-city').value, { required: true });
    if (!city.ok) { toast(city.error, true); return; }
    const state = FerociaLocation.validateState(document.getElementById('sc-state').value, { required: true });
    if (!state.ok) { toast(state.error, true); return; }

    const ratingRaw = document.getElementById('sc-rating').value;
    const rating = Number(ratingRaw);
    if (!ratingRaw || !Number.isFinite(rating) || rating < 1 || rating > 8) {
      toast('Coach rating is required and must be between 1 and 8.', true);
      return;
    }

    // confirmModal() renders with textContent, so this is one flowing
    // sentence rather than a formatted block.
    const ok = await confirmModal({
      title: 'Create a player record?',
      message: `A player record will be created for ${s.first_name} ${s.last_name}. `
             + `This cannot be undone from the app — there is no option to delete a player, `
             + `so reversing it would need direct database access. They stay on the mailing list.`,
      okLabel: 'Create player',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;

    const btn = document.getElementById('sc-create-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    try {
      // Re-check against the database, not the index: it was loaded when the
      // page opened and another admin may have added this person since.
      const dup = await api(
        `players?email=ilike.${encodeURIComponent(s.email)}&select=id,first_name,last_name,email&limit=25`);
      if ((dup || []).some(p => _personKey(p) === _personKey(s))) {
        toast('This person already has a player record. Refreshing the list.', true);
        window.closeSubConvert();
        await loadSubscribers();
        return;
      }

      await api('players', 'POST', {
        first_name:    s.first_name,
        last_name:     s.last_name,
        email:         s.email,
        phone:         phoneVal.phone,
        country_code:  phoneVal.country_code,
        date_of_birth: dob,
        city:          city.value,
        state:         state.value,
        gender:        document.getElementById('sc-gender').value || null,
        skill_level:   document.getElementById('sc-skill').value  || null,
        coach_rating:  Number(rating.toFixed(3)),
        coach_rating_updated_at: new Date().toISOString(),
        status:        document.getElementById('sc-status').value,
        // The date they became a player, not the date they subscribed.
        date_joined:   todayISO(),
      });

      window.closeSubConvert();
      toast(`${s.first_name} ${s.last_name} is now a player.`);
      await loadSubscribers();   // rebuilds the index so the icon flips
    } catch (err) {
      toast(`Error creating player: ${err.message}`, true);
      if (btn) { btn.disabled = false; btn.textContent = 'Create Player'; }
    }
  };

  const loadSubscribers = async () => {
    _subsShown = 25;
    let subs = [];
    try {
      subs = await api('subscribers?select=*&order=subscribed_at.desc');
    } catch (e) {
      document.getElementById('subscribers-table').innerHTML =
        `<div class="empty" style="padding:20px;">Error: ${esc(e.message)}</div>`;
      return;
    }
    _allSubs = subs;

    // Which of these people already have a player record. Loaded here, once,
    // rather than per row: 419 subscribers would mean 419 lookups.
    // Non-fatal — if it fails the convert icon simply shows for everyone and
    // the modal catches the duplicate before creating anything.
    try {
      const players = await api('players?select=id,first_name,last_name,email');
      _playerIndex = new Map(players.map(p => [_personKey(p), p.id]));
    } catch (err) {
      console.warn('[promotions] could not load players for the convert icon:', err.message);
      _playerIndex = new Map();
    }

    // Stat cards
    const countActive  = subs.filter(s => s.status === 'active').length;
    const countPending = subs.filter(s => s.status === 'pending').length;
    const countUnsub   = subs.filter(s => s.status === 'unsubscribed').length;
    const countTotal   = subs.length;
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('promo-stat-active',  countActive);
    setEl('promo-stat-pending', countPending);
    setEl('promo-stat-total',   countTotal);
    setEl('promo-stat-unsub',   countUnsub);

    // Trend: count subscribers joined this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const newThisMonth = subs.filter(s => s.subscribed_at && s.subscribed_at >= monthStart).length;
    const growthPct = countTotal > 0 ? Math.round((newThisMonth / countTotal) * 100) : 0;

    // Update ctx lines with real trend data
    const ctxActive = document.getElementById('promo-ctx-active');
    if (ctxActive) ctxActive.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +${newThisMonth} this month`;
    const ctxPending = document.getElementById('promo-ctx-pending');
    if (ctxPending) ctxPending.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3z"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Awaiting email verification`;
    const ctxTotal = document.getElementById('promo-ctx-total');
    if (ctxTotal) ctxTotal.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +${growthPct}% growth`;

    // Growth badge on QR card
    const badge = document.getElementById('promo-growth-badge');
    if (badge) badge.textContent = `+${newThisMonth} subscriber${newThisMonth !== 1 ? 's' : ''} this month`;

    // Pending label on action card
    const pendLabel = document.getElementById('promo-pending-label');
    if (pendLabel) pendLabel.textContent = `${countPending} subscriber${countPending !== 1 ? 's' : ''} awaiting confirmation.`;

    // Legacy compat
    const elA = document.getElementById('sub-count-active');
    const elP = document.getElementById('sub-count-pending');
    const elU = document.getElementById('sub-count-unsub');
    if (elA) elA.textContent = countActive + ' Active';
    if (elP) elP.textContent = countPending + ' Pending';
    if (elU) elU.textContent = countUnsub + ' Unsubscribed';

    // Wire copy URL button
    const copyBtn = document.getElementById('promo-copy-url-btn');
    if (copyBtn && !copyBtn._wired) {
      copyBtn._wired = true;
      copyBtn.addEventListener('click', () => {
        const url = document.getElementById('subscribe-url-display')?.textContent || '';
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.style.color = 'var(--teal)';
          setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.style.color = '#C6F221'; }, 2000);
        });
      });
    }

    _renderSubsTable();
  };

  const generateQR = () => {
    const baseUrl =
      window.location.origin + window.location.pathname.replace('admin.html', '') + 'subscribe.html';
    // Populate URL strip in new QR card
    const urlDisplay = document.getElementById('subscribe-url-display');
    if (urlDisplay) urlDisplay.textContent = baseUrl;
    const qrEl = document.getElementById('qr-code');
    if (!qrEl) return;
    qrEl.innerHTML = '';
    /* eslint-disable no-new, no-undef */
    new QRCode(qrEl, {
      text: baseUrl,
      width: 150,
      height: 150,
      colorDark: '#0d1f4a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
    /* eslint-enable */
  };

  // ── Helper: relative time ───────────────────────────────────────────────
  const _relTimePromo = (iso) => {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 172800) return 'Yesterday';
    return `${Math.floor(diff/86400)} days ago`;
  };

  const openSendPromo = async () => {
    const modal = document.getElementById('promo-modal');
    if (!modal) return;

    // Reset composer
    const editor = document.getElementById('promo-message');
    if (editor) editor.innerHTML = '';
    const subjectEl = document.getElementById('promo-subject');
    if (subjectEl) subjectEl.value = '';

    // Reset type pills to Tournament
    document.querySelectorAll('.promo-type-pill').forEach(p => p.classList.remove('active'));
    const firstPill = document.querySelector('.promo-type-pill');
    if (firstPill) firstPill.classList.add('active');
    const typeInput = document.getElementById('promo-campaign-type');
    if (typeInput) typeInput.value = 'Tournament';
    const selTypeEl = document.getElementById('promo-selected-type');
    if (selTypeEl) selTypeEl.textContent = 'Tournament';
    // Reset event selector + flyer fields
    const evSel = document.getElementById('promo-event-select');
    if (evSel) evSel.innerHTML = '<option value="">Loading...</option>';
    const flyerInp = document.getElementById('promo-event-flyer-url');
    if (flyerInp) flyerInp.value = '';
    const otherFlyerInp = document.getElementById('promo-other-flyer-url');
    if (otherFlyerInp) otherFlyerInp.value = '';

    // Wire type pill clicks — show/hide event selector or flyer URL field
    const updateCampaignTypeUI = (type) => {
      const evWrap    = document.getElementById('promo-event-selector-wrap');
      const otherWrap = document.getElementById('promo-other-flyer-wrap');
      if (evWrap)    evWrap.style.display    = (type === 'Tournament' || type === 'Ladder') ? 'block' : 'none';
      if (otherWrap) otherWrap.style.display = type === 'Other' ? 'block' : 'none';
      // Repopulate event dropdown for selected type
      if (type === 'Tournament' || type === 'Ladder') populateCampaignEventDropdown(type);
    };
    document.querySelectorAll('.promo-type-pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('.promo-type-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        if (typeInput) typeInput.value = pill.dataset.type;
        if (selTypeEl) selTypeEl.textContent = pill.dataset.type;
        updateCampaignTypeUI(pill.dataset.type);
      };
    });
    // Trigger for initial state (Tournament selected by default)
    updateCampaignTypeUI('Tournament');

    // Wire character counter
    if (editor) {
      editor.addEventListener('input', () => {
        const len = editor.innerText.length;
        const el1 = document.getElementById('promo-char-count');
        const el2 = document.getElementById('promo-char-count2');
        if (el1) el1.textContent = `${len} / 2000`;
        if (el2) el2.textContent = `${len} / 2000`;
      });
    }

    // Wire link button
    window.promptInsertLink = () => {
      const url = prompt('Enter URL:');
      if (url) document.execCommand('createLink', false, url);
    };
    window.toggleEmojiPicker = (e) => {
      e.stopPropagation();
      const picker = document.getElementById('emoji-picker');
      if (!picker) return;
      const isOpen = picker.style.display === 'grid';
      picker.style.display = isOpen ? 'none' : 'grid';
      if (!isOpen) {
        // Close when clicking outside
        const close = (ev) => {
          if (!picker.contains(ev.target) && ev.target.id !== 'emoji-picker-btn') {
            picker.style.display = 'none';
            document.removeEventListener('click', close);
          }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
      }
    };
    window.insertFixedEmoji = (emoji) => {
      const editor = document.getElementById('promo-message');
      if (!editor) return;
      editor.focus();
      document.execCommand('insertText', false, emoji);
      // Close picker after selection
      const picker = document.getElementById('emoji-picker');
      if (picker) picker.style.display = 'none';
    };

    // Load audience + last campaign in parallel
    try {
      const [subs, campaigns] = await Promise.all([
        api('subscribers?status=eq.active&select=id'),
        api('campaigns?select=*&order=sent_at.desc&limit=1').catch(() => []),
      ]);

      const count = subs.length;
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('promo-audience-count', count);

      const recipEl = document.getElementById('promo-recipient-count');
      if (recipEl) recipEl.innerHTML = `<span style="font-weight:800;color:var(--teal);">${count} active subscriber${count !== 1 ? 's' : ''}</span> will receive this campaign.`;

      const last = campaigns?.[0] || null;
      setEl('promo-last-sent', last ? _relTimePromo(last.sent_at) : 'No campaigns yet');
      setEl('promo-last-type', last ? last.campaign_type || 'General' : '');

    } catch (e) {
      const recipEl = document.getElementById('promo-recipient-count');
      if (recipEl) recipEl.textContent = 'Could not load audience data.';
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  const populateCampaignEventDropdown = async (type) => {
    const sel      = document.getElementById('promo-event-select');
    const flyerInp = document.getElementById('promo-event-flyer-url');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading...</option>';
    if (flyerInp) flyerInp.value = '';
    try {
      const today  = new Date().toISOString().slice(0, 10);
      const dbType = type.toLowerCase(); // 'tournament' or 'ladder'
      const events = await api(`events?event_type=eq.${dbType}&event_date=gte.${today}&select=id,title,event_date,flyer_url&order=event_date.asc`);
      if (!events.length) {
        sel.innerHTML = `<option value="">No upcoming ${type.toLowerCase()} events</option>`;
        return;
      }
      sel.innerHTML = '<option value="">Select an event...</option>'
        + events.map(ev => {
            const d = new Date(ev.event_date + 'T00:00:00');
            const label = `${ev.title} — ${d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}`;
            return `<option value="${ev.id}" data-title="${ev.title.replace(/"/g,'&quot;')}" data-flyer="${ev.flyer_url || ''}">${label}</option>`;
          }).join('');
      // Wire selection → auto-fill subject + store flyer URL
      sel.onchange = () => {
        const opt = sel.options[sel.selectedIndex];
        const subjectEl = document.getElementById('promo-subject');
        if (opt.value && subjectEl) {
          const emoji = type === 'Tournament' ? '🏆' : '🏓';
          subjectEl.value = `${emoji} ${opt.dataset.title} — Don't Miss It!`;
        }
        if (flyerInp) flyerInp.value = opt.dataset.flyer || '';
      };
    } catch (err) {
      sel.innerHTML = '<option value="">Error loading events</option>';
    }
  };

  const sendTestPromoEmail = async () => {
    if (window.AdminState.emailInFlight) { toast('Please wait for the current send to finish.', true); return; }

    const subject = document.getElementById('promo-subject').value.trim();
    const editor  = document.getElementById('promo-message');
    const message = editor ? editor.innerText.trim() : '';
    const campaignType = document.getElementById('promo-campaign-type')?.value || 'Other';

    // Resolve flyer URL same as real send
    let promoFlyerUrl = '';
    if (campaignType === 'Tournament' || campaignType === 'Ladder') {
      const sel = document.getElementById('promo-event-select');
      if (!sel || !sel.value) { toast('Please select an event first.', true); return; }
      promoFlyerUrl = document.getElementById('promo-event-flyer-url')?.value || '';
    } else if (campaignType === 'Other') {
      promoFlyerUrl = document.getElementById('promo-other-flyer-url')?.value.trim() || '';
    }

    if (!subject || !message) {
      toast('Please fill in the subject and message before sending a test.', true);
      return;
    }

    const testBtn = document.getElementById('promo-test-btn');
    const origHTML = testBtn.innerHTML;
    testBtn.disabled = true;
    testBtn.innerHTML = 'Sending test...';

    try {
      emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
      const ok = await window.sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.PROMO, {
        player_name:     'Ferocia Admin',
        player_email:    CFG.ADMIN_EMAIL,
        subject:         `[TEST] ${subject}`,
        message:         message,
        unsubscribe_url: '#',
        flyer_url:       promoFlyerUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      });
      if (ok) {
        toast(`✅ Test email sent to ${CFG.ADMIN_EMAIL}`);
      } else {
        toast('Test email failed. Check your EmailJS config.', true);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = origHTML;
    }
  };

  const sendPromoEmail = async (e) => {
    e.preventDefault();
    const subject = document.getElementById('promo-subject').value.trim();
    const editor  = document.getElementById('promo-message');
    const message = editor ? editor.innerText.trim() : '';
    const campaignType = document.getElementById('promo-campaign-type')?.value || 'Other';

    // Resolve flyer URL: from event selector or from Other flyer URL input
    let promoFlyerUrl = '';
    if (campaignType === 'Tournament' || campaignType === 'Ladder') {
      const sel = document.getElementById('promo-event-select');
      if (sel && sel.value) {
        promoFlyerUrl = document.getElementById('promo-event-flyer-url')?.value || '';
      } else {
        toast('Please select an event.', true); return;
      }
    } else if (campaignType === 'Other') {
      promoFlyerUrl = document.getElementById('promo-other-flyer-url')?.value.trim() || '';
    }

    if (!subject || !message) {
      toast('Please fill in the subject and message.', true);
      return;
    }

    let subs = [];
    try {
      subs = await api('subscribers?status=eq.active&select=*');
    } catch (err) {
      toast(`Error: ${err.message}`, true);
      return;
    }
    if (!subs.length) {
      toast('No active subscribers to send to.', true);
      return;
    }

    const sendBtn = document.getElementById('promo-send-btn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = 'Sending...';
    window.AdminState.emailInFlight = true;

    emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
    const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', '');
    let sent = 0;
    const failedRecipients = [];

    // Admin copy always last
    const allPromoRecipients = [
      ...subs,
      { first_name: 'Ferocia', last_name: 'Admin', email: CFG.ADMIN_EMAIL, unsubscribe_token: null },
    ];

    for (const sub of allPromoRecipients) {
      const unsubUrl = sub.unsubscribe_token
        ? `${baseUrl}unsubscribe.html?t=${sub.unsubscribe_token}`
        : `${baseUrl}unsubscribe.html`;
      // Replace {first_name} with real name
      const personalizedMsg = message.replace(/\{first_name\}/g, sub.first_name || 'Player');
      const ok = await window.sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.PROMO, {
        player_name:     `${sub.first_name} ${sub.last_name}`,
        player_email:    sub.email,
        subject,
        message:         personalizedMsg,
        unsubscribe_url: unsubUrl,
        flyer_url:       promoFlyerUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      });
      if (ok) sent++;
      else failedRecipients.push(sub.email);
      sendBtn.innerHTML = `Sending... ${sent + failedRecipients.length}/${allPromoRecipients.length}`;
      if (sent + failedRecipients.length < allPromoRecipients.length) {
        await sleep(CFG.EMAIL_THROTTLE_MS);
      }
    }

    // Record campaign in DB
    try {
      await api('campaigns', 'POST', {
        subject,
        message,
        campaign_type: campaignType,
        sent_at:       new Date().toISOString(),
        sent_count:    sent,
        failed_count:  failedRecipients.length,
      });
    } catch(_) { /* non-critical — don't block on this */ }

    window.AdminState.emailInFlight = false;
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Launch Campaign';

    // Close modal
    const modal = document.getElementById('promo-modal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }

    if (!failedRecipients.length) {
      toast(`✅ Campaign launched! ${sent} emails sent.`);
    } else {
      const failedList = failedRecipients.slice(0, 3).join(', ');
      const more = failedRecipients.length > 3 ? ` (+${failedRecipients.length - 3} more)` : '';
      toast(`Sent ${sent}. Failed: ${failedList}${more}`, true);
    }
  };


  // Own these listeners directly (DOM is already parsed by the time this
  // script runs, same as every other listener).
  document.getElementById('promo-form')?.addEventListener('submit', sendPromoEmail);
  document.getElementById('sub-status-filter')?.addEventListener('change', () => { _subsShown = 25; _renderSubsTable(); });
  document.getElementById('sub-search')?.addEventListener('input', () => { _subsShown = 25; _renderSubsTable(); });

  // ── Expose / register with the shared infrastructure ──────────────────
  window.loadPromotionsPage = loadPromotionsPage; // called from the page router
  window.sendTestPromoEmail = sendTestPromoEmail; // exposed via window.app for tournament.js (set in app.js's BOOT)
  window.loadSubscribers    = loadSubscribers;    // called by sendPendingReminder, which stays in app.js

  Object.assign(window.CLICK_HANDLERS, {
    // CLICK_HANDLERS are called with ONE argument: the button element.
    viewSubscriber:      (btn) => window.viewSubscriber(btn.dataset.subid),
    convertSubscriber:   (btn) => window.convertSubscriber(btn.dataset.subid),
    doConvertSubscriber: (btn) => window.doConvertSubscriber(btn.dataset.subid),
    closeSubView:        () => window.closeSubView(),
    closeSubConvert:     () => window.closeSubConvert(),
    openSendPromo: () => openSendPromo(),
    generateQR: () => generateQR(),
  });
})();
