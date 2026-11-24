/* ============================================================
   FEROCIA — CANCHAS DEL BRACKET (§122, SQL 142) · 23 nov 2026
   En la sección del bracket de cada categoría:
     · "Bracket courts": se marcan las canchas (al abrir vienen las del
       round robin de esa categoría, 4A) y, si se quiere, una "Final
       court". "▶ Start bracket courts" y el sistema llama los partidos en
       orden en cuanto las dos parejas están definidas y libres.
     · Después, el tablero: cada cancha con su partido (y la ronda),
       "Up next", Enter score, Move, Team not here, Court out, Pause.
   Sin canchas, el bracket sigue a mano como siempre.
   Quién decide qué partido va a cada cancha: la base (SQL 142).

   Lo usa tournament.js:
     BracketCourts.montar(el, { cat, tournament, teams, bracketMatches })
     BracketCourts.esAuto(cat)
     BracketCourts.etiqueta(match, matches, cat)   (la línea de cada partido)
     BracketCourts.avisoSiguiente(catId, court, scoreA, scoreB)
   ============================================================ */
(function () {
  'use strict';

  const REFRESCO_MS = 15000;
  const MAX_CANCHAS = 60;
  let _timer = null;
  let _firma = '';
  let _equipos = {};

  const esc = (s) => (s == null ? '' : String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
  const aviso = (msg, esError = false) => (typeof window.tToast === 'function' ? window.tToast(msg, esError) : null);
  const api = (...args) => (window.app?.api || window.api)(...args);
  const rpc = async (f, args) => {
    const { data, error } = await window.supabase.rpc(f, args);
    if (error) throw new Error(error.message || String(error));
    return data;
  };
  const AC = () => window.AutoCourts || {};
  const lista = (c) => (AC().escribirCanchas ? AC().escribirCanchas(c) : (c || []).join(', '));
  const minutos = (seg) => Math.max(0, Math.floor((seg || 0) / 60));

  /* "Semifinal", "Quarterfinal"… */
  const RONDA = { Final: 'Final', '3rd Place': '3rd place', Semifinals: 'Semifinal', QF: 'Quarterfinal', R16: 'Round of 16', R32: 'Round of 32' };
  const ronda = (r) => RONDA[r] || r || 'Bracket';
  const rondaN = (m) => (m.round_name === 'Final' || m.round_name === '3rd Place' ? ronda(m.round_name) : `${ronda(m.round_name)} ${Number(m.match_number) || ''}`.trim());

  function mensaje(r) {
    const e = typeof r === 'string' ? r : r?.error;
    switch (e) {
      case 'invalid_courts': return `Courts go from 1 to 999 (up to ${MAX_CANCHAS}).`;
      case 'court_busy': return `Court ${r.court} has a match on it right now.`;
      case 'already_started': return 'Bracket courts already started for this category.';
      case 'tournament_not_active': return 'Start the tournament first.';
      case 'tournament_completed': return 'This tournament is completed.';
      case 'no_matches': return 'Generate the bracket first.';
      case 'already_playing': return 'Bracket scores were already entered by hand, so this bracket stays manual.';
      case 'no_courts': return 'Choose the bracket courts first.';
      case 'not_on_court': return 'That match is no longer on a court.';
      case 'court_not_available': return 'That court is not available.';
      case 'busy': return 'That match is being saved right now — try again.';
      case 'changed': return `Court ${r.court} changed since you opened this. Check the board and try again.`;
      case 'not_started': return 'Press Start bracket courts first.';
      default:
        if (/Could not find the function|PGRST202/.test(String(e))) return 'Bracket courts need the latest update (SQL 142).';
        if (/bracket_winner_locked|bracket_next_on_court/.test(String(e)) && AC().mensaje) return AC().mensaje(e);
        return AC().mensaje ? AC().mensaje(e) : `Error: ${e}`;
    }
  }

  function esAuto(cat) {
    return !!(cat && Array.isArray(cat.bracket_courts) && cat.bracket_courts.length && cat.bracket_started_at);
  }

  function nombreEquipo(id) {
    const t = _equipos[id];
    if (!t) return '?';
    const j = typeof window.getTeamPlayerNames === 'function' ? window.getTeamPlayerNames(t) : '';
    return j || t.name || '?';
  }
  function nombreCorto(id) {
    const t = _equipos[id];
    if (!t) return '?';
    const todos = Array.isArray(window.tAllPlayers) ? window.tAllPlayers : [];
    const n = [t.player1_id, t.player2_id, t.player3_id, t.player4_id].filter(Boolean)
      .map((pid) => todos.find((p) => p.id === pid)?.first_name).filter(Boolean);
    return n.length ? n.join(' & ') : (t.name || '?');
  }

  /* ── La línea de cada partido en el dibujo del bracket ── */
  const FLUJO = ['R32', 'R16', 'QF', 'Semifinals', 'Final'];
  function previos(m, matches) {
    if (m.round_name === 'Final' || m.round_name === '3rd Place') return matches.filter((x) => x.round_name === 'Semifinals');
    const i = FLUJO.indexOf(m.round_name);
    if (i <= 0) return [];
    const n = Number(m.match_number) || 1;
    return matches.filter((x) => x.round_name === FLUJO[i - 1] && [2 * n - 1, 2 * n].includes(Number(x.match_number)));
  }
  function etiqueta(m, matches, cat) {
    if (!esAuto(cat)) return '';
    const final = m.round_name === 'Final' && cat.bracket_final_court ? ` · ★ Court ${Number(cat.bracket_final_court)}` : '';
    if (m.status === 'completed') return m.court ? `<div class="bc-lbl bc-lbl-done">✓ Played on Court ${Number(m.court)}</div>` : '';
    if (m.status !== 'pending') return '';
    if (m.called_at) return `<div class="bc-lbl bc-lbl-now">● On Court ${Number(m.court)} now</div>`;
    if (!m.team_a_id || !m.team_b_id) {
      const faltan = previos(m, matches).filter((x) => x.status === 'pending').map(rondaN);
      return `<div class="bc-lbl">${esc(faltan.length ? `Waiting for ${faltan.join(' & ')}` : 'Waiting for previous results')}${esc(final)}</div>`;
    }
    return `<div class="bc-lbl bc-lbl-next">Up next · waiting for a court${esc(final)}</div>`;
  }

  /* ── Después de guardar: quién entra a esa cancha ── */
  async function avisoSiguiente(catId, court, sa, sb) {
    let texto = `Saved ${sa}–${sb}.`;
    try {
      const b = await rpc('bracket_courts_board', { p_category_id: catId });
      const equipos = await api(`tournament_teams?category_id=eq.${catId}&select=*`);
      _equipos = {}; (equipos || []).forEach((t) => { _equipos[t.id] = t; });
      const c = (b?.board || []).find((x) => x.court === court);
      if (c && c.state === 'playing') texto += ` Court ${court} → next: ${ronda(c.round_name)} · ${nombreEquipo(c.team_a_id)} vs ${nombreEquipo(c.team_b_id)}.`;
      else if (b?.paused) texto += ` Court ${court} is free — courts are paused.`;
      else texto += ` Court ${court} is free — the next match is waiting for its teams.`;
    } catch (_) { /* el score ya se guardó */ }
    aviso(texto);
  }

  /* ════════════════ PINTAR ════════════════ */
  /* Las canchas que se pueden marcar: las guardadas, o (4A) las del round
     robin de esta categoría, más las que se añadan. */
  function candidatas(ctx) {
    const { cat } = ctx;
    if (!ctx._sel) {
      const base = (cat.bracket_courts && cat.bracket_courts.length) ? cat.bracket_courts : (cat.auto_courts || []);
      ctx._sel = new Set(base.map(Number));
      ctx._todas = new Set([...ctx._sel, ...(cat.auto_courts || []).map(Number), ...(cat.bracket_final_court ? [Number(cat.bracket_final_court)] : [])]);
      ctx._final = cat.bracket_final_court ? Number(cat.bracket_final_court) : null;
    }
    return [...ctx._todas].sort((a, b) => a - b);
  }

  function htmlAjustes(ctx) {
    const { cat, tournament, bracketMatches } = ctx;
    const empezo = !!cat.bracket_started_at;
    const todas = candidatas(ctx);
    const pendientes = bracketMatches.filter((m) => m.status === 'pending').length;
    const yaHay = bracketMatches.some((m) => m.status !== 'pending' && m.status !== 'bye');
    const puede = ctx._sel.size && pendientes > 0 && tournament.status === 'active' && !yaHay;
    const nota = tournament.status !== 'active' ? 'Start the tournament first.'
      : pendientes === 0 ? 'All bracket matches are already played.'
      : yaHay ? 'Bracket scores were already entered by hand, so this bracket stays manual.'
      : !ctx._sel.size ? 'Choose at least one court. Leave all off to enter bracket courts by hand, as before.'
      : 'Matches are called in order — quarterfinals → semifinals → 3rd place / final — as soon as both teams are known and free.';
    const opciones = [...ctx._sel].sort((a, b) => a - b);
    if (ctx._final && !opciones.includes(ctx._final)) opciones.push(ctx._final);
    return `<div class="ac-card ac-setup bc-setup">
      <div class="ac-head"><div><div class="ac-kicker">${esc(cat.name)} · Bracket</div>
        <div class="ac-title">Bracket courts</div></div>
        ${empezo ? '<span class="ac-tag ac-tag-play">Started</span>' : ''}</div>
      <div class="bc-chips" role="group" aria-label="Bracket courts">
        ${todas.map((x) => `<button type="button" class="bc-chip" data-bc="chip" data-court="${x}" aria-pressed="${ctx._sel.has(x)}">Court ${x}${ctx._sel.has(x) ? ' ✓' : ''}</button>`).join('')}
        <span class="bc-add"><label class="bc-sr" for="bc-add-${cat.id}">Add a court</label>
          <input class="ac-input bc-add-in" id="bc-add-${cat.id}" data-bc="add-input" inputmode="numeric" maxlength="3" placeholder="#">
          <button type="button" class="ac-btn ac-btn-link ac-btn-sm" data-bc="add">+ Add court</button></span>
      </div>
      <label class="ac-lbl" for="bc-final-${cat.id}">Final court</label>
      <select class="ac-select bc-final" id="bc-final-${cat.id}" data-bc="final">
        <option value="">None — the first free court</option>
        ${opciones.map((x) => `<option value="${x}" ${ctx._final === x ? 'selected' : ''}>★ Court ${x}</option>`).join('')}
      </select>
      <p class="ac-help">${ctx._final && !ctx._sel.has(ctx._final)
        ? `The Final always goes to Court ${ctx._final}. It's not a bracket court, so only the Final plays there.`
        : 'The Final always goes here. Other matches can use it until both finalists are known. Leave empty to use the first free court.'}</p>
      <div class="ac-err" data-bc="err" hidden></div>
      <div class="ac-actions">
        ${empezo ? '<button type="button" class="ac-btn ac-btn-pri" data-bc="save">Save courts</button><button type="button" class="ac-btn ac-btn-link" data-bc="close-setup">Close</button>'
          : `<button type="button" class="ac-btn ac-btn-pri" data-bc="start" ${puede ? '' : 'disabled'} data-busy="Starting…">▶ Start bracket courts</button>`}
      </div>
      ${empezo ? '' : `<p class="ac-help ac-note">${esc(nota)}</p>`}
    </div>`;
  }

  function htmlBoard(ctx, b) {
    const { cat } = ctx;
    const ahora = new Date(b.now).getTime();
    const completo = b.total > 0 && b.done === b.total;
    const noAqui = new Set((b.not_here || []).map(Number));
    if (completo) {
      return `<div class="ac-card ac-mini"><b>Bracket courts</b> · All bracket matches played ✓</div>`;
    }
    let html = `<div class="ac-card ac-board bc-board">
      <div class="ac-head"><div><div class="ac-kicker">${esc(cat.name)} · Bracket · Courts ${esc(lista(b.courts))}${b.final_court ? ` · ★ Final court ${Number(b.final_court)}` : ''}</div>
        <div class="ac-title">Bracket court board</div></div>
        <div class="ac-head-a"><button type="button" class="ac-btn ${b.paused ? 'ac-btn-ok' : 'ac-btn-sec'} ac-btn-sm" data-bc="${b.paused ? 'resume' : 'pause'}">${b.paused ? 'Resume courts' : 'Pause courts'}</button>
          <button type="button" class="ac-btn ac-btn-link" data-bc="open-setup">Edit courts</button></div></div>
      <div class="ac-stats"><div><b>${b.done}</b><span>done</span></div><div><b>${b.on_court}</b><span>on court</span></div><div><b>${b.left}</b><span>left</span></div></div>`;
    if (b.paused) {
      html += `<div class="ac-paused" role="status"><b>Courts paused</b> — no new matches are called. Matches on court keep playing.</div>`;
    }
    if (b.checkin_missing > 0) {
      html += `<p class="ac-help ac-checkin">${Number(b.checkin_missing)} bracket player${b.checkin_missing === 1 ? '' : 's'} ${b.checkin_missing === 1 ? 'has' : 'have'} not checked in. Their matches wait until they do.</p>`;
    }
    const libres = b.board.filter((x) => x.state === 'free').map((x) => x.court);
    html += '<div class="ac-cols"><div class="ac-courts">';
    for (const c of b.board) {
      const estrella = c.final ? '<span class="bc-star" title="Final court">★ Final court</span>' : '';
      if (c.state === 'playing') {
        const min = minutos((ahora - new Date(c.called_at).getTime()) / 1000);
        const nuevo = min < 2;
        const otras = libres.filter((x) => x !== c.court);
        html += `<div class="ac-court" data-court="${c.court}">
          <div class="ac-court-h"><span class="ac-court-n">COURT ${c.court}</span>
            <span class="ac-tag ${nuevo ? 'ac-tag-new' : 'ac-tag-play'}">${nuevo ? 'New · just called' : `Playing · ${min} min`}</span></div>
          <div class="bc-round">${esc(ronda(c.round_name))}${estrella}</div>
          <div class="ac-court-m"><div class="ac-team">${esc(nombreEquipo(c.team_a_id))}</div><div class="ac-vs">vs</div>
            <div class="ac-team">${esc(nombreEquipo(c.team_b_id))}</div></div>
          <div class="ac-court-a">
            <button type="button" class="ac-btn ac-btn-pri ac-btn-sm" data-bc="score" data-match="${Number(c.match_id)}" data-a="${Number(c.team_a_id)}" data-b="${Number(c.team_b_id)}">Enter score</button>
            <button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-bc="move-open" ${otras.length ? '' : 'disabled'}>Move</button>
            <button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-bc="nothere-open">Team not here</button>
            <button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-bc="out-open">Court out</button>
          </div>
          <div class="ac-inline" data-bc="move-box" hidden>
            <select class="ac-select ac-select-sm" data-bc="move-select" aria-label="Move to">${otras.map((x) => `<option value="${x}">Court ${x}</option>`).join('')}</select>
            <button type="button" class="ac-btn ac-btn-pri ac-btn-sm" data-bc="move" data-match="${Number(c.match_id)}">Move</button>
            <button type="button" class="ac-btn ac-btn-link ac-btn-sm" data-bc="cancel">Cancel</button>
          </div>
          <div class="ac-inline" data-bc="nothere-box" hidden>
            <span class="ac-inline-q">Who is not here?</span>
            <button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-bc="nothere" data-team="${Number(c.team_a_id)}">${esc(nombreCorto(c.team_a_id))}</button>
            <button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-bc="nothere" data-team="${Number(c.team_b_id)}">${esc(nombreCorto(c.team_b_id))}</button>
            <button type="button" class="ac-btn ac-btn-link ac-btn-sm" data-bc="cancel">Cancel</button>
          </div>
          <div class="ac-inline" data-bc="out-box" hidden>
            <span class="ac-inline-q">Take Court ${c.court} out? This match goes back to the top of Up next.</span>
            <button type="button" class="ac-btn ac-btn-pri ac-btn-sm" data-bc="out" data-court="${c.court}" data-match="${Number(c.match_id)}">Court out</button>
            <button type="button" class="ac-btn ac-btn-link ac-btn-sm" data-bc="cancel">Cancel</button>
          </div>
        </div>`;
      } else if (c.state === 'in_use') {
        html += `<div class="ac-court bc-court-used" data-court="${c.court}">
          <div class="ac-court-h"><span class="ac-court-n">COURT ${c.court}</span><span class="ac-tag ac-tag-out">In use</span></div>
          ${estrella ? `<div class="bc-round">${estrella}</div>` : ''}
          <div class="ac-court-m ac-muted">${esc(c.in_use_by ? `${c.in_use_by} is playing here.` : 'Another match is playing here.')} It's used for the bracket as soon as it's free.</div>
        </div>`;
      } else if (c.state === 'free') {
        html += `<div class="ac-court" data-court="${c.court}">
          <div class="ac-court-h"><span class="ac-court-n">COURT ${c.court}</span>${b.paused
            ? '<span class="ac-tag ac-tag-paused">Free · paused</span>'
            : '<span class="ac-tag ac-tag-free">Free · waiting for a match</span>'}</div>
          ${estrella ? `<div class="bc-round">${estrella}</div>` : ''}
          <div class="ac-court-m ac-muted">${b.paused ? 'Courts are paused. Press Resume courts to call the next match.'
            : c.final && b.final_waiting ? 'Kept for the Final. It’s called here as soon as both finalists are free.'
            : `The next match is waiting for its teams${noAqui.size ? ' (or a team is not here)' : ''}${b.checkin_missing ? ' or for check-in' : ''}. It fills by itself.`}</div>
          <div class="ac-court-a"><button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-bc="out" data-court="${c.court}">Court out</button></div>
        </div>`;
      } else {
        html += `<div class="ac-court ac-court-out" data-court="${c.court}">
          <div class="ac-court-h"><span class="ac-court-n">COURT ${c.court}</span><span class="ac-tag ac-tag-out">Court out</span></div>
          ${estrella ? `<div class="bc-round">${estrella}</div>` : ''}
          <div class="ac-court-m ac-muted">Not used until you bring it back.</div>
          <div class="ac-court-a"><button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-bc="back" data-court="${c.court}">Back in</button></div>
        </div>`;
      }
    }
    html += '</div>';
    const listos = b.queue.filter((q) => q.state === 'ready').length;
    html += `<aside class="ac-next" aria-labelledby="bc-next-${cat.id}">
      <div class="ac-next-h"><h3 class="ac-next-t" id="bc-next-${cat.id}">Up next</h3>
        <span class="ac-next-n">${b.queue.length ? `${b.queue.length} match${b.queue.length === 1 ? '' : 'es'}${listos ? ` · ${listos} ready` : ''}` : 'none'}</span></div>`;
    if (!b.queue.length) html += '<p class="ac-help">No match has both teams yet.</p>';
    for (const q of b.queue) {
      let estado = '';
      let boton = '';
      if (q.state === 'ready') estado = q.first ? 'first in line' : (q.round_name === 'Final' && b.final_court ? `waiting for Court ${Number(b.final_court)}` : `ready · waiting ${minutos(q.wait_seconds)} min`);
      else if (q.state === 'playing') estado = 'playing now';
      else if (q.state === 'not_checked_in') estado = `⏳ waiting for check-in${q.missing && q.missing.length ? `: ${q.missing.join(', ')}` : ''}`;
      else {
        const aus = [q.team_a_id, q.team_b_id].filter((t) => noAqui.has(Number(t)));
        estado = aus.map((t) => `${nombreCorto(t)} not here`).join(' · ');
        boton = aus.map((t) => `<button type="button" class="ac-btn ac-btn-sec ac-btn-xs" data-bc="here" data-team="${Number(t)}">Here</button>`).join('');
      }
      html += `<div class="ac-q"><span><span class="bc-q-r">${esc(rondaN(q))}</span> ${esc(nombreCorto(q.team_a_id))} <span class="ac-vs">vs</span> ${esc(nombreCorto(q.team_b_id))}</span>
        <span class="ac-q-w">${esc(estado)} ${boton}</span></div>`;
    }
    html += '</aside></div>';
    html += `<p class="ac-help ac-upd">Updated ${esc(new Date(b.now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))} · refreshes every 15 seconds</p>`;
    return html + '</div>';
  }

  /* ════════════════ MONTAR ════════════════ */
  function montar(el, ctx) {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _firma = '';
    if (!el || !ctx || !ctx.cat) return;
    const { cat, tournament } = ctx;
    _equipos = {}; (ctx.teams || []).forEach((t) => { _equipos[t.id] = t; });
    /* Sin el SQL 142 la categoría no trae estas columnas: no se pinta nada. */
    if (!('bracket_courts' in cat) || tournament.status === 'completed') { el.innerHTML = ''; return; }
    el.classList.add('ac-root');
    const empezo = !!cat.bracket_started_at;
    if (!empezo) {
      const yaHay = ctx.bracketMatches.some((m) => m.status !== 'pending' && m.status !== 'bye');
      const pendientes = ctx.bracketMatches.some((m) => m.status === 'pending');
      /* Un bracket que ya se está jugando a mano (o terminado) se queda a mano. */
      el.innerHTML = (yaHay || !pendientes) ? '' : htmlAjustes(ctx);
      enlazar(el, ctx);
      return;
    }
    el.innerHTML = '<div class="ac-card ac-board"><div class="ac-help">Loading bracket courts…</div></div>';
    enlazar(el, ctx);
    pintarBoard(el, ctx, true);
    _timer = setInterval(() => {
      if (!el.isConnected) { clearInterval(_timer); _timer = null; return; }
      if (document.visibilityState !== 'visible') return;
      if (document.querySelector('.t-modal-bg.t-modal-open')) return;
      if (el.querySelector('[data-bc="move-box"]:not([hidden]), [data-bc="nothere-box"]:not([hidden]), [data-bc="out-box"]:not([hidden]), .bc-setup')) return;
      pintarBoard(el, ctx, false);
    }, REFRESCO_MS);
  }

  async function pintarBoard(el, ctx, primera) {
    let b;
    try { b = await rpc('bracket_courts_board', { p_category_id: ctx.cat.id }); }
    catch (e) { if (primera) el.innerHTML = `<div class="ac-card ac-err-card">${esc(mensaje(e.message))}</div>`; return; }
    if (!el.isConnected || !b || b.error) return;
    if (window.tCurrentCategoryId != null && Number(window.tCurrentCategoryId) !== Number(ctx.cat.id)) return;
    /* Red de seguridad: una cancha libre y un partido listo no deberían coincidir. */
    if (!ctx._llenando && !b.paused && b.board.some((x) => x.state === 'free' && !x.final) && b.queue.some((q) => q.state === 'ready' && q.round_name !== 'Final')) {
      ctx._llenando = true;
      try {
        const r = await rpc('bracket_courts_fill_now', { p_category_id: ctx.cat.id });
        if (r && r.called > 0) { await recargar(ctx); return; }
      } catch (_) { /* en la próxima vuelta */ }
      finally { ctx._llenando = false; }
    }
    const firma = JSON.stringify([b.done, b.out, b.courts, b.final_court, b.not_here, b.paused, b.checkin_missing, b.board.map((x) => [x.court, x.match_id, x.state])]);
    if (!primera && firma !== _firma && typeof window.loadCategory === 'function') {
      _firma = firma;
      window.loadCategory(ctx.cat.id, ctx.tournament);
      return;
    }
    _firma = firma;
    if (!el.querySelector('.bc-setup')) el.innerHTML = htmlBoard(ctx, b);
  }

  async function recargar(ctx) {
    if (typeof window.loadCategory === 'function') {
      const [t] = await api(`tournaments?id=eq.${ctx.tournament.id}&select=*`).catch(() => [ctx.tournament]);
      return window.loadCategory(ctx.cat.id, t || ctx.tournament);
    }
  }

  async function accion(boton, ctx, f, args, okMsg) {
    boton.disabled = true;
    try {
      const r = await rpc(f, args);
      if (r && r.error) { aviso(mensaje(r), true); boton.disabled = false; return null; }
      if (okMsg) aviso(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      await recargar(ctx);
      return r;
    } catch (e) {
      aviso(mensaje(e.message), true);
      boton.disabled = false;
      return null;
    }
  }

  /* Guarda las canchas marcadas y la Final court. */
  async function guardar(el, ctx) {
    const err = el.querySelector('[data-bc="err"]');
    const courts = [...ctx._sel].sort((a, b) => a - b);
    const final = ctx._final;
    const r = await rpc('bracket_courts_set', { p_category_id: ctx.cat.id, p_courts: courts, p_final_court: final });
    if (r && r.error) { err.textContent = mensaje(r); err.hidden = false; return null; }
    return r;
  }

  function repintarAjustes(el, ctx) {
    el.innerHTML = htmlAjustes(ctx);
  }

  function enlazar(el, ctx) {
    if (el._bcEnlazado) { el._bcCtx = ctx; return; }
    el._bcEnlazado = true;
    el._bcCtx = ctx;

    el.addEventListener('change', (ev) => {
      if (ev.target.dataset.bc !== 'final') return;
      const c = el._bcCtx;
      c._final = ev.target.value ? Number(ev.target.value) : null;
      repintarAjustes(el, c);
      el.querySelector('[data-bc="final"]')?.focus();
    });
    el.addEventListener('keydown', (ev) => {
      if (ev.target.dataset.bc === 'add-input' && ev.key === 'Enter') { ev.preventDefault(); el.querySelector('[data-bc="add"]')?.click(); }
    });

    el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-bc]');
      if (!b || !el.contains(b) || b.tagName !== 'BUTTON' || b.disabled) return;
      const c = el._bcCtx;
      const tarjeta = b.closest('.ac-court');
      switch (b.dataset.bc) {
        case 'chip': {
          const x = Number(b.dataset.court);
          if (c._sel.has(x)) c._sel.delete(x); else c._sel.add(x);
          return repintarAjustes(el, c);
        }
        case 'add': {
          const inp = el.querySelector('[data-bc="add-input"]');
          const err = el.querySelector('[data-bc="err"]');
          const x = Number(String(inp.value).trim());
          if (!Number.isInteger(x) || x < 1 || x > 999) { err.textContent = 'Use a court number from 1 to 999.'; err.hidden = false; inp.focus(); return; }
          if (c._todas.size >= MAX_CANCHAS && !c._todas.has(x)) { err.textContent = `Up to ${MAX_CANCHAS} courts.`; err.hidden = false; return; }
          c._todas.add(x); c._sel.add(x);
          repintarAjustes(el, c);
          el.querySelector('[data-bc="add-input"]')?.focus();
          return;
        }
        case 'start': {
          b.disabled = true;
          try {
            if (!(await guardar(el, c))) { b.disabled = false; return; }
            const r = await rpc('bracket_courts_start', { p_category_id: c.cat.id });
            if (r && r.error) { aviso(mensaje(r), true); b.disabled = false; return; }
            aviso(r && r.called > 0
              ? `Bracket courts started — ${r.called} match${r.called === 1 ? '' : 'es'} called to court.`
              : 'Bracket courts started. No match could be called yet — check that both teams are here and checked in.');
            await recargar(c);
          } catch (e) { aviso(mensaje(e.message), true); b.disabled = false; }
          return;
        }
        case 'save': {
          b.disabled = true;
          try {
            if (!(await guardar(el, c))) { b.disabled = false; return; }
            aviso('Bracket courts saved.');
            await recargar(c);
          } catch (e) { aviso(mensaje(e.message), true); b.disabled = false; }
          return;
        }
        case 'open-setup':
          if (_timer) { clearInterval(_timer); _timer = null; }
          c._sel = null;
          return repintarAjustes(el, c);
        case 'close-setup':
          c._sel = null;
          return montar(el, c);
        case 'score':
          if (typeof window.openScoreModal === 'function') window.openScoreModal('bracket', Number(b.dataset.match), Number(b.dataset.a), Number(b.dataset.b), c.cat.id);
          return;
        case 'move-open': case 'nothere-open': case 'out-open': {
          el.querySelectorAll('[data-bc="move-box"], [data-bc="nothere-box"], [data-bc="out-box"]').forEach((x) => { x.hidden = true; });
          const caja = { 'move-open': 'move-box', 'nothere-open': 'nothere-box', 'out-open': 'out-box' }[b.dataset.bc];
          tarjeta.querySelector(`[data-bc="${caja}"]`).hidden = false;
          return;
        }
        case 'cancel':
          b.closest('.ac-inline').hidden = true;
          return;
        case 'move': {
          const destino = Number(tarjeta.querySelector('[data-bc="move-select"]').value);
          return accion(b, c, 'bracket_courts_move', { p_match_id: Number(b.dataset.match), p_court: destino }, `Match moved to Court ${destino}.`);
        }
        case 'nothere': {
          const nombre = nombreCorto(Number(b.dataset.team));
          return accion(b, c, 'auto_courts_team_here', { p_team_id: Number(b.dataset.team), p_here: false },
            `${nombre}: not here. Their match went back to the queue.`);
        }
        case 'here': {
          const nombre = nombreCorto(Number(b.dataset.team));
          return accion(b, c, 'auto_courts_team_here', { p_team_id: Number(b.dataset.team), p_here: true }, `${nombre} is here.`);
        }
        case 'out': {
          const args = { p_category_id: c.cat.id, p_court: Number(b.dataset.court), p_out: true };
          if (b.dataset.match) args.p_match_id = Number(b.dataset.match);
          return accion(b, c, 'bracket_courts_court_out', args, (r) => {
            if (r && r.moved_to) return `Court ${b.dataset.court} is out. Its match moved to Court ${r.moved_to}.`;
            if (r && r.requeued) return Number(b.dataset.court) === Number(c.cat.bracket_final_court)
              ? `Court ${b.dataset.court} is out. The Final goes to the next free bracket court.`
              : `Court ${b.dataset.court} is out. Its match goes first to the next free court.`;
            return `Court ${b.dataset.court} is out.`;
          });
        }
        case 'back':
          return accion(b, c, 'bracket_courts_court_out', { p_category_id: c.cat.id, p_court: Number(b.dataset.court), p_out: false }, `Court ${b.dataset.court} is back in.`);
        case 'pause':
          return accion(b, c, 'auto_courts_pause', { p_category_id: c.cat.id, p_paused: true },
            `Courts paused for ${c.cat.name}. No new matches will be called.`);
        case 'resume':
          return accion(b, c, 'auto_courts_pause', { p_category_id: c.cat.id, p_paused: false },
            (r) => `Courts resumed${r && r.called ? ` — ${r.called} match${r.called === 1 ? '' : 'es'} called to court` : ''}.`);
        default:
      }
    });
  }

  window.BracketCourts = { montar, esAuto, etiqueta, avisoSiguiente, mensaje };
})();
