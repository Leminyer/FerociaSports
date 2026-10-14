/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PLAYER CLAIMS
   Portal del Jugador, hitos 3 y 4 (14 de octubre) — decisiones §43–§49
   Pantalla aprobada en el diseño ("Admin panel — Player claims").

   Tres pestañas:
     · To review: las cuentas del portal que la base no pudo unir solas
       a una ficha. Se ve lo que escribió el jugador al lado de la(s)
       ficha(s) parecida(s), y se decide: Approve (unir), Link to another
       player (buscar otra ficha), Create new player o Reject.
     · Help messages: los mensajes de "Need help?" del portal. Se
       contestan por correo (Reply by email) y se marcan resueltos.
     · Resolved: lo decidido (y lo que se unió solo), con "Reopen" para
       un rechazo.
   Al decidir, se le manda un correo al jugador EN ESE MISMO CLIC (si la
   casilla "Email the player" está marcada): nada sale solo (§44).
   El círculo rojo del menú cuenta reclamos por revisar + mensajes sin
   resolver.

   La seguridad está en la base (sql/89): cada función comprueba que
   quien llama es administradora activa. Si el SQL 89 no está, la
   pantalla lo dice y el resto del panel funciona igual.

   Depende de: db.js (esc, toast, confirmModal, window.supabase),
   admin-email-utils.js (sendEmailServer), app.js (AdminPageLoaders,
   CLICK_HANDLERS, app.authReady). Estilos: admin-pages.css (pc-).
   ============================================================ */

