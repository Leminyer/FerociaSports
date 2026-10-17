/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PORTAL ACTIVITY
   SQL 106 (16 de octubre) — decisión §86. Diseño aprobado
   ("FEROCIA Portal activity — diseño").

   Cómo va el Player Portal, en una pantalla (menú Player Portal):
     1. Los números grandes (cuentas, reclamos, % de activos con cuenta).
     2. "Needs your attention": reclamos de más de 24 h, mensajes de
        Help sin responder, reportes de Player Safety (cada uno lleva a
        su pantalla). Y (SQL 107, 17 de octubre) "Level changes to check":
        jugadores que cambiaron su nivel en el portal y no cuadra con el
        rating del coach (o saltaron de Beginner a Advanced o al revés).
        Cada uno con "View player" y "Mark as seen". Al jugador no se le
        bloquea nada: sólo es un aviso para el equipo.
     3. El embudo del jugador (dónde se quedan).
     4. La gráfica: cuentas nuevas y reclamos aprobados.
     5. Qué hacen en el portal (sólo cuentas).
     6. A qué entran: lo que eligen en el Home (contado, sin nombres).
     7. Los últimos 20 movimientos.
   Periodo: Last 7 days · 30 days · 90 days · All time.
   Sólo LEE. La seguridad está en la base: admin_portal_actividad sólo
   responde a quien está en admins, activo y con rol Admin.

   Depende de: db.js (esc, window.supabase), app.js (AdminPageLoaders,
   CLICK_HANDLERS). Estilos: admin-pages.css (pa-).
   ============================================================ */

