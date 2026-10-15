/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PLAYER SAFETY
   Matchmaking M-2a (15 de octubre) — decisiones §73, §74
   Pantalla aprobada en el diseño ("Admin panel — Player Safety").

   Los reportes que mandan los jugadores desde el portal (un juego o la
   tarjeta de un jugador). Tres pestañas:
     · Open: la lista a la izquierda y el reporte elegido a la derecha:
       quién reportó (el reportado NUNCA lo sabe), dónde, qué pasó, si
       también lo bloqueó y cuántos reportes más tiene. Con una nota
       (obligatoria) se decide:
         Resolve                   — sólo se anota.
         Warn player (email)       — un correo con las reglas de la
                                     comunidad (siempre sale, aunque
                                     haya apagado los correos de juegos).
         Suspend from matchmaking  — deja de ver y de aparecer en Play y
                                     en los juegos; sus juegos activos se
                                     cancelan (avisando a los demás). Lo
                                     demás del club no cambia.
     · Resolved: lo decidido, quién y cuándo.
     · Suspended players: con "Lift suspension" (también con nota).
   Todo queda en el registro del jugador (player_audit_log).
   El círculo rojo del menú cuenta los reportes abiertos.

   La seguridad está en la base (sql/97): cada función comprueba que
   quien llama es administradora activa. Si el SQL 97 no está, la
   pantalla lo dice y el resto del panel funciona igual.

   Depende de: db.js (esc, toast, confirmModal, window.supabase), app.js
   (AdminPageLoaders, CLICK_HANDLERS, app.authReady). Estilos:
   admin-pages.css (pc- de Player claims, pp-perf- y ps-).
   ============================================================ */

