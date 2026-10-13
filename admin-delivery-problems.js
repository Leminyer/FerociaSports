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
    /* Sólo los que marcaron a alguien: los rechazados y los ajenos
       ("Recorded only…") salen en "All problems". */
    bounced:      '&or=(type.eq.email.suppressed,and(type.eq.email.bounced,bounce_type.ilike.permanent))'
                + '&action=not.like.Recorded%20only*',
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

  /** Lo que pasó, en palabras, y de qué color. */
  const queFue = (f) => {
    if (f.type === 'email.complained') return { txt: 'Marked as spam', cls: 'dp-pill-spam' };
    if (f.type === 'email.suppressed') return { txt: 'Blocked by Resend', cls: 'dp-pill-bounce' };
    if (String(f.bounce_type || '').toLowerCase() === 'permanent') {
      /* Si no marcó a nadie (mensaje rechazado por el servidor del
         destinatario, u otro motivo que no es "el buzón no existe"), no
         se pinta como un rebote: lo dice la columna de al lado. */
      return /^Recorded only/.test(String(f.action || ''))
        ? { txt: 'Rejected', cls: 'dp-pill-temp' }
        : { txt: 'Bounced', cls: 'dp-pill-bounce' };
    }
    return { txt: 'Temporary bounce', cls: 'dp-pill-temp' };
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
            return `<tr>
              <td class="dp-cuando">${esc(cuando(f.occurred_at || f.received_at))}</td>
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

  window.cargarProblemasDeEntrega = (desdeElPrincipio = true) => cargar(desdeElPrincipio);

  document.getElementById('dp-filter')?.addEventListener('change', () => cargar(true));

  Object.assign(window.CLICK_HANDLERS, {
    dpLoadMore: () => cargar(false),
  });
})();
