/* ============================================================
   FEROCIA — LIVE COURTS en la página pública del torneo
   §116 (SQL 131, decisión 6B) · 5 de noviembre de 2026

   Arriba de los resultados: quién juega en cada cancha ahora y quién va
   después ("Up next — get ready"). Sin cuenta; para una TV o el celular.
   Se actualiza sola cada 15 segundos.

   Sólo enseña lo que la página ya enseña hoy: los nombres de las parejas
   (de public_players, igual que el resto de la página) y los números de
   cancha. No dice qué cancha está "out" ni quién "no está".
   Si el torneo no usa Auto Courts (o el SQL 131 no está), no aparece.
   ============================================================ */
(function () {
  'use strict';

  const REFRESCO_MS = 15000;
  const caja = document.getElementById('t-live');
  if (!caja || !window.supabase || typeof window.api !== 'function') return;

  let torneoId;
  try { torneoId = parseInt(atob(new URLSearchParams(location.search).get('t') || ''), 10); } catch (_) { return; }
  if (!torneoId) return;

  let categorias = {};   // id → nombre
  let equipos = {};      // id → fila de tournament_teams
  let jugadores = {};    // id → { first_name, last_name }

  /* Elementos con textContent: nada de HTML que venga de los datos. */
  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }
  const idsDe = (t) => [t.player1_id, t.player2_id, t.player3_id, t.player4_id].filter(Boolean);
  function nombreLargo(id) {
    const t = equipos[id];
    if (!t) return '';
    const n = idsDe(t).map((p) => jugadores[p] && `${jugadores[p].first_name} ${jugadores[p].last_name}`).filter(Boolean);
    return n.length ? n.join(' & ') : (t.name || '');
  }
  function nombreCorto(id) {
    const t = equipos[id];
    if (!t) return '';
    const n = idsDe(t).map((p) => jugadores[p] && jugadores[p].first_name).filter(Boolean);
    return n.length ? n.join(' & ') : (t.name || '');
  }

  async function cargarNombres(vivo) {
    const faltan = new Set();
    vivo.forEach((c) => {
      c.courts.forEach((x) => { if (x.team_a_id) { faltan.add(x.team_a_id); faltan.add(x.team_b_id); } });
      c.next.forEach((x) => { faltan.add(x.team_a_id); faltan.add(x.team_b_id); });
    });
    const nuevos = [...faltan].filter((id) => !equipos[id]);
    const sinCategoria = vivo.some((c) => !categorias[c.category_id]);
    if (sinCategoria) {
      const cats = await window.api(`tournament_categories?tournament_id=eq.${torneoId}&select=id,name`);
      cats.forEach((c) => { categorias[c.id] = c.name; });
    }
    if (!nuevos.length) return;
    const filas = await window.api(`tournament_teams?id=in.(${nuevos.join(',')})&select=*`);
    filas.forEach((t) => { equipos[t.id] = t; });
    const pids = [...new Set(filas.flatMap(idsDe))].filter((p) => !jugadores[p]);
    if (pids.length) {
      try {
        const ps = await window.api(`public_players?id=in.(${pids.join(',')})&select=id,first_name,last_name`);
        ps.forEach((p) => { jugadores[p.id] = p; });
      } catch (_) { /* sin nombres: se enseña el nombre de la pareja */ }
    }
  }

  function pintar(vivo) {
    caja.replaceChildren();
    if (!vivo.length) { caja.hidden = true; return; }
    const tarjeta = el('div', 'tl-card');
    const cab = el('div', 'tl-head');
    cab.append(el('h2', 'tl-title', 'Live courts'));
    const live = el('span', 'tl-live');
    live.append(el('i', 'tl-dot'), document.createTextNode('LIVE'));
    cab.append(live);
    tarjeta.append(cab);

    for (const c of vivo) {
      tarjeta.append(el('div', 'tl-cat', categorias[c.category_id] || ''));
      const grid = el('div', 'tl-grid');
      for (const x of c.courts) {
        const pc = el('div', x.team_a_id ? 'tl-court' : 'tl-court tl-court-free');
        pc.append(el('div', 'tl-n', `COURT ${x.court}`));
        if (x.team_a_id) {
          pc.append(el('div', 'tl-team', nombreLargo(x.team_a_id)), el('div', 'tl-vs', 'vs'), el('div', 'tl-team', nombreLargo(x.team_b_id)));
        } else {
          pc.append(el('div', 'tl-team tl-wait', 'Getting ready…'));
        }
        grid.append(pc);
      }
      tarjeta.append(grid);
      if (c.next.length) {
        tarjeta.append(el('div', 'tl-cat tl-next-lbl', 'Up next — get ready'));
        const lista = el('div', 'tl-next');
        c.next.forEach((x) => lista.append(el('span', 'tl-chip', `${nombreCorto(x.team_a_id)} vs ${nombreCorto(x.team_b_id)}`)));
        tarjeta.append(lista);
      }
    }
    tarjeta.append(el('div', 'tl-upd',
      `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · refreshes every 15 seconds`));
    caja.append(tarjeta);
    caja.hidden = false;
  }

  async function actualizar() {
    try {
      const { data, error } = await window.supabase.rpc('tournament_live_courts', { p_tournament_id: torneoId });
      if (error) throw error;
      const vivo = Array.isArray(data) ? data : [];
      await cargarNombres(vivo);
      pintar(vivo);
    } catch (_) {
      caja.hidden = true;   // sin SQL 131 o sin conexión: la página sigue como siempre
    }
  }

  actualizar();
  setInterval(() => { if (document.visibilityState === 'visible') actualizar(); }, REFRESCO_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') actualizar(); });
})();
