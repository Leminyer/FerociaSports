/* ============================================================
   FEROCIA — CHECK-IN DEL TORNEO EN EL PANEL (§121, SQL 141) · 23 nov 2026
   En "Team Registration", cada jugador es un botón: un toque marca que
   llegó (o lo desmarca). La pareja está "Ready" cuando llegaron todos.
   Arriba, cuántos llegaron y "Check in everyone".
   Con Auto Courts, un partido con alguien sin check-in no se llama; al
   marcarlo, la base llama el partido sola.
   Lo que el jugador marca desde el portal aparece aquí al recargar.
   ============================================================ */
(function () {
  'use strict';

  const rpc = async (fn, args) => {
    const { data, error } = await window.supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
    if (data && data.error) throw new Error(data.error);
    return data;
  };
  const aviso = (msg, err) => (window.tToast ? window.tToast(msg, err) : null);
  const confirmar = (opts) => (window.app?.confirmModal || window.confirmModal || (() => Promise.resolve(false)))(opts);
  const mensaje = (e) => {
    const t = String(e && e.message || e);
    if (/not_authorized/.test(t)) return 'Your session is not an active admin. Sign in again.';
    if (/tournament_completed/.test(t)) return 'This tournament is completed.';
    if (/not_in_tournament/.test(t)) return 'That player is not in this tournament any more. Reload the page.';
    if (/Could not find the function|PGRST202/.test(t)) return 'Check-in needs the latest update (SQL 141).';
    return `Check-in error: ${t}`;
  };

  let ctx = null;            // { mount, lista, tournament, llegaron:Set, ocupado }

  async function montar(mount, { tournament }) {
    const lista = document.getElementById('ci-teams');
    if (!mount || !lista) return;
    ctx = { mount, lista, tournament, llegaron: new Set(), ocupado: false };
    mount.innerHTML = '<div class="ci-resumen"><span class="ci-leyendo">Loading check-in…</span></div>';
    lista.addEventListener('click', alTocar);
    mount.addEventListener('click', alTocar);
    try {
      const filas = await rpc('admin_torneo_checkins', { p_tournament_id: tournament.id });
      if (!ctx || ctx.mount !== mount) return;
      ctx.llegaron = new Set((filas || []).map((f) => Number(f.player_id)));
      pintar();
    } catch (e) {
      mount.innerHTML = '';
      const p = document.createElement('div');
      p.className = 'ci-resumen ci-error';
      p.textContent = mensaje(e);
      mount.append(p);
    }
  }

  function jugadoresDeLaCategoria() {
    return [...new Set([...ctx.lista.querySelectorAll('[data-ci-player]')].map((b) => Number(b.dataset.ciPlayer)))];
  }

  function pintar() {
    const { lista, mount, llegaron } = ctx;
    lista.querySelectorAll('[data-ci-player]').forEach((b) => {
      const si = llegaron.has(Number(b.dataset.ciPlayer));
      b.classList.toggle('si', si);
      b.setAttribute('aria-pressed', String(si));
      b.title = si ? 'Checked in — tap to undo' : 'Tap when this player arrives';
    });
    let listas = 0;
    const equipos = lista.querySelectorAll('[data-ci-team]');
    equipos.forEach((e) => {
      const ids = e.dataset.ciPlayers ? e.dataset.ciPlayers.split(',').map(Number) : [];
      const faltan = ids.filter((id) => !llegaron.has(id));
      e.className = 'ci-estado';
      if (!faltan.length) { e.classList.add('ok'); e.textContent = '✓ Ready'; listas++; return; }
      if (faltan.length === ids.length) { e.classList.add('no'); e.textContent = 'Not here yet'; return; }
      e.classList.add('medio');
      const nombres = faltan.map((id) => {
        const b = lista.querySelector(`[data-ci-player="${id}"]`);
        return b ? b.textContent.replace('✓', '').trim().split(' ')[0] : '';
      });
      e.textContent = `Waiting for ${nombres.join(' & ')}`;
    });

    const todos = jugadoresDeLaCategoria();
    const hechos = todos.filter((id) => llegaron.has(id)).length;
    mount.innerHTML = `<div class="ci-resumen">
        <b class="ci-cuenta"></b>
        <div class="ci-prog" role="progressbar" aria-label="Players checked in" aria-valuemin="0" aria-valuemax="${todos.length}" aria-valuenow="${hechos}"><i></i></div>
        <span class="ci-equipos"></span>
        ${hechos < todos.length ? '<button type="button" class="ci-todos" data-ci-todos="1">✓ Check in everyone</button>' : ''}
      </div>`;
    mount.querySelector('.ci-cuenta').textContent = `${hechos} of ${todos.length} players checked in`;
    mount.querySelector('.ci-prog i').style.width = `${todos.length ? Math.round((hechos / todos.length) * 100) : 0}%`;
    const esperando = equipos.length - listas;
    mount.querySelector('.ci-equipos').textContent = `${listas} ready${esperando ? ` · ${esperando} waiting` : ''}`;
  }

  async function alTocar(ev) {
    const chip = ev.target.closest('[data-ci-player]');
    const todos = ev.target.closest('[data-ci-todos]');
    if (!chip && !todos) return;
    if (!ctx || ctx.ocupado) return;
    if (todos) return checkinTodos(todos);
    const pid = Number(chip.dataset.ciPlayer);
    const entra = !ctx.llegaron.has(pid);
    const chipTorneo = ctx.tournament.id;
    if (!entra && ctx.tournament.status === 'active') {
      const nombre = chip.textContent.replace('✓', '').trim();
      const ok = await confirmar({
        title: 'Undo check-in?',
        message: `${nombre} will be marked as not here. Their next matches won't be called until they check in again. A match already on court keeps playing.`,
        okLabel: 'Undo check-in', focusCancel: true,
      });
      if (!ok || !ctx || ctx.ocupado || ctx.tournament.id !== chipTorneo || !chip.isConnected) return;
    }
    ctx.ocupado = true;
    chip.classList.add('ci-busy'); chip.setAttribute('aria-busy', 'true');
    try {
      const r = await rpc('admin_torneo_checkin', { p_tournament_id: ctx.tournament.id, p_player_id: pid, p_in: entra });
      if (entra) ctx.llegaron.add(pid); else ctx.llegaron.delete(pid);
      pintar();
      if (r && r.called) aviso(`${r.called} match${r.called === 1 ? '' : 'es'} called to court.`);
      window.AutoCourts?.refrescar?.();
    } catch (e) {
      aviso(mensaje(e), true);
    } finally {
      ctx.ocupado = false;
      chip.classList.remove('ci-busy'); chip.removeAttribute('aria-busy');
    }
  }

  async function checkinTodos(boton) {
    if (!ctx || ctx.ocupado) return;
    boton = boton || ctx.mount.querySelector('[data-ci-todos]');
    const torneo = ctx.tournament.id;
    const faltan = jugadoresDeLaCategoria().filter((id) => !ctx.llegaron.has(id)).length;
    const ok = await confirmar({
      title: 'Check in everyone?',
      message: `Mark all players of this tournament as checked in (${faltan} in this category still missing). Use it when everyone is here.`,
      okLabel: 'Check in everyone', focusCancel: true,
    });
    if (!ok || !ctx || ctx.tournament.id !== torneo) return;   // si cambió de torneo mientras preguntaba, nada
    ctx.ocupado = true;
    if (boton) { boton.disabled = true; boton.textContent = 'Checking in…'; }
    try {
      const r = await rpc('admin_torneo_checkin_todos', { p_tournament_id: ctx.tournament.id });
      jugadoresDeLaCategoria().forEach((id) => ctx.llegaron.add(id));
      ctx.ocupado = false;
      pintar();
      window.AutoCourts?.refrescar?.();
      aviso(`Everyone is checked in${r && r.called ? ` — ${r.called} match${r.called === 1 ? '' : 'es'} called to court` : ''}.`);
    } catch (e) {
      ctx.ocupado = false;
      if (boton) { boton.disabled = false; boton.textContent = '✓ Check in everyone'; }
      aviso(mensaje(e), true);
    }
  }

  /* "Check in everyone" también desde el aviso amarillo de Auto Courts. */
  window.AdminCheckin = { montar, todos: () => checkinTodos(null) };
})();
