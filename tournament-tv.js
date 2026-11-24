/* ============================================================
   FEROCIA — MODO TV de las canchas en vivo (§121, aprobado 7A) · 23 nov 2026
   tournament-tv.html?t=<id en base64> (el mismo código que la página de
   resultados). Para una TV, tablet o laptop junto a las canchas:
     · las canchas de cada categoría y "Up next — get ready";
     · se actualiza sola cada 15 segundos;
     · si no caben todas las categorías, va pasando de dos en dos cada 20 s;
     · intenta que la pantalla no se apague (Wake Lock) y tiene "Full screen".
   Usa sólo lo público: tournament_live_courts (SQL 131/139/141) y los
   nombres de public_players, igual que la página de resultados.
   ============================================================ */
(function () {
  'use strict';

  const REFRESCO_MS = 15000;
  const ROTAR_MS = 20000;
  const POR_PAGINA = 2;

  const cuerpo = document.getElementById('tv-cuerpo');
  if (!cuerpo || !window.supabase || typeof window.api !== 'function') return;

  let torneoId;
  try { torneoId = parseInt(atob(new URLSearchParams(location.search).get('t') || ''), 10); } catch (_) { torneoId = 0; }

  const categorias = {};
  /* §122 (SQL 142): la ronda del bracket, en palabras. */
  const RONDA = { Final: 'Final', '3rd Place': '3rd place', Semifinals: 'Semifinal', QF: 'Quarterfinal', R16: 'Round of 16', R32: 'Round of 32' };
  const ronda = (r) => (r ? (RONDA[r] || String(r)) : '');
  const equipos = {};
  const jugadores = {};
  let vivo = [];
  let pagina = 0;

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }
  const idsDe = (t) => [t.player1_id, t.player2_id, t.player3_id, t.player4_id].filter(Boolean);
  function nombre(id) {
    const t = equipos[id];
    if (!t) return '';
    const n = idsDe(t).map((p) => jugadores[p] && `${jugadores[p].first_name} ${jugadores[p].last_name}`).filter(Boolean);
    return n.length ? n.join(' & ') : (t.name || '');
  }

  function vacio(texto) {
    cuerpo.style.removeProperty('--cats');
    cuerpo.replaceChildren(el('div', 'tv-vacio', texto));
    document.getElementById('tv-pagina').textContent = '';
  }

  async function cargarNombres() {
    const faltan = new Set();
    vivo.forEach((c) => {
      c.courts.forEach((x) => { if (x.team_a_id) { faltan.add(x.team_a_id); faltan.add(x.team_b_id); } });
      c.next.forEach((x) => { faltan.add(x.team_a_id); faltan.add(x.team_b_id); });
    });
    if (vivo.some((c) => !categorias[c.category_id])) {
      const cats = await window.api(`tournament_categories?tournament_id=eq.${torneoId}&select=id,name`);
      cats.forEach((c) => { categorias[c.id] = c.name; });
    }
    const nuevos = [...faltan].filter((id) => id && !equipos[id]);
    if (!nuevos.length) return;
    const filas = await window.api(`tournament_teams?id=in.(${nuevos.join(',')})&select=*`);
    filas.forEach((t) => { equipos[t.id] = t; });
    const pids = [...new Set(filas.flatMap(idsDe))].filter((p) => !jugadores[p]);
    if (pids.length) {
      try {
        const ps = await window.api(`public_players?id=in.(${pids.join(',')})&select=id,first_name,last_name`);
        ps.forEach((p) => { jugadores[p.id] = p; });
      } catch (_) { /* sin nombres: el nombre de la pareja */ }
    }
  }

  function pintar() {
    if (!vivo.length) { vacio('Live courts will appear here when matches are called.'); return; }
    const paginas = Math.ceil(vivo.length / POR_PAGINA);
    if (pagina >= paginas) pagina = 0;
    const visibles = vivo.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA);
    cuerpo.style.setProperty('--cats', String(visibles.length));
    const partes = [];
    for (const c of visibles) {
      const col = el('div', 'tv-cat');
      col.append(el('h2', null, `${categorias[c.category_id] || ''}${c.phase === 'bracket' ? ' · Finals' : ''}`));
      if (c.paused) col.append(el('div', 'tv-pausa', 'Courts paused — matches will resume shortly.'));
      for (const x of c.courts) {
        const fila = el('div', x.team_a_id ? 'tv-c' : 'tv-c libre');
        const n = el('div', 'tv-cn');
        n.append(el('small', null, 'COURT'), document.createTextNode(String(x.court)));
        const eq = el('div', 'tv-eq');
        if (x.team_a_id) {
          if (x.round) eq.append(el('span', 'tv-ronda', ronda(x.round)), el('br'));
          eq.append(document.createTextNode(nombre(x.team_a_id)), el('br'),
            el('span', 'vs', 'vs '), document.createTextNode(nombre(x.team_b_id)));
        } else {
          eq.textContent = c.paused ? 'Paused' : 'Getting ready…';
        }
        fila.append(n, eq);
        col.append(fila);
      }
      partes.push(col);
    }
    const sig = el('div', 'tv-next');
    sig.append(el('h2', null, 'UP NEXT — GET READY'));
    let hay = false;
    for (const c of visibles) {
      for (const x of c.next) {
        const it = el('div', 'tv-it');
        it.append(el('span', null, `${categorias[c.category_id] || ''}${x.round ? ` · ${ronda(x.round)}` : ''}`), document.createTextNode(`${nombre(x.team_a_id)} vs ${nombre(x.team_b_id)}`));
        sig.append(it);
        hay = true;
      }
    }
    if (!hay) sig.append(el('div', 'tv-it', 'No matches waiting.'));
    partes.push(sig);
    cuerpo.replaceChildren(...partes);
    document.getElementById('tv-pagina').textContent = paginas > 1 ? `${pagina + 1} / ${paginas}` : 'Updates every 15 seconds';
  }

  async function actualizar() {
    try {
      const { data, error } = await window.supabase.rpc('tournament_live_courts', { p_tournament_id: torneoId });
      if (error) throw error;
      vivo = Array.isArray(data) ? data : [];
      await cargarNombres();
      pintar();
    } catch (_) {
      if (!vivo.length) vacio('Live courts are not available right now. Retrying…');
    }
    document.getElementById('tv-hora').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  async function nombreDelTorneo() {
    try {
      const [t] = await window.api(`tournaments?id=eq.${torneoId}&select=name`);
      if (t) { document.getElementById('tv-torneo').textContent = t.name; document.title = `${t.name} — Live Courts`; }
    } catch (_) { /* sin nombre: sigue igual */ }
  }

  /* Que la pantalla no se apague (si el navegador lo permite). */
  let bloqueo = null;
  async function noApagar() {
    try { if ('wakeLock' in navigator && !bloqueo) { bloqueo = await navigator.wakeLock.request('screen'); bloqueo.addEventListener('release', () => { bloqueo = null; }); } }
    catch (_) { /* no disponible: no pasa nada */ }
  }

  document.getElementById('tv-pantalla').addEventListener('click', () => {
    const d = document.documentElement;
    if (d.requestFullscreen) d.requestFullscreen().catch(() => {});
    noApagar();
  });

  if (!torneoId) { vacio('This link is not complete. Copy the TV link again from the panel (Share).'); return; }
  nombreDelTorneo();
  actualizar();
  noApagar();
  setInterval(actualizar, REFRESCO_MS);
  setInterval(() => { if (vivo.length > POR_PAGINA) { pagina += 1; pintar(); } }, ROTAR_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { actualizar(); noApagar(); } });
})();
