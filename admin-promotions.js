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
  let _subsShown     = 25;

  const _renderSubsTable = () => {
    const search = (document.getElementById('sub-search')?.value || '').toLowerCase().trim();
    const filter = document.getElementById('sub-status-filter')?.value || 'all';
    const filtered = _allSubs.filter(s => {
      const nameMatch = `${s.first_name} ${s.last_name} ${s.email} ${s.phone || ''}`.toLowerCase().includes(search);
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
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:var(--text-muted);">${esc(s.phone || '—')}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:var(--text-muted);text-transform:capitalize;">${esc(s.skill_level || '—')}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;">
                <span style="font-size:9px;font-weight:800;padding:3px 9px;border-radius:99px;letter-spacing:.5px;text-transform:uppercase;${pillCSS(s.status)}">${esc(s.status || '—')}</span>
              </td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:11px;color:var(--text-muted);">${fmtDate(s.subscribed_at) || '—'}</td>
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
    openSendPromo: () => openSendPromo(),
    generateQR: () => generateQR(),
  });
})();