(function () {
  'use strict';

  const CADA = 3 * 60 * 1000;
  const sb = () => window.supabase;
  const esc = (x) => window.esc(x == null ? '' : String(x));
  const $ = (id) => document.getElementById(id);

  const MOTIVO = {
    no_show: "Didn't show up", rude: 'Rude or disrespectful', harassment: 'Harassment or unwanted contact',
    unsafe: 'Unsafe play', selling: 'Selling or promoting something', fake: 'Fake profile', other: 'Something else',
  };
  /* Los más serios, en rojo. */
  const GRAVES = ['harassment', 'unsafe', 'fake'];
  const ACCION = { resolved: ['Resolved', 'pc-pill-green'], warned: ['Warned', 'pc-pill-warn'], suspended: ['Suspended', 'pc-pill-red'] };
  const TIPO = { singles: 'Singles', doubles: 'Doubles', mixed: 'Mixed doubles', drill: 'Drill / practice' };

  let _tab = 'open';
  let _lista = [];
  let _sel = null;
  let _ocupada = false;
  let _vez = 0;

  const cuando = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const dia = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const donde = (r) => (r.game ? `${TIPO[r.game.kind] || 'Game'} · ${dia(r.game.plays_at)} · ${r.game.place}` : 'Player card');
  const pastillaMotivo = (m) => `<span class="pc-pill ${GRAVES.includes(m) ? 'pc-pill-red' : 'pc-pill-warn'}">${esc(MOTIVO[m] || m)}</span>`;

  const errorLegible = (err) => {
    const m = String((err && err.message) || err || '');
    if (/already_resolved/.test(m)) return 'Another admin already resolved this report. The list is refreshed.';
    if (/note_required/.test(m)) return 'Write a short note for the team first.';
    if (/not_found/.test(m)) return 'This no longer exists. The list is refreshed.';
    if (/not_authorized|permission denied/.test(m)) return 'Your admin access could not be confirmed. Sign in again.';
    if (/function .* does not exist|Could not find the function/i.test(m)) return 'Player Safety is not installed yet (SQL 97).';
    return 'Something went wrong. Please try again in a moment.';
  };

  // ── El círculo rojo ──────────────────────────────────────────
  let _vezCuenta = 0;
  async function contar() {
    if (!sb()) return;
    const mia = ++_vezCuenta;
    let n = 0;
    try {
      const { data, error } = await sb().rpc('admin_safety_pendientes');
      if (error) throw error;
      n = Number(data && data.open) || 0;
    } catch (err) {
      console.warn('[player-safety] no se pudo contar:', err?.message || err);
    }
    if (mia !== _vezCuenta) return;
    const t = n > 99 ? '99+' : String(n);
    ['ps-sb', 'ps-md', 'ps-n-open'].forEach((id) => { const el = $(id); if (el) { el.textContent = t; el.hidden = n === 0; } });
    const frase = n ? ` — ${n} open report${n === 1 ? '' : 's'}` : '';
    ['sb-player-safety', 'md-player-safety'].forEach((id) => { const b = $(id); if (b) b.setAttribute('aria-label', `Player Safety${frase}`); });
  }

  // ── Las pestañas ─────────────────────────────────────────────
  function marcarPestana() {
    document.querySelectorAll('#page-player-safety .pc-tab').forEach((b) => {
      const si = b.dataset.tab === _tab;
      b.classList.toggle('active', si);
      b.setAttribute('aria-selected', si ? 'true' : 'false');
    });
  }
  async function cargar() {
    marcarPestana();
    const caja = $('ps-body');
    const mia = ++_vez;
    caja.innerHTML = '<div class="loading">Loading...</div>';
    try {
      const { data, error } = await sb().rpc('admin_safety_reportes', { p_vista: _tab });
      if (error) throw error;
      if (mia !== _vez) return;
      _lista = Array.isArray(data) ? data : [];
      if (_tab === 'open') {
        if (!_lista.some((r) => r.id === _sel)) _sel = _lista.length ? _lista[0].id : null;
        pintarAbiertos();
      } else if (_tab === 'resolved') pintarResueltos();
      else pintarSuspendidos();
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[player-safety] no se pudo leer:', err);
      caja.innerHTML = `<div class="pc-vacio">${esc(errorLegible(err))}</div>`;
    }
  }

  // ── Open ─────────────────────────────────────────────────────
  function pintarAbiertos() {
    const caja = $('ps-body');
    if (!_lista.length) {
      caja.innerHTML = '<div class="pc-vacio pc-vacio-ok">No open reports. Reports players send from a game or a player card show up here.</div>';
      return;
    }
    const lista = _lista.map((r) => `
      <button type="button" class="pc-item${r.id === _sel ? ' active' : ''}" data-action="psSel" data-id="${esc(r.id)}" aria-pressed="${r.id === _sel}">
        <span class="pc-item-top"><span class="pc-item-name">${esc(r.reported.name)}</span><span class="pc-item-when">${esc(cuando(r.created_at))}</span></span>
        ${pastillaMotivo(r.reason)}
        <span class="ps-item-sub">Reported by ${esc(r.reporter.name)} · ${esc(r.game ? `${TIPO[r.game.kind] || 'Game'}, ${new Date(r.game.plays_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}` : 'Player card')}</span>
      </button>`).join('');
    caja.innerHTML = `<div class="pc-split"><div class="pc-list">${lista}</div><section class="pc-detail" id="ps-detail" aria-live="polite"></section></div>`;
    pintarDetalle();
  }

  const fila = (lbl, val) => `<div class="pp-perf-row"><span class="pp-perf-lbl">${esc(lbl)}</span><span class="ps-val">${val}</span></div>`;
  function pintarDetalle() {
    const caja = $('ps-detail');
    const r = _lista.find((x) => x.id === _sel);
    if (!caja || !r) return;
    const otros = Number(r.other_reports) || 0;
    caja.innerHTML = `
      <div class="pc-detail-head">
        <h2 class="pc-detail-name">${esc(r.reported.name)} — ${esc(MOTIVO[r.reason] || r.reason)}</h2>
        <span class="pc-detail-when">${esc(cuando(r.created_at))}</span>
      </div>
      ${r.reported.suspended ? '<div class="pc-detail-sub"><span class="pc-pill pc-pill-red">Already suspended from matchmaking</span></div>' : ''}
      <div class="ps-rows">
        ${fila('Reported by', `${esc(r.reporter.name)} <span class="ps-muted">(never shown to ${esc(r.reported.name.split(' ')[0])})</span>`)}
        ${fila('Where', esc(donde(r)))}
        ${fila('What happened', r.detail ? `<span class="ps-texto">${esc(r.detail)}</span>` : '<span class="ps-muted">No details</span>')}
        ${fila('Blocked by reporter', r.also_blocked ? 'Yes' : 'No')}
        ${fila(`Other reports about ${r.reported.name.split(' ')[0]}`, otros ? `<strong class="ps-alerta">${otros}</strong>` : '0')}
      </div>
      <label class="ps-nota"><span class="pc-sr">Note for the team</span>
        <textarea id="ps-nota" maxlength="1000" rows="3" placeholder="Note for the team (required). The player doesn't see it."></textarea></label>
      <div class="pc-botones">
        <button type="button" class="av-btn av-btn-pri" data-action="psResolver" data-accion="resolved">Resolve</button>
        <button type="button" class="av-btn av-btn-sec" data-action="psResolver" data-accion="warned">Warn player (email)</button>
        <button type="button" class="av-btn pc-btn-peligro" data-action="psResolver" data-accion="suspended"${r.reported.suspended ? ' disabled' : ''}>Suspend from matchmaking</button>
        <button type="button" class="av-btn av-btn-sec" data-action="showPage" data-page="player-profile" data-pid="${esc(r.reported.player_id)}">View player profile</button>
      </div>
      <p class="pc-pie">Warn sends an email with the community rules. Suspend removes the player from Play and games (their games are cancelled and the other players are told); ladders, tournaments and events don't change. Everything is saved in the player's history.</p>`;
  }

  async function resolver(accion) {
    if (_ocupada) return;
    const r = _lista.find((x) => x.id === _sel);
    if (!r) return;
    const nota = ($('ps-nota')?.value || '').trim();
    if (!nota) { window.toast('Write a short note for the team first.', true); $('ps-nota')?.focus(); return; }
    const nombre = r.reported.name;
    if (accion === 'warned' && !(await window.confirmModal({ title: `Warn ${nombre}?`, message: `${nombre.split(' ')[0]} gets an email reminding them of the community rules. They are not told who reported.`, okLabel: 'Send warning' }))) return;
    if (accion === 'suspended' && !(await window.confirmModal({ title: `Suspend ${nombre} from matchmaking?`, message: `${nombre.split(' ')[0]} won't see or appear in Play and games, their active games are cancelled (the players are told), and they get an email. You can lift it later.`, okLabel: 'Suspend', danger: true }))) return;
    _ocupada = true;
    try {
      const { error } = await sb().rpc('admin_safety_resolver', { p_id: r.id, p_action: accion, p_note: nota });
      if (error) throw error;
      window.toast({ resolved: 'Report resolved.', warned: 'Warning sent. Report resolved.', suspended: `${nombre} is suspended from matchmaking.` }[accion]);
      _sel = null;
    } catch (err) {
      window.toast(errorLegible(err), true);
    } finally {
      _ocupada = false;
    }
    await cargar();
    contar();
  }

  // ── Resolved ─────────────────────────────────────────────────
  function pintarResueltos() {
    if (!_lista.length) { $('ps-body').innerHTML = '<div class="pc-vacio">No resolved reports yet.</div>'; return; }
    const filas = _lista.map((r) => {
      const [txt, cls] = ACCION[r.action] || ['Resolved', 'pc-pill-green'];
      return `<tr>
        <td><strong>${esc(r.reported.name)}</strong><span class="pc-sub">Reported by ${esc(r.reporter.name)}</span></td>
        <td>${pastillaMotivo(r.reason)}<span class="pc-sub">${esc(donde(r))}</span></td>
        <td><span class="pc-pill ${cls}">${esc(txt)}</span></td>
        <td>${esc(r.resolved_at ? cuando(r.resolved_at) : '')}<span class="pc-sub">${esc(r.by ? `by ${r.by}` : '')}</span></td>
        <td class="pc-td-nota">${esc(r.admin_note || '')}</td>
      </tr>`;
    }).join('');
    $('ps-body').innerHTML = `<div class="card pc-card"><div class="pc-tabla-wrap"><table class="pc-tabla pc-tabla-res">
      <thead><tr><th scope="col">Player</th><th scope="col">Report</th><th scope="col">Decision</th><th scope="col">When</th><th scope="col">Note</th></tr></thead>
      <tbody>${filas}</tbody></table></div></div>`;
  }

  // ── Suspended players ────────────────────────────────────────
  function pintarSuspendidos() {
    if (!_lista.length) { $('ps-body').innerHTML = '<div class="pc-vacio pc-vacio-ok">Nobody is suspended from matchmaking.</div>'; return; }
    $('ps-body').innerHTML = `<div class="pc-msgs">${_lista.map((s) => `
      <article class="pc-msg">
        <div class="pc-msg-top"><strong class="pc-msg-who">${esc(s.name)}</strong><span class="pc-pill pc-pill-red">Suspended</span>
          <span class="pc-item-when">Since ${esc(cuando(s.since))}${s.by ? ` · by ${esc(s.by)}` : ''}</span></div>
        ${s.note ? `<div class="ps-texto">${esc(s.note)}</div>` : ''}
        <label class="ps-nota"><span class="pc-sr">Note to lift the suspension</span>
          <textarea id="ps-lift-${esc(s.player_id)}" maxlength="1000" rows="2" placeholder="Why it is lifted (required)"></textarea></label>
        <div class="pc-botones">
          <button type="button" class="av-btn av-btn-sec" data-action="psLevantar" data-pid="${esc(s.player_id)}">Lift suspension</button>
          <button type="button" class="av-btn av-btn-sec" data-action="showPage" data-page="player-profile" data-pid="${esc(s.player_id)}">View player profile</button>
        </div>
      </article>`).join('')}</div>`;
  }
  async function levantar(pid) {
    if (_ocupada) return;
    const nota = ($(`ps-lift-${pid}`)?.value || '').trim();
    if (!nota) { window.toast('Write why the suspension is lifted first.', true); $(`ps-lift-${pid}`)?.focus(); return; }
    _ocupada = true;
    try {
      const { error } = await sb().rpc('admin_safety_levantar', { p_player: Number(pid), p_note: nota });
      if (error) throw error;
      window.toast('Suspension lifted. The player is back in Play.');
    } catch (err) {
      window.toast(errorLegible(err), true);
    } finally {
      _ocupada = false;
    }
    await cargar();
  }

  // ── Arranque ─────────────────────────────────────────────────
  window.AdminPageLoaders.playerSafety = () => { cargar(); contar(); };
  Object.assign(window.CLICK_HANDLERS, {
    psTab: (btn) => { _tab = btn.dataset.tab; cargar(); },
    psSel: (btn) => { _sel = Number(btn.dataset.id); pintarAbiertos(); },
    psResolver: (btn) => resolver(btn.dataset.accion),
    psLevantar: (btn) => levantar(btn.dataset.pid),
  });

  const empezar = () => {
    contar();
    setInterval(() => { if (document.visibilityState === 'visible') contar(); }, CADA);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') contar(); });
  };
  if (window.app && window.app.authReady) window.app.authReady.then(empezar);
})();
