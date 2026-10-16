/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PLAY GAMES
   Matchmaking M-3a (15 de octubre) — decisiones §78, §79
   Pantalla aprobada en el diseño ("Admin panel — Play games").

   Los juegos que organizan los jugadores en el Player Portal y sus
   resultados. Cuatro pestañas:
     · In review: lo que alguien declinó dos veces (o el anfitrión no
       corrigió a tiempo). La lista a la izquierda y el resultado a la
       derecha: quién vino, los partidos, quién lo declinó y por qué. Con
       una nota (obligatoria) se decide:
         Verify as reported — cuenta tal cual.
         Correct and verify — con los marcadores y la asistencia que el
                              equipo corrige aquí (los equipos no cambian).
         Discard the result — no cuenta para nadie.
     · Waiting (48 h): lo que espera a los jugadores (también se puede
       decidir antes, si hace falta).
     · Verified: los últimos 100 cerrados (verificados o descartados).
     · Active games: los juegos que vienen.
   NUNCA cambia la clasificación de una escalera. El panel no lee los chats.
   El círculo rojo del menú cuenta lo que está "In review".

   La seguridad está en la base (sql/100): cada función comprueba que quien
   llama es administradora activa. Si el SQL 100 no está, la pantalla lo
   dice y el resto del panel funciona igual.

   Depende de: db.js (esc, toast, confirmModal, window.supabase), app.js
   (AdminPageLoaders, CLICK_HANDLERS, app.authReady). Estilos:
   admin-pages.css (pc- de Player claims, pp-perf-, ps- y pg-).
   ============================================================ */

