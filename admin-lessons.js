/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: LESSONS (§118, SQL 134)
   11 de noviembre de 2026 · diseño aprobado ("FEROCIA Lessons")

   Las clases con Leminyer. Tres pestañas:
     · Schedule — su semana: las clases, lo OCUPADO de su Google
       Calendar (sin detalles) y lo que queda fuera de su horario.
     · Bookings — la lista (Upcoming / Past / Cancelled). Al abrir una:
       cancelar (con mensaje al jugador), cambiar la hora, vino / no vino,
       y una nota para ella.
     · Settings — tipos de clase, horario semanal, días bloqueados,
       reglas y la conexión con Google Calendar.
   "+ Add a lesson": ella reserva para cualquier jugador (también fuera de
   su horario).

   Lo que toca Google (horas libres, reservar, cambiar, cancelar,
   conectar) pasa por la función "lessons" de Supabase; lo demás, por las
   funciones de la base admin_clases_* (cada una comprueba que quien
   llama es administradora activa).

   La vuelta de Google: al dar permiso, Google vuelve a admin.html con
   ?code=…&state=…&scope=… — aquí se quita de la dirección enseguida y
   se termina la conexión (con el vale de un solo uso).

   Depende de: db.js (esc, toast, confirmModal, window.supabase), app.js
   (AdminPageLoaders, CLICK_HANDLERS, app.authReady, showPage),
   ferocia-boton.js. Estilos: admin-lessons.css (lsn-).
   ============================================================ */