(function () {
  'use strict';

  /* La dirección del portal para los correos. Mientras se prueba es la
     de GitHub; en el hito 5 pasa a https://players.ferociasports.com */
  const PORTAL_URL = 'https://leminyer.github.io/FerociaPlayers/';
  const CADA = 3 * 60 * 1000;

  const sb = () => window.supabase;
  const esc = (x) => window.esc(x == null ? '' : String(x));
  const $ = (id) => document.getElementById(id);

  const MOTIVOS = {
    no_dob: ['No date of birth on file', 'pc-pill-warn'],
    dob_mismatch: ["Date of birth doesn't match", 'pc-pill-warn'],
    name_mismatch: ["Name doesn't match", 'pc-pill-warn'],
    shared_email: ['Shared email', 'pc-pill-blue'],
    several_match: ['Several records match', 'pc-pill-blue'],
    other_email: ['Matches a record with another email', 'pc-pill-gray'],
    already_linked: ['Record already linked to another account', 'pc-pill-red'],
  };
  const TEMAS = { signing_in: 'Signing in', player_history: 'My player history', my_details: 'My details', other: 'Something else' };

  let _tab = 'review';
  let _reclamos = [];
  let _sel = null;              // id del reclamo abierto
  let _cand = null;             // id de la ficha candidata elegida
  let _ocupada = false;
  let _vez = 0;

  // ── Formatos ─────────────────────────────────────────────────
  const fecha = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
  };
  const telefono = (t) => {
    const d = String(t || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(t || '');
  };
  function hace(iso) {
    const t = new Date(iso).getTime();
    if (!t) return '';
    const min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min} min ago`;
    const hrs = Math.round(min / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    if (hrs < 48) return 'Yesterday';
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  const cuando = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const nombre = (x) => [x.first_name, x.last_name].filter(Boolean).join(' ') || x.account_email || x.email || 'Player';

  const errorLegible = (err) => {
    const m = String((err && err.message) || err || '');
    if (/claim_already_decided/.test(m)) return 'Another admin already decided this one. The list is refreshed.';
    if (/player_already_linked/.test(m)) return 'That player record is already connected to another portal account.';
    if (/player_not_found/.test(m)) return 'That player record no longer exists.';
    if (/player_exists/.test(m)) return 'A player with that name and email already exists — link to it instead.';
    if (/claim_not_found/.test(m)) return 'This claim no longer exists (the account was deleted).';
    if (/not_authorized|permission denied/.test(m)) return 'Your admin access could not be confirmed. Sign in again.';
    if (/function .* does not exist|Could not find the function/i.test(m)) return 'The Player Portal is not installed yet (SQL 89).';
    return 'Something went wrong. Please try again in a moment.';
  };

  // ── El círculo rojo ──────────────────────────────────────────
  let _vezCuenta = 0;
  async function contar() {
    if (!sb()) return;
    const mia = ++_vezCuenta;
    try {
      const { data, error } = await sb().rpc('admin_portal_pendientes');
      if (mia !== _vezCuenta) return;
      if (error) throw error;
      pintarCuentas(Number(data && data.claims) || 0, Number(data && data.help) || 0);
    } catch (err) {
      if (mia !== _vezCuenta) return;
      console.warn('[player-claims] no se pudo contar:', err?.message || err);
      pintarCuentas(0, 0);
    }
  }
  function pintarCuentas(reclamos, ayuda) {
    const total = reclamos + ayuda;
    const t = (n) => (n > 99 ? '99+' : String(n));
    [['pc-sb', total], ['pc-md', total], ['pc-n-review', reclamos], ['pc-n-help', ayuda]].forEach(([id, n]) => {
      const el = $(id);
      if (!el) return;
      el.textContent = t(n);
      el.hidden = n === 0;
    });
    const frase = total ? ` — ${total} waiting` : '';
    ['sb-player-claims', 'md-player-claims'].forEach((id) => { const b = $(id); if (b) b.setAttribute('aria-label', `Player claims${frase}`); });
  }

  // ── Las pestañas ─────────────────────────────────────────────
  function marcarPestana() {
    document.querySelectorAll('#page-player-claims .pc-tab').forEach((b) => {
      const si = b.dataset.tab === _tab;
      b.classList.toggle('active', si);
      b.setAttribute('aria-selected', si ? 'true' : 'false');
    });
  }
  async function cargar() {
    marcarPestana();
    const caja = $('pc-body');
    const mia = ++_vez;
    caja.innerHTML = '<div class="loading">Loading...</div>';
    try {
      if (_tab === 'review') {
        const { data, error } = await sb().rpc('admin_portal_reclamos', { p_vista: 'review' });
        if (error) throw error;
        if (mia !== _vez) return;
        _reclamos = Array.isArray(data) ? data : [];
        if (!_reclamos.some((r) => r.id === _sel)) { _sel = _reclamos.length ? _reclamos[0].id : null; _cand = null; }
        pintarRevision();
      } else if (_tab === 'help') {
        const { data, error } = await sb().rpc('admin_portal_ayuda', { p_vista: 'open' });
        if (error) throw error;
        if (mia !== _vez) return;
        pintarAyuda(Array.isArray(data) ? data : [], false);
      } else {
        const [r, a] = await Promise.all([
          sb().rpc('admin_portal_reclamos', { p_vista: 'resolved' }),
          sb().rpc('admin_portal_ayuda', { p_vista: 'resolved' }),
        ]);
        if (r.error) throw r.error;
        if (a.error) throw a.error;
        if (mia !== _vez) return;
        pintarResueltos(Array.isArray(r.data) ? r.data : [], Array.isArray(a.data) ? a.data : []);
      }
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[player-claims] no se pudo leer:', err);
      caja.innerHTML = `<div class="pc-vacio">${esc(errorLegible(err))}</div>`;
    }
  }

  // ── To review ────────────────────────────────────────────────
  function pastilla(r) {
    if (r.review_reason === 'shared_email') {
      return `<span class="pc-pill pc-pill-blue">Shared email — ${esc((r.candidates || []).length)} records</span>`;
    }
    const [txt, cls] = MOTIVOS[r.review_reason] || ['Needs a look', 'pc-pill-gray'];
    return `<span class="pc-pill ${cls}">${esc(txt)}</span>`;
  }

  function pintarRevision() {
    const caja = $('pc-body');
    if (!_reclamos.length) {
      caja.innerHTML = '<div class="pc-vacio pc-vacio-ok">Nothing to review. New portal accounts that need your OK will show up here.</div>';
      return;
    }
    const lista = _reclamos.map((r) => `
      <button type="button" class="pc-item${r.id === _sel ? ' active' : ''}" data-action="pcSel" data-id="${esc(r.id)}" aria-pressed="${r.id === _sel}">
        <span class="pc-item-top"><span class="pc-item-name">${esc(nombre(r))}</span><span class="pc-item-when">${esc(hace(r.created_at))}</span></span>
        ${pastilla(r)}
      </button>`).join('');
    caja.innerHTML = `<div class="pc-split"><div class="pc-list">${lista}</div><section class="pc-detail" id="pc-detail" aria-live="polite"></section></div>`;
    pintarDetalle();
  }

  function fila(campo, suyo, ficha, coincide, aviso) {
    const m = coincide === true ? '<span class="pc-si">Yes</span>'
      : coincide === false ? '<span class="pc-no">No</span>'
      : coincide === 'na' ? '<span class="pc-no">Can\'t check</span>' : '';
    return `<tr${aviso ? ' class="pc-fila-aviso"' : ''}><td class="pc-campo">${esc(campo)}</td><td>${suyo}</td><td>${ficha}</td><td>${m}</td></tr>`;
  }

  function pintarDetalle() {
    const caja = $('pc-detail');
    const r = _reclamos.find((x) => x.id === _sel);
    if (!caja || !r) return;
    const cands = r.candidates || [];
    if (!cands.some((c) => c.id === _cand)) _cand = cands.length ? (cands.find((c) => !c.linked_elsewhere) || cands[0]).id : null;
    const c = cands.find((x) => x.id === _cand) || null;

    const elegir = cands.length > 1 ? `
      <div class="pc-cands" role="group" aria-label="Similar player records">
        ${cands.map((x) => `<button type="button" class="pc-cand${x.id === _cand ? ' active' : ''}" data-action="pcCand" data-id="${esc(x.id)}" aria-pressed="${x.id === _cand}">
          #${esc(x.id)} · ${esc(nombre(x))}${x.linked_elsewhere ? ' <span class="pc-mini-red">linked</span>' : ''}</button>`).join('')}
      </div>` : '';

    const nada = '<span class="pc-nada">—</span>';
    let tabla = '';
    if (c) {
      const sinFecha = !c.date_of_birth;
      tabla = `
      <div class="pc-tabla-wrap"><table class="pc-tabla">
        <thead><tr><th scope="col">Field</th><th scope="col">Portal account</th><th scope="col">Player record #${esc(c.id)}</th><th scope="col">Match</th></tr></thead>
        <tbody>
          ${fila('Email (verified)', esc(r.account_email), esc(c.email) || nada, norm(r.account_email) === norm(c.email))}
          ${fila('First name', esc(r.first_name), esc(c.first_name), norm(r.first_name) === norm(c.first_name))}
          ${fila('Last name', esc(r.last_name), esc(c.last_name), norm(r.last_name) === norm(c.last_name))}
          ${fila('Date of birth', esc(fecha(r.date_of_birth)), sinFecha ? '<span class="pc-no">Not on file</span>' : esc(fecha(c.date_of_birth)),
                 sinFecha ? 'na' : r.date_of_birth === c.date_of_birth, sinFecha)}
          ${fila('Phone', esc(telefono(r.phone)), esc(telefono(c.phone)) || nada,
                 String(r.phone || '').replace(/\D/g, '').slice(-10) === String(c.phone || '').replace(/\D/g, '').slice(-10))}
          ${fila('History', nada, esc(`${c.ladders} ladder${c.ladders === 1 ? '' : 's'} · ${c.tournaments} tournament${c.tournaments === 1 ? '' : 's'}`), null)}
        </tbody>
      </table></div>
      ${c.linked_elsewhere ? '<div class="pc-aviso">This player record is already connected to another portal account. Link this person to a different record or create a new player.</div>' : ''}
      ${c.status && c.status !== 'active' ? `<div class="pc-nota">Record status: ${esc(c.status)}.</div>` : ''}`;
    } else {
      tabla = `<div class="pc-datos">
        <div><span class="pc-campo">Email (verified)</span> ${esc(r.account_email)}</div>
        <div><span class="pc-campo">Date of birth</span> ${esc(fecha(r.date_of_birth))}</div>
        <div><span class="pc-campo">Phone</span> ${esc(telefono(r.phone))}</div>
        <div class="pc-nota">No similar player record. You can link to an existing player or create a new one.</div>
      </div>`;
    }

    caja.innerHTML = `
      <div class="pc-detail-head">
        <h2 class="pc-detail-name">${esc(nombre(r))}</h2>
        <span class="pc-detail-when">Signed up ${esc(cuando(r.created_at))}</span>
      </div>
      <div class="pc-detail-sub">${pastilla(r)} <span class="pc-detail-extra">${esc(r.gender || '')}${r.skill_level ? ` · ${esc(r.skill_level)}` : ''}</span></div>
      ${elegir}
      ${tabla}
      <div class="pc-buscar" id="pc-buscar" hidden>
        <label class="ap-label" for="pc-q">Find a player (name, email or record #)</label>
        <div class="pc-buscar-fila">
          <input type="search" id="pc-q" class="ap-input" autocomplete="off" placeholder="e.g. Rivera, alex@…, 214">
          <button type="button" class="av-btn av-btn-sec" data-action="pcBuscarIr">Search</button>
        </div>
        <div id="pc-resultados" class="pc-resultados"></div>
      </div>
      <div class="ap-group pc-nota-campo">
        <label class="ap-label" for="pc-nota">Note <span class="av-opc">(optional — only admins see it)</span></label>
        <input type="text" id="pc-nota" class="ap-input" maxlength="500" autocomplete="off">
      </div>
      <label class="av-check pc-correo"><input type="checkbox" id="pc-correo" checked> <span>Email the player about my decision</span></label>
      <div class="pc-botones">
        ${c ? `<button type="button" class="av-btn av-btn-pri" data-action="pcAprobar" data-player="${esc(c.id)}"${c.linked_elsewhere ? ' disabled' : ''}>Approve &amp; link to #${esc(c.id)}</button>` : ''}
        <button type="button" class="av-btn av-btn-sec" data-action="pcBuscar">Link to another player…</button>
        <button type="button" class="av-btn av-btn-sec" data-action="pcCrear">Create new player</button>
        <button type="button" class="av-btn pc-btn-peligro" data-action="pcRechazar">Reject</button>
      </div>
      <p class="pc-pie">When you approve, the date of birth they entered is saved to the record (if it had none). The player gets an email when you decide.</p>`;
    const q = $('pc-q');
    if (q) q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
  }

  async function buscar() {
    const caja = $('pc-resultados');
    const crudo = String(($('pc-q') || {}).value || '').trim();
    /* Sólo letras, números y lo de un correo: la búsqueda va dentro de
       un filtro de la base y no debe poder cambiarlo. */
    const q = crudo.replace(/[^\p{L}\p{N}@.\-' ]/gu, '').slice(0, 60);
    if (q.length < 2 && !/^\d+$/.test(q)) { caja.innerHTML = '<div class="pc-nota">Type at least 2 letters.</div>'; return; }
    caja.innerHTML = '<div class="loading">Searching...</div>';
    try {
      let consulta = sb().from('players').select('id,first_name,last_name,email,phone,date_of_birth,status').order('last_name').limit(12);
      if (/^\d+$/.test(q)) consulta = consulta.eq('id', Number(q));
      else {
        /* "Alex Rivera": nombre Y apellido; una sola palabra: en nombre,
           apellido o correo. */
        const palabras = q.split(/\s+/).filter(Boolean);
        const p = `*${palabras.join('*')}*`;
        let filtro = `first_name.ilike.${p},last_name.ilike.${p},email.ilike.${p}`;
        if (palabras.length >= 2) {
          const ultimo = palabras[palabras.length - 1];
          const resto = palabras.slice(0, -1).join('*');
          filtro += `,and(first_name.ilike.*${resto}*,last_name.ilike.*${ultimo}*)`;
        }
        consulta = consulta.or(filtro);
      }
      const { data, error } = await consulta;
      if (error) throw error;
      const filas = data || [];
      caja.innerHTML = filas.length ? filas.map((p) => `
        <div class="pc-res">
          <span class="pc-res-txt"><strong>#${esc(p.id)} · ${esc(nombre(p))}</strong>
            <span>${esc(p.email || 'no email')} · ${esc(telefono(p.phone))}${p.date_of_birth ? ` · ${esc(fecha(p.date_of_birth))}` : ''}${p.status !== 'active' ? ` · ${esc(p.status)}` : ''}</span></span>
          <button type="button" class="av-btn av-btn-pri" data-action="pcAprobar" data-player="${esc(p.id)}">Link to #${esc(p.id)}</button>
        </div>`).join('') : '<div class="pc-nota">No players found.</div>';
    } catch (err) {
      console.error('[player-claims] búsqueda:', err);
      caja.innerHTML = `<div class="pc-nota">${esc(errorLegible(err))}</div>`;
    }
  }

  // ── Decidir ──────────────────────────────────────────────────
  const CORREOS = {
    linked: (r) => ({
      subject: 'Your FEROCIA Player Portal is ready',
      body: `Good news — we connected your account to your FEROCIA player record. Your ladders, results and tournaments are waiting for you.\n\nSign in here: ${PORTAL_URL}\n\nUse ${r.account_email} — we'll send you a secure sign-in link. No password needed.`,
    }),
    reject: () => ({
      subject: 'About your FEROCIA Player Portal account',
      body: `We couldn't connect your account to a FEROCIA player record yet.\n\nPlease reply to this email, or send us a message from the portal (Help), so we can sort it out together: ${PORTAL_URL}`,
    }),
  };

  async function decidir(accion, playerId) {
    if (_ocupada) return;
    const r = _reclamos.find((x) => x.id === _sel);
    if (!r) return;
    const avisar = !!($('pc-correo') && $('pc-correo').checked);
    const nota = (($('pc-nota') || {}).value || '').trim();
    const quien = nombre(r);
    const preguntas = {
      approve: { title: `Link ${quien} to record #${playerId}?`, message: `${quien} will see this player's ladders, results and tournaments in the portal.${avisar ? ' We will email them now.' : ''}`, okLabel: 'Approve & link' },
      create: { title: `Create a new player for ${quien}?`, message: `A new player record is created with what they entered, and connected to their account.${avisar ? ' We will email them now.' : ''}`, okLabel: 'Create player' },
      reject: { title: `Reject ${quien}'s claim?`, message: `They will see that we couldn't confirm their history and will be invited to send us a message.${avisar ? ' We will email them now.' : ''}`, okLabel: 'Reject', danger: true },
    };
    if (!(await window.confirmModal(preguntas[accion]))) return;

    _ocupada = true;
    document.querySelectorAll('#pc-detail button').forEach((b) => { b.disabled = true; });
    let hecho = null;
    try {
      const { data, error } = await sb().rpc('admin_portal_decidir', {
        p_id: r.id, p_accion: accion, p_player_id: accion === 'approve' ? Number(playerId) : null, p_nota: nota || null,
      });
      if (error) throw error;
      hecho = data || {};
    } catch (err) {
      console.error('[player-claims] decidir:', err);
      window.toast(errorLegible(err), true);
      _ocupada = false;
      await cargar();
      contar();
      return;
    }

    let msg = accion === 'reject' ? `${quien}'s claim was rejected.` : `${quien} is connected to record #${hecho.player_id}.`;
    let mal = false;
    if (avisar && hecho.email) {
      const correo = (accion === 'reject' ? CORREOS.reject : CORREOS.linked)({ account_email: hecho.email });
      try {
        const res = await window.sendEmailServer({
          kind: 'player_message', template: 'message', subject: correo.subject, body: correo.body,
          recipients: [{ email: hecho.email, name: hecho.first_name || quien }],
        });
        if (res && res.ok && (!res.data || res.data.sent !== 0)) msg += ' We emailed them.';
        else { mal = true; msg += ` The email did not go out${res && res.message ? ` (${res.message})` : ''} — you can write to ${hecho.email} yourself.`; }
      } catch (e) {
        mal = true;
        msg += ` The email did not go out — you can write to ${hecho.email} yourself.`;
      }
    }
    window.toast(msg, mal);
    _ocupada = false;
    _sel = null;
    await cargar();
    contar();
  }

  // ── Help messages ────────────────────────────────────────────
  function estadoCuenta(m) {
    if (m.link_status === 'linked') return '<span class="pc-pill pc-pill-green">Linked</span>';
    if (m.claim_status === 'review_required') return '<span class="pc-pill pc-pill-warn">In review</span>';
    if (m.claim_status === 'rejected') return '<span class="pc-pill pc-pill-red">Rejected</span>';
    return '<span class="pc-pill pc-pill-gray">No profile yet</span>';
  }
  function tarjetaAyuda(m, resuelta) {
    const asunto = encodeURIComponent('Re: your message to FEROCIA');
    return `
      <article class="pc-msg${resuelta ? ' pc-msg-hecho' : ''}">
        <div class="pc-msg-top">
          <span class="pc-pill pc-pill-blue">${esc(TEMAS[m.topic] || 'Message')}</span>
          ${estadoCuenta(m)}
          <span class="pc-item-when">${esc(hace(m.submitted_at))}</span>
        </div>
        <div class="pc-msg-who"><strong>${esc(nombre(m))}</strong> <span>${esc(m.email || '')}</span></div>
        <p class="pc-msg-txt">${esc(m.message)}</p>
        <div class="pc-botones">
          ${m.email ? `<a class="av-btn av-btn-sec" href="mailto:${encodeURIComponent(m.email)}?subject=${asunto}">Reply by email</a>` : ''}
          ${resuelta
            ? `<button type="button" class="av-btn av-btn-sec" data-action="pcAyudaAbrir" data-id="${esc(m.id)}">Reopen</button>`
            : `<button type="button" class="av-btn av-btn-pri" data-action="pcAyudaResolver" data-id="${esc(m.id)}">Mark as resolved</button>`}
        </div>
      </article>`;
  }
  function pintarAyuda(lista) {
    $('pc-body').innerHTML = lista.length
      ? `<div class="pc-msgs">${lista.map((m) => tarjetaAyuda(m, false)).join('')}</div>`
      : '<div class="pc-vacio pc-vacio-ok">No open messages. Messages players send from "Need help?" in the portal show up here.</div>';
  }
  async function resolverAyuda(id, si) {
    if (_ocupada) return;
    _ocupada = true;
    try {
      const { error } = await sb().rpc('admin_portal_ayuda_resolver', { p_id: Number(id), p_resuelta: si });
      if (error) throw error;
      window.toast(si ? 'Marked as resolved.' : 'Moved back to Help messages.');
    } catch (err) {
      window.toast(errorLegible(err), true);
    } finally {
      _ocupada = false;
    }
    await cargar();
    contar();
  }

  // ── Resolved ─────────────────────────────────────────────────
  function pintarResueltos(reclamos, ayudas) {
    const como = (r) => {
      if (r.claim_status === 'rejected') return '<span class="pc-pill pc-pill-red">Rejected</span>';
      if (r.review_reason === 'auto') return '<span class="pc-pill pc-pill-green">Linked automatically</span>';
      if (r.review_reason === 'new_player') return '<span class="pc-pill pc-pill-green">New player (automatic)</span>';
      return '<span class="pc-pill pc-pill-green">Approved</span>';
    };
    const filas = reclamos.map((r) => `
      <tr>
        <td><strong>${esc(nombre(r))}</strong><span class="pc-sub">${esc(r.account_email || '')}</span></td>
        <td>${como(r)}${r.linked_player ? `<span class="pc-sub">Record #${esc(r.linked_player.id)} · ${esc(nombre(r.linked_player))}</span>` : ''}</td>
        <td>${esc(r.decided_at ? cuando(r.decided_at) : '')}<span class="pc-sub">${esc(r.reviewed_by_name ? `by ${r.reviewed_by_name}` : (r.review_reason === 'auto' || r.review_reason === 'new_player') ? 'by the portal' : '')}</span></td>
        <td class="pc-td-nota">${esc(r.review_notes || '')}</td>
        <td>${r.claim_status === 'rejected' ? `<button type="button" class="av-btn av-btn-sec" data-action="pcReabrir" data-id="${esc(r.id)}">Reopen</button>` : ''}</td>
      </tr>`).join('');
    $('pc-body').innerHTML = `
      <div class="card pc-card">
        <div class="card-title">Portal accounts</div>
        ${reclamos.length ? `<div class="pc-tabla-wrap"><table class="pc-tabla pc-tabla-res">
          <thead><tr><th scope="col">Player</th><th scope="col">Result</th><th scope="col">When</th><th scope="col">Note</th><th scope="col"><span class="pc-sr">Actions</span></th></tr></thead>
          <tbody>${filas}</tbody></table></div>` : '<div class="pc-vacio">No decisions yet.</div>'}
      </div>
      <div class="card pc-card">
        <div class="card-title">Resolved help messages</div>
        ${ayudas.length ? `<div class="pc-msgs">${ayudas.map((m) => tarjetaAyuda(m, true)).join('')}</div>` : '<div class="pc-vacio">None yet.</div>'}
      </div>`;
  }
  async function reabrir(id) {
    if (_ocupada) return;
    if (!(await window.confirmModal({ title: 'Reopen this claim?', message: 'It goes back to "To review" so you can decide again. No email is sent.', okLabel: 'Reopen' }))) return;
    _ocupada = true;
    try {
      const { error } = await sb().rpc('admin_portal_decidir', { p_id: Number(id), p_accion: 'reopen', p_player_id: null, p_nota: null });
      if (error) throw error;
      window.toast('Back in "To review".');
      _tab = 'review';
      _sel = Number(id);
    } catch (err) {
      window.toast(errorLegible(err), true);
    } finally {
      _ocupada = false;
    }
    await cargar();
    contar();
  }

  // ── Arranque ─────────────────────────────────────────────────
  function abrir() {
    cargar();
    contar();
  }
  window.AdminPageLoaders.playerClaims = abrir;
  Object.assign(window.CLICK_HANDLERS, {
    pcTab: (btn) => { _tab = btn.dataset.tab; cargar(); },
    pcSel: (btn) => { _sel = Number(btn.dataset.id); _cand = null; pintarRevision(); },
    pcCand: (btn) => { _cand = Number(btn.dataset.id); pintarDetalle(); },
    pcAprobar: (btn) => decidir('approve', btn.dataset.player),
    pcCrear: () => decidir('create'),
    pcRechazar: () => decidir('reject'),
    pcBuscar: () => { const b = $('pc-buscar'); if (b) { b.hidden = false; $('pc-q').focus(); } },
    pcBuscarIr: () => buscar(),
    pcAyudaResolver: (btn) => resolverAyuda(btn.dataset.id, true),
    pcAyudaAbrir: (btn) => resolverAyuda(btn.dataset.id, false),
    pcReabrir: (btn) => reabrir(btn.dataset.id),
  });

  const empezar = () => {
    contar();
    setInterval(() => { if (document.visibilityState === 'visible') contar(); }, CADA);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') contar(); });
  };
  if (window.app && window.app.authReady) window.app.authReady.then(empezar);
})();
