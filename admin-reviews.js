/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: REVIEWS (§113)
   Depende de: db.js (window.supabase, toast), admin-state.js
               (AdminPageLoaders, CLICK_HANDLERS), app.js (authReady).

   Lo que dijeron los jugadores después de cada escalera o torneo. Las
   reviews se piden desde el Communications Hub ("Review Request") y los
   jugadores las dejan en review.html con su enlace privado.

   En esta pantalla:
     · la lista, la más reciente primero, con filtros por evento, por
       estrellas y por "nuevas / en la web / con comentario / con
       sugerencia";
     · "Show on website": la review sale en ferociasports.com ("What
       players say") con el nombre y la inicial del apellido. Sólo se
       puede con un comentario. Si el jugador cambia su comentario, deja
       de salir hasta que se vuelva a marcar (lo hace la base, sql/125);
     · "What could we do better?" es privado: se ve aquí y en ningún otro
       sitio.
   El círculo rojo del menú cuenta las nuevas; al abrir la pantalla, las
   que se ven dejan de ser nuevas (siguen marcadas "New" en esta visita).

   Todo lo que escribió un jugador se pone con textContent, nunca como
   HTML. Si el SQL 125 todavía no está, la pantalla lo dice y el resto
   del panel funciona igual.
   ============================================================ */

(function () {
  'use strict';

  const CADA = 3 * 60 * 1000;                   // el contador vuelve a mirar cada 3 minutos
  const SITIOS = ['rv-sb', 'rv-md'];
  const ZONA = 'America/New_York';

  let _todas = [];        // lo que devolvió admin_reviews_list
  let _nuevasAhora = new Set();   // las que eran nuevas al abrir (siguen con "New" en esta visita)
  let _vez = 0;           // una respuesta vieja no pinta encima de una nueva
  let _cambiando = new Set();     // link_id con el interruptor en vuelo

  const $ = (id) => document.getElementById(id);
  const sb = () => window.supabase;

  /* ── EL CONTADOR DEL MENÚ ───────────────────────────────── */
  function pintarContador(n) {
    const v = n > 0 ? n : 0;
    SITIOS.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.textContent = v > 99 ? '99+' : String(v);
      el.hidden = v === 0;
    });
    const frase = v === 1 ? '1 new review' : `${v} new reviews`;
    [['sb-reviews', 'Reviews'], ['md-reviews', 'Reviews']].forEach(([id, base]) => {
      const b = $(id);
      if (b) b.setAttribute('aria-label', v ? `${base} — ${frase}` : base);
    });
  }

  async function contar() {
    if (!sb()) return;
    try {
      const { data, error } = await sb().rpc('admin_reviews_new_count');
      if (error) throw error;
      pintarContador(Number(data) || 0);
    } catch (err) {
      /* Sin el SQL 125, o sin permiso: no se pinta nada, sin ruido. */
      console.warn('[reviews] no se pudo contar:', err?.message || err);
      pintarContador(0);
    }
  }

  /* ── FECHAS Y ESTRELLAS ─────────────────────────────────── */
  const fecha = (iso) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-US', { timeZone: ZONA, month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  };

  function estrellas(n) {
    const caja = document.createElement('span');
    caja.className = 'rvw-estrellas';
    caja.setAttribute('role', 'img');
    caja.setAttribute('aria-label', `${n} out of 5 stars`);
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      s.setAttribute('aria-hidden', 'true');
      if (i > n) s.className = 'rvw-off';
      caja.append(s);
    }
    return caja;
  }

  const el = (tag, clase, texto) => {
    const x = document.createElement(tag);
    if (clase) x.className = clase;
    if (texto !== undefined) x.textContent = texto;
    return x;
  };

  /* ── CARGAR ─────────────────────────────────────────────── */
  /* nuevaVisita: al entrar en la pantalla. Si la lista se vuelve a leer
     sin salir (tras un aviso), las que eran "New" lo siguen siendo. */
  async function cargar(nuevaVisita) {
    const mia = ++_vez;
    if (nuevaVisita) _nuevasAhora = new Set();
    $('rvw-body').replaceChildren(el('div', 'loading', 'Loading...'));
    $('rvw-filtros').hidden = true;
    $('rvw-resumen').hidden = true;
    let data;
    try {
      const r = await sb().rpc('admin_reviews_list');
      if (r.error) throw r.error;
      data = r.data || [];
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[reviews] no se pudo leer la lista:', err);
      const sinSql = /admin_reviews_list|function|404|PGRST202/i.test(String(err?.message || err?.code || ''));
      $('rvw-body').replaceChildren(el('div', 'empty', sinSql
        ? 'Reviews are not set up yet (SQL 125).'
        : 'Could not load the reviews. Try again in a moment.'));
      return;
    }
    if (mia !== _vez) return;
    _todas = data;
    data.filter((r) => r.is_new).forEach((r) => _nuevasAhora.add(r.link_id));
    pintarFiltros();
    pintar();
    marcarVistas();
  }

  /* Las que se acaban de ver dejan de contar como nuevas en el menú. Con
     "hasta": la fecha más reciente de la lista tal como la mandó la base
     (sin pasar por el reloj de este ordenador). Una review que un jugador
     cambie justo después de cargar la lista sigue siendo nueva. */
  function hastaDe(filas) {
    let max = null;
    filas.forEach((r) => {
      const t = r.updated_at;
      if (!t) return;
      const d = new Date(t).getTime(), m = max ? new Date(max).getTime() : -Infinity;
      if (d > m || (d === m && String(t) > String(max))) max = t;
    });
    return max;
  }

  async function marcarVistas() {
    const ids = _todas.filter((r) => r.is_new).map((r) => r.link_id);
    const hasta = hastaDe(_todas);
    if (!ids.length || !hasta) { contar(); return; }
    try {
      const { error } = await sb().rpc('admin_reviews_seen', { p_link_ids: ids, p_hasta: hasta });
      if (error) throw error;
      contar();
    } catch (err) {
      console.warn('[reviews] no se pudieron marcar como vistas:', err?.message || err);
      contar();
    }
  }

  /* ── FILTROS ────────────────────────────────────────────── */
  const claveEvento = (r) => `${r.event_type || ''}:${r.event_id || ''}`;

  function pintarFiltros() {
    const sel = $('rvw-f-evento');
    const antes = sel.value;
    const eventos = new Map();
    _todas.forEach((r) => { if (!eventos.has(claveEvento(r))) eventos.set(claveEvento(r), r); });
    sel.replaceChildren(new Option('All events', ''), ...[...eventos].map(([k, r]) =>
      new Option(`${r.event_label || 'Event'} · ${r.event_type === 'tournament' ? 'Tournament' : 'Ladder'}`, k)));
    sel.value = eventos.has(antes) ? antes : '';
    $('rvw-filtros').hidden = _todas.length === 0;
  }

  function filtradas() {
    const ev = $('rvw-f-evento').value;
    const est = Number($('rvw-f-estrellas').value) || 0;
    const ver = $('rvw-f-ver').value;
    return _todas.filter((r) => (!ev || claveEvento(r) === ev)
      && (!est || r.rating === est)
      && (ver !== 'new' || _nuevasAhora.has(r.link_id))
      && (ver !== 'public' || r.is_public)
      && (ver !== 'comment' || !!r.comment)
      && (ver !== 'improve' || !!r.improve));
  }

  /* ── PINTAR ─────────────────────────────────────────────── */
  function pintar() {
    const lista = filtradas();
    /* Un resumen corto, sin promedio (decidido: nada de "4.8 estrellas"
       en la web; aquí tampoco hace falta). */
    const publicas = _todas.filter((r) => r.is_public).length;
    const nuevas = _todas.filter((r) => _nuevasAhora.has(r.link_id)).length;
    $('rvw-resumen').textContent = _todas.length
      ? `${_todas.length} review${_todas.length === 1 ? '' : 's'} · ${nuevas} new · ${publicas} on the website`
      : '';
    $('rvw-resumen').hidden = !_todas.length;

    if (!_todas.length) {
      $('rvw-body').replaceChildren(el('div', 'empty',
        'No reviews yet. Send a "Review Request" from the Communications Hub after a ladder or tournament is completed.'));
      $('rvw-estado').textContent = 'No reviews yet.';
      return;
    }
    if (!lista.length) {
      $('rvw-body').replaceChildren(el('div', 'empty', 'No reviews match these filters.'));
      $('rvw-estado').textContent = 'No reviews match these filters.';
      return;
    }
    $('rvw-body').replaceChildren(...lista.map(tarjeta));
    $('rvw-estado').textContent = `${lista.length} review${lista.length === 1 ? '' : 's'} shown.`;
  }

  function tarjeta(r) {
    const t = el('article', 'card rvw-card');
    t.dataset.link = String(r.link_id);

    const cab = el('div', 'rvw-cab');
    const quien = el('div', 'rvw-quien');
    const nombre = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Player';
    quien.append(el('span', 'rvw-nombre', nombre));
    if (r.display_name) quien.append(el('span', 'rvw-como', `Shown as ${r.display_name}`));
    cab.append(estrellas(r.rating), quien);
    if (_nuevasAhora.has(r.link_id)) cab.append(el('span', 'pill rvw-nueva', 'New'));
    t.append(cab);

    const meta = el('div', 'rvw-meta');
    const editada = r.updated_at && r.answered_at && new Date(r.updated_at) - new Date(r.answered_at) > 60 * 1000;
    meta.textContent = `${r.event_label || 'Event'} · ${r.event_type === 'tournament' ? 'Tournament' : 'Ladder'} · `
      + `${fecha(r.answered_at)}${editada ? ` (updated ${fecha(r.updated_at)})` : ''}`;
    t.append(meta);

    if (r.comment) {
      t.append(el('div', 'rvw-rotulo', 'Tell us about it'));
      t.append(el('p', 'rvw-texto', r.comment));
    } else {
      t.append(el('p', 'rvw-vacio', 'Only stars — no comment.'));
    }
    if (r.improve) {
      const priv = el('div', 'rvw-privado');
      priv.append(el('div', 'rvw-rotulo', 'What could we do better? · Private'), el('p', 'rvw-texto', r.improve));
      t.append(priv);
    }

    /* "Show on website": un interruptor de verdad (role="switch"). */
    const pie = el('div', 'rvw-pie');
    const sw = el('button', 'rvw-switch');
    sw.type = 'button';
    sw.dataset.action = 'rvwPublicar';
    sw.dataset.link = String(r.link_id);
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', r.is_public ? 'true' : 'false');
    sw.disabled = !r.comment || _cambiando.has(r.link_id);
    sw.append(el('span', 'rvw-switch-pista'), el('span', 'rvw-switch-texto', 'Show on website'));
    pie.append(sw);
    if (!r.comment) pie.append(el('span', 'rvw-pista', 'Only reviews with a comment can be shown on the website.'));
    else if (r.is_public && r.published_at) pie.append(el('span', 'rvw-pista', `On the website since ${fecha(r.published_at)}.`));
    t.append(pie);
    return t;
  }

  /* ── PUBLICAR / QUITAR ──────────────────────────────────── */
  async function publicar(btn) {
    const id = Number(btn.dataset.link);
    const r = _todas.find((x) => x.link_id === id);
    if (!r || _cambiando.has(id)) return;
    const quiere = !r.is_public;
    _cambiando.add(id);
    btn.disabled = true;
    let res;
    try {
      /* Se manda el comentario que ella está viendo: si el jugador lo
         cambió mientras tanto, la base no lo publica ('changed'). */
      const { data, error } = await sb().rpc('admin_review_publish', { p_link_id: id, p_public: quiere, p_comment: r.comment });
      if (error) throw error;
      res = data || {};
    } catch (err) {
      console.error('[reviews] no se pudo cambiar:', err);
      res = { error: 'server' };
    }
    _cambiando.delete(id);
    if (res.error) {
      toast(res.error === 'no_comment' ? 'Only reviews with a comment can be shown on the website.'
        : res.error === 'changed' ? 'The player just edited this review. Read it again before showing it — the list was refreshed.'
          : res.error === 'not_found' ? 'That review no longer exists. The list was refreshed.'
            : 'Could not save the change. Try again.', true);
      if (res.error === 'not_found' || res.error === 'changed' || res.error === 'no_comment') { cargar(); return; }
      pintar();
      return;
    }
    r.is_public = !!res.is_public;
    r.published_at = r.is_public ? (r.published_at || new Date().toISOString()) : null;
    toast(r.is_public ? 'Shown on ferociasports.com.' : 'Removed from the website.');
    pintar();
    document.querySelector(`.rvw-switch[data-link="${id}"]`)?.focus();
  }

  /* ── EVENTOS ────────────────────────────────────────────── */
  ['rvw-f-evento', 'rvw-f-estrellas', 'rvw-f-ver'].forEach((id) => $(id)?.addEventListener('change', pintar));
  Object.assign(window.CLICK_HANDLERS, { rvwPublicar: (btn) => publicar(btn) });
  window.AdminPageLoaders.reviews = () => cargar(true);

  const empezar = () => {
    contar();
    setInterval(() => { if (document.visibilityState === 'visible') contar(); }, CADA);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') contar(); });
  };
  if (window.app && window.app.authReady) window.app.authReady.then(empezar);
})();
