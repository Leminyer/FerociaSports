/* ============================================================
   FEROCIA — AUTO COURTS (§116, SQL 131) · 5 de noviembre de 2026
   Canchas automáticas en el round robin de los torneos.

   Qué hace este archivo (el panel):
     · "Courts for this category": guardar las canchas de la categoría
       (20-25, o 20, 21, 23…). Sin canchas, todo sigue a mano, como antes.
     · "Start courts": el sistema llena las canchas con los primeros partidos.
     · Court board: cada cancha con su estado (Playing / New / Free /
       Court out), "Up next", y los botones Enter score, Move, Team not
       here / Here, Court out / Back in y, al terminar, "Lend courts to…".
     · Al guardar un score: "Saved 11–7. Court 20 → next: …".

   Quién decide qué partido va a cada cancha: la base de datos (SQL 131),
   no este archivo. Aquí sólo se pinta y se llama a sus funciones.

   Lo usa tournament.js:
     AutoCourts.montar(el, { cat, tournament, teams, rrMatches })
     AutoCourts.esAuto(cat)
     AutoCourts.htmlCanchaFija(match)
     AutoCourts.avisoSiguiente(catId, court, scoreA, scoreB)
   ============================================================ */
(function () {
  'use strict';

  const REFRESCO_MS = 15000;          // el board se actualiza solo cada 15 s
  const MAX_CANCHAS = 60;

  let _timer = null;                  // un solo reloj a la vez
  let _firma = '';                    // para saber si algo cambió

  const esc = (s) => (s == null ? '' : String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

  const aviso = (msg, esError = false) => {
    if (typeof window.tToast === 'function') return window.tToast(msg, esError);
    if (typeof window.toast === 'function') return window.toast(msg, esError);
  };

  const api = (...args) => (window.app?.api || window.api)(...args);

  const rpc = async (f, args) => {
    const { data, error } = await window.supabase.rpc(f, args);
    if (error) throw new Error(error.message || String(error));
    return data;
  };

  /* ── Canchas: "20-25, 27" ⇄ [20,21,22,23,24,25,27] ── */
  function leerCanchas(texto) {
    const t = String(texto || '').trim();
    if (!t) return { courts: [] };
    const set = new Set();
    for (const parte of t.split(/[,\s]+/).filter(Boolean)) {
      const m = parte.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
      if (!m) return { error: 'Use numbers like 20-25 or 20, 21, 23.' };
      const a = Number(m[1]), b = m[2] !== undefined ? Number(m[2]) : a;
      if (a < 1 || b < 1 || b < a || b - a >= MAX_CANCHAS) return { error: 'Use numbers like 20-25 or 20, 21, 23.' };
      for (let x = a; x <= b; x++) set.add(x);
    }
    const courts = [...set].sort((x, y) => x - y);
    if (courts.length > MAX_CANCHAS || courts.some((x) => x > 999)) return { error: `Courts go from 1 to 999 (up to ${MAX_CANCHAS}).` };
    return { courts };
  }
  function escribirCanchas(lista) {
    const c = [...(lista || [])].sort((x, y) => x - y);
    const partes = [];
    for (let i = 0; i < c.length; i++) {
      let j = i;
      while (j + 1 < c.length && c[j + 1] === c[j] + 1) j++;
      partes.push(j > i ? `${c[i]}-${c[j]}` : String(c[i]));
      i = j;
    }
    return partes.join(', ');
  }

  /* ── Mensajes de la base, en palabras ── */
  function mensaje(r) {
    const e = typeof r === 'string' ? r : r?.error;
    switch (e) {
      case 'court_taken': return `Court ${r.court} is already used by ${r.category}. Each court can belong to one category only.`;
      case 'invalid_courts': return `Courts go from 1 to 999 (up to ${MAX_CANCHAS}).`;
      case 'court_busy': return `Court ${r.court} has a match on it right now.`;
      case 'already_started': return 'Auto Courts already started for this category.';
      case 'tournament_not_active': return 'Start the tournament first.';
      case 'tournament_completed': return 'This tournament is completed.';
      case 'no_matches': return 'Generate the round robin first.';
      case 'already_playing': return 'Scores were already entered by hand. Auto Courts starts before the first score.';
      case 'no_courts': return 'Save the courts first.';
      case 'not_on_court': return 'That match is no longer on a court.';
      case 'court_not_available': return 'That court is not available.';
      case 'busy': return 'That match is being saved right now — try again.';
      case 'rr_not_complete': return 'This round robin is not complete yet.';
      case 'not_playing': return 'That category is not playing with Auto Courts.';
      case 'category_not_found': case 'match_not_found': case 'team_not_found': return 'Not found — reload the page.';
      default:
        if (/auto_courts_locked/.test(String(e))) return 'Courts in this category are set by Auto Courts. Reload the page (Ctrl + Shift + R).';
        if (/not_authorized/.test(String(e))) return 'You do not have permission to do that.';
        if (/Could not find the function|PGRST202/.test(String(e))) return 'Auto Courts is not installed yet (SQL 131).';
        return `Error: ${e}`;
    }
  }

  /* ── ¿Esta categoría reparte canchas sola? ── */
  function esAuto(cat) {
    return !!(cat && Array.isArray(cat.auto_courts) && cat.auto_courts.length && cat.auto_courts_started_at);
  }

  /* ── Nombres ── */
  let _equipos = {};
  function nombreEquipo(id) {
    const t = _equipos[id];
    if (!t) return '?';
    const jugadores = typeof window.getTeamPlayerNames === 'function' ? window.getTeamPlayerNames(t) : '';
    return jugadores || t.name || '?';
  }
  function nombreCorto(id) {
    const t = _equipos[id];
    if (!t) return '?';
    const todos = Array.isArray(window.tAllPlayers) ? window.tAllPlayers : [];
    const nombres = [t.player1_id, t.player2_id, t.player3_id, t.player4_id].filter(Boolean)
      .map((pid) => todos.find((p) => p.id === pid)?.first_name).filter(Boolean);
    return nombres.length ? nombres.join(' & ') : (t.name || '?');
  }
  const minutos = (seg) => Math.max(0, Math.floor((seg || 0) / 60));

  /* "6 courts · 8 teams · 28 matches" y, si sobran canchas, cuántas se usan
     a la vez (8 parejas → como mucho 4 partidos al mismo tiempo). */
  function resumen(nCanchas, ctx) {
    const nEq = ctx.teams.length;
    const partidos = ctx.rrMatches.filter((m) => m.status !== 'bye').length;
    let t = `${nCanchas} court${nCanchas === 1 ? '' : 's'} · ${nEq} ${nEq === 1 ? 'team' : 'teams'}${partidos ? ` · ${partidos} matches` : ''}`;
    const aLaVez = Math.floor(nEq / 2);
    if (nCanchas > aLaVez && aLaVez > 0) t += `. With ${nEq} teams, only ${aLaVez} match${aLaVez === 1 ? '' : 'es'} can be played at a time.`;
    return t;
  }

  /* ── El modal del score: la cancha fija ── */
  function htmlCanchaFija(match) {
    const enCancha = match.status === 'pending' && match.called_at;
    const hecho = match.status !== 'pending';
    if (enCancha) {
      return `<div id="t-auto-court" class="ac-lock" data-court="${Number(match.court) || ''}" data-state="on_court">
        <span class="ac-lock-pin" aria-hidden="true">📍</span> Court ${Number(match.court) || '?'} <span class="ac-lock-sub">— set by Auto Courts</span></div>`;
    }
    if (hecho) {
      return `<div id="t-auto-court" class="ac-lock ac-lock-done" data-court="${Number(match.court) || ''}" data-state="done">
        <span class="ac-lock-pin" aria-hidden="true">📍</span> ${match.court ? `Court ${Number(match.court)}` : 'No court'} <span class="ac-lock-sub">— played</span></div>`;
    }
    return `<div id="t-auto-court" class="ac-lock ac-lock-wait" data-court="" data-state="waiting">
      <span class="ac-lock-pin" aria-hidden="true">⏳</span> Not on a court yet <span class="ac-lock-sub">— Auto Courts will call it</span></div>`;
  }

  /* ── Después de guardar: quién entra a esa cancha ── */
  async function avisoSiguiente(catId, court, sa, sb) {
    let texto = `Saved ${sa}–${sb}.`;
    try {
      const b = await rpc('auto_courts_board', { p_category_id: catId });
      const equipos = await api(`tournament_teams?category_id=eq.${catId}&select=*`);
      _equipos = {}; (equipos || []).forEach((t) => { _equipos[t.id] = t; });
      const c = (b?.board || []).find((x) => x.court === court);
      if (c && c.state === 'playing') texto += ` Court ${court} → next: ${nombreEquipo(c.team_a_id)} vs ${nombreEquipo(c.team_b_id)}. Call them to Court ${court}.`;
      else texto += ` Court ${court} is free — no match can start yet.`;
    } catch (_) { /* el score ya se guardó; el aviso es lo de menos */ }
    aviso(texto);
  }

  /* ════════════════════════ PINTAR ════════════════════════ */
  function htmlAjustes(ctx) {
    const { cat, tournament, rrMatches } = ctx;
    const courts = cat.auto_courts || [];
    const empezo = !!cat.auto_courts_started_at;
    const pendientes = rrMatches.filter((m) => m.status === 'pending').length;
    /* Se empieza antes del primer score (si ya se juega a mano, el sistema
       no sabría qué partidos están en cancha). */
    const yaHayScores = rrMatches.some((m) => m.status !== 'pending' && m.status !== 'bye');
    const puedeEmpezar = courts.length && pendientes > 0 && tournament.status === 'active' && !yaHayScores;
    const nota = !courts.length ? 'Leave empty to enter courts by hand, as before.'
      : !rrMatches.length ? 'Next: generate the round robin, then press Start courts.'
      : tournament.status !== 'active' ? 'Start the tournament first.'
      : pendientes === 0 ? 'All matches are already played.'
      : yaHayScores ? 'Scores were already entered by hand, so this category stays manual. Auto Courts starts before the first score.'
      : 'Press Start courts before play begins (before the first score).';
    return `<div class="ac-card ac-setup">
      <div class="ac-head"><div><div class="ac-kicker">Auto Courts</div>
        <div class="ac-title">Courts for this category</div></div>
        ${empezo ? '<span class="ac-tag ac-tag-play">Started</span>' : ''}</div>
      <label class="ac-lbl" for="ac-courts-${cat.id}">Courts</label>
      <input class="ac-input" id="ac-courts-${cat.id}" data-ac="courts-input" inputmode="numeric" autocomplete="off"
        value="${esc(escribirCanchas(courts))}" placeholder="e.g. 20-25">
      <p class="ac-help">A range (20-25), a list (20, 21, 23) or both (20-23, 26).</p>
      <div class="ac-chips" data-ac="chips">${courts.map((c) => `<span class="ac-chip">${c}</span>`).join('')}</div>
      <p class="ac-help" data-ac="summary">${esc(resumen(courts.length, ctx))}</p>
      <div class="ac-err" data-ac="err" hidden></div>
      <div class="ac-actions">
        <button type="button" class="ac-btn ac-btn-sec" data-ac="save">Save courts</button>
        ${!empezo && courts.length ? `<button type="button" class="ac-btn ac-btn-pri" data-ac="start" ${puedeEmpezar ? '' : 'disabled'}>Start courts</button>` : ''}
        ${empezo ? '<button type="button" class="ac-btn ac-btn-link" data-ac="close-setup">Close</button>' : ''}
      </div>
      ${empezo ? '' : `<p class="ac-help ac-note">${esc(nota)}</p>`}
    </div>`;
  }

  function htmlBoard(ctx, b) {
    const { cat } = ctx;
    const ahora = new Date(b.now).getTime();
    const completo = b.total > 0 && b.done === b.total;
    const noAqui = new Set((b.not_here || []).map(Number));
    let html = `<div class="ac-card ac-board">
      <div class="ac-head"><div><div class="ac-kicker">${esc(cat.name)} · Courts ${esc(escribirCanchas(b.courts))}</div>
        <div class="ac-title">Court board</div></div>
        <button type="button" class="ac-btn ac-btn-link" data-ac="open-setup">Edit courts</button></div>
      <div class="ac-stats"><div><b>${b.done}</b><span>done</span></div><div><b>${b.on_court}</b><span>on court</span></div><div><b>${b.left}</b><span>left</span></div></div>`;

    if (completo) {
      html += `<div class="ac-banner"><b>Round robin complete ✓</b><br>${b.done} of ${b.total} matches played.${b.courts.length ? ` Courts ${esc(escribirCanchas(b.courts))} are free.` : ''}</div>`;
      if (b.courts.length) {
        html += b.lend_to.length ? `<label class="ac-lbl" for="ac-lend-${cat.id}">Lend courts ${esc(escribirCanchas(b.courts))} to…</label>
          <select class="ac-select" id="ac-lend-${cat.id}" data-ac="lend-select">
            ${b.lend_to.map((o) => `<option value="${Number(o.id)}">${esc(o.name)} (courts ${esc(escribirCanchas(o.courts))} · ${Number(o.left)} matches left)</option>`).join('')}
          </select>
          <button type="button" class="ac-btn ac-btn-ok ac-btn-full" data-ac="lend">Lend courts</button>
          <p class="ac-help">Only categories still playing with Auto Courts appear. You decide; nothing moves by itself.</p>`
          : '<p class="ac-help">No other category is playing with Auto Courts right now.</p>';
      }
      return html + '</div>';
    }

    const libres = b.board.filter((x) => x.state === 'free').map((x) => x.court);
    /* §137 (11 nov): las canchas en cuadrícula a todo el ancho y "Up next"
       en su propia columna a la derecha (abajo en pantallas angostas). */
    html += '<div class="ac-cols"><div class="ac-courts">';
    for (const c of b.board) {
      if (c.state === 'playing') {
        const min = minutos((ahora - new Date(c.called_at).getTime()) / 1000);
        const nuevo = min < 2;
        html += `<div class="ac-court" data-court="${c.court}">
          <div class="ac-court-h"><span class="ac-court-n">COURT ${c.court}</span>
            <span class="ac-tag ${nuevo ? 'ac-tag-new' : 'ac-tag-play'}">${nuevo ? 'New · just called' : `Playing · ${min} min`}</span></div>
          <div class="ac-court-m"><div class="ac-team">${esc(nombreEquipo(c.team_a_id))}</div><div class="ac-vs">vs</div>
            <div class="ac-team">${esc(nombreEquipo(c.team_b_id))}</div></div>
          <div class="ac-court-a">
            <button type="button" class="ac-btn ac-btn-pri ac-btn-sm" data-ac="score" data-match="${c.match_id}" data-a="${c.team_a_id}" data-b="${c.team_b_id}">Enter score</button>
            <button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-ac="move-open" ${libres.length ? '' : 'disabled'}>Move</button>
            <button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-ac="nothere-open">Team not here</button>
          </div>
          <div class="ac-inline" data-ac="move-box" hidden>
            <select class="ac-select ac-select-sm" data-ac="move-select">${libres.map((x) => `<option value="${x}">Court ${x}</option>`).join('')}</select>
            <button type="button" class="ac-btn ac-btn-pri ac-btn-sm" data-ac="move" data-match="${c.match_id}">Move</button>
            <button type="button" class="ac-btn ac-btn-link ac-btn-sm" data-ac="cancel">Cancel</button>
          </div>
          <div class="ac-inline" data-ac="nothere-box" hidden>
            <span class="ac-inline-q">Who is not here?</span>
            <button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-ac="nothere" data-team="${c.team_a_id}">${esc(nombreCorto(c.team_a_id))}</button>
            <button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-ac="nothere" data-team="${c.team_b_id}">${esc(nombreCorto(c.team_b_id))}</button>
            <button type="button" class="ac-btn ac-btn-link ac-btn-sm" data-ac="cancel">Cancel</button>
          </div>
        </div>`;
      } else if (c.state === 'free') {
        html += `<div class="ac-court" data-court="${c.court}">
          <div class="ac-court-h"><span class="ac-court-n">COURT ${c.court}</span><span class="ac-tag ac-tag-free">Free · waiting for a team</span></div>
          <div class="ac-court-m ac-muted">No match can start yet: the teams left are on court${noAqui.size ? ' or not here' : ''}. It fills by itself when a game ends.</div>
          <div class="ac-court-a"><button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-ac="out" data-court="${c.court}">Court out</button></div>
        </div>`;
      } else {
        html += `<div class="ac-court ac-court-out" data-court="${c.court}">
          <div class="ac-court-h"><span class="ac-court-n">COURT ${c.court}</span><span class="ac-tag ac-tag-out">Court out</span></div>
          <div class="ac-court-m ac-muted">Not used until you bring it back.</div>
          <div class="ac-court-a"><button type="button" class="ac-btn ac-btn-sec ac-btn-sm" data-ac="back" data-court="${c.court}">Back in</button></div>
        </div>`;
      }
    }

    html += '</div>';
    const esperando = b.queue.filter((q) => q.state === 'ready').length;
    html += `<aside class="ac-next" aria-labelledby="ac-next-${cat.id}">
      <div class="ac-next-h"><h3 class="ac-next-t" id="ac-next-${cat.id}">Up next</h3>
        <span class="ac-next-n">${b.queue.length ? `${b.queue.length} match${b.queue.length === 1 ? '' : 'es'}${esperando ? ` · ${esperando} ready` : ''}` : 'none'}</span></div>`;
    if (!b.queue.length) html += '<p class="ac-help">No matches waiting.</p>';
    for (const q of b.queue) {
      let estado = '';
      let boton = '';
      if (q.state === 'ready') estado = `waiting ${minutos(q.wait_seconds)} min`;
      else if (q.state === 'playing') estado = 'after their games';
      else {
        const ausentes = [q.team_a_id, q.team_b_id].filter((t) => noAqui.has(Number(t)));
        estado = ausentes.map((t) => `${nombreCorto(t)} not here`).join(' · ');
        boton = ausentes.map((t) => `<button type="button" class="ac-btn ac-btn-sec ac-btn-xs" data-ac="here" data-team="${t}">Here</button>`).join('');
      }
      html += `<div class="ac-q"><span>${esc(nombreCorto(q.team_a_id))} <span class="ac-vs">vs</span> ${esc(nombreCorto(q.team_b_id))}</span>
        <span class="ac-q-w">${esc(estado)} ${boton}</span></div>`;
    }
    const otrosAusentes = [...noAqui].filter((t) => !b.queue.some((q) => q.state === 'not_here' && [Number(q.team_a_id), Number(q.team_b_id)].includes(t)));
    if (otrosAusentes.length) {
      html += `<div class="ac-q ac-q-absent"><span>Not here: ${otrosAusentes.map((t) => esc(nombreCorto(t))).join(', ')}</span>
        <span class="ac-q-w">${otrosAusentes.map((t) => `<button type="button" class="ac-btn ac-btn-sec ac-btn-xs" data-ac="here" data-team="${t}">${esc(nombreCorto(t))} is here</button>`).join(' ')}</span></div>`;
    }
    html += '</aside></div>';
    html += `<p class="ac-help ac-upd">Updated ${esc(new Date(b.now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))} · refreshes every 15 seconds</p>`;
    return html + '</div>';
  }

  /* ════════════════════════ MONTAR ════════════════════════ */
  function montar(el, ctx) {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _firma = '';
    if (!el || !ctx || !ctx.cat) return;
    const { cat, tournament } = ctx;
    _equipos = {}; (ctx.teams || []).forEach((t) => { _equipos[t.id] = t; });
    const courts = cat.auto_courts || [];
    const empezo = !!cat.auto_courts_started_at;
    /* Antes del SQL 131 la categoría no trae estas columnas: no se pinta nada. */
    if (!('auto_courts' in cat)) { el.innerHTML = ''; return; }
    if (tournament.status === 'completed' && !courts.length) { el.innerHTML = ''; return; }

    el.dataset.cat = cat.id;
    el.classList.add('ac-root');
    if (!empezo || tournament.status === 'completed') {
      el.innerHTML = tournament.status === 'completed' ? '' : htmlAjustes(ctx);
      enlazar(el, ctx);
      return;
    }
    if (!courts.length) {
      el.innerHTML = '<div class="ac-card ac-mini"><b>Auto Courts</b> · Round robin complete ✓ — courts lent to another category.</div>';
      return;
    }
    el.innerHTML = '<div class="ac-card ac-board"><div class="ac-help">Loading Court board…</div></div>';
    enlazar(el, ctx);
    pintarBoard(el, ctx, true);
    _timer = setInterval(() => {
      if (!el.isConnected) { clearInterval(_timer); _timer = null; return; }
      if (document.visibilityState !== 'visible') return;
      if (document.querySelector('.t-modal-bg.t-modal-open')) return;   // no molestar con un modal abierto
      if (el.querySelector('[data-ac="move-box"]:not([hidden]), [data-ac="nothere-box"]:not([hidden]), .ac-setup')) return;
      pintarBoard(el, ctx, false);
    }, REFRESCO_MS);
  }

  async function pintarBoard(el, ctx, primera) {
    let b;
    try { b = await rpc('auto_courts_board', { p_category_id: ctx.cat.id }); }
    catch (e) { if (primera) el.innerHTML = `<div class="ac-card ac-err-card">${esc(mensaje(e.message))}</div>`; return; }
    if (!el.isConnected || !b || b.error) return;
    /* Si mientras tanto se cambió de categoría, esto ya no toca. */
    if (window.tCurrentCategoryId != null && Number(window.tCurrentCategoryId) !== Number(ctx.cat.id)) return;
    /* Red de seguridad: una cancha libre y un partido listo para jugar no
       deberían coincidir; si pasa (algo quedó a medias), se llena ahora. */
    if (!ctx._llenando && b.board.some((x) => x.state === 'free') && b.queue.some((q) => q.state === 'ready')) {
      ctx._llenando = true;
      try {
        const r = await rpc('auto_courts_fill_now', { p_category_id: ctx.cat.id });
        if (r && r.called > 0) { await recargar(ctx); return; }
      } catch (_) { /* se intenta en la próxima vuelta */ }
      finally { ctx._llenando = false; }
    }
    const firma = JSON.stringify([b.done, b.out, b.courts, b.not_here, b.board.map((x) => [x.court, x.match_id])]);
    if (!primera && firma !== _firma && typeof window.loadCategory === 'function') {
      /* Alguien guardó un score (u otro cambio): se recarga la categoría
         entera, así las rondas y la tabla de abajo también se ponen al día. */
      _firma = firma;
      window.loadCategory(ctx.cat.id, ctx.tournament);
      return;
    }
    _firma = firma;
    if (!el.querySelector('.ac-setup')) el.innerHTML = htmlBoard(ctx, b);
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

  function enlazar(el, ctx) {
    if (el._acEnlazado) { el._acCtx = ctx; return; }
    el._acEnlazado = true;
    el._acCtx = ctx;

    el.addEventListener('input', (ev) => {
      if (ev.target.dataset.ac !== 'courts-input') return;
      const c = el._acCtx;
      const r = leerCanchas(ev.target.value);
      const chips = el.querySelector('[data-ac="chips"]');
      const err = el.querySelector('[data-ac="err"]');
      const sum = el.querySelector('[data-ac="summary"]');
      if (r.error) { err.textContent = r.error; err.hidden = false; chips.innerHTML = ''; return; }
      err.hidden = true;
      chips.innerHTML = r.courts.map((x) => `<span class="ac-chip">${x}</span>`).join('');
      sum.textContent = resumen(r.courts.length, c);
    });

    el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-ac]');
      if (!b || !el.contains(b) || b.tagName !== 'BUTTON' || b.disabled) return;
      const c = el._acCtx;
      const tarjeta = b.closest('.ac-court');
      switch (b.dataset.ac) {
        case 'save': {
          const input = el.querySelector('[data-ac="courts-input"]');
          const err = el.querySelector('[data-ac="err"]');
          const r = leerCanchas(input.value);
          if (r.error) { err.textContent = r.error; err.hidden = false; input.focus(); return; }
          b.disabled = true;
          try {
            const res = await rpc('auto_courts_set', { p_category_id: c.cat.id, p_courts: r.courts });
            if (res && res.error) { err.textContent = mensaje(res); err.hidden = false; b.disabled = false; return; }
            aviso(r.courts.length ? `Courts saved: ${escribirCanchas(r.courts)}.` : 'Auto Courts off — courts are entered by hand.');
            await recargar(c);
          } catch (e) { err.textContent = mensaje(e.message); err.hidden = false; b.disabled = false; }
          return;
        }
        case 'start':
          return accion(b, c, 'auto_courts_start', { p_category_id: c.cat.id },
            (r) => `Auto Courts started — ${r.called} match${r.called === 1 ? '' : 'es'} called to court.`);
        case 'open-setup': {
          if (_timer) { clearInterval(_timer); _timer = null; }
          el.innerHTML = htmlAjustes(c);
          return;
        }
        case 'close-setup':
          return montar(el, c);
        case 'score':
          if (typeof window.openScoreModal === 'function') window.openScoreModal('rr', Number(b.dataset.match), Number(b.dataset.a), Number(b.dataset.b), c.cat.id);
          return;
        case 'move-open': case 'nothere-open': {
          el.querySelectorAll('[data-ac="move-box"], [data-ac="nothere-box"]').forEach((x) => { x.hidden = true; });
          tarjeta.querySelector(b.dataset.ac === 'move-open' ? '[data-ac="move-box"]' : '[data-ac="nothere-box"]').hidden = false;
          return;
        }
        case 'cancel':
          b.closest('.ac-inline').hidden = true;
          return;
        case 'move': {
          const destino = Number(tarjeta.querySelector('[data-ac="move-select"]').value);
          return accion(b, c, 'auto_courts_move', { p_match_id: Number(b.dataset.match), p_court: destino }, `Match moved to Court ${destino}.`);
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
        case 'out':
          return accion(b, c, 'auto_courts_court_out', { p_category_id: c.cat.id, p_court: Number(b.dataset.court), p_out: true }, `Court ${b.dataset.court} is out.`);
        case 'back':
          return accion(b, c, 'auto_courts_court_out', { p_category_id: c.cat.id, p_court: Number(b.dataset.court), p_out: false }, `Court ${b.dataset.court} is back in.`);
        case 'lend': {
          const sel = el.querySelector('[data-ac="lend-select"]');
          const nombre = sel.options[sel.selectedIndex]?.textContent.replace(/\s*\(.*$/, '') || '';
          return accion(b, c, 'auto_courts_lend', { p_from_category: c.cat.id, p_to_category: Number(sel.value) }, `Courts lent to ${nombre}.`);
        }
        default:
      }
    });
  }

  window.AutoCourts = { montar, esAuto, htmlCanchaFija, avisoSiguiente, mensaje, leerCanchas, escribirCanchas };
})();
