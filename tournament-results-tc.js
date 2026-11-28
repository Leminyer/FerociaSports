/* ============================================================
   FEROCIA — TEAM CHALLENGE en la página pública del torneo (§132, SQL 150)
   27 nov 2026 · tournament-results.html?t=<id en base64>

   Una división "team_challenge" no tiene parejas sueltas ni bracket: tiene
   equipos (2 hombres + 2 mujeres, 4 líneas). Aquí se pinta:
     · la tabla de equipos (tc_tabla: puntos de sus 4 líneas, diferencia,
       partidos ganados; los cruces ganados sólo informan);
     · el podio cuando ya se jugó todo;
     · los cruces de cada ronda con sus 4 partidos.
   Sólo lo público: tournament_tc_teams (lectura), tc_tabla y lo que la
   página ya carga. Todo el texto de los datos pasa por esc().
   ============================================================ */
(function () {
  'use strict';

  const LARGO = { md: "Men's doubles", wd: "Women's doubles", mx1: 'Mixed line 1', mx2: 'Mixed line 2' };
  const ORDEN = { md: 1, wd: 2, mx1: 3, mx2: 4 };
  const datos = { equipos: {}, tablas: {} };   // por división

  const esTC = (cat) => !!cat && cat.format === 'team_challenge';

  /* Carga los equipos y la tabla de las divisiones Team Challenge. Si el
     SQL 150 no está, no pasa nada: la página sigue como siempre. */
  async function cargar(categorias) {
    const tc = (categorias || []).filter(esTC);
    if (!tc.length) return;
    try {
      const ids = tc.map((c) => Number(c.id)).join(',');
      const [equipos, ...tablas] = await Promise.all([
        window.api(`tournament_tc_teams?category_id=in.(${ids})&select=*&order=id`),
        ...tc.map((c) => window.supabase.rpc('tc_tabla', { p_category_id: c.id })),
      ]);
      tc.forEach((c, i) => {
        datos.equipos[c.id] = equipos.filter((e) => e.category_id === c.id);
        datos.tablas[c.id] = (tablas[i] && !tablas[i].error && Array.isArray(tablas[i].data)) ? tablas[i].data : [];
      });
    } catch (_) { /* sin SQL 150: se queda vacío */ }
  }

  const cuantos = (catId) => (datos.equipos[catId] || []).length;

  function pintar(cat, lineas, partidos, ayudas) {
    const { esc, nombres, estado } = ayudas;
    const equipos = datos.equipos[cat.id] || [];
    const tabla = datos.tablas[cat.id] || [];
    const eqDe = new Map(lineas.map((l) => [l.id, l]));
    const nomEq = (id) => (equipos.find((e) => e.id === id) || {}).name || 'Team';
    const reales = partidos.filter((m) => m.status !== 'bye');
    const hechos = reales.filter((m) => m.status === 'completed').length;
    const todo = reales.length > 0 && hechos === reales.length;
    const lider = tabla.find((t) => !t.withdrawn);
    let html = '<div class="stats-grid tc-pub-stats">'
      + `<div class="stat sb"><div class="stat-label">Teams</div><div class="stat-value">${equipos.length}</div><div class="stat-ctx tc-c-azul">Team Challenge</div></div>`
      + `<div class="stat st"><div class="stat-label">Matches</div><div class="stat-value">${hechos}</div><div class="stat-ctx tc-c-verde">${reales.length ? `${hechos} of ${reales.length} played` : 'No schedule yet'}</div></div>`
      + `<div class="stat sg"><div class="stat-label">Leader</div>${lider && lider.pts > 0
        ? `<div class="stat-value tc-lider">${esc(lider.name)}</div><div class="stat-ctx tc-c-oro">${Number(lider.pts)} pts · ${lider.diff > 0 ? '+' : ''}${Number(lider.diff)} diff</div>`
        : '<div class="stat-value tc-lider">—</div><div class="stat-ctx tc-c-oro">No scores yet</div>'}</div>`
      + '</div>' + estado;

    html += '<div class="tc-pub-reglas">🏆 <b>Team Challenge</b> · Each team: 2 men + 2 women, 4 lines (Men\'s doubles, Women\'s doubles, Mixed line 1, Mixed line 2). Every match point counts for the team.</div>';

    if (todo && tabla.length >= 3) {
      const top = tabla.filter((t) => !t.withdrawn).slice(0, 3);
      html += '<div class="phase-lbl">🏆 Final Results</div><div class="card"><div class="tc-pub-podio">'
        + top.map((t, i) => `<div class="tc-pub-p tc-pub-p${i + 1}"><small>${['Champion', '2nd Place', '3rd Place'][i]}</small><b>${esc(t.name)}</b><span>${Number(t.pts)} pts</span></div>`).join('')
        + '</div></div>';
    }

    if (tabla.length) {
      html += '<div class="phase-lbl">Team Standings</div><div class="card"><div class="tc-pub-scroll"><table><thead><tr><th>#</th><th>Team</th><th>Pts</th><th>Diff</th><th>Matches</th><th>Ties</th></tr></thead><tbody>'
        + tabla.map((t, i) => {
          const rc = t.withdrawn ? '' : i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
          return `<tr${t.withdrawn ? ' class="tc-pub-fuera"' : ''}><td><span class="rank-badge ${rc}">${Number(t.rank)}</span></td>`
            + `<td class="tc-pub-nom">${esc(t.name)}${t.withdrawn ? ' <span class="tc-pub-ff">Withdrawn</span>' : ''}</td>`
            + `<td class="tc-pub-pts">${Number(t.pts)}</td><td class="${t.diff >= 0 ? 'tc-c-verde' : 'tc-c-nar'}">${t.diff > 0 ? '+' : ''}${Number(t.diff)}</td>`
            + `<td>${Number(t.won)}–${Number(t.lost)}</td><td>${Number(t.ties_won)}–${Number(t.ties_lost)}${t.ties_drawn ? `–${Number(t.ties_drawn)}` : ''}</td></tr>`;
        }).join('')
        + '</tbody></table></div><p class="tc-pub-nota">Pts = all points won by the team\'s 4 lines. Tie-break: point difference, matches won, then points between the tied teams. Ties = team matches won (for information only).</p></div>';
    }

    /* Los cruces: por ronda, los 4 partidos de cada par de equipos. */
    const grupos = new Map();
    reales.forEach((m) => {
      const a = eqDe.get(m.team_a_id), b = eqDe.get(m.team_b_id);
      if (!a || !b || !a.tc_team_id || !b.tc_team_id) return;
      const x = Math.min(a.tc_team_id, b.tc_team_id), y = Math.max(a.tc_team_id, b.tc_team_id);
      const k = `${m.round}:${x}:${y}`;
      if (!grupos.has(k)) grupos.set(k, { round: m.round, a: x, b: y, partidos: [] });
      grupos.get(k).partidos.push(m);
    });
    const lista = [...grupos.values()];
    const rondas = [...new Set(lista.map((g) => g.round))].sort((p, q) => p - q);
    if (rondas.length) {
      html += '<div class="phase-lbl">Team Matches</div><div class="card">';
      rondas.forEach((r) => {
        html += `<div class="round-lbl">Round ${Number(r)}</div>`;
        lista.filter((g) => g.round === r).forEach((g) => {
          let pa = 0, pb = 0;
          const filas = g.partidos
            .sort((p, q) => ORDEN[eqDe.get(p.team_a_id).tc_line] - ORDEN[eqDe.get(q.team_a_id).tc_line])
            .map((m) => {
              const la = eqDe.get(m.team_a_id);
              const aEsA = la.tc_team_id === g.a;
              const [lx, ly] = aEsA ? [la, eqDe.get(m.team_b_id)] : [eqDe.get(m.team_b_id), la];
              const [sx, sy] = aEsA ? [m.score_a, m.score_b] : [m.score_b, m.score_a];
              const hecho = m.status === 'completed';
              if (hecho) { pa += Number(sx) || 0; pb += Number(sy) || 0; }
              const gx = hecho && m.winner_id === lx.id, gy = hecho && m.winner_id === ly.id;
              const ff = m.forfeit_team_id ? ' <span class="tc-pub-ff">FF</span>' : '';
              return `<tr><td><span class="tc-pub-l tc-pub-${esc(lx.tc_line)}">${esc(LARGO[lx.tc_line] || '')}</span></td>`
                + `<td class="${gx ? 'tc-pub-g' : ''}">${esc(nombres(lx))}</td>`
                + `<td class="tc-pub-sc">${hecho ? `<span class="${gx ? 'tc-pub-g' : ''}">${Number(sx)}</span>–<span class="${gy ? 'tc-pub-g' : ''}">${Number(sy)}</span>${ff}` : '<span class="tc-pub-pend">To play</span>'}</td>`
                + `<td class="${gy ? 'tc-pub-g' : ''}">${esc(nombres(ly))}</td></tr>`;
            }).join('');
          html += `<div class="tc-pub-cruce"><div class="tc-pub-cruce-h"><b>${esc(nomEq(g.a))}</b><span>${pa}–${pb}</span><b>${esc(nomEq(g.b))}</b></div>`
            + `<div class="tc-pub-scroll"><table class="tc-pub-t" aria-label="${esc(nomEq(g.a))} vs ${esc(nomEq(g.b))}, round ${Number(r)}">${filas}</table></div></div>`;
        });
        const juegan = new Set(lista.filter((g) => g.round === r).flatMap((g) => [g.a, g.b]));
        const descansa = equipos.filter((e) => !juegan.has(e.id));
        if (descansa.length) html += `<p class="tc-pub-nota">${descansa.map((e) => esc(e.name)).join(', ')} rest${descansa.length === 1 ? 's' : ''} this round.</p>`;
      });
      html += '</div>';
    } else if (equipos.length) {
      html += '<div class="phase-lbl">Registered Teams</div><div class="teams-grid">'
        + equipos.map((e, i) => `<div class="team-card"><div class="team-seed${i < 3 ? ` s${i + 1}` : ''}">${i + 1}</div><div><div class="team-name">${esc(e.name)}</div><div class="team-players">${esc(ayudas.jugadores([e.m1_id, e.m2_id, e.w1_id, e.w2_id]))}</div></div></div>`).join('')
        + '</div>';
    }
    if (!equipos.length) html += '<div class="empty">No teams yet for this division.</div>';
    return html;
  }

  window.ResultadosTC = { esTC, cargar, cuantos, pintar };
})();
