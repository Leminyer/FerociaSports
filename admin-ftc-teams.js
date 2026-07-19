/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: FTC TEAM REGISTRATION
   Depends on: config.js, db.js, admin-state.js, admin-ladder-selector.js
   Load order: admin-state.js -> admin-ladder-selector.js ->
               admin-ftc-teams.js -> app.js

   Extracted from app.js's FTC LADDER — PHASE 2: TEAM REGISTRATION
   section — the team-registration wizard (roster builder, mixed-pair
   slots, review step) and the teams list. Fully independent of FTC
   Standings and FTC Playoffs/Schedule — no function calls cross those
   boundaries, only the shared AdminState.ftc.teams array, which this
   file owns (populated by loadFtcTeams).
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

  /* ─── FTC LADDER — PHASE 2: TEAM REGISTRATION ────────────── */

  // AdminState.ftc.teams — initial value set in admin-state.js

  // ── Load and render teams page ──────────────────────────────────────────
  const loadFtcTeams = async () => {
    if (!AdminState.currentLadder) return;
    // Set page title (Bebas Neue, same as RP ladder pages)
    const teamsTitleEl = document.getElementById('ftc-teams-title');
    if (teamsTitleEl) {
      teamsTitleEl.textContent = AdminState.currentLadder.name || '';
      teamsTitleEl.style.display = 'block';
    }
    // Update hero
    const heroTitle = document.getElementById('ftc-hero-title');
    const heroSub   = document.getElementById('ftc-hero-sub');
    const heroTag   = document.getElementById('ftc-hero-tagline');
    if (heroTitle) heroTitle.textContent = AdminState.currentLadder.name || 'Ferocia Team Challenge';
    if (heroSub) {
      const start = AdminState.currentLadder.start_date
        ? new Date(AdminState.currentLadder.start_date + 'T00:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'})
        : 'Season Dates TBD';
      heroSub.textContent = `Season 1 • ${start}`;
    }
    if (heroTag) heroTag.innerHTML = `🔥 ${esc(AdminState.currentLadder.name || 'Ferocia Team Challenge')} &nbsp;•&nbsp; Playoffs Included`;
    const el = document.getElementById('ftc-teams-list');
    el.innerHTML = '<div class="loading">Loading teams...</div>';
    try {
      AdminState.ftc.teams = await api(
        `ftc_ladder_teams?ladder_id=eq.${AdminState.currentLadder.id}&select=*&order=id`
      );
      const statEl = document.getElementById('ftc-stat-teams');
      if (statEl) statEl.textContent = AdminState.ftc.teams.length;
      // Show search only when at least 1 team exists
      const searchWrap = document.getElementById('ftc-search-wrap');
      if (searchWrap) searchWrap.style.display = AdminState.ftc.teams.length > 0 ? 'block' : 'none';
      renderFtcTeams();
    } catch (err) {
      el.innerHTML = `<div class="error">Error: ${esc(err.message)}</div>`;
    }
  };

  const renderFtcTeams = (filterStr = '') => {
    const el = document.getElementById('ftc-teams-list');
    let teams = AdminState.ftc.teams;
    if (filterStr) {
      const q = filterStr.toLowerCase();
      teams = AdminState.ftc.teams.filter(t => {
        const nameMatch = (t.name || '').toLowerCase().includes(q);
        const capPlayer = t.captain_player_id ? AdminState.ladderPlayers.find(x => x.id === t.captain_player_id) : null;
        const capMatch  = capPlayer ? `${capPlayer.first_name} ${capPlayer.last_name}`.toLowerCase().includes(q) : false;
        const playerIds = [t.m1_id,t.m2_id,t.f1_id,t.f2_id,t.m_sub_id,t.f_sub_id].filter(Boolean);
        const playerMatch = playerIds.some(pid => {
          const p = AdminState.ladderPlayers.find(x => x.id === pid);
          return p && `${p.first_name} ${p.last_name}`.toLowerCase().includes(q);
        });
        return nameMatch || capMatch || playerMatch;
      });
    }

    if (!teams.length && !filterStr) {
      el.innerHTML = `<div class="ftc-empty">
        <div class="ftc-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4;"><circle cx="12" cy="8" r="5"/><path d="M8.56 13.9l-1.56 6.1 5-3 5 3-1.56-6.1"/></svg>
        </div>
        <div class="ftc-empty-title">Ready to build the competition?</div>
        <div class="ftc-empty-sub">Register the first team and start the season.<br>Teams will appear here once registered.</div>
        <button class="ftc-register-btn" onclick="ftcOpenRegisterModal()" style="margin:0 auto;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          Register First Team
        </button>
      </div>`;
      return;
    }
    if (!teams.length) {
      el.innerHTML = '<div class="ftc-empty" style="padding:32px;"><div class="ftc-empty-title">No teams match your search.</div></div>';
      return;
    }

    const playerName = (id) => {
      if (!id) return null;
      const p = AdminState.ladderPlayers.find(x => x.id === id);
      return p ? `${esc(p.first_name)} ${esc(p.last_name)}` : null;
    };

    const cards = teams.map((t, i) => {
      const label = t.name ? esc(t.name) : `Team ${i + 1}`;
      const initial = (t.name || `T${i+1}`)[0].toUpperCase();
      const capPlayer = t.captain_player_id ? AdminState.ladderPlayers.find(x => x.id === t.captain_player_id) : null;
      const capName = capPlayer ? `${esc(capPlayer.first_name)} ${esc(capPlayer.last_name)}` : null;
      const playerCount = [t.m1_id,t.m2_id,t.f1_id,t.f2_id,t.m_sub_id,t.f_sub_id].filter(Boolean).length;

      return `<div class="ftc-team-card">
        <div class="ftc-card-header">
          <div class="ftc-card-avatar">${initial}</div>
          <div style="flex:1;min-width:0;">
            <div class="ftc-card-name">${label}</div>
            ${capName ? `<div class="ftc-card-captain">⭐ ${capName}</div>` : '<div class="ftc-card-captain" style="color:#b0bbd6;">No captain assigned</div>'}
          </div>
        </div>
        <div class="ftc-card-body">
          <div class="ftc-card-row">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${playerCount} Player${playerCount!==1?'s':''}
          </div>
          <div class="ftc-card-row">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            0–0 Record
          </div>
          ${t.mixed1_ma_id ? `<div class="ftc-card-row">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Mixed pairs assigned
          </div>` : ''}
        </div>
        <div class="ftc-card-actions">
          <button class="ftc-card-btn" onclick="ftcOpenViewModal(${t.id})">View</button>
          <button class="ftc-card-btn" onclick="ftcOpenEditModal(${t.id})">Edit</button>
          <button class="ftc-card-btn danger" onclick="ftcDeleteTeam(${t.id}, '${label}')">Delete</button>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `<div style="font-size:11px;font-weight:700;color:#6b7a99;margin-bottom:12px;">${teams.length} team${teams.length!==1?'s':''} registered</div>
      <div class="ftc-teams-grid">${cards}</div>`;
  };

  window.ftcFilterTeams = (val) => renderFtcTeams(val);
  // ── Populate player dropdowns with cross-exclusion ─────────────────────
  // ── Single source of truth for all FTC dropdowns ──────────────────────────
  // editTeamId: the team being edited (null for new). Excludes other-team players.
  // Reads current form selections to cross-exclude within the form.
  const ftcBuildDropdowns = (editTeamId = null, initialVals = null) => {
    // Players used in OTHER teams
    const usedInOtherTeams = new Set(
      AdminState.ftc.teams
        .filter(t => t.id !== editTeamId)
        .flatMap(t => [t.m1_id, t.m2_id, t.f1_id, t.f2_id, t.m_sub_id, t.f_sub_id].filter(Boolean))
        .map(String)
    );
    const avail = AdminState.ladderPlayers.filter(p => !usedInOtherTeams.has(String(p.id)));
    const men   = avail.filter(p => p.gender === 'Male');
    const women = avail.filter(p => p.gender === 'Female');

    // Use explicit initial values if provided (edit mode), else read from DOM
    const gv = (id) => document.getElementById(id)?.value || '';
    const iv = (key, id) => initialVals ? (String(initialVals[key] || '')) : gv(id);
    const m1v = iv('m1', 'ftc-m1'), m2v = iv('m2', 'ftc-m2');
    const f1v = iv('f1', 'ftc-f1'), f2v = iv('f2', 'ftc-f2');
    const m1mCur = iv('mix1m', 'ftc-mixed1-m'), m2mCur = iv('mix2m', 'ftc-mixed2-m');
    const m1fCur = iv('mix1f', 'ftc-mixed1-f'), m2fCur = iv('mix2f', 'ftc-mixed2-f');
    const msubv  = iv('msub', 'ftc-msub'),       fsubv  = iv('fsub', 'ftc-fsub');

    const opt = (p, sel) => `<option value="${p.id}"${String(p.id)===String(sel)?' selected':''}>${esc(p.first_name)} ${esc(p.last_name)}</option>`;

    // Starter dropdowns — each excludes the OTHER starter of same gender
    const m1el = document.getElementById('ftc-m1');
    const m2el = document.getElementById('ftc-m2');
    const f1el = document.getElementById('ftc-f1');
    const f2el = document.getElementById('ftc-f2');
    if (m1el) m1el.innerHTML = `<option value="">Select male player...</option>`   + men.filter(p => !m2v || String(p.id) !== m2v).map(p => opt(p, m1v)).join('');
    if (m2el) m2el.innerHTML = `<option value="">Select male player...</option>`   + men.filter(p => !m1v || String(p.id) !== m1v).map(p => opt(p, m2v)).join('');
    if (f1el) f1el.innerHTML = `<option value="">Select female player...</option>` + women.filter(p => !f2v || String(p.id) !== f2v).map(p => opt(p, f1v)).join('');
    if (f2el) f2el.innerHTML = `<option value="">Select female player...</option>` + women.filter(p => !f1v || String(p.id) !== f1v).map(p => opt(p, f2v)).join('');

    // Sub dropdowns — exclude both starters of same gender
    const msubEl = document.getElementById('ftc-msub');
    const fsubEl = document.getElementById('ftc-fsub');
    if (msubEl) msubEl.innerHTML = `<option value="">None</option>` + men.filter(p => String(p.id) !== m1v && String(p.id) !== m2v).map(p => opt(p, msubv)).join('');
    if (fsubEl) fsubEl.innerHTML = `<option value="">None</option>` + women.filter(p => String(p.id) !== f1v && String(p.id) !== f2v).map(p => opt(p, fsubv)).join('');

    // Mixed doubles — only starters are eligible, cross-excluded between pairs
    const starterMen   = men.filter(p => m1v && m2v ? (String(p.id)===m1v||String(p.id)===m2v) : (String(p.id)===m1v||String(p.id)===m2v));
    const starterWomen = women.filter(p => f1v && f2v ? (String(p.id)===f1v||String(p.id)===f2v) : (String(p.id)===f1v||String(p.id)===f2v));
    const mix1mEl = document.getElementById('ftc-mixed1-m');
    const mix2mEl = document.getElementById('ftc-mixed2-m');
    const mix1fEl = document.getElementById('ftc-mixed1-f');
    const mix2fEl = document.getElementById('ftc-mixed2-f');
    if (mix1mEl) mix1mEl.innerHTML = `<option value="">Select man...</option>`    + starterMen.filter(p => !m2mCur || String(p.id) !== m2mCur).map(p => opt(p, m1mCur)).join('');
    if (mix2mEl) mix2mEl.innerHTML = `<option value="">Select man...</option>`    + starterMen.filter(p => !m1mCur || String(p.id) !== m1mCur).map(p => opt(p, m2mCur)).join('');
    if (mix1fEl) mix1fEl.innerHTML = `<option value="">Select woman...</option>`  + starterWomen.filter(p => !m2fCur || String(p.id) !== m2fCur).map(p => opt(p, m1fCur)).join('');
    if (mix2fEl) mix2fEl.innerHTML = `<option value="">Select woman...</option>`  + starterWomen.filter(p => !m1fCur || String(p.id) !== m1fCur).map(p => opt(p, m2fCur)).join('');

    ftcUpdateCaptainUI();
  };

  // Legacy wrappers so existing callers still work
  const ftcPopulateDropdowns = (editTeamId = null) => ftcBuildDropdowns(editTeamId);
  window.ftcRefreshStarterDropdowns = () => {
    const editTeamId = parseInt(document.getElementById('ftc-team-id')?.value || '0', 10) || null;
    ftcBuildDropdowns(editTeamId);
  };

  // ── Update mixed doubles dropdowns based on starter selections ──────────
  // Update captain radio pill styles + labels from dropdown selections
  window.ftcUpdateCaptainUI = () => {
    const slotMap = { m1:'ftc-m1', m2:'ftc-m2', f1:'ftc-f1', f2:'ftc-f2' };
    const labelMap = { m1:'Man 1', m2:'Man 2', f1:'Woman 1', f2:'Woman 2' };
    Object.entries(slotMap).forEach(([slot, selId]) => {
      const sel   = document.getElementById(selId);
      const label = document.getElementById(`ftc-cap-${slot}-label`);
      if (!label) return;
      const val = sel?.value;
      if (val) {
        const p = AdminState.ladderPlayers.find(x => String(x.id) === String(val));
        label.textContent = p ? `${p.first_name} ${p.last_name}` : labelMap[slot];
      } else {
        label.textContent = labelMap[slot];
      }
    });
    // Update pill active styles
    const selected = document.querySelector('input[name="ftc-captain"]:checked')?.value || '';
    ['none','m1','m2','f1','f2'].forEach(slot => {
      const wrap = document.getElementById(`ftc-cap-${slot}-wrap`);
      if (!wrap) return;
      const isActive = selected === slot || (slot === 'none' && selected === '');
      wrap.classList.toggle('selected', isActive);
    });
  };

  // ftcUpdateMixedOptions: delegates to ftcBuildDropdowns (preserves all selections)
  window.ftcUpdateMixedOptions = () => {
    const editTeamId = parseInt(document.getElementById('ftc-team-id')?.value || '0', 10) || null;
    ftcBuildDropdowns(editTeamId);
  };

  // ── Wizard navigation ──────────────────────────────────────────────────
  let ftcCurrentStep = 1;
  const FTC_TOTAL_STEPS = 6;

  const ftcGoToStep = (step) => {
    ftcCurrentStep = step;
    // Show/hide panels
    for (let i = 1; i <= FTC_TOTAL_STEPS; i++) {
      const panel = document.getElementById(`ftc-panel-${i}`);
      if (panel) panel.classList.toggle('active', i === step);
    }
    // Update sidebar step states
    for (let i = 1; i <= FTC_TOTAL_STEPS; i++) {
      const num   = document.getElementById(`ftc-stepnum-${i}`);
      const label = document.getElementById(`ftc-steplabel-${i}`);
      if (!num || !label) continue;
      if (i < step) {
        num.className   = 'ftc-step-num done';
        num.innerHTML   = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        label.className = 'ftc-step-label done';
      } else if (i === step) {
        num.className   = 'ftc-step-num active';
        num.textContent = i;
        label.className = 'ftc-step-label active';
      } else {
        num.className   = 'ftc-step-num';
        num.textContent = i;
        label.className = 'ftc-step-label';
      }
    }
    // Show/hide nav buttons
    const backBtn = document.getElementById('ftc-btn-back');
    const nextBtn = document.getElementById('ftc-btn-next');
    const saveBtn = document.getElementById('ftc-btn-save');
    if (backBtn) backBtn.style.display = step > 1 ? 'inline-flex' : 'none';
    if (nextBtn) nextBtn.style.display = step < FTC_TOTAL_STEPS ? 'inline-flex' : 'none';
    if (saveBtn) saveBtn.style.display = step === FTC_TOTAL_STEPS ? 'inline-flex' : 'none';
    // Build review on step 6
    if (step === FTC_TOTAL_STEPS) ftcBuildReview();
  };

  window.ftcWizardNext = () => {
    // Validate current step before advancing
    if (ftcCurrentStep === 2) {
      if (!document.getElementById('ftc-m1')?.value ||
          !document.getElementById('ftc-m2')?.value ||
          !document.getElementById('ftc-f1')?.value ||
          !document.getElementById('ftc-f2')?.value) {
        toast('Please select all 4 starters before continuing.', true);
        return;
      }
      const ids = ['ftc-m1','ftc-m2','ftc-f1','ftc-f2'].map(id => document.getElementById(id).value);
      if (new Set(ids).size < 4) {
        toast('Each starter slot must be a different player.', true);
        return;
      }
    }
    if (ftcCurrentStep === 5) {
      const m1m = document.getElementById('ftc-mixed1-m')?.value;
      const m1f = document.getElementById('ftc-mixed1-f')?.value;
      const m2m = document.getElementById('ftc-mixed2-m')?.value;
      const m2f = document.getElementById('ftc-mixed2-f')?.value;
      const mixedErr = ftcValidateMixed(m1m, m1f, m2m, m2f);
      if (mixedErr) {
        const valEl = document.getElementById('ftc-mixed-validation');
        if (valEl) { valEl.textContent = mixedErr; valEl.style.display = 'block'; }
        return;
      }
      const valEl = document.getElementById('ftc-mixed-validation');
      if (valEl) valEl.style.display = 'none';
    }
    if (ftcCurrentStep < FTC_TOTAL_STEPS) ftcGoToStep(ftcCurrentStep + 1);
  };

  window.ftcWizardBack = () => {
    if (ftcCurrentStep > 1) ftcGoToStep(ftcCurrentStep - 1);
  };

  const ftcBuildReview = () => {
    const el = document.getElementById('ftc-review-content');
    if (!el) return;
    const pName = (id) => {
      if (!id) return '—';
      const p = AdminState.ladderPlayers.find(x => String(x.id) === String(id) || x.id === id);
      return p ? `${p.first_name} ${p.last_name}` : '—';
    };
    const slot = document.querySelector('input[name="ftc-captain"]:checked')?.value || '';
    const slotToSel = { m1:'ftc-m1', m2:'ftc-m2', f1:'ftc-f1', f2:'ftc-f2' };
    const capPid = slot && slotToSel[slot] ? document.getElementById(slotToSel[slot])?.value : null;
    const capName = capPid ? pName(capPid) : 'None';

    el.innerHTML = `
      <div class="ftc-review-section">
        <div class="ftc-review-label">Team Identity</div>
        <div class="ftc-review-row"><span class="ftc-review-key">Team Name</span><span class="ftc-review-val">${document.getElementById('ftc-team-name')?.value || '—'}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Captain</span><span class="ftc-review-val">${capName}</span></div>
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Starters</div>
        <div class="ftc-review-row"><span class="ftc-review-key">Man 1</span><span class="ftc-review-val">${pName(document.getElementById('ftc-m1')?.value)}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Man 2</span><span class="ftc-review-val">${pName(document.getElementById('ftc-m2')?.value)}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Woman 1</span><span class="ftc-review-val">${pName(document.getElementById('ftc-f1')?.value)}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Woman 2</span><span class="ftc-review-val">${pName(document.getElementById('ftc-f2')?.value)}</span></div>
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Substitutes</div>
        <div class="ftc-review-row"><span class="ftc-review-key">Male Sub</span><span class="ftc-review-val">${pName(document.getElementById('ftc-msub')?.value) || 'None'}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Female Sub</span><span class="ftc-review-val">${pName(document.getElementById('ftc-fsub')?.value) || 'None'}</span></div>
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Mixed Doubles</div>
        <div class="ftc-review-row"><span class="ftc-review-key">Mixed #1</span><span class="ftc-review-val">${pName(document.getElementById('ftc-mixed1-m')?.value)} + ${pName(document.getElementById('ftc-mixed1-f')?.value)}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Mixed #2</span><span class="ftc-review-val">${pName(document.getElementById('ftc-mixed2-m')?.value)} + ${pName(document.getElementById('ftc-mixed2-f')?.value)}</span></div>
      </div>`;
  };

  // ── Open register modal ─────────────────────────────────────────────────
  window.ftcOpenRegisterModal = () => {
    document.getElementById('ftc-team-id').value   = '';
    document.getElementById('ftc-team-name').value = '';
    document.getElementById('ftc-modal-title').textContent    = 'Register Team';
    document.getElementById('ftc-modal-subtitle').textContent = 'Create your team and assign your players.';
    ['ftc-m1','ftc-m2','ftc-f1','ftc-f2','ftc-msub','ftc-fsub',
     'ftc-mixed1-m','ftc-mixed1-f','ftc-mixed2-m','ftc-mixed2-f'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const noneRadio = document.getElementById('ftc-cap-none');
    if (noneRadio) noneRadio.checked = true;
    const valEl = document.getElementById('ftc-mixed-validation');
    if (valEl) valEl.style.display = 'none';
    ftcPopulateDropdowns();
    ftcUpdateCaptainUI();
    ftcGoToStep(1);
    document.getElementById('ftc-team-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  // ── Open edit modal ─────────────────────────────────────────────────────
  window.ftcOpenViewModal = (teamId) => {
    const t = AdminState.ftc.teams.find(x => x.id === teamId);
    if (!t) return;
    const pName = (id) => {
      if (!id) return '<span style="color:#b0bbd6;">—</span>';
      const p = AdminState.ladderPlayers.find(x => x.id === id);
      return p ? `${esc(p.first_name)} ${esc(p.last_name)}` : '—';
    };
    const capPlayer = t.captain_player_id ? AdminState.ladderPlayers.find(x => x.id === t.captain_player_id) : null;
    const teamLabel = t.name || 'Unnamed Team';
    const row = (label, val) => `
      <div class="ftc-review-row">
        <span class="ftc-review-key">${label}</span>
        <span class="ftc-review-val">${val}</span>
      </div>`;

    const el = document.getElementById('ftc-view-content');
    const titleEl = document.getElementById('ftc-view-title');
    if (titleEl) titleEl.textContent = teamLabel;
    if (el) el.innerHTML = `
      <div class="ftc-review-section">
        <div class="ftc-review-label">Team Identity</div>
        ${row('Team Name', teamLabel)}
        ${row('Captain', capPlayer ? `⭐ ${esc(capPlayer.first_name)} ${esc(capPlayer.last_name)}` : '<span style="color:#b0bbd6;">None assigned</span>')}
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Starters</div>
        ${row('Man 1', pName(t.m1_id))}
        ${row('Man 2', pName(t.m2_id))}
        ${row('Woman 1', pName(t.f1_id))}
        ${row('Woman 2', pName(t.f2_id))}
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Substitutes</div>
        ${row('Male Sub', pName(t.m_sub_id))}
        ${row('Female Sub', pName(t.f_sub_id))}
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Mixed Doubles</div>
        ${row('Mixed #1', t.mixed1_ma_id ? `${pName(t.mixed1_ma_id)} + ${pName(t.mixed1_fa_id)}` : '<span style="color:#b0bbd6;">Not assigned</span>')}
        ${row('Mixed #2', t.mixed2_ma_id ? `${pName(t.mixed2_ma_id)} + ${pName(t.mixed2_fa_id)}` : '<span style="color:#b0bbd6;">Not assigned</span>')}
      </div>`;
    document.getElementById('ftc-view-edit-id').value = teamId;
    document.getElementById('ftc-view-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.ftcCloseViewModal = () => {
    document.getElementById('ftc-view-modal').style.display = 'none';
    document.body.style.overflow = '';
  };

  window.ftcViewToEdit = () => {
    const teamId = parseInt(document.getElementById('ftc-view-edit-id').value, 10);
    ftcCloseViewModal();
    ftcOpenEditModal(teamId);
  };

  window.ftcOpenEditModal = (teamId) => {
    const t = AdminState.ftc.teams.find(x => x.id === teamId);
    if (!t) return;
    document.getElementById('ftc-team-id').value      = t.id;
    document.getElementById('ftc-team-name').value    = t.name || '';
    // captain is now set via radio group below
    document.getElementById('ftc-modal-title').textContent    = 'Edit Team';
    document.getElementById('ftc-modal-subtitle').textContent = 'Update team details. Past matches are not affected.';
    // Pass initial values directly so ftcBuildDropdowns renders options with correct selected state
    ftcBuildDropdowns(t.id, {
      m1:    t.m1_id,         m2:    t.m2_id,
      f1:    t.f1_id,         f2:    t.f2_id,
      msub:  t.m_sub_id,      fsub:  t.f_sub_id,
      mix1m: t.mixed1_ma_id,  mix1f: t.mixed1_fa_id,
      mix2m: t.mixed2_ma_id,  mix2f: t.mixed2_fa_id,
    });
    // Set captain radio
    const slotMap = { m1: t.m1_id, m2: t.m2_id, f1: t.f1_id, f2: t.f2_id };
    const capId = t.captain_player_id;
    let capSlot = '';
    if (capId) {
      Object.entries(slotMap).forEach(([slot, pid]) => {
        if (String(pid) === String(capId)) capSlot = slot;
      });
    }
    const capRadio = document.getElementById(capSlot ? `ftc-cap-${capSlot}` : 'ftc-cap-none');
    if (capRadio) capRadio.checked = true;
    ftcUpdateCaptainUI();
    const valEl = document.getElementById('ftc-mixed-validation');
    if (valEl) valEl.style.display = 'none';
    ftcGoToStep(1);
    document.getElementById('ftc-team-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  // ── Close modal ─────────────────────────────────────────────────────────
  window.ftcCloseModal = () => {
    document.getElementById('ftc-team-modal').style.display = 'none';
    document.body.style.overflow = '';
  };

  // ── Validate mixed doubles pairs ────────────────────────────────────────
  const ftcValidateMixed = (m1m, m1f, m2m, m2f) => {
    if (!m1m || !m1f || !m2m || !m2f) return null; // incomplete — skip
    if (m1m === m2m && m1f === m2f) {
      return 'The same mixed doubles pair cannot play both Mixed #1 and Mixed #2. Please assign different player combinations.';
    }
    return null;
  };

  // ── Save team (create or update) ────────────────────────────────────────
  window.ftcSaveTeam = async () => {
    const teamId  = document.getElementById('ftc-team-id').value;
    const isEdit  = !!teamId;

    const gv = (id) => document.getElementById(id)?.value || null;

    // Validate required starters
    if (!gv('ftc-m1') || !gv('ftc-m2') || !gv('ftc-f1') || !gv('ftc-f2')) {
      toast('Please assign all 4 starters (Man 1, Man 2, Woman 1, Woman 2).', true);
      return;
    }

    // Validate no duplicate starter
    const starterIds = [gv('ftc-m1'), gv('ftc-m2'), gv('ftc-f1'), gv('ftc-f2')];
    if (new Set(starterIds).size < 4) {
      toast('Each starter slot must be a different player.', true);
      return;
    }

    // Mixed doubles validation (also checked on step nav)
    const m1m = gv('ftc-mixed1-m'), m1f = gv('ftc-mixed1-f');
    const m2m = gv('ftc-mixed2-m'), m2f = gv('ftc-mixed2-f');
    const mixedErr = ftcValidateMixed(m1m, m1f, m2m, m2f);
    if (mixedErr) { toast(mixedErr, true); return; }

    const body = {
      ladder_id:    AdminState.currentLadder.id,
      name:              document.getElementById('ftc-team-name').value.trim() || null,
      captain_player_id: (() => {
        const slot = document.querySelector('input[name="ftc-captain"]:checked')?.value;
        if (!slot) return null;
        const slotToField = { m1:'ftc-m1', m2:'ftc-m2', f1:'ftc-f1', f2:'ftc-f2' };
        const pid = document.getElementById(slotToField[slot])?.value;
        return pid ? parseInt(pid, 10) : null;
      })(),
      m1_id:        parseInt(gv('ftc-m1'), 10),
      m2_id:        parseInt(gv('ftc-m2'), 10),
      f1_id:        parseInt(gv('ftc-f1'), 10),
      f2_id:        parseInt(gv('ftc-f2'), 10),
      m_sub_id:     gv('ftc-msub')    ? parseInt(gv('ftc-msub'), 10)    : null,
      f_sub_id:     gv('ftc-fsub')    ? parseInt(gv('ftc-fsub'), 10)    : null,
      mixed1_ma_id: m1m ? parseInt(m1m, 10) : null,
      mixed1_fa_id: m1f ? parseInt(m1f, 10) : null,
      mixed2_ma_id: m2m ? parseInt(m2m, 10) : null,
      mixed2_fa_id: m2f ? parseInt(m2f, 10) : null,
    };

    const btn = document.getElementById('ftc-btn-save');
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
      if (isEdit) {
        await api(`ftc_ladder_teams?id=eq.${teamId}`, 'PATCH', body);
        toast('Team updated successfully!');
      } else {
        await api('ftc_ladder_teams', 'POST', body);
        toast('Team registered successfully!');
      }
      ftcCloseModal();
      await loadFtcTeams();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    }
  };

  // ── Delete team ─────────────────────────────────────────────────────────
  window.ftcDeleteTeam = async (teamId, teamLabel) => {
    const ok = await confirmModal({
      title:   'Delete team?',
      message: `Remove "${teamLabel}" from this ladder? This cannot be undone.`,
      confirm: 'Delete Team',
      danger:  true,
    });
    if (!ok) return;
    try {
      await api(`ftc_ladder_teams?id=eq.${teamId}`, 'DELETE');
      toast('Team deleted.');
      await loadFtcTeams();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  // Input handler — search + auto-calc previews
  // ── Ladder Participants gender filter ─────────────────────────────────
  let _lpGenderFilter = 'all'; // 'all' | 'male' | 'female'

  window.lpGenderFilter = (gender) => {
    _lpGenderFilter = gender;
    // Update pill styles
    ['all','male','female'].forEach(g => {
      const btn = document.getElementById(`lp-filter-${g}`);
      if (!btn) return;
      const active = g === gender;
      btn.style.background   = active ? '#174CCC' : 'white';
      btn.style.borderColor  = active ? '#174CCC' : '#e0e7f5';
      btn.style.color        = active ? 'white'   : '#6b7a99';
    });
    lpApplyFilters();
  };

  window.lpApplyFilters = () => {
    const q = (document.getElementById('lp-search')?.value || '').toLowerCase();
    document.querySelectorAll('#lp-enrolled .lp-player-row-new').forEach((row) => {
      const nameMatch   = row.dataset.name?.includes(q) ?? true;
      const genderMatch = _lpGenderFilter === 'all' || row.dataset.gender === _lpGenderFilter;
      row.style.display = (nameMatch && genderMatch) ? '' : 'none';
    });
  };

  // ── Expose with the shared infrastructure ──────────────────────────────
  window.loadFtcTeams = loadFtcTeams; // called from the page router
})();