(function () {
  'use strict';

  const CADA = 3 * 60 * 1000;
  const sb = () => window.supabase;
  const esc = (x) => window.esc(x == null ? '' : String(x));
  const $ = (id) => document.getElementById(id);

  const TIPO = { singles: 'Singles', doubles: 'Doubles', mixed: 'Mixed doubles', drill: 'Drill / practice' };
  const FORMATO = { single: 'Single game', bo3: 'Best of 3', bo5: 'Best of 5' };
  const ASISTE = { played: 'Played', no_show: 'No-show', excused: 'Excused', late: 'Late cancellation', late_excused: 'Late — excused' };
  const MOTIVO = { score: 'A score is wrong', teams: 'The teams are wrong', not_played: "Didn't play this game",
    attendance: 'Someone is marked wrong', other: 'Something else' };
  const ESTADO = {
    pending: ['Waiting for players', 'pc-pill-warn'], declined: ['Declined — host can correct', 'pc-pill-warn'],
    disputed: ['In review', 'pc-pill-red'], verified: ['Verified', 'pc-pill-green'], discarded: ['Discarded', 'pc-pill-gray'],
    self: ['Self-reported', 'pc-pill-gray'],   // M-3b: sólo con invitados
  };
  const COMO = { accepted: 'accepted by a player', auto: 'automatically after 48 h', team: 'by the team', self: 'guests only' };
  const VINCULO = { pending: 'waiting for them to confirm', accepted: 'confirmed', declined: 'said it wasn\'t them', expired: 'could not be linked' };
  /* M-3b: un juego registrado ("Log a game") lleva su etiqueta; el lugar es opcional. */
  const etiquetaLogged = (g) => (g.logged ? ' <span class="pc-pill pc-pill-gray">Logged</span>' : '');

  let _tab = 'review';
  let _datos = { items: [], counts: {} };
  let _sel = null;
  let _ocupada = false;
  let _vez = 0;

  const cuando = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const dia = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const juegoTxt = (g) => [TIPO[g.kind] || 'Game', dia(g.plays_at), g.place].filter(Boolean).join(' · ');
  const nombres = (t) => (t || []).map((p) => p.name).join(' & ');

  const errorLegible = (err) => {
    const m = String((err && err.message) || err || '');
    if (/already_resolved/.test(m)) return 'Another admin already decided this result. The list is refreshed.';
    if (/note_required/.test(m)) return 'Write a short note for the team first.';
    if (/invalid_score/.test(m)) return 'Check the scores: no ties, and a Best of 3 or 5 ends as soon as a team wins 2 (or 3) games.';
    if (/invalid_people|invalid_teams/.test(m)) return 'Someone in a game is marked as not playing. Check the attendance.';
    if (/too_many_games_day|same_partner_limit/.test(m)) return 'That breaks the daily limits (8 games a day, 4 single games with the same partner).';
    if (/not_found/.test(m)) return 'This no longer exists. The list is refreshed.';
    if (/not_authorized|permission denied/.test(m)) return 'Your admin access could not be confirmed. Sign in again.';
    if (/function .* does not exist|Could not find the function/i.test(m)) return 'Play games is not installed yet (SQL 100).';
    return 'Something went wrong. Please try again in a moment.';
  };

  // ── El círculo rojo ──────────────────────────────────────────
  let _vezCuenta = 0;
  async function contar() {
    if (!sb()) return;
    const mia = ++_vezCuenta;
    let n = 0;
    try {
      const { data, error } = await sb().rpc('admin_juegos_pendientes');
      if (error) throw error;
      n = Number(data && data.review) || 0;
    } catch (err) {
      console.warn('[play-games] no se pudo contar:', err?.message || err);
    }
    if (mia !== _vezCuenta) return;
    const t = n > 99 ? '99+' : String(n);
    ['pg-sb', 'pg-md', 'pg-n-review'].forEach((id) => { const el = $(id); if (el) { el.textContent = t; el.hidden = n === 0; } });
    const frase = n ? ` — ${n} result${n === 1 ? '' : 's'} in review` : '';
    ['sb-play-games', 'md-play-games'].forEach((id) => { const b = $(id); if (b) b.setAttribute('aria-label', `Play games${frase}`); });
  }

  // ── Las pestañas ─────────────────────────────────────────────
  function marcarPestana() {
    document.querySelectorAll('#page-play-games .pc-tab').forEach((b) => {
      const si = b.dataset.tab === _tab;
      b.classList.toggle('active', si);
      b.setAttribute('aria-selected', si ? 'true' : 'false');
    });
  }
  async function cargar() {
    marcarPestana();
    const caja = $('pg-body');
    const mia = ++_vez;
    caja.innerHTML = '<div class="loading">Loading...</div>';
    try {
      const { data, error } = await sb().rpc('admin_juegos', { p_vista: _tab });
      if (error) throw error;
      if (mia !== _vez) return;
      _datos = data || { items: [], counts: {} };
      pintarCifras();
      if (_tab === 'active') pintarActivos();
      else if (_tab === 'verified') pintarCerrados();
      else {
        const lista = _datos.items || [];
        if (!lista.some((r) => r.game.id === _sel)) _sel = lista.length ? lista[0].game.id : null;
        pintarDecidir();
      }
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[play-games] no se pudo leer:', err);
      caja.innerHTML = `<div class="pc-vacio">${esc(errorLegible(err))}</div>`;
    }
  }
  function pintarCifras() {
    const c = _datos.counts || {};
    $('pg-stats').innerHTML = [['active', 'Active games'], ['waiting', 'Waiting for players'], ['verified_month', 'Verified, last 30 days'], ['review', 'In review']]
      .map(([k, t]) => `<div class="pg-stat"><b>${esc(Number(c[k]) || 0)}</b>${esc(t)}</div>`).join('');
  }

  // ── In review y Waiting: decidir ─────────────────────────────
  function pintarDecidir() {
    const caja = $('pg-body');
    const lista = _datos.items || [];
    if (!lista.length) {
      caja.innerHTML = `<div class="pc-vacio pc-vacio-ok">${_tab === 'review'
        ? 'Nothing to review. Results that players decline twice (or that the host doesn\'t correct in time) show up here.'
        : 'No results waiting for players right now.'}</div>`;
      return;
    }
    const items = lista.map((r) => {
      const no = (r.log || []).filter((l) => l.action === 'declined');
      const sub = no.length ? `Declined by ${no.map((l) => l.name).join(', ')}` : `Reported ${cuando(r.reported_at)}`;
      return `<button type="button" class="pc-item${r.game.id === _sel ? ' active' : ''}" data-action="pgSel" data-id="${esc(r.game.id)}" aria-pressed="${r.game.id === _sel}">
        <span class="pc-item-top"><span class="pc-item-name">${esc(TIPO[r.game.kind] || 'Game')} · ${esc(new Date(r.game.plays_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }))}</span><span class="pc-item-when">${esc(r.game.place || (r.game.logged ? 'Logged game' : ''))}</span></span>
        <span class="ps-item-sub">Hosted by ${esc(r.game.host.name)} · ${esc(sub)}</span>
      </button>`;
    }).join('');
    caja.innerHTML = `<div class="pc-split"><div class="pc-list">${items}</div><section class="pc-detail" id="pg-detail" aria-live="polite"></section></div>`;
    pintarDetalle();
  }

  const fila = (lbl, val) => `<div class="pp-perf-row"><span class="pp-perf-lbl">${esc(lbl)}</span><span class="ps-val">${val}</span></div>`;
  function pintarDetalle() {
    const caja = $('pg-detail');
    const r = (_datos.items || []).find((x) => x.game.id === _sel);
    if (!caja || !r) return;
    const [estado, cls] = ESTADO[r.status] || ['', ''];
    const fuera = (r.people || []).filter((p) => p.role !== 'host');
    const asistencia = fuera.map((p) => {
      /* M-3b: añadido con su código (jugó; no se cambia aquí). */
      if (p.role === 'added') {
        const voto = p.vote ? `<span class="pc-pill ${p.vote === 'accepted' ? 'pc-pill-green' : 'pc-pill-red'}">${p.vote === 'accepted' ? 'Accepted' : 'Declined'}</span>` : '<span class="ps-muted">No answer</span>';
        return `<tr><td>${esc(p.name)}<span class="pc-sub">Added with their player code</span></td><td>Played</td><td>${voto}</td></tr>`;
      }
      const ops = (p.role === 'late' ? ['late', 'late_excused'] : ['played', 'no_show', 'excused'])
        .map((v) => `<option value="${v}"${p.attendance === v ? ' selected' : ''}>${esc(ASISTE[v])}</option>`).join('');
      const voto = p.vote ? `<span class="pc-pill ${p.vote === 'accepted' ? 'pc-pill-green' : 'pc-pill-red'}">${p.vote === 'accepted' ? 'Accepted' : 'Declined'}</span>` : '<span class="ps-muted">No answer</span>';
      return `<tr><td>${esc(p.name)}${p.role === 'late' ? '<span class="pc-sub">Left less than 12 h before</span>' : ''}</td>
        <td><label class="pc-sr" for="pg-at-${esc(p.player_id)}">Attendance of ${esc(p.name)}</label><select class="pg-select" id="pg-at-${esc(p.player_id)}" data-pid="${esc(p.player_id)}">${ops}</select></td><td>${voto}</td></tr>`;
    }).join('') + (r.guests || []).map((g) => `<tr><td>${esc(g.name)}<span class="pc-sub">Guest (not on FEROCIA)${g.link_status ? ` · linked to ${esc(g.link_name || 'a player')}: ${esc(VINCULO[g.link_status] || g.link_status)}` : ''}</span></td><td>Played</td><td><span class="ps-muted">—</span></td></tr>`).join('');
    const partidos = (r.entries || []).map((e) => {
      const marcadores = e.score_a.map((x, i) => `<span class="pg-game"><input class="pg-sc" inputmode="numeric" maxlength="2" aria-label="Entry ${e.pos}, game ${i + 1}, team A" data-pos="${esc(e.pos)}" data-i="${i}" data-lado="a" value="${esc(x)}">–<input class="pg-sc" inputmode="numeric" maxlength="2" aria-label="Entry ${e.pos}, game ${i + 1}, team B" data-pos="${esc(e.pos)}" data-i="${i}" data-lado="b" value="${esc(e.score_b[i])}"></span>`).join('');
      return `<tr><td>${esc(e.pos)} · ${esc(FORMATO[e.format] || e.format)}</td><td>${esc(nombres(e.team_a))}</td><td>${esc(nombres(e.team_b))}</td><td class="pg-scores">${marcadores}</td></tr>`;
    }).join('');
    const historia = (r.log || []).filter((l) => l.action === 'declined').map((l) =>
      `<div class="ps-quote"><b>${esc(l.name)}</b> declined (round ${esc(l.round)}): ${esc(MOTIVO[l.reason] || l.reason)}${l.detail ? ` — “${esc(l.detail)}”` : ''}</div>`).join('');
    caja.innerHTML = `
      <div class="pc-detail-head">
        <h2 class="pc-detail-name">${esc(juegoTxt(r.game))}${etiquetaLogged(r.game)}</h2>
        <span class="pc-pill ${cls}">${esc(estado)}</span>
      </div>
      <div class="ps-rows">
        ${fila('Hosted by', esc(r.game.host.name))}
        ${fila('Reported', `${esc(cuando(r.reported_at))}${r.round === 2 ? ' <span class="ps-muted">(corrected once)</span>' : ''}`)}
        ${r.status === 'pending' ? fila('Verified automatically', esc(cuando(r.deadline_at))) : ''}
      </div>
      ${historia}
      <div class="pc-tabla-wrap"><table class="pc-tabla pg-tabla"><thead><tr><th scope="col">Player</th><th scope="col">Attendance</th><th scope="col">Answer</th></tr></thead><tbody>${asistencia}</tbody></table></div>
      ${partidos ? `<div class="pc-tabla-wrap"><table class="pc-tabla pg-tabla"><thead><tr><th scope="col">Entry</th><th scope="col">Team A</th><th scope="col">Team B</th><th scope="col">Score</th></tr></thead><tbody>${partidos}</tbody></table></div>` : '<p class="ps-muted">No scores (attendance only).</p>'}
      <label class="ps-nota"><span class="pc-sr">Note for the team</span>
        <textarea id="pg-nota" maxlength="1000" rows="3" placeholder="Note for the team (required). Players don't see it."></textarea></label>
      <div class="pc-botones">
        <button type="button" class="av-btn av-btn-pri" data-action="pgDecidir" data-accion="verify">Verify as reported</button>
        <button type="button" class="av-btn av-btn-sec" data-action="pgDecidir" data-accion="correct">Correct and verify</button>
        <button type="button" class="av-btn pc-btn-peligro" data-action="pgDecidir" data-accion="discard">Discard the result</button>
        <button type="button" class="av-btn av-btn-sec" data-action="showPage" data-page="player-profile" data-pid="${esc(r.game.host.player_id)}">View host profile</button>
      </div>
      <p class="pc-pie">"Correct and verify" saves the scores and attendance you change above (the teams stay as reported). Verified results count in the players' Play games and reliability; ladder standings never change. Everything is saved in the host's history.</p>`;
  }

  /* Lo que el equipo cambió en pantalla (asistencia y marcadores). */
  function leerCorreccion(r) {
    const people = (r.people || []).filter((p) => p.role === 'in' || p.role === 'late').map((p) => ({ player_id: p.player_id, attendance: ($(`pg-at-${p.player_id}`) || {}).value || p.attendance }));
    const entries = (r.entries || []).map((e) => {
      const lee = (lado, i) => {
        const el = document.querySelector(`#pg-detail .pg-sc[data-pos="${e.pos}"][data-i="${i}"][data-lado="${lado}"]`);
        return el ? el.value.trim() : '';
      };
      const scores = e.score_a.map((x, i) => [lee('a', i), lee('b', i)]).filter((s) => s[0] !== '' || s[1] !== '');
      return { format: e.format, team_a: e.team_a.map((p) => p.player_id), team_b: e.team_b.map((p) => p.player_id),
        scores: scores.map((s) => [/^\d{1,2}$/.test(s[0]) ? Number(s[0]) : s[0], /^\d{1,2}$/.test(s[1]) ? Number(s[1]) : s[1]]) };
    });
    return { people, entries };
  }

  async function decidir(accion) {
    if (_ocupada) return;
    const r = (_datos.items || []).find((x) => x.game.id === _sel);
    if (!r) return;
    const nota = ($('pg-nota')?.value || '').trim();
    if (!nota) { window.toast('Write a short note for the team first.', true); $('pg-nota')?.focus(); return; }
    if (accion === 'discard' && !(await window.confirmModal({ title: 'Discard this result?', message: 'It won\'t count for anyone (Play games, reliability or recognitions). The players are told in the portal.', okLabel: 'Discard', danger: true }))) return;
    _ocupada = true;
    try {
      const c = accion === 'correct' ? leerCorreccion(r) : { people: null, entries: null };
      const { error } = await sb().rpc('admin_juegos_decidir', { p_game: r.game.id, p_action: accion, p_note: nota, p_people: c.people, p_entries: c.entries });
      if (error) throw error;
      window.toast({ verify: 'Result verified.', correct: 'Result corrected and verified.', discard: 'Result discarded.' }[accion]);
      _sel = null;
    } catch (err) {
      window.toast(errorLegible(err), true);
      _ocupada = false;
      return;
    }
    _ocupada = false;
    await cargar();
    contar();
  }

  // ── Verified ─────────────────────────────────────────────────
  function pintarCerrados() {
    const lista = _datos.items || [];
    if (!lista.length) { $('pg-body').innerHTML = '<div class="pc-vacio">No verified results yet.</div>'; return; }
    const filas = lista.map((r) => {
      const [txt, cls] = ESTADO[r.status] || ['', ''];
      const partidos = (r.entries || []).map((e) => `${nombres(e.team_a)} vs ${nombres(e.team_b)}: ${e.score_a.map((x, i) => `${x}–${e.score_b[i]}`).join(', ')}`).join(' · ');
      return `<tr>
        <td><strong>${esc(TIPO[r.game.kind] || 'Game')}</strong>${etiquetaLogged(r.game)}<span class="pc-sub">${esc([dia(r.game.plays_at), r.game.place].filter(Boolean).join(' · '))}</span></td>
        <td>${esc(r.game.host.name)}</td>
        <td class="pc-td-nota">${esc(partidos || 'Attendance only')}</td>
        <td><span class="pc-pill ${cls}">${esc(txt)}</span><span class="pc-sub">${esc(r.decided_at ? `${cuando(r.decided_at)}, ${COMO[r.decided_how] || ''}` : '')}${esc(r.by ? ` (${r.by})` : '')}</span></td>
        <td class="pc-td-nota">${esc(r.admin_note || '')}</td>
      </tr>`;
    }).join('');
    $('pg-body').innerHTML = `<div class="card pc-card"><div class="pc-tabla-wrap"><table class="pc-tabla pc-tabla-res">
      <thead><tr><th scope="col">Game</th><th scope="col">Host</th><th scope="col">Result</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
      <tbody>${filas}</tbody></table></div></div>`;
  }

  // ── Active games ─────────────────────────────────────────────
  function pintarActivos() {
    const lista = _datos.items || [];
    if (!lista.length) { $('pg-body').innerHTML = '<div class="pc-vacio">No upcoming games right now.</div>'; return; }
    const filas = lista.map((x) => `<tr>
        <td><strong>${esc(TIPO[x.game.kind] || 'Game')}</strong><span class="pc-sub">${esc(dia(x.game.plays_at))}</span></td>
        <td>${esc(x.game.place)}</td>
        <td>${esc(x.game.host.name)}</td>
        <td>${esc(x.game.players)} of ${esc(x.game.of)}</td>
        <td>${esc(x.game.visibility === 'invite' ? 'Invite only' : 'Open')}</td>
      </tr>`).join('');
    $('pg-body').innerHTML = `<div class="card pc-card"><div class="pc-tabla-wrap"><table class="pc-tabla pc-tabla-res">
      <thead><tr><th scope="col">Game</th><th scope="col">Where</th><th scope="col">Host</th><th scope="col">Players</th><th scope="col">Visibility</th></tr></thead>
      <tbody>${filas}</tbody></table></div></div>`;
  }

  // ── Arranque ─────────────────────────────────────────────────
  window.AdminPageLoaders.playGames = () => { cargar(); contar(); };
  Object.assign(window.CLICK_HANDLERS, {
    pgTab: (btn) => { _tab = btn.dataset.tab; cargar(); },
    pgSel: (btn) => { _sel = Number(btn.dataset.id); pintarDecidir(); },
    pgDecidir: (btn) => decidir(btn.dataset.accion),
  });

  const empezar = () => {
    contar();
    setInterval(() => { if (document.visibilityState === 'visible') contar(); }, CADA);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') contar(); });
  };
  if (window.app && window.app.authReady) window.app.authReady.then(empezar);
})();
