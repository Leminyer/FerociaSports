/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: SHARE PAGE
   Depends on: config.js, db.js, admin-state.js
   Load order: admin-state.js -> admin-share.js -> app.js

   Extracted from app.js's SHARE PAGE section. Self-contained — reads
   no ladder/player state (AdminState), only its own local module state.
   ============================================================ */

(function () {
  'use strict';

  // ── Share page state ──────────────────────────────────────────────────
  let _shareData = { ladders: [], tournaments: [], visits: [] };
  let _shareCurrentTab = 'ladders';

  // ── Relative time helper ───────────────────────────────────────────────
  const _relTime = (iso) => {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)  return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 172800) return 'yesterday';
    return `${Math.floor(diff/86400)}d ago`;
  };

  // ── Populate stat cards ────────────────────────────────────────────────
  const _populateShareStats = () => {
    const { ladders, tournaments, visits } = _shareData;
    const all = [...ladders, ...tournaments];

    // Most Viewed — ladder/tournament with most visit rows
    const visitsByItem = {};
    visits.forEach(v => {
      const key = v.ladder_id ? `l_${v.ladder_id}` : v.tournament_id ? `t_${v.tournament_id}` : null;
      if (key) visitsByItem[key] = (visitsByItem[key] || 0) + 1;
    });
    let mostViewedName = '—';
    if (Object.keys(visitsByItem).length) {
      const topKey = Object.keys(visitsByItem).sort((a,b) => visitsByItem[b] - visitsByItem[a])[0];
      const [type, id] = topKey.split('_');
      const found = type === 'l'
        ? ladders.find(l => String(l.id) === id)
        : tournaments.find(t => String(t.id) === id);
      if (found) mostViewedName = found.name;
    } else if (all.length) {
      // Fallback: first active ladder/tournament
      const active = all.find(x => x.status === 'active');
      if (active) mostViewedName = active.name;
    }

    // Last Shared — most recently copied (use updated_at or start_date as proxy)
    let lastSharedName = '—', lastSharedTime = '—';
    if (ladders.length) {
      const sorted = [...ladders].sort((a,b) => {
        const da = a.updated_at || a.start_date || '';
        const db = b.updated_at || b.start_date || '';
        return db.localeCompare(da);
      });
      lastSharedName = sorted[0].name;
      lastSharedTime = _relTime(sorted[0].updated_at || sorted[0].start_date);
    }

    // Total Visits — all time, plus this week for context
    const weekAgo = Date.now() - 7 * 86400000;
    const weekVisits = visits.filter(v => new Date(v.visited_at) > weekAgo).length;
    const totalVisits = visits.length;

    // Active links
    const activeLadders = ladders.filter(l => l.status === 'active').length;
    const activeTourneys = tournaments.filter(t => t.status === 'active').length;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('share-stat-most-viewed',       mostViewedName);
    setEl('share-stat-last-shared',       lastSharedName);
    setEl('share-stat-last-shared-time',  lastSharedTime);
    setEl('share-stat-visits',            totalVisits || '—');
    setEl('share-stat-links',             activeLadders + activeTourneys);
    setEl('share-stat-links-sub',         `${activeLadders} ladder${activeLadders !== 1 ? 's' : ''} · ${activeTourneys} tournament${activeTourneys !== 1 ? 's' : ''}`);
  };

  // ── Render share cards ─────────────────────────────────────────────────
  const _renderShareCards = () => {
    const tab    = _shareCurrentTab;
    const items  = tab === 'ladders' ? _shareData.ladders : _shareData.tournaments;
    const visits = _shareData.visits;
    const q      = (document.getElementById('share-search-current')?.value || '').toLowerCase().trim();
    const filter = document.getElementById('share-status-filter')?.value || 'all';

    const baseLadderUrl = window.location.origin + window.location.pathname.replace('admin.html', '') + 'players.html';
    const baseTourneyUrl= window.location.origin + window.location.pathname.replace('admin.html', '') + 'tournament-results.html';

    // Build visit maps with namespaced keys to avoid ladder/tournament ID collisions
    // e.g. ladder 5 → "l_5", tournament 5 → "t_5"
    const visitsByItem = {};
    visits.forEach(v => {
      const key = v.ladder_id ? `l_${Number(v.ladder_id)}` : v.tournament_id ? `t_${Number(v.tournament_id)}` : null;
      if (key) visitsByItem[key] = (visitsByItem[key] || 0) + 1;
    });
    const weekAgo = Date.now() - 7 * 86400000;
    const recentByItem = {};
    visits.filter(v => new Date(v.visited_at) > weekAgo).forEach(v => {
      const key = v.ladder_id ? `l_${Number(v.ladder_id)}` : v.tournament_id ? `t_${Number(v.tournament_id)}` : null;
      if (key) recentByItem[key] = (recentByItem[key] || 0) + 1;
    });
    const maxVisits = Math.max(...Object.values(visitsByItem), 0);

    const copyIcon   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const eyeIcon    = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const shareIcon  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
    const linkIcon   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b0bbd6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    const plrIcon    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;
    const clkIcon    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const visIcon    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const hotIcon    = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    const sharedfIcon= `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;

    let filtered = items.filter(item => {
      const nameMatch = item.name.toLowerCase().includes(q);
      let statusMatch = true;
      if (filter === 'active')   statusMatch = item.status === 'active';
      if (filter === 'archived') statusMatch = item.status !== 'active';
      if (filter === 'recent') {
        const d = item.updated_at || item.start_date || '';
        statusMatch = d ? (Date.now() - new Date(d)) < 7 * 86400000 : false;
      }
      return nameMatch && statusMatch;
    });

    const listEl = tab === 'ladders'
      ? document.getElementById('share-ladder-list')
      : document.getElementById('share-tournament-list');
    if (!listEl) return;

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty" style="padding:20px;text-align:center;background:white;border-radius:10px;">No ${tab} found.</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(item => {
      const url     = tab === 'ladders'
        ? `${baseLadderUrl}?l=${btoa(String(item.id))}`
        : `${baseTourneyUrl}?t=${btoa(String(item.id))}`;
      const btnId   = `copy-${tab}-${item.id}`;
      const isActive = item.status === 'active';
      const isClosed = !isActive;
      const visitCount = visitsByItem[tab === 'ladders' ? `l_${Number(item.id)}` : `t_${Number(item.id)}`] || 0;
      const isHot   = visitCount > 0 && visitCount === maxVisits && maxVisits > 0 && Object.keys(visitsByItem).length > 0;
      const dateStr = item.end_date || item.start_date || '';
      const updatedStr = dateStr ? _relTime(dateStr) : '—';

      // Player count from ladder_players (not available here, skip to —)
      const pillClass = isActive ? 'pill-active' : 'pill-closed';
      const pillLabel = isActive ? 'Active' : (item.status || 'Closed');
      const typeLabel = tab === 'ladders' ? 'Ladder' : 'Tournament';

      const intelHTML = [
        isHot ? `<span class="share-card-intel share-intel-hot">${hotIcon} Most Viewed</span>` : '',
      ].filter(Boolean).join('');

      return `<div class="share-card" data-name="${esc(item.name).toLowerCase()}" data-status="${esc(item.status || '')}">
        <div class="share-card-inner">
          <div class="share-card-left">
            <div class="share-card-name">${esc(item.name)}</div>
            <div class="share-card-meta">
              <span class="pill ${pillClass}">${esc(pillLabel)}</span>
              <span class="pill" style="background:#e8f0ff;color:#174CCC;">${typeLabel}</span>
            </div>
            <div class="share-card-stats">
              <span class="share-card-stat">${clkIcon} Updated ${esc(updatedStr)}</span>
              <span class="share-card-stat" style="${visitCount ? 'color:#174CCC;' : ''}">${visIcon} ${visitCount || '—'} visits</span>
            </div>
            ${intelHTML ? `<div style="display:flex;gap:6px;flex-wrap:wrap;">${intelHTML}</div>` : ''}
          </div>
          <div class="share-card-right">
            <button class="share-card-btn primary" data-action="copyShareLink"
              data-url="${esc(url)}" data-btnid="${btnId}" id="${btnId}">${copyIcon} Copy Link</button>
            <a href="${esc(url)}" target="_blank" rel="noopener" class="share-card-btn preview"
              style="text-decoration:none;" onclick="_recordShareVisit('${esc(url)}')">${eyeIcon} Preview Page</a>
            <button class="share-card-btn" data-action="showShareQR" data-url="${esc(url)}">${shareIcon} Share</button>
          </div>
        </div>
        <div class="share-card-url">${linkIcon}<span class="share-card-url-text">${esc(url)}</span></div>
      </div>`;
    }).join('');
  };

  const loadSharePage = async () => {
    let _visitsTableExists = false;
    try {
      const [ladders, tournaments] = await Promise.all([
        api('ladders?select=*&order=id.desc'),
        api('tournaments?select=*&order=id.desc'),
      ]);
      // Try visits table separately so we can detect if it exists
      let visits = [];
      try {
        visits = await api('link_visits?select=ladder_id,tournament_id,visited_at&order=visited_at.desc');
        _visitsTableExists = true;
      } catch(_) {
        _visitsTableExists = false;
      }
      _shareData = { ladders, tournaments, visits: visits || [] };
    } catch (e) {
      toast(`Error loading share data: ${e.message}`, true);
    }
    // Show/hide visit tracking note
    const noteEl = document.getElementById('share-visits-note');
    if (noteEl) {
      noteEl.style.display = _visitsTableExists ? 'none' : 'flex';
    }
    _populateShareStats();
    _renderShareCards();

    // Wire search + filter (once only)
    const searchEl = document.getElementById('share-search-current');
    const filterEl = document.getElementById('share-status-filter');
    if (searchEl && !searchEl._wired) {
      searchEl._wired = true;
      searchEl.addEventListener('input', _renderShareCards);
    }
    if (filterEl && !filterEl._wired) {
      filterEl._wired = true;
      filterEl.addEventListener('change', _renderShareCards);
    }
  };

  const switchShareTab = (btn) => {
    const tab = btn.dataset.tab;
    _shareCurrentTab = tab;
    document.querySelectorAll('.share-tab').forEach((b) => {
      const isActive = b.dataset.tab === tab;
      b.classList.toggle('active', isActive);
      b.style.color = isActive ? '#174CCC' : '#6b7a99';
      b.style.borderBottomColor = isActive ? '#C6F221' : 'transparent';
    });
    // Reset search placeholder
    const searchEl = document.getElementById('share-search-current');
    if (searchEl) searchEl.placeholder = `Search ${tab}...`;
    // Show/hide tab content
    document.getElementById('share-tab-ladders').style.display  = tab === 'ladders'     ? '' : 'none';
    document.getElementById('share-tab-tournaments').style.display = tab === 'tournaments' ? '' : 'none';
    // QR now shown in modal — nothing to hide here
    _renderShareCards();
  };

  const showShareQR = (btn) => {
    const url  = btn.dataset.url;
    // Find the card name from closest ancestor
    const card = btn.closest('.share-card');
    const name = card ? (card.querySelector('.share-card-name')?.textContent || '') : '';

    const modal   = document.getElementById('share-qr-modal');
    const qrEl    = document.getElementById('share-qr-modal-code');
    const urlEl   = document.getElementById('share-qr-modal-url');
    const nameEl  = document.getElementById('share-qr-modal-name');
    const copyBtn = document.getElementById('share-qr-modal-copy');
    const closeBtn= document.getElementById('share-qr-modal-close');
    if (!modal || !qrEl) return;

    // Populate
    if (nameEl) nameEl.textContent = name;
    if (urlEl)  urlEl.textContent  = url;

    // Clear old QR and generate fresh
    qrEl.innerHTML = '';
    new QRCode(qrEl, {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#0d1f4a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });

    // Track this share action
    _recordShareVisit(url);

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Copy button inside modal
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(url).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.style.color = '#24BC96';
          setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.style.color = '#174CCC'; }, 2000);
        });
      };
    }

    // Close handlers
    const closeModal = () => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    };
    if (closeBtn) closeBtn.onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  };

  const copyShareLink = (url, btnId) => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        const btn = document.getElementById(btnId);
        if (btn) {
          const origHTML = btn.innerHTML;
          btn.innerHTML = '✓ Copied!';
          btn.style.background = '#24BC96';
          setTimeout(() => {
            btn.innerHTML = origHTML;
            btn.style.background = '';
          }, 2000);
        }
        toast('Link copied to clipboard!');
        // Track the share action
        _recordShareVisit(url);
      })
      .catch(() => {
        toast('Could not copy. Please copy the link manually.', true);
      });
  };

  // Record a visit/share event in link_visits table — exposed on window for inline onclick
  const _recordShareVisit = async (url) => {
    try {
      // Parse ladder_id or tournament_id from URL
      const urlObj = new URL(url);
      const lParam = urlObj.searchParams.get('l');
      const tParam = urlObj.searchParams.get('t');
      const ladder_id     = lParam ? parseInt(atob(lParam), 10) : null;
      const tournament_id = tParam ? parseInt(atob(tParam), 10) : null;
      if (!ladder_id && !tournament_id) return;
      await api('link_visits', 'POST', {
        ladder_id:      ladder_id     || null,
        tournament_id:  tournament_id || null,
        visited_at:     new Date().toISOString(),
        visitor_token:  Math.random().toString(36).slice(2),
      });
    } catch(_) { /* silent fail if table doesn't exist yet */ }
  };
  window._recordShareVisit = _recordShareVisit; // expose for inline onclick handlers

  // ── Register with the shared infrastructure (admin-state.js) ─────────
  window.AdminPageLoaders.share = loadSharePage;
  Object.assign(window.CLICK_HANDLERS, {
    copyShareLink: (btn) => copyShareLink(btn.dataset.url, btn.dataset.btnid),
    switchShareTab: (btn) => switchShareTab(btn),
    showShareQR: (btn) => showShareQR(btn),
  });
})();
