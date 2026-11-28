/* ============================================================
   FEROCIA — TEAM CHALLENGE DE LOS TORNEOS EN EL PANEL (§132, SQL 150)
   27 nov 2026 · diseño team-challenge.html aprobado.

   Una división con formato "team_challenge":
     1. Teams: cada equipo = 2 hombres + 2 mujeres. Las 4 líneas salen
        solas (Men 1 + Men 2, Women 1 + Women 2, Men 1 + Women 1 =
        Mixed line 1, Men 2 + Women 2 = Mixed line 2). Fijas al generar
        el calendario. Cada jugador es un botón de check-in (admin-checkin.js).
     2. Team matches: los cruces por ronda, cada uno con sus 4 partidos
        (Enter score de siempre, Forfeit de un partido, Undo forfeit).
        Las canchas automáticas, como en cualquier round robin.
     3. Team standings: la tabla de la base (tc_tabla), el aviso del
        primer forfeit de una línea, Withdrawn y el podio.
   Una división sin equipos ni partidos enseña arriba el selector de
   formato (Standard / Team Challenge).
   Todo lo que cambia datos pasa por funciones de la base (admin_tc_*).
   ============================================================ */
(function () {
  'use strict';

  const esc = (s) => (window.app?.esc || window.esc)(s == null ? '' : String(s));
  const api = (...a) => (window.app?.api || window.api)(...a);
  const aviso = (m, e) => (window.tToast ? window.tToast(m, e) : null);
  const confirmar = (o) => (window.app?.confirmModal || window.confirmModal || (() => Promise.resolve(false)))(o);
  const rpc = async (fn, args) => {
    const { data, error } = await window.supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
    if (data && data.error) { const e = new Error(data.error); e.datos = data; throw e; }
    return data;
  };

  const LINEAS = [['md', "Men's doubles", "Men's"], ['wd', "Women's doubles", "Women's"], ['mx1', 'Mixed line 1', 'Mixed 1'], ['mx2', 'Mixed line 2', 'Mixed 2']];
  const LARGO = Object.fromEntries(LINEAS.map(([k, l]) => [k, l]));
  const CORTO = Object.fromEntries(LINEAS.map(([k, , c]) => [k, c]));
  const ORDEN = { md: 1, wd: 2, mx1: 3, mx2: 4 };

  const MENSAJES = {
    not_authorized: 'Your session is not an active admin. Sign in again.',
    not_team_challenge: 'This division is not a Team Challenge.',
    tournament_completed: 'This tournament is completed.',
    schedule_generated: 'The schedule is already generated: teams and lines are locked.',
    bad_name: 'Write a team name (up to 40 characters).',
    missing_player: 'Choose the 4 players.',
    repeated_player: 'The same player can\'t be in two slots.',
    men_slots: 'Men 1 and Men 2 must be men (check the player\'s gender in Players).',
    women_slots: 'Women 1 and Women 2 must be women (check the player\'s gender in Players).',
    name_taken: 'Another team in this division already has that name.',
    player_in_other_team: 'Already in another team of this division',
    need_3_teams: 'Add at least 3 teams to generate the schedule.',
    incomplete_team: 'A team is missing a line. Edit it and save again.',
    not_started: 'Start the tournament first.',
    not_pending: 'This match already has a result.',
    bad_team: 'That team is not in this match.',
    team_withdrawn: 'This team is withdrawn. Undo the withdrawal first.',
    not_forfeit: 'This match is not a forfeit.',
    not_withdrawn: 'This team is not withdrawn.',
    has_teams: 'This division already has teams or matches: the format can\'t change.',
  };
  const mensaje = (e) => {
    const t = String(e && e.message || e);
    if (/Could not find the function|PGRST202/.test(t)) return 'Team Challenge needs the latest update (SQL 150).';
    if (e && e.datos && e.datos.players) return `${MENSAJES.player_in_other_team}: ${e.datos.players}.`;
    return MENSAJES[t] || `Error: ${t}`;
  };

  /* Hombre / mujer, con la misma regla de la base (_tc_genero). */
  const genero = (p) => {
    const g = String(p && p.gender || '').trim().toLowerCase();
    if (['m', 'male', 'man', 'men', 'masculino', 'hombre'].includes(g)) return 'm';
    if (['f', 'female', 'woman', 'women', 'femenino', 'mujer'].includes(g)) return 'f';
    return '';
  };
  const jugadores = () => window.tAllPlayers || [];
  const nombre = (id) => { const p = jugadores().find((x) => Number(x.id) === Number(id)); return p ? `${p.first_name} ${p.last_name}`.trim() : '?'; };
  const corto = (id) => { const p = jugadores().find((x) => Number(x.id) === Number(id)); return p ? `${p.first_name} ${String(p.last_name || '').charAt(0)}.`.trim() : '?'; };

  let ctx = null;   // { el, cat, tournament, equipos, lineas, partidos, tabla, avisos }

  const cerrar = () => { window.tSetModalSubtitle?.(''); window.closeTModal?.(); };
  const recargar = () => (ctx && window.switchCategory ? window.switchCategory(ctx.cat.id, ctx.tournament.id) : null);

  /* ═══ El selector de formato (división vacía) ═══ */
  function barraFormato(cat, tournament) {
    if (tournament.status === 'completed') return '';
    const tc = cat.format === 'team_challenge';
    return `<div class="tc-formato" role="group" aria-label="Division format">
      <span class="tc-formato-t">Division format</span>
      <button type="button" class="tc-formato-b${tc ? '' : ' on'}" aria-pressed="${!tc}" data-action="tcFormato" data-cat="${Number(cat.id)}" data-tc="0">Standard</button>
      <button type="button" class="tc-formato-b${tc ? ' on' : ''}" aria-pressed="${tc}" data-action="tcFormato" data-cat="${Number(cat.id)}" data-tc="1">🏆 Team Challenge</button>
      <span class="tc-formato-n">${tc ? 'Teams of 2 men + 2 women · 4 lines · team points' : 'Pairs, round robin and bracket'}</span>
    </div>`;
  }

  /* ═══ La vista de la división ═══ */
  async function pintar(el, base) {
    const { cat, tournament, teams, rrMatches } = base;
    const mio = ctx = { el, cat, tournament, lineas: teams, partidos: rrMatches, equipos: [], tabla: [], avisos: [] };
    el.innerHTML = '<div class="t-loading">Loading…</div>';
    try {
      const [equipos, tabla, avisos, enOtras] = await Promise.all([
        api(`tournament_tc_teams?category_id=eq.${Number(cat.id)}&select=*&order=id`),
        rpc('tc_tabla', { p_category_id: cat.id }),
        rpc('admin_tc_avisos', { p_category_id: cat.id }).catch(() => []),
        jugadoresDeOtras(cat, tournament).catch(() => new Set()),   // si falla, la base igual lo impide
      ]);
      if (ctx !== mio) return;
      Object.assign(mio, { equipos, tabla: tabla || [], avisos: avisos || [], enOtras });
    } catch (e) {
      if (ctx !== mio) return;
      el.innerHTML = '';
      const p = document.createElement('div'); p.className = 'tc-error'; p.textContent = mensaje(e); el.append(p);
      return;
    }
    const conPartidos = rrMatches.length > 0;
    el.innerHTML = `${conPartidos || mio.equipos.length ? '' : barraFormato(cat, tournament)}
      ${reglas()}
      ${seccionEquipos(mio, conPartidos)}
      ${seccionPartidos(mio, conPartidos)}
      ${seccionTabla(mio)}`;
    /* La barra de progreso: el ancho aquí (no en el HTML). */
    el.querySelectorAll('.tc-prog i[data-pct]').forEach((i) => { i.style.width = `${Number(i.dataset.pct)}%`; });
    const ac = document.getElementById(`ac-mount-${cat.id}`);
    if (ac && window.AutoCourts) window.AutoCourts.montar(ac, { cat, tournament, teams, rrMatches });
    const ci = document.getElementById('ci-mount');
    if (ci && window.AdminCheckin) window.AdminCheckin.montar(ci, { tournament, cat, teams });
  }

  /* Como "Add team" de siempre: quien ya juega otra división del torneo no sale. */
  async function jugadoresDeOtras(cat, tournament) {
    const cats = (await api(`tournament_categories?tournament_id=eq.${Number(tournament.id)}&select=id`))
      .map((c) => Number(c.id)).filter((id) => id !== Number(cat.id));
    if (!cats.length) return new Set();
    const filas = await api(`tournament_teams?category_id=in.(${cats.join(',')})&select=player1_id,player2_id,player3_id,player4_id`);
    return new Set(filas.flatMap((t) => [t.player1_id, t.player2_id, t.player3_id, t.player4_id]).filter(Boolean).map(Number));
  }

  function reglas() {
    return `<div class="tc-reglas">
      <div><b>4 lines per team</b><span>Men's doubles · Women's doubles · Mixed line 1 · Mixed line 2. Each player plays two lines.</span></div>
      <div><b>Line vs line</b><span>Every team plays every other team once: 4 matches, each line against the same line.</span></div>
      <div><b>Points</b><span>Each team adds up the points of all its matches. Tie-break: point difference, matches won, then points between the tied teams.</span></div>
      <div><b>Forfeits</b><span>A forfeited match counts ${tope(ctx.cat)}–0. The same line forfeiting twice in a row withdraws the team.</span></div>
    </div>`;
  }
  const tope = (cat) => (/21/.test(cat.rr_format || '') ? 21 : /15/.test(cat.rr_format || '') ? 15 : 11);

  function cabecera(n, titulo, extra, accion) {
    return `<div class="tc-sec-h"><div class="tc-sec-t"><span class="tc-num">${n}</span>${esc(titulo)}${extra ? ` <small>${esc(extra)}</small>` : ''}</div>${accion || ''}</div>`;
  }

  function lineasDe(eq) {
    return [['md', eq.m1_id, eq.m2_id], ['wd', eq.w1_id, eq.w2_id], ['mx1', eq.m1_id, eq.w1_id], ['mx2', eq.m2_id, eq.w2_id]];
  }

  function seccionEquipos(c, conPartidos) {
    const { cat, tournament, equipos } = c;
    const editable = !conPartidos && tournament.status !== 'completed';
    const checkin = tournament.status !== 'completed' && !!window.AdminCheckin;
    const boton = editable ? `<button type="button" class="tc-btn tc-btn-p" data-action="tcEquipo" data-cat="${Number(cat.id)}">＋ Add team</button>` : '';
    const lista = equipos.length ? equipos.map((eq, i) => {
      const ids = [eq.m1_id, eq.m2_id, eq.w1_id, eq.w2_id];
      const chip = (id, g) => checkin
        ? `<button type="button" class="ci-chip" data-ci-player="${Number(id)}" aria-pressed="false"><span class="ci-c" aria-hidden="true">✓</span>${esc(nombre(id))}</button>`
        : `<span class="tc-jug tc-${g}">${esc(nombre(id))}</span>`;
      return `<div class="tc-eq">
        <span class="tc-eq-n">${i + 1}</span>
        <div class="tc-eq-c">
          <div class="tc-eq-nom">${esc(eq.name)}${eq.withdrawn_at ? ' <span class="tc-chip tc-ff">Withdrawn</span>' : ''}</div>
          <div class="ci-jug tc-jugs">${chip(eq.m1_id, 'm')}${chip(eq.m2_id, 'm')}${chip(eq.w1_id, 'f')}${chip(eq.w2_id, 'f')}
            ${checkin ? `<span class="ci-estado" data-ci-team="${Number(eq.id)}" data-ci-players="${ids.map(Number).join(',')}"></span>` : ''}</div>
          <div class="tc-eq-l">${lineasDe(eq).map(([l, a, b]) => `<span><span class="tc-chip tc-${l}">${esc(CORTO[l])}</span> ${esc(corto(a))} &amp; ${esc(corto(b))}</span>`).join('')}</div>
        </div>
        ${editable ? `<div class="tc-eq-a">
          <button type="button" class="tc-btn" data-action="tcEquipo" data-cat="${Number(cat.id)}" data-id="${Number(eq.id)}">Edit</button>
          <button type="button" class="tc-btn tc-btn-r" data-action="tcBorrar" data-id="${Number(eq.id)}" data-nombre="${esc(eq.name)}">Delete</button>
        </div>` : ''}
      </div>`;
    }).join('') : '<p class="tc-vacio">No teams yet. Each team is 2 men + 2 women; the 4 lines are built from them.</p>';
    return `<section class="tc-sec">${cabecera(1, 'Teams', equipos.length ? `${equipos.length} team${equipos.length === 1 ? '' : 's'}` : '', boton)}
      ${checkin && equipos.length ? '<div id="ci-mount" class="ci-mount"></div>' : ''}
      <div id="ci-teams" class="tc-eqs">${lista}</div>
      ${!editable && !conPartidos ? '' : conPartidos ? '<p class="tc-nota">Teams and lines are locked: the schedule is generated (no substitutes).</p>' : ''}
    </section>`;
  }

  /* Los cruces de una ronda: los 4 partidos de cada par de equipos. */
  function cruces(c) {
    const eqDe = new Map(c.lineas.map((l) => [Number(l.id), l]));
    const grupos = new Map();
    c.partidos.filter((m) => m.status !== 'bye').forEach((m) => {
      const a = eqDe.get(Number(m.team_a_id)), b = eqDe.get(Number(m.team_b_id));
      if (!a || !b) return;
      const k = `${m.round}:${Math.min(a.tc_team_id, b.tc_team_id)}:${Math.max(a.tc_team_id, b.tc_team_id)}`;
      if (!grupos.has(k)) grupos.set(k, { round: m.round, a: Number(a.tc_team_id), b: Number(b.tc_team_id), partidos: [] });
      grupos.get(k).partidos.push(m);
    });
    return [...grupos.values()].map((g) => ({ ...g, partidos: g.partidos.sort((x, y) => ORDEN[eqDe.get(Number(x.team_a_id)).tc_line] - ORDEN[eqDe.get(Number(y.team_a_id)).tc_line]) }));
  }

  function seccionPartidos(c, conPartidos) {
    const { cat, tournament, equipos } = c;
    const nombreEq = (id) => (equipos.find((e) => Number(e.id) === Number(id)) || {}).name || 'Team';
    const retirado = (id) => !!(equipos.find((e) => Number(e.id) === Number(id)) || {}).withdrawn_at;
    const eqDe = new Map(c.lineas.map((l) => [Number(l.id), l]));
    let accion = '';
    if (!conPartidos) {
      accion = tournament.status === 'draft'
        ? '<span class="tc-gris">Start the tournament first</span>'
        : equipos.length >= 3 && tournament.status === 'active'
          ? `<button type="button" class="tc-btn tc-btn-p" data-action="tcCalendario" data-cat="${Number(cat.id)}">Generate schedule</button>`
          : '<span class="tc-gris">Add at least 3 teams</span>';
    } else {
      const total = c.partidos.length, hechos = c.partidos.filter((m) => m.status === 'completed').length;
      accion = `<span class="tc-gris">${hechos} of ${total} matches reported</span>`;
    }
    if (!conPartidos) {
      return `<section class="tc-sec">${cabecera(2, 'Team matches', '', accion)}
        <div class="ac-mount" id="ac-mount-${Number(cat.id)}"></div>
        <p class="tc-vacio">Every team plays every other team once: 4 matches per pair of teams, line against line. With an odd number of teams, one team rests each round.</p></section>`;
    }
    const total = c.partidos.length, hechos = c.partidos.filter((m) => m.status === 'completed').length;
    const lista = cruces(c);
    const rondas = [...new Set(lista.map((x) => x.round))].sort((a, b) => a - b);
    const abierto = tournament.status !== 'completed';
    const html = rondas.map((r) => {
      const deRonda = lista.filter((x) => x.round === r);
      const juegan = new Set(deRonda.flatMap((x) => [x.a, x.b]));
      const descansa = equipos.filter((e) => !juegan.has(Number(e.id)));
      return `<div class="tc-ronda"><div class="tc-ronda-t">Round ${r}</div>
        ${deRonda.map((x) => {
          let pa = 0, pb = 0, ga = 0, gb = 0, faltan = 0;
          const filas = x.partidos.map((m) => {
            const la = eqDe.get(Number(m.team_a_id)), lb = eqDe.get(Number(m.team_b_id));
            const aEsX = Number(la.tc_team_id) === x.a;
            const [lx, ly] = aEsX ? [la, lb] : [lb, la];
            const [sx, sy] = aEsX ? [m.score_a, m.score_b] : [m.score_b, m.score_a];
            const hecho = m.status === 'completed';
            if (hecho) { pa += sx || 0; pb += sy || 0; if (Number(m.winner_id) === Number(lx.id)) ga++; else gb++; } else faltan++;
            const ffNombre = m.forfeit_team_id ? nombreEq((eqDe.get(Number(m.forfeit_team_id)) || {}).tc_team_id) : '';
            let estado = '';
            if (hecho && m.forfeit_team_id) {
              const puedeDeshacer = abierto && !m.tc_withdrawal && !retirado((eqDe.get(Number(m.forfeit_team_id)) || {}).tc_team_id);
              estado = `<span class="tc-chip tc-ff">FF · ${esc(ffNombre)}${m.tc_withdrawal ? ' (withdrawn)' : ''}</span>${puedeDeshacer ? ` <button type="button" class="tc-btn tc-btn-s" data-action="tcDeshacer" data-match="${Number(m.id)}">Undo</button>` : ''}`;
            } else if (hecho) {
              estado = abierto ? `<button type="button" class="tc-btn tc-btn-s" data-action="tcScore" data-match="${Number(m.id)}" data-a="${Number(m.team_a_id)}" data-b="${Number(m.team_b_id)}" data-cat="${Number(cat.id)}">Edit</button>` : '<span class="tc-chip tc-ok">Final</span>';
            } else if (abierto) {
              estado = `${m.called_at && m.court ? `<span class="tc-chip tc-ok">Court ${Number(m.court)} · now</span> ` : ''}<button type="button" class="tc-btn tc-btn-s" data-action="tcScore" data-match="${Number(m.id)}" data-a="${Number(m.team_a_id)}" data-b="${Number(m.team_b_id)}" data-cat="${Number(cat.id)}">Enter score</button>
                <button type="button" class="tc-btn tc-btn-s tc-btn-r" data-action="tcForfeit" data-match="${Number(m.id)}" data-a="${Number(m.team_a_id)}" data-b="${Number(m.team_b_id)}">Forfeit</button>`;
            }
            const gx = hecho && Number(m.winner_id) === Number(lx.id), gy = hecho && !gx;
            return `<tr><td><span class="tc-chip tc-${esc(lx.tc_line)}">${esc(CORTO[lx.tc_line])}</span></td>
              <td>${esc(corto(lx.player1_id))} &amp; ${esc(corto(lx.player2_id))} <span class="tc-vs">vs</span> ${esc(corto(ly.player1_id))} &amp; ${esc(corto(ly.player2_id))}</td>
              <td class="tc-sc">${hecho ? `<span class="${gx ? 'tc-g' : ''}">${Number(sx)}</span>–<span class="${gy ? 'tc-g' : ''}">${Number(sy)}</span>` : ''}</td>
              <td class="tc-est">${estado}</td></tr>`;
          }).join('');
          return `<div class="tc-cruce"><div class="tc-cruce-h"><b>${esc(nombreEq(x.a))} vs ${esc(nombreEq(x.b))}</b>
              <span>Points ${pa}–${pb} · Matches ${ga}–${gb}${faltan ? ` · ${faltan} to play` : ''}</span></div>
            <div class="tc-tabla-w"><table class="tc-t" aria-label="${esc(nombreEq(x.a))} vs ${esc(nombreEq(x.b))}, round ${Number(r)}">${filas}</table></div></div>`;
        }).join('')}
        ${descansa.length ? `<p class="tc-nota">${descansa.map((e) => esc(e.name)).join(', ')} rest${descansa.length === 1 ? 's' : ''} this round.</p>` : ''}
      </div>`;
    }).join('');
    return `<section class="tc-sec">${cabecera(2, 'Team matches', '', accion)}
      <div class="ac-mount" id="ac-mount-${Number(cat.id)}"></div>
      <div class="tc-prog"><i data-pct="${total ? Math.round((hechos / total) * 100) : 0}"></i></div>
      ${html}</section>`;
  }

  function seccionTabla(c) {
    const { tournament, tabla, avisos, equipos } = c;
    if (!tabla.length) return '';
    const todo = c.partidos.length > 0 && c.partidos.every((m) => m.status === 'completed');
    const podio = (tournament.status === 'completed' || todo) && tabla.length >= 3
      ? `<div class="tc-podio">${tabla.filter((t) => !t.withdrawn).slice(0, 3).map((t, i) => `<div class="tc-p${i + 1}"><small>${['Champion', '2nd Place', '3rd Place'][i]}</small><b>${esc(t.name)}</b></div>`).join('')}</div>` : '';
    const abiertos = tournament.status !== 'completed';
    return `<section class="tc-sec">${cabecera(3, 'Team standings', '', '')}
      ${avisos.map((a) => `<div class="tc-aviso" role="status">⚠ <b>${esc(a.team)}</b> forfeited ${esc(LARGO[a.line] || a.line)} in round ${Number(a.round)}. If ${esc(LARGO[a.line] || a.line)} forfeits again in its next match, the team is withdrawn.</div>`).join('')}
      ${podio}
      <div class="tc-tabla-w"><table class="tc-t tc-st">
        <thead><tr><th>#</th><th>Team</th><th>Pts</th><th>Diff</th><th>Matches</th><th title="Team matches won (for information only)">Ties</th></tr></thead>
        <tbody>${tabla.map((t) => `<tr${t.withdrawn ? ' class="tc-fuera"' : ''}><td>${Number(t.rank)}</td>
          <td>${esc(t.name)}${t.withdrawn ? ` <span class="tc-chip tc-ff">Withdrawn · ${esc(CORTO[t.withdrawn_line] || '')}</span>${abiertos ? ` <button type="button" class="tc-btn tc-btn-s" data-action="tcDeshacerRetiro" data-id="${Number(t.tc_team_id)}" data-nombre="${esc(t.name)}">Undo withdrawal</button>` : ''}` : ''}</td>
          <td>${Number(t.pts)}</td><td>${t.diff > 0 ? '+' : t.diff < 0 ? '−' : ''}${Math.abs(Number(t.diff))}</td>
          <td>${Number(t.won)}–${Number(t.lost)}</td><td>${Number(t.ties_won)}–${Number(t.ties_lost)}${t.ties_drawn ? `–${Number(t.ties_drawn)}` : ''}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="tc-nota">Pts = all points won by the team's 4 lines. Tie-break: difference, matches won, then the points between the tied teams. Ties (team matches won) is for information only.${equipos.some((e) => e.withdrawn_at) ? ' A withdrawn team keeps what it played and goes last.' : ''}</p>
    </section>`;
  }

  /* ═══ Acciones ═══ */
  async function formato(btn) {
    const quiere = btn.dataset.tc === '1';
    try {
      await rpc('admin_tc_formato', { p_category_id: Number(btn.dataset.cat), p_on: quiere });
      aviso(quiere ? 'This division is now a Team Challenge.' : 'This division is now a standard division.');
      if (window.switchCategory && window.tCurrentTournamentId) window.switchCategory(Number(btn.dataset.cat), window.tCurrentTournamentId);
    } catch (e) { aviso(mensaje(e), true); }
  }

  function opciones(g, elegido, usados) {
    const lista = jugadores().filter((p) => genero(p) === g && (!usados.has(Number(p.id)) || Number(p.id) === Number(elegido)))
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    return '<option value="">Choose…</option>' + lista.map((p) => `<option value="${Number(p.id)}"${Number(p.id) === Number(elegido) ? ' selected' : ''}>${esc(`${p.first_name} ${p.last_name}`)}</option>`).join('');
  }

  function abrirEquipo(btn) {
    if (!ctx) return;
    const id = btn.dataset.id ? Number(btn.dataset.id) : null;
    const eq = id ? ctx.equipos.find((e) => Number(e.id) === id) : null;
    const usados = new Set(ctx.equipos.filter((e) => Number(e.id) !== id).flatMap((e) => [e.m1_id, e.m2_id, e.w1_id, e.w2_id].map(Number)));
    (ctx.enOtras || new Set()).forEach((pid) => usados.add(pid));
    document.getElementById('t-modal-title').textContent = eq ? 'Edit team' : 'Add team';
    window.tSetModalSubtitle?.(`Team Challenge · ${ctx.cat.name}`);
    document.getElementById('t-modal-body').innerHTML = `<form class="tc-form" id="tc-form" novalidate>
      <label class="tc-l" for="tc-nombre">Team name *</label>
      <input class="t-new-input tc-in" id="tc-nombre" maxlength="40" autocomplete="off" value="${esc(eq ? eq.name : '')}">
      <div class="tc-4">
        <div><label class="tc-l" for="tc-m1">Men 1 *</label><select class="t-new-input tc-in" id="tc-m1">${opciones('m', eq && eq.m1_id, usados)}</select></div>
        <div><label class="tc-l" for="tc-w1">Women 1 *</label><select class="t-new-input tc-in" id="tc-w1">${opciones('f', eq && eq.w1_id, usados)}</select></div>
        <div><label class="tc-l" for="tc-m2">Men 2 *</label><select class="t-new-input tc-in" id="tc-m2">${opciones('m', eq && eq.m2_id, usados)}</select></div>
        <div><label class="tc-l" for="tc-w2">Women 2 *</label><select class="t-new-input tc-in" id="tc-w2">${opciones('f', eq && eq.w2_id, usados)}</select></div>
      </div>
      <div class="tc-prev"><div class="tc-prev-t">The 4 lines</div><div id="tc-prev"></div></div>
      <p class="tc-nota">Only players marked male or female in Players appear here. Players already in another team or division of this tournament are not listed. Lines lock when the schedule is generated.</p>
      <div class="tc-form-a"><button type="button" class="tc-btn" data-action="tcCerrar">Cancel</button>
        <button type="submit" class="tc-btn tc-btn-p" data-busy="Saving…">Save team</button></div>
    </form>`;
    const form = document.getElementById('tc-form');
    const prev = () => {
      const v = (k) => document.getElementById(`tc-${k}`).value;
      const n = (x) => (x ? corto(x) : '—');
      document.getElementById('tc-prev').innerHTML = [['md', v('m1'), v('m2')], ['wd', v('w1'), v('w2')], ['mx1', v('m1'), v('w1')], ['mx2', v('m2'), v('w2')]]
        .map(([l, a, b]) => `<div class="tc-prev-l"><span class="tc-chip tc-${l}">${esc(LARGO[l])}</span><span>${esc(n(a))} &amp; ${esc(n(b))}</span></div>`).join('');
    };
    form.addEventListener('change', prev);
    prev();
    const guardar = async () => {
      const v = (k) => document.getElementById(`tc-${k}`).value;
      try {
        await rpc('admin_tc_equipo_guardar', { p_category_id: ctx.cat.id, p_id: id, p_name: v('nombre'),
          p_m1: Number(v('m1')) || null, p_m2: Number(v('m2')) || null, p_w1: Number(v('w1')) || null, p_w2: Number(v('w2')) || null });
        cerrar();
        aviso(eq ? 'Team updated.' : 'Team added.');
        recargar();
      } catch (e) { aviso(mensaje(e), true); }
    };
    const alEnviar = (ev) => { ev.preventDefault(); return guardar(); };
    /* Un envío a la vez (doble clic o Enter mientras guarda: se ignora). */
    form.addEventListener('submit', window.FerociaBoton ? window.FerociaBoton.formulario(alEnviar) : alEnviar);
    window.openTModal?.();
    setTimeout(() => document.getElementById('tc-nombre')?.focus(), 60);
  }

  async function borrar(btn) {
    const ok = await confirmar({ title: 'Delete team?', message: `Delete "${btn.dataset.nombre}" and its 4 lines?`, okLabel: 'Delete', danger: true, focusCancel: true });
    if (!ok) return;
    try { await rpc('admin_tc_equipo_borrar', { p_id: Number(btn.dataset.id) }); aviso('Team deleted.'); recargar(); }
    catch (e) { aviso(mensaje(e), true); }
  }

  async function calendario(btn) {
    if (!ctx) return;
    const n = ctx.equipos.length;
    const rondas = n % 2 ? n : n - 1;
    const ok = await confirmar({ title: 'Generate the schedule?',
      message: `${n} teams · ${rondas} rounds · ${(n * (n - 1) / 2) * 4} matches. After this, teams and lines can't change (no substitutes).`,
      okLabel: 'Generate schedule' });
    if (!ok) return;
    try {
      const r = await rpc('admin_tc_calendario', { p_category_id: Number(btn.dataset.cat) });
      aviso(`Schedule generated: ${r.rounds} rounds, ${r.matches} matches.`);
      recargar();
    } catch (e) { aviso(mensaje(e), true); }
  }

  function score(btn) {
    window.openScoreModal?.('rr', Number(btn.dataset.match), Number(btn.dataset.a), Number(btn.dataset.b), Number(btn.dataset.cat));
  }

  /* Forfeit de UN partido: se elige qué equipo no juega. */
  function pedirForfeit(btn) {
    if (!ctx) return;
    const eqDe = new Map(ctx.lineas.map((l) => [Number(l.id), l]));
    const la = eqDe.get(Number(btn.dataset.a)), lb = eqDe.get(Number(btn.dataset.b));
    const nom = (l) => (ctx.equipos.find((e) => Number(e.id) === Number(l.tc_team_id)) || {}).name || 'Team';
    document.getElementById('t-modal-title').textContent = 'Record forfeit';
    window.tSetModalSubtitle?.(`${LARGO[la.tc_line]} · ${nom(la)} vs ${nom(lb)}`);
    document.getElementById('t-modal-body').innerHTML = `<div class="tc-ff-m">
      <p>Only this match: the other team wins ${tope(ctx.cat)}–0 (not reported to DUPR). If the same line forfeits its next match too, the whole team is withdrawn.</p>
      <p class="tc-ff-q">Which team forfeits?</p>
      <button type="button" class="tc-btn tc-btn-r tc-ancho" data-action="tcForfeitSi" data-match="${Number(btn.dataset.match)}" data-pair="${Number(la.id)}" data-busy="Saving…">${esc(nom(la))} forfeits</button>
      <button type="button" class="tc-btn tc-btn-r tc-ancho" data-action="tcForfeitSi" data-match="${Number(btn.dataset.match)}" data-pair="${Number(lb.id)}" data-busy="Saving…">${esc(nom(lb))} forfeits</button>
      <button type="button" class="tc-btn tc-ancho" data-action="tcCerrar">Cancel</button>
    </div>`;
    window.openTModal?.();
    setTimeout(() => document.querySelector('#t-modal-body [data-action="tcForfeitSi"]')?.focus(), 60);
  }

  async function forfeit(matchId, pairId) {
    try {
      const r = await rpc('admin_tc_forfeit', { p_match_id: matchId, p_pair: pairId });
      cerrar();
      aviso(r.withdrawn ? `${r.team} forfeited ${LARGO[r.line]} twice in a row: the team is withdrawn and its remaining matches are recorded as forfeits.` : 'Forfeit recorded.');
      recargar();
      return true;
    } catch (e) { aviso(mensaje(e), true); return false; }
  }

  async function deshacer(btn) {
    const ok = await confirmar({ title: 'Undo forfeit?', message: 'The match goes back to "to play" (with Auto Courts, it returns to the queue).', okLabel: 'Undo forfeit', focusCancel: true });
    if (!ok) return;
    try {
      const r = await rpc('admin_tc_forfeit_deshacer', { p_match_id: Number(btn.dataset.match) });
      aviso(r && r.still_forfeit ? 'The other team is withdrawn, so this match stays a forfeit (theirs now).' : 'Forfeit undone.');
      recargar();
    }
    catch (e) { aviso(mensaje(e), true); }
  }

  async function deshacerRetiro(btn) {
    const ok = await confirmar({ title: 'Undo withdrawal?',
      message: `${btn.dataset.nombre}'s matches that were recorded as forfeits when it withdrew go back to "to play". The two forfeits that caused it stay (undo them one by one if needed).`,
      okLabel: 'Undo withdrawal', focusCancel: true });
    if (!ok) return;
    try { await rpc('admin_tc_retiro_deshacer', { p_tc_team_id: Number(btn.dataset.id) }); aviso('Withdrawal undone.'); recargar(); }
    catch (e) { aviso(mensaje(e), true); }
  }

  window.CLICK_HANDLERS = window.CLICK_HANDLERS || {};
  Object.assign(window.CLICK_HANDLERS, {
    tcFormato: (b) => formato(b),
    tcEquipo: (b) => abrirEquipo(b),
    tcBorrar: (b) => borrar(b),
    tcCalendario: (b) => calendario(b),
    tcScore: (b) => score(b),
    tcForfeit: (b) => pedirForfeit(b),
    tcForfeitSi: (b) => forfeit(Number(b.dataset.match), Number(b.dataset.pair)),
    tcDeshacer: (b) => deshacer(b),
    tcDeshacerRetiro: (b) => deshacerRetiro(b),
    tcCerrar: () => cerrar(),
  });

  window.TeamChallenge = {
    esTC: (cat) => !!cat && cat.format === 'team_challenge',
    pintar,
    barraFormato,
    /* Desde el modal de score (la casilla de forfeit): sólo ese partido,
       nunca el retiro de la pareja entera (processForfeit). */
    forfeitDesdeScore: (matchId, pairId) => {
      const linea = ctx && ctx.lineas.find((l) => Number(l.id) === Number(pairId));
      const eq = linea && ctx.equipos.find((e) => Number(e.id) === Number(linea.tc_team_id));
      document.getElementById('t-modal-title').textContent = 'Record forfeit';
      window.tSetModalSubtitle?.(linea ? LARGO[linea.tc_line] : '');
      document.getElementById('t-modal-body').innerHTML = `<div class="tc-ff-m">
        <p><b>${esc(eq ? eq.name : 'This team')}</b> forfeits only this match: the other team wins ${ctx ? tope(ctx.cat) : 11}–0 (not reported to DUPR). If the same line forfeits its next match too, the whole team is withdrawn.</p>
        <button type="button" class="tc-btn tc-btn-r tc-ancho" data-action="tcForfeitSi" data-match="${Number(matchId)}" data-pair="${Number(pairId)}" data-busy="Saving…">Confirm forfeit</button>
        <button type="button" class="tc-btn tc-ancho" data-action="tcCerrar">Cancel</button>
      </div>`;
    },
  };
})();