(function () {
  'use strict';

  const ZONA = 'America/New_York';
  const sb = () => window.supabase;
  const esc = (x) => window.esc(x == null ? '' : String(x));
  const $ = (id) => document.getElementById(id);
  const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DIAS_LARGOS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];
  const ESTADO = {
    booked: ['Booked', 'pc-pill-blue'], attended: ['Attended', 'pc-pill-green'],
    no_show: ['No-show', 'pc-pill-red'], cancelled: ['Cancelled', 'pc-pill-gray'],
  };
  const GOOGLE_AVISO = {
    missing: 'Not in your Google Calendar — someone deleted the event there.',
    moved: 'Moved in Google Calendar — the time there is different from here.',
    failed: 'Google could not be updated for this lesson. Check your FEROCIA Lessons calendar.',
  };

  let _tab = 'schedule';
  let _vista = 'upcoming';
  let _lunes = null;            // "YYYY-MM-DD" del lunes que se ve
  let _ajustes = null;          // admin_clases_ajustes()
  let _reservas = [];           // la última lista pintada (para "View")
  let _horasEdit = null;        // el horario mientras se edita
  let _vez = 0;

  // ── Fechas en la hora del club ───────────────────────────
  const fmt = (iso, op) => new Date(iso).toLocaleString('en-US', { timeZone: ZONA, ...op });
  const diaHora = (iso) => fmt(iso, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const soloHora = (iso) => fmt(iso, { hour: 'numeric', minute: '2-digit' });
  const diaET = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);
  const sumarDias = (dia, n) => { const [y, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const dowDe = (dia) => { const [y, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const lunesDe = (dia) => sumarDias(dia, -((dowDe(dia) + 6) % 7));
  const diaCorto = (dia) => { const [y, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }); };
  /* El instante (ISO) de "dia hh:mm" en Florida (con su horario de verano). */
  function instanteET(dia, hhmm = '00:00') {
    const [y, m, d] = dia.split('-').map(Number);
    const [h, mi] = hhmm.split(':').map(Number);
    let t = Date.UTC(y, m - 1, d, h, mi);
    for (let i = 0; i < 2; i++) {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
      const visto = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
      t += Date.UTC(y, m - 1, d, h, mi) - visto;
    }
    return new Date(t).toISOString();
  }
  /* Minutos desde medianoche (hora de Florida) de un instante. */
  const minutosET = (iso) => { const p = fmt(iso, { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).split(':'); return (+p[0] % 24) * 60 + +p[1]; };
  const hhmmA12 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const precio = (v) => (v == null || v === '' ? '—' : `$${Number(v) % 1 ? Number(v).toFixed(2) : Number(v)}`);

  // ── Errores en palabras ──────────────────────────────────
  function errorLegible(err) {
    const m = String((err && (err.message || err.error)) || err || '');
    const T = {
      google_unavailable: "Google Calendar didn't respond, so nothing was changed. Try again in a moment — if it keeps happening, check Settings → Google Calendar.",
      google_not_configured: 'Google is not set up in Supabase yet (secrets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).',
      slot_taken: 'That time was just taken, or something new is in your Google Calendar. Pick another time.',
      slot_unavailable: 'That time is not available anymore. Pick another time.',
      same_time: 'That is the same time it already has.',
      not_booked: 'This lesson is no longer booked. The list is refreshed.',
      not_found: 'This no longer exists. The list is refreshed.',
      not_started: 'You can mark it after the lesson starts.',
      invalid_group: 'Choose how many players come (within the limits of this lesson type).',
      player_not_found: 'Choose a player from the list.',
      type_not_found: 'Choose a lesson type.',
      invalid_state: 'That Google link expired. Press "Connect Google Calendar" again.',
      missing_permissions: 'Google needs all 3 permissions. Press "Connect Google Calendar" again and leave every box checked.',
      no_refresh_token: 'Google did not give a lasting connection. Press "Connect Google Calendar" again.',
      invalid_rules: 'Check the rules: one of the numbers is out of range, or the email is not valid.',
      invalid_type: 'Check the lesson type: it needs a name, a length, and max players ≥ min players.',
      in_use: 'This lesson type has bookings, so it can only be paused (not deleted).',
      invalid_hours: 'Check the hours: each one needs a start and an end, and the end must be after the start.',
      hours_overlap: 'Two time ranges on the same day overlap. Fix them and save again.',
      invalid_dates: 'Check the dates: "to" must be the same day or after "from".',
      note_too_long: 'The note is too long (500 characters max).',
      message_too_long: 'The message is too long (300 characters max).',
      invalid_calendars: 'Could not save the calendars. Reload and try again.',
      not_authorized: 'Your admin access could not be confirmed. Sign in again.',
    };
    for (const [k, t] of Object.entries(T)) if (m.includes(k)) return t;
    if (/function .* does not exist|Could not find the function|lesson_/i.test(m)) return 'Lessons is not installed yet (SQL 134).';
    if (/Failed to send|fetch|network|Load failed/i.test(m)) return "We couldn't connect. Check your internet and try again.";
    return 'Something went wrong. Please try again in a moment.';
  }
  async function rpc(fn, args) {
    const { data, error } = await sb().rpc(fn, args || {});
    if (error) throw error;
    return data;
  }
  async function funcion(action, data) {
    const { data: r, error } = await sb().functions.invoke('lessons', { body: { action, data: data || {} } });
    if (error) {
      let cuerpo = null;
      try { cuerpo = await error.context.json(); } catch (_) { /* nada */ }
      throw new Error((cuerpo && cuerpo.error) || error.message || 'network');
    }
    if (!r || r.ok !== true) { const e = new Error((r && r.error) || 'unexpected'); e.detalle = r; throw e; }
    return r;
  }

  // ── Página y pestañas ────────────────────────────────────
  function marcarPestana() {
    document.querySelectorAll('#page-lessons .pc-tab').forEach((b) => {
      const si = b.dataset.tab === _tab;
      b.classList.toggle('active', si);
      b.setAttribute('aria-selected', si ? 'true' : 'false');
    });
  }
  async function cargarAjustes() {
    _ajustes = await rpc('admin_clases_ajustes');
    pintarAvisoGoogle();
    return _ajustes;
  }
  function pintarAvisoGoogle() {
    const caja = $('lsn-google-aviso');
    if (!caja || !_ajustes) return;
    const g = _ajustes.google || {};
    let t = '';
    if (g.status === 'disconnected') t = "Players can't book lessons until Google Calendar is connected.";
    else if (g.status === 'error') t = "Google Calendar stopped working (the connection was removed or expired). Players can't book until you connect it again.";
    else if (g.failing) t = `Google Calendar didn't respond at ${diaHora(g.error_at)}. If players say they can't book, open Settings → Google Calendar.`;
    caja.hidden = !t;
    caja.innerHTML = t ? `<span>${esc(t)}</span><button type="button" class="btn btn-sm btn-primary" data-action="lsnTab" data-tab="settings">Open Settings</button>` : '';
  }
  async function cargar() {
    marcarPestana();
    const caja = $('lsn-body');
    const mia = ++_vez;
    caja.innerHTML = '<div class="loading">Loading...</div>';
    try {
      await cargarAjustes();
      if (mia !== _vez) return;
      if (_tab === 'schedule') await pintarSemana(mia);
      else if (_tab === 'bookings') await pintarReservas(mia);
      else pintarAjustes();
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[lessons]', err);
      caja.innerHTML = `<div class="pc-vacio">${esc(errorLegible(err))}</div>`;
    }
  }

  // ── Schedule: la semana ──────────────────────────────────
  async function pintarSemana(mia) {
    if (!_lunes) _lunes = lunesDe(diaET());
    const desde = _lunes, hasta = sumarDias(_lunes, 7);
    const [reservas, google] = await Promise.all([
      rpc('admin_clases_reservas', { p_vista: 'week', p_desde: desde }),
      _ajustes.google.status === 'connected'
        ? funcion('google_week', { from: instanteET(desde), to: instanteET(hasta) }).catch((e) => ({ error: e }))
        : Promise.resolve({ busy: [], marks: [], off: true }),
    ]);
    if (mia !== _vez) return;
    _reservas = reservas || [];
    const marcas = Object.fromEntries(((google && google.marks) || []).map((x) => [x.id, x.state]));
    _reservas.forEach((r) => { if (marcas[r.id]) r.google_state = marcas[r.id]; });
    const horas = _ajustes.hours || [];
    const bloques = _ajustes.blocks || [];
    const dias = Array.from({ length: 7 }, (_, i) => sumarDias(_lunes, i));
    const hoy = diaET();
    // El tramo de horas que se ve: de 7 AM a 8 PM, o más si hace falta.
    let ini = 7 * 60, fin = 20 * 60;
    horas.forEach((h) => { ini = Math.min(ini, toMin(h.starts)); fin = Math.max(fin, toMin(h.ends)); });
    _reservas.forEach((r) => { ini = Math.min(ini, minutosET(r.starts_at)); fin = Math.max(fin, minutosET(r.ends_at) || 24 * 60); });
    ini = Math.floor(ini / 60) * 60; fin = Math.min(24 * 60, Math.ceil(fin / 60) * 60);
    const PX = 44 / 60;
    const alto = (fin - ini) * PX;
    const top = (min) => Math.max(0, (min - ini) * PX);

    const columnas = dias.map((d) => {
      const dow = dowDe(d);
      const bloqueo = bloques.find((b) => d >= b.from_day && d <= b.to_day);
      const ventanas = bloqueo ? [] : horas.filter((h) => h.dow === dow);
      const capas = [];
      ventanas.forEach((h) => capas.push(`<div class="lsn-ev lsn-abierto" data-t="${top(toMin(h.starts))}" data-a="${(toMin(h.ends) - toMin(h.starts)) * PX}"></div>`));
      if (bloqueo) capas.push(`<div class="lsn-bloqueado">Blocked${bloqueo.note ? ` · ${esc(bloqueo.note)}` : ''}</div>`);
      ((google && google.busy) || []).forEach((b) => {
        const s = Math.max(Date.parse(b.s), Date.parse(instanteET(d))), e = Math.min(Date.parse(b.e), Date.parse(instanteET(sumarDias(d, 1))));
        if (e <= s) return;
        const mi = minutosET(new Date(s).toISOString()), mf = mi + (e - s) / 60000;
        capas.push(`<div class="lsn-ev lsn-ocupado" data-t="${top(mi)}" data-a="${Math.max(14, (Math.min(mf, fin) - Math.max(mi, ini)) * PX)}">Busy (Google)</div>`);
      });
      _reservas.filter((r) => diaET(new Date(r.starts_at)) === d).forEach((r) => {
        const mi = minutosET(r.starts_at);
        const aviso = GOOGLE_AVISO[r.google_state] ? ' lsn-con-aviso' : '';
        capas.push(`<button type="button" class="lsn-ev lsn-clase lsn-${esc(r.status)}${aviso}" data-action="lsnVer" data-id="${esc(r.id)}"
          data-t="${top(mi)}" data-a="${Math.max(22, r.duration_min * PX)}" aria-label="${esc(`${r.player}, ${r.type_name}, ${diaHora(r.starts_at)}`)}">
          <b>${esc(r.player)}${r.group_size > 1 ? ` +${esc(r.group_size - 1)}` : ''}</b><span>${esc(soloHora(r.starts_at))} · ${esc(r.type_name)}</span></button>`);
      });
      return `<div class="lsn-col${d === hoy ? ' lsn-hoy' : ''}"><div class="lsn-col-h">${esc(DIAS[dow])} <b>${esc(d.slice(8).replace(/^0/, ''))}</b></div>
        <div class="lsn-col-c" data-a="${alto}">${capas.join('')}</div></div>`;
    }).join('');
    const reglas = [];
    for (let m = ini; m < fin; m += 60) reglas.push(`<div class="lsn-hr" data-a="${60 * PX}">${esc(hhmmA12(`${Math.floor(m / 60)}:00`).replace(':00 ', ' '))}</div>`);

    const sueltos = (google && google.orphans) || [];
    const avisoG = (google && google.error
      ? `<p class="lsn-nota lsn-nota-roja">${esc(errorLegible(google.error))}</p>` : '')
      + (sueltos.length ? `<p class="lsn-nota lsn-nota-ambar">${esc(`Your FEROCIA Lessons calendar has ${sueltos.length} lesson event${sueltos.length === 1 ? '' : 's'} with no booking (${sueltos.map((x) => diaHora(x.s)).join(', ')}). It was left by a booking that didn't finish — delete ${sueltos.length === 1 ? 'it' : 'them'} in Google Calendar.`)}</p>` : '');
    $('lsn-body').innerHTML = `
      <div class="lsn-semana-nav">
        <button type="button" class="btn btn-outline btn-sm" data-action="lsnSemana" data-dir="-1" aria-label="Previous week">‹</button>
        <b>${esc(diaCorto(desde))} – ${esc(diaCorto(sumarDias(desde, 6)))}</b>
        <button type="button" class="btn btn-outline btn-sm" data-action="lsnSemana" data-dir="1" aria-label="Next week">›</button>
        <button type="button" class="btn btn-outline btn-sm" data-action="lsnSemana" data-dir="0">This week</button>
      </div>
      ${avisoG}
      <div class="lsn-cal-scroll"><div class="lsn-cal">
        <div class="lsn-col lsn-col-horas"><div class="lsn-col-h"></div><div class="lsn-col-c" data-a="${alto}">${reglas.join('')}</div></div>
        ${columnas}
      </div></div>
      <div class="lsn-leyenda">
        <span><i class="lsn-l-clase"></i>Lesson</span><span><i class="lsn-l-ocupado"></i>Busy in your Google Calendar (no details)</span>
        <span><i class="lsn-l-fuera"></i>Outside your lesson hours / blocked</span><span><i class="lsn-l-aviso"></i>Check in Google</span>
      </div>`;
    /* Las posiciones van por JS (nada de estilos escritos en el HTML). */
    $('lsn-body').querySelectorAll('[data-t], [data-a]').forEach((el) => {
      if (el.dataset.t != null) el.style.top = `${el.dataset.t}px`;
      if (el.dataset.a != null) el.style.height = `${el.dataset.a}px`;
    });
  }
  const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

  // ── Bookings: la lista ───────────────────────────────────
  async function pintarReservas(mia) {
    const lista = await rpc('admin_clases_reservas', { p_vista: _vista, p_desde: null });
    if (mia !== _vez) return;
    _reservas = lista || [];
    // Revisar en Google las que vienen (sin esperar: si cambia algo, se repinta).
    if (_vista === 'upcoming' && _reservas.length && _ajustes.google.status === 'connected') {
      const ultimo = _reservas[_reservas.length - 1].ends_at;
      funcion('google_week', { from: new Date().toISOString(), to: new Date(Math.min(Date.parse(ultimo) + 3600e3, Date.now() + 120 * 864e5)).toISOString(), busy: false })
        .then((g) => {
          if (mia !== _vez) return;
          const m = Object.fromEntries((g.marks || []).map((x) => [x.id, x.state]));
          let cambio = false;
          _reservas.forEach((r) => { if (m[r.id] && m[r.id] !== r.google_state) { r.google_state = m[r.id]; cambio = true; } });
          if (cambio) pintarTabla();
        }).catch(() => {});
    }
    pintarTabla();
  }
  function pintarTabla() {
    const filtros = [['upcoming', 'Upcoming'], ['past', 'Past'], ['cancelled', 'Cancelled']]
      .map(([k, t]) => `<button type="button" class="lsn-filtro${k === _vista ? ' active' : ''}" data-action="lsnVista" data-vista="${k}" aria-pressed="${k === _vista}">${t}</button>`).join('');
    const filas = _reservas.map((r) => {
      const [et, cl] = ESTADO[r.status] || ['', 'pc-pill-gray'];
      const aviso = GOOGLE_AVISO[r.google_state] ? `<span class="lsn-aviso" title="${esc(GOOGLE_AVISO[r.google_state])}">⚠ ${r.google_state === 'failed' ? 'Google' : r.google_state === 'moved' ? 'Moved in Google' : 'Not in Google'}</span>` : '';
      return `<tr>
        <td data-k="When">${esc(diaHora(r.starts_at))}</td>
        <td data-k="Player">${esc(r.player)}${r.group_size > 1 ? ` <span class="lsn-gris">+${esc(r.group_size - 1)}</span>` : ''}</td>
        <td data-k="Lesson">${esc(r.type_name)}</td>
        <td data-k="Status"><span class="pc-pill ${cl}">${esc(et)}</span> ${aviso}</td>
        <td><button type="button" class="btn btn-outline btn-sm" data-action="lsnVer" data-id="${esc(r.id)}">View</button></td></tr>`;
    }).join('');
    const vacio = { upcoming: 'No upcoming lessons yet.', past: 'No past lessons in the last year.', cancelled: 'No cancelled lessons in the last year.' }[_vista];
    $('lsn-body').innerHTML = `<div class="lsn-filtros" role="group" aria-label="Show">${filtros}</div>
      ${_reservas.length ? `<div class="lsn-tabla-caja"><table class="lsn-tabla"><thead><tr><th>When</th><th>Player</th><th>Lesson</th><th>Status</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
        : `<div class="pc-vacio">${esc(vacio)}</div>`}`;
  }

  // ── La ventana (detalle, añadir, cambiar, tipo) ──────────
  function abrirVentana(html, ancho) {
    const caja = $('lsn-modal-box');
    caja.style.maxWidth = ancho || '560px';
    caja.innerHTML = `<button type="button" class="lsn-x" data-action="lsnCerrar" aria-label="Close">✕</button>${html}`;
    $('lsn-modal').classList.add('open');
    setTimeout(() => { const f = caja.querySelector('[data-foco]') || caja.querySelector('input, select, textarea, button:not(.lsn-x)'); if (f) f.focus(); }, 30);
  }
  function cerrarVentana() { $('lsn-modal').classList.remove('open'); $('lsn-modal-box').innerHTML = ''; }

  function ver(id) {
    const r = _reservas.find((x) => String(x.id) === String(id));
    if (!r) return;
    const [et, cl] = ESTADO[r.status] || ['', 'pc-pill-gray'];
    const empezo = Date.parse(r.starts_at) <= Date.now();
    const acciones = [];
    if (r.status === 'booked' && !empezo) {
      acciones.push(`<button type="button" class="btn btn-sm btn-primary" data-action="lsnCambiarAbrir" data-id="${esc(r.id)}">Change time</button>`);
    }
    if (r.status === 'booked') {
      acciones.push(`<button type="button" class="btn btn-sm btn-danger" data-action="lsnCancelarAbrir" data-id="${esc(r.id)}">Cancel lesson</button>`);
    }
    if (empezo && r.status !== 'cancelled') {
      if (r.status !== 'attended') acciones.push(`<button type="button" class="btn btn-sm btn-teal" data-action="lsnMarcar" data-id="${esc(r.id)}" data-estado="attended" data-busy="Saving…">Attended</button>`);
      if (r.status !== 'no_show') acciones.push(`<button type="button" class="btn btn-sm btn-outline" data-action="lsnMarcar" data-id="${esc(r.id)}" data-estado="no_show" data-busy="Saving…">No-show</button>`);
      if (r.status !== 'booked') acciones.push(`<button type="button" class="btn btn-sm btn-outline" data-action="lsnMarcar" data-id="${esc(r.id)}" data-estado="booked" data-busy="Saving…">Undo</button>`);
    }
    const fila = (k, v) => (v == null || v === '' ? '' : `<div class="lsn-dato"><span>${esc(k)}</span><div>${v}</div></div>`);
    const tel = r.phone ? `<a href="tel:${esc(String(r.phone).replace(/[^\d+]/g, ''))}">${esc(r.phone)}</a>` : '';
    abrirVentana(`
      <div class="modal-title">${esc(r.player)}</div>
      <p class="lsn-sub"><span class="pc-pill ${cl}">${esc(et)}</span> ${esc(r.type_name)} · ${esc(diaHora(r.starts_at))}</p>
      ${GOOGLE_AVISO[r.google_state] && r.status !== 'cancelled' ? `<p class="lsn-nota lsn-nota-ambar">${esc(GOOGLE_AVISO[r.google_state])}</p>` : ''}
      ${r.google_state === 'failed' && r.status === 'cancelled' ? '<p class="lsn-nota lsn-nota-ambar">This lesson is cancelled, but Google could not remove the event. Delete it in your FEROCIA Lessons calendar.</p>' : ''}
      <div class="lsn-datos">
        ${fila('When', esc(`${diaHora(r.starts_at)} – ${soloHora(r.ends_at)} (ET)`))}
        ${fila('Players', r.group_size > 1 ? esc(r.group_size) : '')}
        ${fila('Price', esc(`${precio(r.price)} · pay at the club`))}
        ${fila('Phone', tel)}
        ${fila('Email', r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '')}
        ${fila('Player note', r.note ? esc(r.note) : '')}
        ${fila('Booked', esc(`${r.created_by === 'admin' ? 'By you' : 'By the player'} · ${diaHora(r.created_at)}`))}
        ${fila('Cancelled', r.status === 'cancelled' ? esc(`${r.cancelled_by === 'admin' ? 'By you' : 'By the player'}${r.cancelled_at ? ` · ${diaHora(r.cancelled_at)}` : ''}`) : '')}
        ${fila('Times changed', r.changed_count ? esc(r.changed_count) : '')}
      </div>
      <form id="lsn-nota-form" class="lsn-nota-form">
        <div class="form-group"><label for="lsn-nota-txt">Your note (only you see it)</label>
        <textarea id="lsn-nota-txt" rows="2" maxlength="500">${esc(r.admin_note || '')}</textarea></div>
        <div><button type="submit" class="btn btn-sm btn-outline" data-busy="Saving…">Save note</button></div>
      </form>
      ${acciones.length ? `<div class="modal-actions lsn-acciones">${acciones.join('')}</div>` : ''}`);
    $('lsn-nota-form').addEventListener('submit', window.FerociaBoton ? window.FerociaBoton.formulario(guardarNota) : guardarNota);
    $('lsn-nota-form').dataset.id = r.id;
  }
  async function guardarNota(e) {
    e.preventDefault();
    const id = Number(e.currentTarget.dataset.id);
    try {
      await rpc('admin_clases_nota', { p_id: id, p_nota: $('lsn-nota-txt').value });
      const r = _reservas.find((x) => x.id === id); if (r) r.admin_note = $('lsn-nota-txt').value.trim();
      window.toast('Note saved.');
    } catch (err) { window.toast(errorLegible(err), true); }
  }

  async function marcar(btn) {
    const id = Number(btn.dataset.id), estado = btn.dataset.estado;
    try {
      await rpc('admin_clases_marcar', { p_id: id, p_estado: estado });
      window.toast(estado === 'attended' ? 'Marked as attended.' : estado === 'no_show' ? 'Marked as no-show. It counts in the player\'s reliability.' : 'Mark removed.');
      cerrarVentana();
      cargar();
    } catch (err) { window.toast(errorLegible(err), true); }
  }

  function cancelarAbrir(btn) {
    const r = _reservas.find((x) => String(x.id) === String(btn.dataset.id));
    if (!r) return;
    abrirVentana(`
      <div class="modal-title">Cancel this lesson?</div>
      <p class="lsn-sub">${esc(r.player)} · ${esc(r.type_name)} · ${esc(diaHora(r.starts_at))}</p>
      <form id="lsn-cancelar-form">
        <div class="form-group"><label for="lsn-cancelar-msj">Message to the player (optional)</label>
        <textarea id="lsn-cancelar-msj" rows="3" maxlength="300" placeholder="e.g. Sorry, I'm sick. Let's find another time." data-foco></textarea></div>
        <p class="lsn-gris">The player gets an email and a notification. The event is removed from your Google Calendar.</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline btn-sm" data-action="lsnCerrar">Keep it</button>
          <button type="submit" class="btn btn-sm btn-danger" data-busy="Cancelling…">Cancel lesson</button>
        </div>
      </form>`, '480px');
    const f = $('lsn-cancelar-form');
    f.dataset.id = r.id;
    f.addEventListener('submit', window.FerociaBoton ? window.FerociaBoton.formulario(cancelar) : cancelar);
  }
  async function cancelar(e) {
    e.preventDefault();
    const id = Number(e.currentTarget.dataset.id);
    try {
      const r = await funcion('admin_cancel', { id, message: $('lsn-cancelar-msj').value.trim() || null });
      cerrarVentana();
      window.toast(r.google === 'failed' ? 'Lesson cancelled and the player was told. Google could not remove the event — delete it in your FEROCIA Lessons calendar.' : 'Lesson cancelled. The player was told.', r.google === 'failed');
      cargar();
    } catch (err) { window.toast(errorLegible(err), true); if (/not_booked|not_found/.test(String(err.message))) { cerrarVentana(); cargar(); } }
  }

  // ── Elegir día y hora (añadir y cambiar) ─────────────────
  function selectorHoras(prefijo) {
    return `<div class="form-row">
        <div class="form-group"><label for="${prefijo}-dia">Day</label><input type="date" id="${prefijo}-dia" min="${esc(diaET())}" value="${esc(diaET())}"></div>
        <div class="form-group lsn-fuera"><label class="lsn-check"><input type="checkbox" id="${prefijo}-fuera"> Show times outside my hours</label></div>
      </div>
      <div class="lsn-horas" id="${prefijo}-horas" role="group" aria-label="Times"><p class="lsn-gris">Choose a day.</p></div>`;
  }
  async function cargarHoras(prefijo, pedir) {
    const caja = $(`${prefijo}-horas`);
    const dia = $(`${prefijo}-dia`).value;
    if (!dia) { caja.innerHTML = '<p class="lsn-gris">Choose a day.</p>'; return; }
    const fuera = $(`${prefijo}-fuera`).checked;
    caja.innerHTML = '<p class="lsn-gris">Checking your calendar…</p>';
    caja.dataset.elegida = '';
    const mia = (caja._vez = (caja._vez || 0) + 1);
    try {
      const r = await funcion('admin_slots', { ...pedir(), from: dia, to: dia });
      if (mia !== caja._vez) return;
      const slots = (r.slots || []).filter((s) => fuera || s.h);
      caja.innerHTML = slots.length
        ? slots.map((s) => `<button type="button" class="lsn-hora${s.h ? '' : ' lsn-hora-fuera'}" data-action="lsnHora" data-s="${esc(s.s)}" aria-pressed="false">${esc(soloHora(s.s))}</button>`).join('')
        : `<p class="lsn-gris">${fuera ? 'No free times this day.' : 'No free times in your hours this day. Check "Show times outside my hours" to see more.'}</p>`;
    } catch (err) {
      if (mia !== caja._vez) return;
      caja.innerHTML = `<p class="lsn-nota lsn-nota-roja">${esc(errorLegible(err))}</p>`;
    }
  }
  function elegirHora(btn) {
    const caja = btn.closest('.lsn-horas');
    caja.querySelectorAll('.lsn-hora').forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    caja.dataset.elegida = btn.dataset.s;
  }

  // + Add a lesson
  let _jugador = null;
  function anadirAbrir() {
    const tipos = (_ajustes.types || []);
    if (!tipos.length) { window.toast('Create a lesson type first (Settings → Lesson types).', true); return; }
    if (_ajustes.google.status !== 'connected') { window.toast('Connect Google Calendar first (Settings → Google Calendar).', true); return; }
    _jugador = null;
    abrirVentana(`
      <div class="modal-title">Add a lesson</div>
      <form id="lsn-anadir-form">
        <div class="form-group lsn-buscar"><label for="lsn-a-buscar">Player</label>
          <input type="search" id="lsn-a-buscar" autocomplete="off" placeholder="Type a name or email" data-foco>
          <div class="lsn-sugerencias" id="lsn-a-sug" role="listbox" hidden></div>
          <div class="lsn-elegido" id="lsn-a-elegido" hidden></div></div>
        <div class="form-row">
          <div class="form-group"><label for="lsn-a-tipo">Lesson type</label><select id="lsn-a-tipo">
            ${tipos.map((t) => `<option value="${esc(t.id)}" data-min="${esc(t.min_players)}" data-max="${esc(t.max_players)}">${esc(t.name)} · ${esc(t.duration_min)} min${t.active ? '' : ' (paused)'}</option>`).join('')}</select></div>
          <div class="form-group" id="lsn-a-grupo-caja" hidden><label for="lsn-a-grupo">How many players</label><select id="lsn-a-grupo"></select></div>
        </div>
        ${selectorHoras('lsn-a')}
        <div class="form-group"><label for="lsn-a-nota">Note (optional — goes in your Google event)</label><textarea id="lsn-a-nota" rows="2" maxlength="500"></textarea></div>
        <p class="lsn-gris">The player gets the confirmation email and a notification.</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline btn-sm" data-action="lsnCerrar">Cancel</button>
          <button type="submit" class="btn btn-sm btn-primary" data-busy="Booking…">Book lesson</button>
        </div>
      </form>`, '600px');
    const pedir = () => ({ type_id: Number($('lsn-a-tipo').value) });
    const grupo = () => {
      const o = $('lsn-a-tipo').selectedOptions[0];
      const min = Number(o.dataset.min), max = Number(o.dataset.max);
      $('lsn-a-grupo-caja').hidden = max <= 1;
      $('lsn-a-grupo').innerHTML = Array.from({ length: max - min + 1 }, (_, i) => `<option>${min + i}</option>`).join('');
    };
    grupo();
    $('lsn-a-tipo').addEventListener('change', () => { grupo(); cargarHoras('lsn-a', pedir); });
    $('lsn-a-dia').addEventListener('change', () => cargarHoras('lsn-a', pedir));
    $('lsn-a-fuera').addEventListener('change', () => cargarHoras('lsn-a', pedir));
    let reloj = null;
    $('lsn-a-buscar').addEventListener('input', () => { clearTimeout(reloj); reloj = setTimeout(buscarJugador, 250); });
    const f = $('lsn-anadir-form');
    f.addEventListener('submit', window.FerociaBoton ? window.FerociaBoton.formulario(anadir) : anadir);
    cargarHoras('lsn-a', pedir);
  }
  let _vezBuscar = 0;
  async function buscarJugador() {
    const q = $('lsn-a-buscar').value.trim();
    const caja = $('lsn-a-sug');
    const mia = ++_vezBuscar;
    if (q.length < 2) { caja.hidden = true; return; }
    try {
      const lista = await rpc('admin_clases_buscar_jugador', { p_q: q });
      if (mia !== _vezBuscar) return;
      caja.innerHTML = (lista || []).length
        ? lista.map((p) => `<button type="button" role="option" class="lsn-sug" data-action="lsnJugador" data-id="${esc(p.id)}" data-name="${esc(p.name)}"><b>${esc(p.name)}</b><span>${esc(p.email || p.phone || '')}</span></button>`).join('')
        : '<p class="lsn-gris">No players found.</p>';
      caja.hidden = false;
    } catch (err) { caja.innerHTML = `<p class="lsn-gris">${esc(errorLegible(err))}</p>`; caja.hidden = false; }
  }
  function elegirJugador(btn) {
    _jugador = { id: Number(btn.dataset.id), name: btn.dataset.name };
    $('lsn-a-sug').hidden = true;
    $('lsn-a-buscar').value = '';
    $('lsn-a-buscar').hidden = true;
    const el = $('lsn-a-elegido');
    el.hidden = false;
    el.innerHTML = `<b>${esc(_jugador.name)}</b> <button type="button" class="btn btn-outline btn-sm" data-action="lsnJugadorQuitar">Change</button>`;
  }
  function quitarJugador() {
    _jugador = null;
    $('lsn-a-elegido').hidden = true;
    $('lsn-a-buscar').hidden = false;
    $('lsn-a-buscar').focus();
  }
  async function anadir(e) {
    e.preventDefault();
    if (!_jugador) { window.toast('Choose a player first.', true); $('lsn-a-buscar').focus(); return; }
    const s = $('lsn-a-horas').dataset.elegida;
    if (!s) { window.toast('Choose a time.', true); return; }
    try {
      const g = $('lsn-a-grupo-caja').hidden ? null : Number($('lsn-a-grupo').value);
      await funcion('admin_book', { player_id: _jugador.id, type_id: Number($('lsn-a-tipo').value), start: s, group: g,
                                    note: $('lsn-a-nota').value.trim() || null });
      cerrarVentana();
      window.toast(`Lesson booked for ${_jugador.name}. It's in your Google Calendar and the player was told.`);
      cargar();
    } catch (err) {
      window.toast(errorLegible(err), true);
      if (/slot_/.test(String(err.message))) cargarHoras('lsn-a', () => ({ type_id: Number($('lsn-a-tipo').value) }));
    }
  }

  // Change time
  function cambiarAbrir(btn) {
    const r = _reservas.find((x) => String(x.id) === String(btn.dataset.id));
    if (!r) return;
    abrirVentana(`
      <div class="modal-title">Change the time</div>
      <p class="lsn-sub">${esc(r.player)} · ${esc(r.type_name)} · now ${esc(diaHora(r.starts_at))}</p>
      <form id="lsn-cambiar-form">
        ${selectorHoras('lsn-c')}
        <p class="lsn-gris">The player gets an email and a notification with the new time. Your Google event moves too.</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline btn-sm" data-action="lsnCerrar">Cancel</button>
          <button type="submit" class="btn btn-sm btn-primary" data-busy="Saving…">Save new time</button>
        </div>
      </form>`, '560px');
    $('lsn-c-dia').value = diaET(new Date(r.starts_at)) < diaET() ? diaET() : diaET(new Date(r.starts_at));
    const pedir = () => ({ change_id: r.id });
    $('lsn-c-dia').addEventListener('change', () => cargarHoras('lsn-c', pedir));
    $('lsn-c-fuera').addEventListener('change', () => cargarHoras('lsn-c', pedir));
    const f = $('lsn-cambiar-form');
    f.dataset.id = r.id;
    f.addEventListener('submit', window.FerociaBoton ? window.FerociaBoton.formulario(cambiar) : cambiar);
    cargarHoras('lsn-c', pedir);
  }
  async function cambiar(e) {
    e.preventDefault();
    const id = Number(e.currentTarget.dataset.id);
    const s = $('lsn-c-horas').dataset.elegida;
    if (!s) { window.toast('Choose the new time.', true); return; }
    try {
      await funcion('admin_change', { id, start: s });
      cerrarVentana();
      window.toast('New time saved. The player was told and your Google event moved.');
      cargar();
    } catch (err) {
      window.toast(errorLegible(err), true);
      if (/slot_/.test(String(err.message))) cargarHoras('lsn-c', () => ({ change_id: id }));
    }
  }

  // ── Settings ─────────────────────────────────────────────
  function pintarAjustes() {
    const a = _ajustes;
    const s = a.settings, g = a.google;
    _horasEdit = (a.hours || []).map((h) => ({ ...h }));
    const tipos = (a.types || []).map((t) => `<tr>
        <td data-k="Name">${esc(t.name)}${t.description ? `<div class="lsn-gris">${esc(t.description)}</div>` : ''}</td>
        <td data-k="Length">${esc(t.duration_min)} min</td>
        <td data-k="Players">${esc(t.min_players === t.max_players ? t.min_players : `${t.min_players}–${t.max_players}`)}</td>
        <td data-k="Price">${esc(precio(t.price))}</td>
        <td data-k="Status"><span class="pc-pill ${t.active ? 'pc-pill-green' : 'pc-pill-gray'}">${t.active ? 'Active' : 'Paused'}</span></td>
        <td class="lsn-td-acc"><button type="button" class="btn btn-outline btn-sm" data-action="lsnTipoAbrir" data-id="${esc(t.id)}">Edit</button>
          <button type="button" class="btn btn-outline btn-sm" data-action="lsnTipoActivo" data-id="${esc(t.id)}" data-busy="Saving…">${t.active ? 'Pause' : 'Activate'}</button>
          ${t.used ? '' : `<button type="button" class="btn btn-danger btn-sm" data-action="lsnTipoBorrar" data-id="${esc(t.id)}" data-busy="Deleting…">Delete</button>`}</td></tr>`).join('');
    const bloques = (a.blocks || []).map((b) => `<li><span>${esc(b.from_day === b.to_day ? diaCorto(b.from_day) : `${diaCorto(b.from_day)} – ${diaCorto(b.to_day)}`)}${b.note ? ` · ${esc(b.note)}` : ''}</span>
      <button type="button" class="btn btn-outline btn-sm" data-action="lsnBloqueoQuitar" data-id="${esc(b.id)}" data-busy="Removing…" aria-label="Remove blocked dates">Remove</button></li>`).join('');
    const num = (id, label, v, min, max, sufijo) => `<div class="lsn-regla"><label for="${id}">${label}</label><span><input type="number" id="${id}" value="${esc(v)}" min="${min}" max="${max}" step="1" required> ${sufijo}</span></div>`;
    const estadoG = g.status === 'connected'
      ? `<div class="lsn-gc lsn-gc-ok"><span class="lsn-punto"></span><div><b>Connected</b>${g.email ? ` · ${esc(g.email)}` : ''}<br><span class="lsn-gris">Lessons are added to your “FEROCIA Lessons” calendar.</span></div></div>`
      : g.status === 'error'
        ? `<div class="lsn-gc lsn-gc-mal"><span class="lsn-punto"></span><div><b>Not working</b><br><span>The connection was removed or expired. Players can't book until you connect again.</span></div></div>`
        : `<div class="lsn-gc"><span class="lsn-punto"></span><div><b>Not connected</b><br><span class="lsn-gris">Players can't book until you connect your Google Calendar.</span></div></div>`;
    $('lsn-body').innerHTML = `<div class="lsn-ajustes">
      <section class="lsn-caja lsn-ancha"><h3>Lesson types</h3>
        ${tipos ? `<div class="lsn-tabla-caja"><table class="lsn-tabla"><thead><tr><th>Name</th><th>Length</th><th>Players</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>${tipos}</tbody></table></div>` : '<p class="lsn-gris">No lesson types yet. Create the first one.</p>'}
        <p class="lsn-gris">Paused types are hidden from players; lessons already booked stay. The price is only shown to players (“Pay at the club”).</p>
        <button type="button" class="btn btn-sm btn-primary" data-action="lsnTipoAbrir">+ New type</button>
      </section>

      <section class="lsn-caja"><h3>Google Calendar</h3>
        ${estadoG}
        ${g.status === 'connected' && g.failing ? `<p class="lsn-nota lsn-nota-roja">Google didn't respond at ${esc(diaHora(g.error_at))}. If it keeps happening, disconnect and connect again.</p>` : ''}
        ${g.status === 'connected' ? `<p class="lsn-sub2">Check these calendars for busy times</p>
          <div id="lsn-cals" class="lsn-cals"><p class="lsn-gris">Loading your calendars…</p></div>
          <div class="lsn-fila-botones"><button type="button" class="btn btn-sm btn-primary" data-action="lsnCalsGuardar" data-busy="Saving…">Save calendars</button>
          <button type="button" class="btn btn-sm btn-outline" data-action="lsnGoogleQuitar" data-busy="Disconnecting…">Disconnect</button></div>
          <p class="lsn-gris">Events marked “Free” in Google don't block lessons. FEROCIA only sees busy/free — never what your events are.</p>`
        : `<div class="lsn-fila-botones"><button type="button" class="btn btn-sm btn-primary" data-action="lsnGoogleConectar" data-busy="Opening Google…">Connect Google Calendar</button></div>
          <p class="lsn-gris">Google will say the app isn't verified: it's yours, so tap “Advanced” → “Go to FEROCIA Lessons”, and leave all 3 permission boxes checked.</p>`}
      </section>

      <section class="lsn-caja"><h3>Booking rules</h3>
        <form id="lsn-reglas-form">
          ${num('lsn-r-aviso', 'Book at least', s.min_notice_hours, 0, 168, 'hours before')}
          ${num('lsn-r-dias', 'Book up to', s.max_days_ahead, 1, 180, 'days ahead')}
          ${num('lsn-r-descanso', 'Break between lessons', s.break_min, 0, 120, 'min')}
          <div class="lsn-regla"><label for="lsn-r-paso">Start times every</label><span><select id="lsn-r-paso">
            ${[15, 30, 60].map((m) => `<option value="${m}"${m === s.step_min ? ' selected' : ''}>${m}</option>`).join('')}</select> min</span></div>
          ${num('lsn-r-max', 'Upcoming lessons per player', s.max_upcoming, 1, 20, 'max')}
          ${num('lsn-r-cambio', 'Players can change / cancel until', s.change_until_hours, 0, 168, 'hours before')}
          <div class="form-group"><label for="lsn-r-coach">Coach name (players see it)</label><input type="text" id="lsn-r-coach" maxlength="40" value="${esc(s.coach_name)}" required></div>
          <div class="form-group"><label for="lsn-r-mail">Send booking alerts to</label><input type="email" id="lsn-r-mail" maxlength="200" value="${esc(s.alert_email || '')}" placeholder="${esc(g.email || 'your email')}">
            <span class="lsn-gris">Empty = your Google Calendar email. You get an email when a player books, changes or cancels.</span></div>
          <div><button type="submit" class="btn btn-sm btn-primary" data-busy="Saving…">Save rules</button></div>
        </form>
      </section>

      <section class="lsn-caja"><h3>Weekly hours</h3>
        <div id="lsn-horario"></div>
        <div class="lsn-fila-botones"><button type="button" class="btn btn-sm btn-primary" data-action="lsnHorasGuardar" data-busy="Saving…">Save hours</button></div>
        <h3 class="lsn-h3-2">Blocked dates</h3>
        ${bloques ? `<ul class="lsn-bloques">${bloques}</ul>` : '<p class="lsn-gris">No blocked dates.</p>'}
        <form id="lsn-bloqueo-form" class="lsn-bloqueo-form">
          <div class="form-row"><div class="form-group"><label for="lsn-b-desde">From</label><input type="date" id="lsn-b-desde" required min="${esc(diaET())}"></div>
          <div class="form-group"><label for="lsn-b-hasta">To</label><input type="date" id="lsn-b-hasta" required min="${esc(diaET())}"></div></div>
          <div class="form-group"><label for="lsn-b-nota">Note (optional)</label><input type="text" id="lsn-b-nota" maxlength="80" placeholder="e.g. Vacation, Tournament"></div>
          <div><button type="submit" class="btn btn-sm btn-outline" data-busy="Saving…">Block these dates</button></div>
        </form>
      </section></div>`;
    pintarHorario();
    $('lsn-reglas-form').addEventListener('submit', window.FerociaBoton ? window.FerociaBoton.formulario(guardarReglas) : guardarReglas);
    $('lsn-bloqueo-form').addEventListener('submit', window.FerociaBoton ? window.FerociaBoton.formulario(bloquear) : bloquear);
    if (g.status === 'connected') cargarCalendarios();
  }

  function pintarHorario() {
    const caja = $('lsn-horario');
    if (!caja) return;
    caja.innerHTML = ORDEN_SEMANA.map((dow) => {
      const tramos = _horasEdit.map((h, i) => ({ ...h, i })).filter((h) => h.dow === dow);
      return `<div class="lsn-dia"><span class="lsn-dia-n">${DIAS[dow]}</span><div class="lsn-tramos">
        ${tramos.length ? tramos.map((h) => `<span class="lsn-tramo">
          <input type="time" step="900" value="${esc(h.starts)}" data-i="${h.i}" data-k="starts" aria-label="${DIAS_LARGOS[dow]} from">
          <span>–</span><input type="time" step="900" value="${esc(h.ends)}" data-i="${h.i}" data-k="ends" aria-label="${DIAS_LARGOS[dow]} to">
          <button type="button" class="lsn-quitar" data-action="lsnTramoQuitar" data-i="${h.i}" aria-label="Remove ${DIAS_LARGOS[dow]} ${esc(hhmmA12(h.starts))} range">✕</button></span>`).join('')
          : '<span class="lsn-no">Not available</span>'}
        <button type="button" class="lsn-mas" data-action="lsnTramoMas" data-dow="${dow}">+ Add hours</button></div></div>`;
    }).join('');
    caja.querySelectorAll('input[type="time"]').forEach((inp) => inp.addEventListener('change', () => {
      _horasEdit[Number(inp.dataset.i)][inp.dataset.k] = inp.value;
    }));
  }
  function tramoMas(btn) {
    const dow = Number(btn.dataset.dow);
    const delDia = _horasEdit.filter((h) => h.dow === dow);
    const ultimo = delDia.length ? delDia[delDia.length - 1].ends : '08:00';
    const [h] = ultimo.split(':').map(Number);
    const ini = delDia.length ? `${String(Math.min(h + 1, 22)).padStart(2, '0')}:00` : '08:00';
    const fin = `${String(Math.min(Number(ini.slice(0, 2)) + 4, 23)).padStart(2, '0')}:00`;
    _horasEdit.push({ dow, starts: ini, ends: fin });
    pintarHorario();
  }
  function tramoQuitar(btn) { _horasEdit.splice(Number(btn.dataset.i), 1); pintarHorario(); }
  async function guardarHoras() {
    const malo = _horasEdit.find((h) => !h.starts || !h.ends || h.ends <= h.starts);
    if (malo) { window.toast(`${DIAS_LARGOS[malo.dow]}: each range needs a start and an end, and the end after the start.`, true); return; }
    try {
      await rpc('admin_clases_horas_guardar', { p_horas: _horasEdit.map((h) => ({ dow: h.dow, starts: h.starts, ends: h.ends })) });
      window.toast('Weekly hours saved.');
      await cargarAjustes();
    } catch (err) { window.toast(errorLegible(err), true); }
  }

  async function guardarReglas(e) {
    e.preventDefault();
    const n = (id) => Number($(id).value);
    try {
      await rpc('admin_clases_reglas_guardar', { p: {
        min_notice_hours: n('lsn-r-aviso'), max_days_ahead: n('lsn-r-dias'), break_min: n('lsn-r-descanso'),
        step_min: n('lsn-r-paso'), max_upcoming: n('lsn-r-max'), change_until_hours: n('lsn-r-cambio'),
        coach_name: $('lsn-r-coach').value.trim(), alert_email: $('lsn-r-mail').value.trim() } });
      window.toast('Booking rules saved.');
      await cargarAjustes();
    } catch (err) { window.toast(errorLegible(err), true); }
  }
  async function bloquear(e) {
    e.preventDefault();
    const desde = $('lsn-b-desde').value, hasta = $('lsn-b-hasta').value || desde;
    try {
      const n = await rpc('admin_clases_bloqueo_agregar', { p_desde: desde, p_hasta: hasta, p_nota: $('lsn-b-nota').value.trim() || null });
      window.toast(n > 0 ? `Dates blocked. You have ${n} lesson${n === 1 ? '' : 's'} already booked in those days — they were NOT cancelled. Cancel them from Bookings if needed.` : 'Dates blocked.', n > 0);
      await cargar();
    } catch (err) { window.toast(errorLegible(err), true); }
  }
  async function quitarBloqueo(btn) {
    try { await rpc('admin_clases_bloqueo_quitar', { p_id: Number(btn.dataset.id) }); window.toast('Blocked dates removed.'); await cargar(); }
    catch (err) { window.toast(errorLegible(err), true); }
  }

  function tipoAbrir(btn) {
    const t = btn && btn.dataset.id ? (_ajustes.types || []).find((x) => String(x.id) === btn.dataset.id) : null;
    const opc = (lista, v) => lista.map((x) => `<option value="${x}"${Number(v) === x ? ' selected' : ''}>${x}</option>`).join('');
    abrirVentana(`
      <div class="modal-title">${t ? 'Edit lesson type' : 'New lesson type'}</div>
      <form id="lsn-tipo-form">
        <div class="form-group"><label for="lsn-t-nombre">Name</label><input type="text" id="lsn-t-nombre" maxlength="60" required value="${esc(t ? t.name : '')}" placeholder="e.g. Private lesson" data-foco></div>
        <div class="form-group"><label for="lsn-t-desc">Short description (optional)</label><input type="text" id="lsn-t-desc" maxlength="200" value="${esc(t && t.description ? t.description : '')}" placeholder="e.g. One-on-one, any level"></div>
        <div class="form-row">
          <div class="form-group"><label for="lsn-t-dur">Length</label><select id="lsn-t-dur">${[30, 45, 60, 75, 90, 120].map((m) => `<option value="${m}"${(t ? t.duration_min : 60) === m ? ' selected' : ''}>${m} min</option>`).join('')}</select></div>
          <div class="form-group"><label for="lsn-t-precio">Price ($, optional)</label><input type="number" id="lsn-t-precio" min="0" max="10000" step="0.01" value="${esc(t && t.price != null ? Number(t.price) : '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="lsn-t-min">Min players</label><select id="lsn-t-min">${opc([1, 2, 3, 4, 5, 6, 7, 8], t ? t.min_players : 1)}</select></div>
          <div class="form-group"><label for="lsn-t-max">Max players</label><select id="lsn-t-max">${opc([1, 2, 3, 4, 5, 6, 7, 8], t ? t.max_players : 1)}</select></div>
        </div>
        <label class="lsn-check"><input type="checkbox" id="lsn-t-activo"${!t || t.active ? ' checked' : ''}> Active (players can book it)</label>
        <p class="lsn-gris">Semi-private: one player books the time for the whole group and says how many come.</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline btn-sm" data-action="lsnCerrar">Cancel</button>
          <button type="submit" class="btn btn-sm btn-primary" data-busy="Saving…">Save</button>
        </div>
      </form>`, '520px');
    const f = $('lsn-tipo-form');
    f.dataset.id = t ? t.id : '';
    f.addEventListener('submit', window.FerociaBoton ? window.FerociaBoton.formulario(guardarTipo) : guardarTipo);
  }
  async function guardarTipo(e) {
    e.preventDefault();
    const id = e.currentTarget.dataset.id ? Number(e.currentTarget.dataset.id) : null;
    const min = Number($('lsn-t-min').value), max = Number($('lsn-t-max').value);
    if (max < min) { window.toast('Max players must be the same or more than min players.', true); return; }
    const p = $('lsn-t-precio').value;
    try {
      await rpc('admin_clases_tipo_guardar', { p_id: id, p_name: $('lsn-t-nombre').value.trim(), p_description: $('lsn-t-desc').value.trim() || null,
        p_duration: Number($('lsn-t-dur').value), p_min: min, p_max: max, p_price: p === '' ? null : Number(p), p_active: $('lsn-t-activo').checked });
      cerrarVentana();
      window.toast('Lesson type saved.');
      await cargar();
    } catch (err) { window.toast(errorLegible(err), true); }
  }
  async function tipoActivo(btn) {
    const t = (_ajustes.types || []).find((x) => String(x.id) === btn.dataset.id);
    if (!t) return;
    try {
      await rpc('admin_clases_tipo_guardar', { p_id: t.id, p_name: t.name, p_description: t.description, p_duration: t.duration_min,
        p_min: t.min_players, p_max: t.max_players, p_price: t.price, p_active: !t.active });
      window.toast(t.active ? 'Paused. Players no longer see it.' : 'Active. Players can book it.');
      await cargar();
    } catch (err) { window.toast(errorLegible(err), true); }
  }
  async function tipoBorrar(btn) {
    const t = (_ajustes.types || []).find((x) => String(x.id) === btn.dataset.id);
    if (!t) return;
    const ok = await window.confirmModal({ title: 'Delete this lesson type?', message: `“${t.name}” will be deleted. This can't be undone.`, okLabel: 'Delete', danger: true, focusCancel: true });
    if (!ok) return;
    try { await rpc('admin_clases_tipo_borrar', { p_id: t.id }); window.toast('Lesson type deleted.'); await cargar(); }
    catch (err) { window.toast(errorLegible(err), true); }
  }

  // Google
  async function cargarCalendarios() {
    const caja = $('lsn-cals');
    try {
      const r = await funcion('google_calendars');
      if (!$('lsn-cals')) return;
      caja.innerHTML = (r.calendars || []).map((c) => `<label class="lsn-check"><input type="checkbox" value="${esc(c.id)}"${c.checked ? ' checked' : ''}> ${esc(c.name)}${c.primary ? ' <span class="lsn-gris">(main)</span>' : ''}</label>`).join('')
        || '<p class="lsn-gris">No calendars found.</p>';
    } catch (err) { if ($('lsn-cals')) caja.innerHTML = `<p class="lsn-nota lsn-nota-roja">${esc(errorLegible(err))}</p>`; }
  }
  async function guardarCalendarios() {
    const ids = [...document.querySelectorAll('#lsn-cals input[type="checkbox"]:checked')].map((i) => i.value);
    if (!document.querySelector('#lsn-cals input[type="checkbox"]')) return;
    if (!ids.length) {
      const ok = await window.confirmModal({ title: 'No calendars checked?', message: 'FEROCIA would not check any of your calendars for busy times — players could book over your personal plans. Save anyway?', okLabel: 'Save anyway', focusCancel: true });
      if (!ok) return;
    }
    try { await rpc('admin_clases_calendarios_guardar', { p_ids: ids }); window.toast('Calendars saved.'); await cargarAjustes(); }
    catch (err) { window.toast(errorLegible(err), true); }
  }
  async function conectar() {
    try {
      const r = await funcion('google_start');
      location.assign(r.url);
      return new Promise(() => {});      // el botón sigue ocupado mientras se va a Google
    } catch (err) { window.toast(errorLegible(err), true); }
  }
  async function desconectar() {
    const ok = await window.confirmModal({ title: 'Disconnect Google Calendar?', message: "Players won't be able to book lessons until you connect again. Lessons already booked stay (and stay in your Google Calendar).", okLabel: 'Disconnect', danger: true, focusCancel: true });
    if (!ok) return;
    try { await funcion('google_disconnect'); window.toast('Google Calendar disconnected.'); await cargar(); }
    catch (err) { window.toast(errorLegible(err), true); }
  }

  /* La vuelta de Google (admin.html?code=…&state=…&scope=…). Sólo si el vale
     tiene la forma de los nuestros: así nunca se confunde con otra cosa. */
  async function volverDeGoogle() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (_) { return; }
    const vale = q.get('state') || '';
    const esNuestro = /^[0-9a-f]{64}$/.test(vale) && ((q.get('code') && /googleapis\.com/.test(q.get('scope') || '')) || q.get('error'));
    if (!esNuestro) return;
    const codigo = q.get('code'), error = q.get('error');
    history.replaceState(null, '', location.pathname + location.hash);
    try { await window.app.authReady; } catch (_) { return; }
    _tab = 'settings';
    if (window.showPage) window.showPage('lessons', $('sb-lessons'));
    if (error) { window.toast('Google Calendar was not connected (you cancelled, or Google said no). You can try again.', true); return; }
    try {
      const r = await funcion('google_finish', { code: codigo, state: vale });
      window.toast(`Google Calendar connected${r.email ? ` (${r.email})` : ''}. Lessons will appear in “FEROCIA Lessons”. Now check which calendars to look at for busy times.`);
    } catch (err) {
      window.toast(errorLegible(err), true);
    }
    cargar();
  }

  // ── Registro ─────────────────────────────────────────────
  window.AdminPageLoaders = window.AdminPageLoaders || {};
  window.AdminPageLoaders.lessons = () => cargar();
  Object.assign(window.CLICK_HANDLERS, {
    /* Pestañas y semanas: sin "ocupado" (se puede cambiar de pestaña
       mientras carga; la última gana). El resto devuelve su promesa: el
       botón se bloquea al primer clic hasta que termina (§117). */
    lsnTab: (btn) => { _tab = btn.dataset.tab; cargar(); },
    lsnVista: (btn) => { _vista = btn.dataset.vista; cargar(); },
    lsnSemana: (btn) => { const d = Number(btn.dataset.dir); _lunes = d === 0 ? lunesDe(diaET()) : sumarDias(_lunes || lunesDe(diaET()), 7 * d); cargar(); },
    lsnVer: (btn) => ver(btn.dataset.id),
    lsnCerrar: () => cerrarVentana(),
    lsnMarcar: (btn) => marcar(btn),
    lsnCancelarAbrir: (btn) => cancelarAbrir(btn),
    lsnCambiarAbrir: (btn) => cambiarAbrir(btn),
    lsnAnadir: () => anadirAbrir(),
    lsnHora: (btn) => elegirHora(btn),
    lsnJugador: (btn) => elegirJugador(btn),
    lsnJugadorQuitar: () => quitarJugador(),
    lsnTipoAbrir: (btn) => tipoAbrir(btn),
    lsnTipoActivo: (btn) => tipoActivo(btn),
    lsnTipoBorrar: (btn) => tipoBorrar(btn),
    lsnTramoMas: (btn) => tramoMas(btn),
    lsnTramoQuitar: (btn) => tramoQuitar(btn),
    lsnHorasGuardar: () => guardarHoras(),
    lsnBloqueoQuitar: (btn) => quitarBloqueo(btn),
    lsnCalsGuardar: () => guardarCalendarios(),
    lsnGoogleConectar: () => conectar(),
    lsnGoogleQuitar: () => desconectar(),
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('lsn-modal') && $('lsn-modal').classList.contains('open') && !document.querySelector('#confirm-modal.open')) cerrarVentana();
  });
  document.addEventListener('click', (e) => { if (e.target === $('lsn-modal')) cerrarVentana(); });

  /* Para las pruebas. */
  window.__lessonsAdmin = { instanteET, lunesDe, sumarDias, errorLegible };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', volverDeGoogle);
  else volverDeGoogle();
})();