(function () {
  'use strict';

  const sb = () => window.supabase;
  const esc = (x) => window.esc(x == null ? '' : String(x));
  const $ = (id) => document.getElementById(id);
  const ZONA = 'America/New_York';
  const fmtN = (n) => Number(n || 0).toLocaleString('en-US');
  const plural = (n, uno, varios) => `${fmtN(n)} ${Number(n) === 1 ? uno : varios}`;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  const RANGOS = [['7', 'Last 7 days'], ['30', '30 days'], ['90', '90 days'], ['all', 'All time']];
  const PERIODO = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', all: 'Since the portal opened' };
  const PASOS = { account: 'Created an account', linked: 'Linked to their player record', dna: 'Completed their Player DNA',
    visible: 'Visible in Play (Limited or Public)', played: 'Played a Play game' };
  const OPCION = { now: 'Play right now', plan: 'Plan a game', open: 'Join an open game', matches: 'Meet your best matches',
    log: 'Log a game you played', stats: "See how I'm doing" };
  const SUCESO = {
    account: ['+', 'pa-dot-blue', () => 'created an account'],
    approved: ['✓', 'pa-dot-green', (e) => (e.by === 'auto' ? 'claim approved automatically' : `claim approved by ${e.by || 'the team'}`)],
    review: ['!', 'pa-dot-orange', () => 'claim needs review'],
    rejected: ['×', 'pa-dot-red', () => 'claim rejected'],
    dna: ['D', 'pa-dot-navy', () => 'completed their Player DNA'],
    first_play: ['P', 'pa-dot-lime', () => 'played their first Play game'],
  };

  let _rango = '30';
  let _datos = null;
  let _todos = false;
  let _vez = 0;
  let _niveles = [];   // los cambios de nivel por revisar (SQL 107)

  /* "12 min ago", "Yesterday, 7:42 PM", "Oct 3". */
  function hace(iso) {
    const d = new Date(iso);
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min} min ago`;
    if (min < 6 * 60) return `${Math.round(min / 60)} h ago`;
    const dia = (x) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(x);
    const hora = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' }).format(d);
    const hoy = new Date();
    if (dia(d) === dia(hoy)) return `Today, ${hora}`;
    if (dia(d) === dia(new Date(hoy.getTime() - 86400000))) return `Yesterday, ${hora}`;
    return new Intl.DateTimeFormat('en-US', { timeZone: ZONA, month: 'short', day: 'numeric' }).format(d);
  }
  // La misma escala que usa Play: menos de 3.0 Beginner, hasta 3.99 Intermediate, 4.0 o más Advanced.
  // 3.5 → "3.5", 3.96 → "3.96", 4 → "4.0" (sin redondear de más: 3.96 no es 4.0).
  const rating = (r) => { const t = String(Math.round(Number(r) * 1000) / 1000); return t.includes('.') ? t : `${t}.0`; };
  const nivelDeRating = (r) => (Number(r) < 3 ? 'Beginner' : Number(r) < 4 ? 'Intermediate' : 'Advanced');
  const corto = (isoDia) => { const [y, m, d] = String(isoDia).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };

  async function cargar() {
    const mia = ++_vez;
    const caja = $('pa-body');
    if (!caja) return;
    pintarRangos();
    caja.setAttribute('aria-busy', 'true');
    if (!_datos) caja.innerHTML = '<div class="loading">Loading...</div>';
    try {
      /* Los cambios de nivel van aparte: si fallan (p. ej. sin el SQL 107),
         la página sale igual, sin esa fila. */
      const niveles = sb().rpc('admin_cambios_nivel').then((r) => {
        if (r.error) { console.warn('[admin] level changes:', r.error.message); return []; }
        return Array.isArray(r.data) ? r.data : [];
      }, () => []);
      const { data, error } = await sb().rpc('admin_portal_actividad', { p_rango: _rango });
      if (error) throw error;
      const lv = await niveles;
      if (mia !== _vez) return;
      _datos = data;
      _niveles = lv;
      pintar();
      const est = $('pa-estado');
      if (est) est.textContent = `Showing: ${PERIODO[_rango]}`;
    } catch (e) {
      if (mia !== _vez) return;
      const msg = String((e && e.message) || e);
      console.warn('[admin] portal activity:', msg);
      caja.innerHTML = /not_authorized/.test(msg)
        ? '<div class="pc-vacio">Only the Admin can see this page.</div>'
        : /admin_portal_actividad|function|schema cache/i.test(msg)
          ? '<div class="pc-vacio">This page needs SQL 106. Run it in Supabase → SQL Editor and refresh.</div>'
          : '<div class="pc-vacio">We couldn\'t load the portal activity. Please try again.</div>';
    } finally { if (mia === _vez) caja.setAttribute('aria-busy', 'false'); }
  }

  function pintarRangos() {
    const g = $('pa-rangos');
    if (!g) return;
    g.innerHTML = RANGOS.map(([k, t]) => `<button type="button" class="pa-seg-b" data-action="paRango" data-r="${k}" aria-pressed="${k === _rango}">${esc(t)}</button>`).join('');
  }

  function tarjeta(etiqueta, valor, sub, clase, subClase) {
    return `<div class="pa-kpi ${clase || ''}"><span class="pa-kpi-l">${esc(etiqueta)}</span><span class="pa-kpi-n">${esc(valor)}</span>${sub ? `<span class="pa-kpi-s ${subClase || ''}">${esc(sub)}</span>` : ''}</div>`;
  }

  function pintar() {
    const d = _datos || {};
    const k = d.kpis || {};
    const todo = _rango === 'all';
    const delta = (n) => (todo ? 'Since the portal opened' : `+${fmtN(n)} in this period`);
    const kpis = [
      tarjeta('Players in the database', fmtN(k.players), `${fmtN(k.active_players)} active`),
      tarjeta('Accounts created', fmtN(k.accounts), delta(k.accounts_period), '', k.accounts_period && !todo ? 'is-up' : ''),
      tarjeta('Claims approved', fmtN(k.approved), delta(k.approved_period), '', k.approved_period && !todo ? 'is-up' : ''),
      tarjeta('To review', fmtN(k.to_review), k.to_review_24h ? `${plural(k.to_review_24h, 'waiting', 'waiting')} over 24 h` : 'None waiting over 24 h',
        k.to_review ? 'is-warn' : '', k.to_review_24h ? 'is-warn' : ''),
      tarjeta('Rejected', fmtN(k.rejected), todo ? null : `${fmtN(k.rejected_period)} in this period`),
      tarjeta('Active players with an account', `${pct(k.active_with_account, k.active_players)}%`, `${fmtN(k.active_with_account)} of ${fmtN(k.active_players)}`),
    ].join('');

    // Lo que necesita atención
    const at = d.attention || {};
    const filaAt = (n, titulo, sub, pagina, boton) => `<button type="button" class="pa-at-row" data-action="showPage" data-page="${pagina}">
        <span class="pa-at-n">${esc(fmtN(n))}</span>
        <span class="pa-at-t"><strong>${esc(titulo)}</strong><span>${esc(sub)}</span></span>
        <span class="pa-at-go">${esc(boton)} →</span></button>`;
    const aten = [];
    if (at.claims_24h) aten.push(filaAt(at.claims_24h, at.claims_24h === 1 ? 'Claim waiting over 24 hours' : 'Claims waiting over 24 hours', `${fmtN(at.claims)} to review in total`, 'player-claims', 'Player claims'));
    else if (at.claims) aten.push(filaAt(at.claims, at.claims === 1 ? 'Claim to review' : 'Claims to review', 'All within the last 24 hours', 'player-claims', 'Player claims'));
    if (at.help) aten.push(filaAt(at.help, at.help === 1 ? 'Help message not answered' : 'Help messages not answered', `The oldest: ${hace(at.help_oldest)}`, 'player-claims', 'Help messages'));
    if (at.reports) aten.push(filaAt(at.reports, at.reports === 1 ? 'Player report to review' : 'Player reports to review', `The oldest: ${hace(at.reports_oldest)}`, 'player-safety', 'Player Safety'));
    // Los cambios de nivel por revisar (SQL 107)
    const lvTexto = (c) => (c.flag === 'coach'
      ? `Coach rating ${rating(c.coach_rating)} · usually ${nivelDeRating(c.coach_rating)}`
      : 'Big jump · no coach rating yet');
    const lvFilas = _niveles.map((c) => `<li class="pa-lv">
        <span class="pa-lv-t"><strong>${esc(c.who)}</strong> <span class="pa-lv-de">${esc(c.from || '—')} → ${esc(c.to)}</span>
          <span class="pa-lv-s">${esc(lvTexto(c))} · ${esc(hace(c.at))}</span></span>
        <span class="pa-lv-b">
          <button type="button" class="pa-lv-btn" data-action="showPage" data-page="player-profile" data-pid="${esc(c.player_id)}">View player</button>
          <button type="button" class="pa-lv-btn pa-lv-ok" data-action="paNivelVisto" data-id="${esc(c.id)}">Mark as seen</button>
        </span></li>`).join('');
    const niveles = _niveles.length
      ? `<div class="pa-lv-box"><h3 class="pa-lv-h"><span class="pa-at-n">${esc(fmtN(_niveles.length))}</span>${_niveles.length === 1 ? 'Level change to check' : 'Level changes to check'}</h3>
          <p class="pa-lv-p">The player changed their level in the portal and it doesn't match what we see. Nothing is blocked — talk to them or update their coach rating if needed.</p>
          <ul class="pa-lv-list">${lvFilas}</ul></div>`
      : '';
    const atencion = aten.length || niveles
      ? `<section class="pa-at" aria-labelledby="pa-at-t"><h2 class="pa-h2 pa-at-h" id="pa-at-t" tabindex="-1">Needs your attention</h2>${aten.length ? `<div class="pa-at-list">${aten.join('')}</div>` : ''}${niveles}</section>`
      : '<section class="pa-at is-ok" aria-labelledby="pa-at-t"><span class="pa-at-ok" id="pa-at-t" tabindex="-1">Nothing needs your attention right now.</span></section>';

    // El embudo
    const pasos = d.funnel || [];
    const base = (pasos[0] && pasos[0].n) || 0;
    let peor = -1, caida = 0;
    pasos.forEach((p, i) => { if (i && pasos[i - 1].n - p.n > caida) { caida = pasos[i - 1].n - p.n; peor = i; } });
    const embudo = pasos.map((p, i) => `<div class="pa-fu">
        <span class="pa-fu-t"><span class="pa-fu-l">${esc(PASOS[p.step] || p.step)}</span><span class="pa-fu-n"><strong>${esc(fmtN(p.n))}</strong> · ${esc(pct(p.n, base))}%</span></span>
        <span class="pa-bar" aria-hidden="true"><span class="pa-bar-f${i === peor ? ' is-drop' : ''}" data-w="${pct(p.n, base)}"></span></span>
        ${i === peor ? `<span class="pa-fu-drop">Biggest drop: ${esc(plural(caida, 'player stops', 'players stop'))} here</span>` : ''}</div>`).join('');

    // La gráfica
    const ch = d.chart || { points: [] };
    const pts = ch.points || [];
    const max = Math.max(1, ...pts.map((p) => Math.max(p.accounts, p.approved)));
    const PASO = { day: 'Each day', week: 'Each 7 days', month: 'Each month' };
    const barras = pts.map((p) => `<span class="pa-ch-g" title="${esc(`${corto(p.from)}: ${plural(p.accounts, 'new account', 'new accounts')} · ${fmtN(p.approved)} approved`)}">
        <span class="pa-ch-b is-a" data-h="${Math.round((p.accounts / max) * 100)}"></span><span class="pa-ch-b is-b" data-h="${Math.round((p.approved / max) * 100)}"></span></span>`).join('');
    const totA = pts.reduce((s, p) => s + p.accounts, 0), totB = pts.reduce((s, p) => s + p.approved, 0);

    // Qué hacen
    const ac = d.activity || {};
    const tiles = [['Signed in', ac.signed_in], ['Games created', ac.games_created], ['Games logged', ac.games_logged],
      ['Results that count', ac.results_verified], ['Chat messages', ac.chat_messages], ['Player reports', ac.reports]]
      .map(([l, n]) => `<div class="pa-tile"><span class="pa-tile-n">${esc(fmtN(n))}</span><span class="pa-tile-l">${esc(l)}</span></div>`).join('');

    // A qué entran
    const hm = d.home || { total: 0, choices: [] };
    const maxH = Math.max(1, ...(hm.choices || []).map((c) => c.n));
    const opciones = hm.total
      ? (hm.choices || []).map((c, i) => `<div class="pa-op"><span class="pa-op-l">${esc(OPCION[c.choice] || c.choice)}</span>
          <span class="pa-bar" aria-hidden="true"><span class="pa-bar-f${i === 0 ? '' : ' is-soft'}" data-w="${Math.round((c.n / maxH) * 100)}"></span></span>
          <span class="pa-op-p">${esc(pct(c.n, hm.total))}%</span></div>`).join('')
      : '<p class="pa-empty">No picks yet in this period.</p>';

    // Los últimos movimientos
    const ult = (d.latest || []);
    const lista = (_todos ? ult : ult.slice(0, 8)).map((e) => {
      const [ic, cls, txt] = SUCESO[e.kind] || ['·', 'pa-dot-navy', () => ''];
      return `<li class="pa-ev"><span class="pa-dot ${cls}" aria-hidden="true">${esc(ic)}</span>
        <span class="pa-ev-t"><strong>${esc(e.who)}</strong> ${esc(txt(e))}</span><span class="pa-ev-w">${esc(hace(e.at))}</span></li>`;
    }).join('');

    $('pa-body').innerHTML = `
      <div class="pa-kpis">${kpis}</div>
      ${atencion}
      <div class="pa-row">
        <section class="card pa-card" aria-labelledby="pa-fu-t">
          <div class="pa-card-h"><h2 class="pa-h2" id="pa-fu-t">The player journey</h2><span class="pa-sub">Of everyone who created an account · where they stop · all time</span></div>
          ${base ? embudo : '<p class="pa-empty">No accounts yet.</p>'}
        </section>
        <section class="card pa-card" aria-labelledby="pa-ch-t">
          <div class="pa-card-h pa-card-h-row"><span><h2 class="pa-h2" id="pa-ch-t">New accounts and approved claims</h2><span class="pa-sub">${esc(PASO[ch.step] || '')} · ${esc(PERIODO[_rango])}</span></span>
            <span class="pa-legend"><span><i class="pa-key is-a"></i>New accounts</span><span><i class="pa-key is-b"></i>Approved</span></span></div>
          <div class="pa-ch" role="img" aria-label="${esc(`${plural(totA, 'new account', 'new accounts')} and ${fmtN(totB)} approved claims, ${(PASO[ch.step] || '').toLowerCase()}`)}">${barras}</div>
          <div class="pa-ch-x"><span>${esc(pts.length ? corto(pts[0].from) : '')}</span><span>${esc(pts.length ? (ch.step === 'month' ? 'This month' : 'Today') : '')}</span></div>
        </section>
      </div>
      <div class="pa-row">
        <section class="card pa-card" aria-labelledby="pa-ac-t">
          <div class="pa-card-h"><h2 class="pa-h2" id="pa-ac-t">What players do in the portal</h2><span class="pa-sub">${esc(PERIODO[_rango])} · counts only</span></div>
          <div class="pa-tiles">${tiles}</div>
        </section>
        <section class="card pa-card" aria-labelledby="pa-op-t">
          <div class="pa-card-h"><h2 class="pa-h2" id="pa-op-t">What players come for</h2><span class="pa-sub">Their picks under “What brings you in today?” · ${esc(PERIODO[_rango])} · ${esc(plural(hm.total, 'pick', 'picks'))}, no names</span></div>
          ${opciones}
        </section>
      </div>
      <section class="card pa-card" aria-labelledby="pa-ev-t">
        <div class="pa-card-h pa-card-h-row"><h2 class="pa-h2" id="pa-ev-t">Latest activity</h2><span class="pa-sub">The last 20 things that happened</span></div>
        ${ult.length ? `<ul class="pa-evs">${lista}</ul>` : '<p class="pa-empty">Nothing yet.</p>'}
        ${!_todos && ult.length > 8 ? `<button type="button" class="av-btn av-btn-sec pa-more" data-action="paTodos">Show all ${esc(ult.length)}</button>` : ''}
      </section>`;
    // Los anchos y altos van por el estilo del elemento (no en el HTML).
    $('pa-body').querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${Math.max(2, Number(el.dataset.w))}%`; });
    $('pa-body').querySelectorAll('[data-h]').forEach((el) => { const v = Number(el.dataset.h); el.style.height = v ? `${Math.max(2, v)}%` : '0'; });
  }

  // ── Arranque ─────────────────────────────────────────────────
  window.AdminPageLoaders.portalActivity = () => { _todos = false; cargar(); };
  Object.assign(window.CLICK_HANDLERS, {
    paRango: (btn) => { _rango = btn.dataset.r; _todos = false; cargar(); },
    paTodos: () => { _todos = true; pintar(); },
    paNivelVisto: async (btn) => {
      const id = Number(btn.dataset.id);
      if (!id || btn.disabled) return;
      btn.disabled = true;
      try {
        const { error } = await sb().rpc('admin_cambio_nivel_visto', { p_id: id });
        if (error) throw error;
        _niveles = _niveles.filter((c) => Number(c.id) !== id);
        pintar();
        window.toast('Marked as seen.');
        $('pa-at-t')?.focus?.();
      } catch (e) {
        console.warn('[admin] mark level change:', e);
        btn.disabled = false;
        window.toast(/not_authorized/.test(String((e && e.message) || '')) ? 'Only the Admin can do this.' : 'We couldn\'t save that. Please try again.', true);
      }
    },
  });
})();
