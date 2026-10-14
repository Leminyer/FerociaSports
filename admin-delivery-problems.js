/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: DELIVERY PROBLEMS
   Ajuste 16 (12 de octubre) — decisiones §24

   La tercera pestaña de Communications: los avisos de Resend de que un
   correo rebotó o alguien lo marcó como spam, del más nuevo al más
   viejo. Los escribe la función resend-webhook (sql/80, email_events);
   aquí sólo se leen.

   Depende de: db.js (api), app.js (esc, toast) y admin-communications.js,
   que llama a window.cargarProblemasDeEntrega al abrir la pestaña.
   Estilos: admin-pages.css (dp-).
   ============================================================ */

(function () {
  'use strict';

  const POR_PAGINA = 25;
  const COLS = 'id,type,email,bounce_type,bounce_subtype,detail,action,occurred_at,received_at,'
             + 'communication_id,communications(subject,kind)';

  /* Qué se pide a la base con cada opción del desplegable. */
  const FILTROS = {
    '':           '',
    /* Los rebotes de verdad (el buzón no existe, o Resend ya lo tiene
       bloqueado), aunque la persona ya no esté en la base. Los rechazados
       y los de correos que no mandó esta app salen en "All problems".
       Ajuste 20: antes se quitaban todos los "Recorded only…", y con eso
       desaparecía el rebote de alguien que ya no estaba en la base. */
    bounced:      '&or=(type.eq.email.suppressed,and(type.eq.email.bounced,bounce_type.ilike.permanent,'
                + 'or(bounce_subtype.is.null,bounce_subtype.ilike.general,bounce_subtype.ilike.noemail,'
                + 'bounce_subtype.ilike.suppressed,bounce_subtype.ilike.onaccountsuppressionlist)))'
                + '&action=not.like.' + encodeURIComponent('*not sent by this app*'),
    complained:   '&type=eq.email.complained',
    /* Resend los llama Transient, Undetermined o Temporary: todo lo que
       no es Permanent. */
    temporary:    '&type=eq.email.bounced&or=(bounce_type.is.null,bounce_type.not.ilike.permanent)',
  };

  let _filas = [];
  let _hayMas = false;
  let _vez = 0;        // la respuesta de una carga vieja no se pinta
  let _cargando = false;

  const esc = (x) => window.esc(x == null ? '' : String(x));

  const cuando = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
         + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  /* MISMA REGLA que procesar_evento_resend (sql/80) y que History
     (admin-communications.js): un rebote permanente es "de verdad" sólo
     con estos subtipos, o sin subtipo. Cualquier otro es un RECHAZO. */
  const SUBTIPOS_REBOTE = ['general', 'noemail', 'suppressed', 'onaccountsuppressionlist'];
  /* Sin subtipo (null) cuenta como General; uno vacío (''), no: así lo
     hace el SQL (coalesce sólo cambia el null). */
  const esRechazo = (f) => !SUBTIPOS_REBOTE.includes(String(f.bounce_subtype == null ? 'general' : f.bounce_subtype).toLowerCase());

  /** Lo que pasó, en palabras, y de qué color. */
  const queFue = (f) => {
    if (f.type === 'email.complained') return { txt: 'Marked as spam', cls: 'dp-pill-spam' };
    if (f.type === 'email.suppressed') return { txt: 'Blocked by Resend', cls: 'dp-pill-bounce' };
    if (String(f.bounce_type || '').toLowerCase() === 'permanent') {
      /* Un mensaje rechazado por el servidor del destinatario no es "el
         buzón no existe": no se pinta como un rebote. Ajuste 20: se mira
         el subtipo y no la columna "What we did" — un rebote de verdad de
         alguien que ya no está en la base también dice "Recorded only…",
         y salía como Rejected. */
      return esRechazo(f)
        ? { txt: 'Rejected', cls: 'dp-pill-temp' }
        : { txt: 'Bounced', cls: 'dp-pill-bounce' };
    }
    return { txt: 'Temporary bounce', cls: 'dp-pill-temp' };
  };

  /* Ajuste 30: "New" en los que llegaron después de la última vez que
     abrió la pestaña, y SÓLO en los que suben el contador rojo (quejas y
     rebotes permanentes de verdad — la misma regla que sql/87). */
  const esAviso = (f) => !String(f.action || '').includes('not sent by this app')
    && (f.type === 'email.complained' || f.type === 'email.suppressed'
        || (f.type === 'email.bounced' && String(f.bounce_type || '').toLowerCase() === 'permanent' && !esRechazo(f)));
  const esNuevo = (f) => {
    const antes = window.FerociaAvisos?.vistoAntes;
    if (!antes || !f.received_at) return false;
    const r = new Date(f.received_at);
    return !isNaN(r.getTime()) && r > antes && esAviso(f);
  };

  function pintar() {
    const caja = document.getElementById('dp-table');
    if (!caja) return;
    if (!_filas.length) {
      const filtro = document.getElementById('dp-filter')?.value || '';
      caja.innerHTML = `<div class="dp-empty">${esc(filtro
        ? 'Nothing of this kind has been reported.'
        : 'No delivery problems reported yet. From the day this was set up, bounces and '
          + 'spam complaints reported by Resend show up here.')}</div>`;
      pintarPie();
      return;
    }
    caja.innerHTML = `
      <div class="dp-scroll">
      <table class="dp-tabla">
        <thead><tr>
          <th>When</th><th>Email</th><th>What happened</th><th>What we did</th><th>Email sent</th>
        </tr></thead>
        <tbody>
          ${_filas.map((f) => {
            const q = queFue(f);
            const envio = f.communications && f.communications.subject
              ? esc(f.communications.subject)
              : '<span class="dp-muted">Signup confirmation or not linked</span>';
            const nuevo = esNuevo(f);
            return `<tr${nuevo ? ' class="dp-fila-nueva"' : ''}>
              <td class="dp-cuando">${nuevo ? '<span class="avp-nuevo">New</span>' : ''}${esc(cuando(f.occurred_at || f.received_at))}</td>
              <td class="dp-email">${esc(f.email || '—')}</td>
              <td><span class="dp-pill ${q.cls}">${esc(q.txt)}</span>${f.detail
                ? `<div class="dp-detalle">${esc(String(f.detail).slice(0, 200))}</div>` : ''}</td>
              <td class="dp-accion">${esc(f.action || '—')}</td>
              <td class="dp-envio">${envio}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>`;
    pintarPie();
  }

  function pintarPie() {
    const fila = document.getElementById('dp-more-row');
    if (!fila) return;
    fila.hidden = !_hayMas;
    const info = document.getElementById('dp-info');
    if (info) info.textContent = _hayMas ? `Showing ${_filas.length}` : '';
  }

  /** Trae una página. `desdeElPrincipio`: vacía la lista antes. */
  async function cargar(desdeElPrincipio) {
    if (_cargando && !desdeElPrincipio) return;
    const mia = ++_vez;
    _cargando = true;
    if (desdeElPrincipio) { _filas = []; _hayMas = false; }
    const caja = document.getElementById('dp-table');
    if (desdeElPrincipio && caja) caja.innerHTML = '<div class="loading dp-loading">Loading...</div>';

    const filtro = FILTROS[document.getElementById('dp-filter')?.value || ''] ?? '';
    try {
      const filas = await window.api(`email_events?select=${COLS}${filtro}`
        + `&order=received_at.desc,id.desc&limit=${POR_PAGINA + 1}&offset=${_filas.length}`);
      if (mia !== _vez) return;
      if (!Array.isArray(filas)) throw new Error('unexpected_response');
      _hayMas = filas.length > POR_PAGINA;
      const ya = new Set(_filas.map((x) => String(x.id)));
      _filas = _filas.concat(filas.slice(0, POR_PAGINA).filter((x) => !ya.has(String(x.id))));
      pintar();
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[delivery-problems] no se pudo leer:', err);
      if (caja) caja.innerHTML = '<div class="dp-empty">Could not load the delivery problems. Please try again in a moment.</div>';
      _hayMas = false;
      pintarPie();
    } finally {
      if (mia === _vez) _cargando = false;
    }
  }

  /* Al abrir la pestaña (admin-communications.js): primero "ya lo vi",
     que devuelve la vez anterior para pintar "New"; luego la lista. Si
     marcar falla (p. ej. sin el SQL 87), la lista sale igual, sin "New".
     Cambiar el filtro NO vuelve a marcar: los "New" siguen ahí. */
  window.cargarProblemasDeEntrega = async (desdeElPrincipio = true) => {
    const av = window.FerociaAvisos;
    /* "New" = llegó después de la última vez que miraste ANTES de esta
       visita al panel. Se guarda la fecha MÁS ANTIGUA: volver a la pestaña
       (o dos clics seguidos) no borra los "New" que ya estaban, y lo que
       llegue mientras tanto también sale como "New". */
    if (desdeElPrincipio && av) {
      const caja = document.getElementById('dp-table');
      if (caja) caja.innerHTML = '<div class="loading dp-loading">Loading...</div>';
      const antes = await av.marcarVistos();
      if (antes && (!av.vistoAntes || antes < av.vistoAntes)) av.vistoAntes = antes;
    }
    return cargar(desdeElPrincipio);
  };

  document.getElementById('dp-filter')?.addEventListener('change', () => cargar(true));

  Object.assign(window.CLICK_HANDLERS, {
    dpLoadMore: () => cargar(false),
  });
})();
