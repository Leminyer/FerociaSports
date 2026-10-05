/* ============================================================
   FEROCIA SPORTS CENTER — SHARED UTILITIES
   Depends on: config.js, @supabase/supabase-js (CDN, loaded via <script>)
   Provides on window:
     - supabase                 The supabase-js client instance
     - api(path, method, body)  Compat wrapper preserving the old signature
     - escapeHtml(str), esc     Safe interpolation
     - fmtDate(dateStr, opts)   Date formatter (avoids TZ shift)
     - sleep(ms)                Promise-based delay
     - todayISO()               Today as YYYY-MM-DD
     - toast(msg, isError)      Top-of-screen banner
     - confirmModal({...})      Promise-based confirmation dialog
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js must load before db.js');
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[Ferocia] @supabase/supabase-js must load before db.js');
    return;
  }

  // ─── SUPABASE CLIENT ──────────────────────────────────────
  // Single shared client. Persists session in localStorage by default.
  // The library auto-refreshes the access token a minute before it expires
  // so the user stays logged in indefinitely (until they sign out or
  // their refresh token is revoked).
  const sbClient = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // we don't use OAuth/magic-link redirects
    },
  });

  // Replace the namespace with our client instance so window.supabase IS the
  // client (matches the convention used in supabase-js docs).
  // Anything that needs createClient() can still use window.supabase.createClient
  // by referencing the constructor on the prototype, but we don't need that.
  window.supabase = sbClient;

  // ─── api() COMPAT WRAPPER ─────────────────────────────────
  // Preserves the old fetch-based api() signature so app.js / tournament.js
  // don't need to be rewritten. Parses the PostgREST URL fragment and
  // dispatches to the supabase-js client which handles auth tokens correctly.
  //
  // Calls like:
  //   api('players?select=*&order=first_name')
  //   api('matches?id=in.(1,2,3)', 'DELETE')
  //   api('ladders', 'POST', { name: 'X' })
  //   api('ladders?id=eq.5', 'PATCH', { status: 'closed' })
  //
  // Important compat details:
  // - GET returns array (or empty array) — same as before
  // - POST returns the inserted rows (representation) — same as before
  // - PATCH returns the updated rows or null — same as before
  // - DELETE returns null — same as before
  // - Throws Error on non-success, with .message — same as before

  async function api(path, method = 'GET', body = null) {
    method = method.toUpperCase();

    // Split "table?queryString" into table + URLSearchParams
    const qIdx = path.indexOf('?');
    const table = qIdx === -1 ? path : path.slice(0, qIdx);
    const query = qIdx === -1 ? '' : path.slice(qIdx + 1);
    const params = new URLSearchParams(query);

    // Pull out PostgREST filter / select / order / limit / offset params
    const select = params.get('select') || '*';
    const order = params.get('order');
    const limit = params.get('limit');
    /* `offset` no se leía aquí, así que caía en applyFilters() y se mandaba
       como si fuera un filtro de columna: `offset=eq.50`.

       Y ahí está la explicación de por qué no daba error. `offset` es una
       palabra reservada de PostgREST: el servidor no buscó ninguna columna
       con ese nombre —eso sí habría dado error—, sino que lo tomó por SU
       propio offset, no consiguió leer "eq.50" como número y lo ignoró.

       Resultado: un "tráeme 50 EMPEZANDO POR EL 50" devolvía otra vez las
       primeras 50. Los dos botones de "cargar más" de Communications no
       hacían nada, y la consola no decía nada, porque nada había fallado:
       simplemente no llegaba ninguna fila nueva.

       Que la primera página SÍ funcionara es la prueba: también manda
       `offset=0`, y si esto se hubiera tratado como una columna inexistente
       habría fallado desde el primer momento. */
    const offset = params.get('offset');
    params.delete('select');
    params.delete('order');
    params.delete('limit');
    params.delete('offset');

    // Everything left is a filter: column=op.value (e.g. id=eq.5, id=in.(1,2,3))
    // Apply each filter to the query builder using the same operator names.
    const applyFilters = (qb) => {
      for (const [col, raw] of params.entries()) {
        const dotIdx = raw.indexOf('.');
        if (dotIdx === -1) {
          // No operator — treat as equality
          qb = qb.eq(col, raw);
          continue;
        }
        const op = raw.slice(0, dotIdx);
        const val = raw.slice(dotIdx + 1);
        switch (op) {
          case 'eq':  qb = qb.eq(col, val); break;
          case 'neq': qb = qb.neq(col, val); break;
          case 'gt':  qb = qb.gt(col, val); break;
          case 'gte': qb = qb.gte(col, val); break;
          case 'lt':  qb = qb.lt(col, val); break;
          case 'lte': qb = qb.lte(col, val); break;
          case 'like': qb = qb.like(col, val); break;
          case 'ilike': qb = qb.ilike(col, val); break;
          case 'is':  qb = qb.is(col, val === 'null' ? null : val); break;
          case 'in': {
            // val is "(1,2,3)" — strip parens and split
            const list = val.replace(/^\(/, '').replace(/\)$/, '').split(',');
            qb = qb.in(col, list);
            break;
          }
          default:
            // Fallback for unsupported ops — encode as raw filter
            qb = qb.filter(col, op, val);
        }
      }
      return qb;
    };

    /* Apply order + limit/offset. SELECT only — PATCH and DELETE call
       applyFilters and nothing else, which is as it should be: ordenar o
       paginar un UPDATE no significa nada. (El comentario de antes decía
       "select/update/delete" y no era cierto.) */
    const applyTrailing = (qb) => {
      if (order) {
        // PostgREST format: "col" or "col.desc" (or "col1,col2.desc")
        for (const part of order.split(',')) {
          const [col, dir] = part.split('.');
          qb = qb.order(col, { ascending: dir !== 'desc' });
        }
      }
      /* Con offset hay que usar .range(desde, hasta), que es como
         supabase-js expresa "una página a partir de aquí". `.limit()` por
         sí solo no sabe saltar.

         La rama de abajo se deja EXACTAMENTE como estaba: sin offset, cada
         consulta de la aplicación pide lo mismo que pedía antes. Hoy el
         offset sólo lo usa la pantalla de Communications. */
      if (offset) {
        const desde   = parseInt(offset, 10);
        const cuantas = limit ? parseInt(limit, 10) : 1000;
        qb = qb.range(desde, desde + cuantas - 1);
      } else if (limit) {
        qb = qb.limit(parseInt(limit, 10));
      }
      return qb;
    };

    let qb, result;
    switch (method) {
      case 'GET': {
        qb = sbClient.from(table).select(select);
        qb = applyFilters(qb);
        qb = applyTrailing(qb);
        result = await qb;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
      }
      case 'POST': {
        // Insert one or many. We do NOT chain .select() here because some
        // tables (e.g. subscribers) have no SELECT RLS policy for anon —
        // requesting the inserted row back would cause a permission error.
        // Admin callers (tournament.js) that need the inserted row back use
        // a follow-up GET or rely on the id returned via the trigger.
        qb = sbClient.from(table).insert(body);
        result = await qb;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
      }
      case 'PATCH': {
        qb = sbClient.from(table).update(body);
        qb = applyFilters(qb);
        // Do NOT chain .select() — anon users may not have SELECT RLS policy
        // on the table being updated (e.g. subscribers). The update itself
        // is allowed by the UPDATE policy; requesting rows back is not.
        result = await qb;
        if (result.error) throw new Error(result.error.message);
        return result.data || null;
      }
      case 'DELETE': {
        qb = sbClient.from(table).delete();
        qb = applyFilters(qb);
        result = await qb;
        if (result.error) throw new Error(result.error.message);
        return null;
      }
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }

  // ─── ESCAPING ─────────────────────────────────────────────
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  const esc = escapeHtml;

  // ─── DATE FORMATTING ──────────────────────────────────────
  /* El 'T12:00:00' NO es un adorno: una fecha suelta ('2026-10-03') se
     interpreta como medianoche UTC, que en Florida son las 8 de la
     tarde del día ANTERIOR, así que la fecha salía un día antes.
     Poniéndola al mediodía, ninguna zona horaria del mundo la mueve.

     ⚠️  PERO SÓLO SIRVE PARA FECHAS SUELTAS. Si lo que llega ya trae la
     hora —cualquier columna `timestamptz`, que es como PostgREST manda
     '2026-10-03T22:00:05+00:00'— pegarle 'T12:00:00' deja un texto que
     no se puede interpretar, y esto devolvía literalmente
     «Invalid Date». Y lo devolvía EN PANTALLA: la columna "Subscribed"
     de la lista de suscriptores y la fila "Subscribed" de cada ficha
     llevaban tiempo enseñando eso, porque `subscribed_at` trae la hora.

     Lo encontró una revisión el 3 de octubre. Se arregla aquí, en la
     función compartida, y no en cada sitio que la llama: así queda
     arreglado también en cualquier pantalla que caiga en lo mismo más
     adelante. Para una fecha suelta se comporta exactamente igual que
     antes. */
  const DEFAULT_DATE_OPTS = { month: 'short', day: 'numeric', year: 'numeric' };
  function fmtDate(dateStr, opts = DEFAULT_DATE_OPTS) {
    if (!dateStr) return '';
    const t = String(dateStr);
    /* ¿Trae ya la hora? Entonces se interpreta tal cual. */
    const d = /[T ]\d{2}:/.test(t) ? new Date(t) : new Date(t + 'T12:00:00');
    /* Y si no se puede interpretar, no se enseña «Invalid Date»: se
       devuelve vacío, que es lo que ya hace esta función cuando no le
       dan nada, y lo que quien la llama sabe pintar como un guion. */
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', opts);
  }

  // ─── MISC ─────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function todayISO() { return new Date().toISOString().split('T')[0]; }

  // ─── TOAST ────────────────────────────────────────────────
  let _toastTimer = null;
  function toast(msg, isError = false, duration = 6000) {
    const okEl = document.getElementById('success-banner');
    const errEl = document.getElementById('error-banner');
    if (!okEl && !errEl) {
      console[isError ? 'error' : 'log']('[toast]', msg);
      return;
    }
    const showEl = isError ? errEl : okEl;
    const hideEl = isError ? okEl : errEl;
    const msgEl = document.getElementById(isError ? 'error-banner-msg' : 'success-banner-msg');
    if (hideEl) hideEl.style.display = 'none';
    if (msgEl) msgEl.textContent = msg;
    if (showEl) showEl.style.display = 'block';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      if (showEl) showEl.style.display = 'none';
    }, duration);
  }

  // ─── CONFIRM MODAL ────────────────────────────────────────
  function ensureConfirmModal() {
    let modal = document.getElementById('confirm-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.className = 'modal-bg';
    modal.innerHTML = `
      <div class="modal" style="max-width:440px;">
        <div class="modal-title" id="confirm-modal-title">Are you sure?</div>
        <div id="confirm-modal-msg" class="text-muted-13" style="margin-bottom:18px;line-height:1.55;"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline btn-sm" id="confirm-modal-cancel">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" id="confirm-modal-ok">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  /* ⚠️  LA TECLA ENTER EN ESTA VENTANA. LÉELO ANTES DE TOCARLA.

     Hasta el 4 de octubre esta ventana escuchaba Enter en TODA la página
     y confirmaba, mirara donde mirase el cursor. O sea que con el cursor
     en Cancel, Enter mandaba igual — y ésta es la ventana que pregunta
     antes de mandar 453 correos que no se pueden recuperar.

     Ahora no escucha Enter: los botones ya responden a Enter ellos solos
     cuando tienen el cursor encima, así que Enter hace lo que diga el
     botón donde estás. Escape sigue cancelando.

     `focusCancel` es la otra mitad, y es la que de verdad cierra el
     agujero: la ventana le pone el cursor a Confirm al abrirse, así que
     sin esto un Enter despistado seguiría mandando. Las ventanas que
     mandan correos o borran algo piden `focusCancel: true` y empiezan
     con el cursor en Cancel — para confirmar hay que mover el dedo o dar
     un Tab, que es un gesto deliberado.

     Por defecto sigue siendo `false`, así que las ventanas inofensivas
     (cerrar sesión, descartar cambios) se comportan igual que siempre. */
  /* ⚠️  SÓLO PUEDE HABER UNA VENTANA ABIERTA A LA VEZ.

     Todas las preguntas usan EL MISMO trozo de pantalla. Si se abre una
     segunda encima de otra, las dos quedan escuchando los mismos dos
     botones, y un solo clic en Confirm contesta que SÍ a las dos.

     Pasaba de verdad, con el teclado y sin forzar nada: con la pregunta
     de los 462 correos abierta, el Tab se salía de la ventana, el
     espacio pulsaba un botón de la pantalla de atrás, ese botón abría
     "Sign out?" encima, y un Enter mandaba los 462 correos con la
     pantalla diciendo "Sign out?". Lo encontró la revisión del 4 de
     octubre.

     Ahora la segunda se contesta que NO en el acto. "No" es la respuesta
     segura: no se hace nada. */
  let _ventanaAbierta = false;

  function confirmModal({ title = 'Are you sure?', message = '', okLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, focusCancel = false } = {}) {
    if (_ventanaAbierta) {
      console.warn('[Ferocia] ya hay una ventana de confirmación abierta; '
                 + 'la nueva se contesta que no:', title);
      return Promise.resolve(false);
    }
    _ventanaAbierta = true;
    return new Promise((resolve) => {
      const modal = ensureConfirmModal();
      modal.querySelector('#confirm-modal-title').textContent = title;
      modal.querySelector('#confirm-modal-msg').textContent = message;
      const okBtn = modal.querySelector('#confirm-modal-ok');
      const cancelBtn = modal.querySelector('#confirm-modal-cancel');
      okBtn.textContent = okLabel;
      cancelBtn.textContent = cancelLabel;
      okBtn.className = `btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`;
      modal.classList.add('open');
      const cleanup = (result) => {
        modal.classList.remove('open');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        _ventanaAbierta = false;
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onBackdrop = (e) => { if (e.target === modal) cleanup(false); };
      const onKey = (e) => {
        if (e.key === 'Escape') { cleanup(false); return; }

        /* ⚠️  EL CURSOR NO SE SALE DE LA VENTANA.

           Sin esto, el Tab se iba a la pantalla de atrás y desde ahí se
           podían pulsar botones con el teclado mientras la pregunta
           seguía abierta — incluido uno que abría otra ventana encima.
           La ventana tiene exactamente dos botones, así que el Tab da
           la vuelta entre ellos y ya está. */
        if (e.key === 'Tab') {
          e.preventDefault();
          const botones = [cancelBtn, okBtn];
          const i = botones.indexOf(document.activeElement);
          /* Si el cursor andaba fuera, se recupera al primero. */
          const siguiente = i === -1 ? 0
            : (i + (e.shiftKey ? botones.length - 1 : 1)) % botones.length;
          botones[siguiente].focus();
          return;
        }

        /* Enter YA NO CONFIRMA DESDE AQUÍ. Lo hace el botón que tenga el
           cursor, él solo.

           Lo que queda es una red por si algo se lleva el cursor fuera
           de la ventana a la fuerza (el Tab ya no puede): Enter y el
           espacio se tragan aquí. Mientras el cursor esté DENTRO, no se
           tocan: si no, los botones dejarían de responder.

           ⚠️  Y HASTA AHÍ LLEGA. `preventDefault` sólo cancela lo que
           hace el navegador por su cuenta —pulsar un botón, mandar un
           formulario—; no para el código de otro que esté escuchando esa
           misma tecla antes que nosotros. Quien de verdad cierra esa
           puerta es la trampa del Tab de arriba, que impide que el
           cursor llegue ahí. Esto es el segundo cinturón, no el
           primero. */
        if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')
            && !modal.contains(document.activeElement)) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
      setTimeout(() => (focusCancel ? cancelBtn : okBtn).focus(), 50);
    });
  }

  // ─── EXPORT ───────────────────────────────────────────────
  Object.assign(window, {
    api,
    escapeHtml,
    esc,
    fmtDate,
    sleep,
    todayISO,
    toast,
    confirmModal,
  });
})();
