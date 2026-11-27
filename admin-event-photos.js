/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: FOTOS DE LOS EVENTOS (§123, SQL 143)
   Torneos, etapa 2 · 24 nov 2026 · diseño etapa2.html (pantallas 6 y 7)

   1. "Photos" al final de cada torneo y en cada escalera (debajo de
      Standings). Hasta 30. Se arrastran o se eligen; aquí mismo se
      achican (1600 px, JPG) antes de subir. Van a la carpeta PRIVADA
      "event-photos": sólo las ven las administradoras y, en su Player
      Portal, los jugadores de ese evento.
   2. Player Portal → "Photo removal requests": las fotos que un jugador
      pidió quitar ("Remove me"). La foto ya está escondida; aquí se
      borra para siempre o se vuelve a mostrar. Círculo rojo con los
      pedidos nuevos.

   La seguridad está en la base (SQL 143): cada función comprueba que
   quien llama es administradora activa, y la carpeta sólo deja subir y
   borrar a las administradoras. Si el SQL 143 no está, la sección lo
   dice y el resto del panel funciona igual.

   Depende de: db.js (esc, toast, confirmModal, window.supabase) y app.js
   (AdminPageLoaders, CLICK_HANDLERS, app.authReady).
   Estilos: admin-event-photos.css (prefijo ep-).
   ============================================================ */

(function () {
  'use strict';

  const CARPETA = 'event-photos';
  const MAX = 30;
  const LADO = 1600;           // lado largo después de achicar
  const CALIDAD = 0.82;
  const CADA = 3 * 60 * 1000;  // el círculo rojo se pone al día cada 3 minutos
  const sb = () => window.supabase;
  const esc = (x) => window.esc(x == null ? '' : String(x));
  const $ = (id) => document.getElementById(id);

  const faltaSql = (m) => /function .* does not exist|Could not find the function|bucket not found/i.test(m);
  const errorLegible = (err) => {
    const m = String((err && err.message) || err || '');
    if (/too_many/.test(m)) return `This event already has ${MAX} photos. Delete one to add another.`;
    if (/not_authorized|permission denied|row-level security|Unauthorized/i.test(m)) return 'Your admin access could not be confirmed. Sign in again.';
    if (faltaSql(m)) return 'Photos are not installed yet (SQL 143).';
    if (/already_decided|request_not_found|photo_not_found/.test(m)) return 'This was already handled. The list is refreshed.';
    if (/not_an_image/.test(m)) return 'One of the files is not a photo we can read (use JPG or PNG).';
    return 'Something went wrong. Please try again in a moment.';
  };
  const cuando = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  /* Enlaces que caducan (1 hora) para ver las fotos aquí. */
  async function enlaces(paths) {
    if (!paths.length) return {};
    const { data, error } = await sb().storage.from(CARPETA).createSignedUrls(paths, 3600);
    if (error) throw error;
    const out = {};
    (data || []).forEach((d) => { if (d && d.signedUrl && d.path) out[d.path] = d.signedUrl; });
    return out;
  }

  /* ── Achicar una foto (en el navegador, antes de subir) ── */
  async function abrirImagen(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* se intenta abajo */ }
    }
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('not_an_image')); };
      img.src = url;
    });
  }
  async function achicar(file) {
    const img = await abrirImagen(file);
    const w0 = img.width, h0 = img.height;
    if (!w0 || !h0) throw new Error('not_an_image');
    const f = Math.min(1, LADO / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * f)), h = Math.max(1, Math.round(h0 * f));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // PNG con transparencia: fondo blanco
    ctx.drawImage(img, 0, 0, w, h);
    if (img.close) img.close();
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', CALIDAD));
    if (!blob) throw new Error('not_an_image');
    return { blob, w, h };
  }
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

  /* ═══ 1. La sección "Photos" de un evento ═══ */
  const secciones = {};   // slotId → { kind, id, vez, fotos, subiendo }

  function marco(slot, s) {
    slot.innerHTML = `
      <section class="ep-bloque" aria-labelledby="${slot.id}-t">
        <div class="ep-cab">
          <h3 class="ep-titulo" id="${slot.id}-t">Photos <span class="ep-tag ep-tag-azul" data-ep="cuenta">—</span></h3>
          <span class="ep-nota">🔒 Only players of this ${s.kind === 'tournament' ? 'tournament' : 'ladder'} see them, in their Player Portal.</span>
        </div>
        <div class="ep-cont">
          <label class="ep-drop" data-ep="drop">
            <input type="file" class="ep-file" accept="image/jpeg,image/png,image/webp" multiple data-ep="file">
            <span><b>Drop photos here</b> or <b>choose files</b> · JPG or PNG · they're resized automatically</span>
          </label>
          <p class="ep-estado" data-ep="estado" role="status" aria-live="polite"></p>
          <div class="ep-grid" data-ep="grid"><div class="loading">Loading photos...</div></div>
        </div>
      </section>`;
    const input = slot.querySelector('[data-ep="file"]');
    const drop = slot.querySelector('[data-ep="drop"]');
    input.addEventListener('change', () => { subir(slot.id, Array.from(input.files || [])); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('ep-drop-on'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('ep-drop-on'); }));
    drop.addEventListener('drop', (e) => subir(slot.id, Array.from((e.dataTransfer && e.dataTransfer.files) || [])));
  }

  async function cargar(slotId) {
    const s = secciones[slotId];
    const slot = $(slotId);
    if (!s || !slot) return;
    const mia = ++s.vez;
    const grid = slot.querySelector('[data-ep="grid"]');
    try {
      const { data, error } = await sb().rpc('admin_fotos', { p_kind: s.kind, p_event_id: s.id });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      const fotos = (data && data.photos) || [];
      const urls = await enlaces(fotos.map((f) => f.path));
      if (mia !== s.vez || !$(slotId)) return;
      s.fotos = fotos;
      slot.querySelector('[data-ep="cuenta"]').textContent = `${fotos.length} of ${MAX}`;
      slot.querySelector('[data-ep="drop"]').classList.toggle('ep-drop-lleno', fotos.length >= MAX);
      if (!fotos.length) {
        grid.innerHTML = '<p class="ep-vacio">No photos yet. Players see them in their recap as soon as you add them.</p>';
        return;
      }
      grid.innerHTML = fotos.map((f, i) => `
        <figure class="ep-foto${f.hidden ? ' ep-foto-oculta' : ''}">
          ${urls[f.path] ? `<img src="${esc(urls[f.path])}" alt="Photo ${i + 1}" loading="lazy">` : ''}
          ${f.hidden ? '<span class="ep-oculta">Hidden · removal request</span>' : ''}
          <button type="button" class="ep-x" data-action="epBorrar" data-slot="${esc(slotId)}" data-id="${esc(f.id)}" aria-label="Delete photo ${i + 1}">✕</button>
        </figure>`).join('');
    } catch (err) {
      if (mia !== s.vez || !$(slotId)) return;
      console.error('[event-photos] no se pudo leer:', err);
      grid.innerHTML = `<p class="ep-vacio">${esc(errorLegible(err))}</p>`;
    }
  }

  async function subir(slotId, files) {
    const s = secciones[slotId];
    const slot = $(slotId);
    if (!s || !slot || s.subiendo) return;
    const fotos = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) || (!f.type && /\.(jpe?g|png|webp)$/i.test(f.name || '')));
    if (!fotos.length) { if (files.length) window.toast('Choose photos (JPG or PNG). iPhone HEIC photos: export them as JPG first.', true); return; }
    const libres = MAX - (s.fotos ? s.fotos.length : 0);
    if (libres <= 0) { window.toast(`This event already has ${MAX} photos. Delete one to add another.`, true); return; }
    const lote = fotos.slice(0, libres);
    const estado = slot.querySelector('[data-ep="estado"]');
    s.subiendo = true;
    slot.querySelector('[data-ep="drop"]').classList.add('ep-drop-ocupado');
    let bien = 0, mal = 0, ultimoError = null;
    for (let i = 0; i < lote.length; i++) {
      estado.textContent = `Uploading ${i + 1} of ${lote.length}…`;
      const path = `${s.kind === 'tournament' ? 't' : 'l'}/${s.id}/${nuevoId()}.jpg`;
      let subida = false;
      try {
        const { blob, w, h } = await achicar(lote[i]);
        const up = await sb().storage.from(CARPETA).upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
        if (up.error) throw up.error;
        subida = true;
        const { data, error } = await sb().rpc('admin_foto_agregar', { p_kind: s.kind, p_event_id: s.id, p_path: path, p_width: w, p_height: h });
        if (error) throw error;
        if (data && data.error) throw new Error(data.error);
        bien++;
      } catch (err) {
        mal++; ultimoError = err;
        console.error('[event-photos] no se pudo subir:', err);
        /* Si el archivo quedó en la carpeta pero no se apuntó, se quita. */
        if (subida) { try { await sb().storage.from(CARPETA).remove([path]); } catch (_) { /* nada */ } }
        if (/too_many/.test(String(err && err.message))) break;
      }
    }
    s.subiendo = false;
    slot.querySelector('[data-ep="drop"]').classList.remove('ep-drop-ocupado');
    const sobran = fotos.length - lote.length;
    estado.textContent = '';
    if (bien) window.toast(`${bien} photo${bien === 1 ? '' : 's'} added.${sobran ? ` ${sobran} not added: the limit is ${MAX}.` : ''}`);
    if (mal) window.toast(`${mal} photo${mal === 1 ? '' : 's'} could not be added. ${errorLegible(ultimoError)}`, true);
    else if (sobran && !bien) window.toast(`The limit is ${MAX} photos per event.`, true);
    await cargar(slotId);
  }

  /* Borrar: primero la fila (los jugadores dejan de verla), después el archivo. */
  async function borrarFoto(id, { preguntar = true } = {}) {
    if (preguntar) {
      const si = await window.confirmModal({ title: 'Delete this photo?', message: 'It is deleted for good. Players will not see it anymore.', okLabel: 'Delete photo', danger: true, focusCancel: true });
      if (!si) return false;
    }
    try {
      const { data, error } = await sb().rpc('admin_foto_borrar', { p_photo_id: Number(id) });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      const { error: e2 } = await sb().storage.from(CARPETA).remove([data.path]);
      if (e2) console.warn('[event-photos] la foto ya no se ve, pero el archivo no se pudo borrar:', e2.message);
      window.toast('Photo deleted.');
      return true;
    } catch (err) {
      window.toast(errorLegible(err), true);
      return false;
    }
  }

  function montar(kind, id, slotId) {
    const slot = $(slotId);
    if (!slot || !id || !sb()) return;
    const antes = secciones[slotId];
    if (antes && antes.subiendo && antes.kind === kind && antes.id === Number(id)) return;
    secciones[slotId] = { kind, id: Number(id), vez: antes ? antes.vez + 1 : 0, fotos: null, subiendo: false };
    marco(slot, secciones[slotId]);
    cargar(slotId);
  }

  /* La escalera elegida arriba (debajo de Standings). */
  function montarEscalera() {
    const l = window.AdminState && window.AdminState.currentLadder;
    const slot = $('ep-ladder');
    if (!slot) return;
    if (l) montar('ladder', l.id, 'ep-ladder');
    else { slot.innerHTML = ''; delete secciones['ep-ladder']; }
  }

  /* ═══ 2. Player Portal → Photo removal requests ═══ */
  let _vezPedidos = 0;
  let _vezCuenta = 0;

  async function contar() {
    if (!sb()) return;
    const mia = ++_vezCuenta;
    let n = 0;
    try {
      const { data, error } = await sb().rpc('admin_fotos_pedidos_nuevos');
      if (error) throw error;
      n = Number(data) || 0;
    } catch (err) {
      if (!faltaSql(String(err && err.message))) console.warn('[event-photos] no se pudo contar:', err?.message || err);
    }
    if (mia !== _vezCuenta) return;
    const t = n > 99 ? '99+' : String(n);
    ['fr-sb', 'fr-md'].forEach((id) => { const el = $(id); if (el) { el.textContent = t; el.hidden = n === 0; } });
    const nuevo = $('fr-nuevos');
    if (nuevo) { nuevo.textContent = `${n} new`; nuevo.hidden = n === 0; }
    const frase = n ? ` — ${n} new` : '';
    ['sb-photo-requests', 'md-photo-requests'].forEach((id) => { const b = $(id); if (b) b.setAttribute('aria-label', `Photo removal requests${frase}`); });
  }

  async function cargarPedidos() {
    const caja = $('fr-body');
    if (!caja) return;
    const mia = ++_vezPedidos;
    caja.innerHTML = '<div class="loading">Loading...</div>';
    try {
      const { data, error } = await sb().rpc('admin_fotos_pedidos');
      if (error) throw error;
      const items = (data && data.items) || [];
      const urls = await enlaces(items.filter((r) => r.path).map((r) => r.path));
      if (mia !== _vezPedidos) return;
      if (!items.length) {
        caja.innerHTML = '<div class="pc-vacio pc-vacio-ok">No requests. When a player taps "Remove me" on a photo, it is hidden right away and shows up here.</div>';
        return;
      }
      const ESTADO = { new: ['Hidden from players', 'pc-pill-red'], deleted: ['Deleted', 'pc-pill-green'], kept: ['Kept · visible again', 'pc-pill-warn'] };
      caja.innerHTML = `<div class="ep-pedidos">${items.map((r) => {
        const [txt, cls] = ESTADO[r.status] || ESTADO.new;
        const visible = r.status === 'kept' && r.hidden ? ['Still hidden (another request)', 'pc-pill-red'] : [txt, cls];
        return `
        <article class="ep-pedido">
          <div class="ep-pedido-foto">${r.path && urls[r.path] ? `<img src="${esc(urls[r.path])}" alt="Photo from ${esc(r.event || 'the event')}" loading="lazy">` : '<span>Photo deleted</span>'}</div>
          <div class="ep-pedido-txt">
            <b>${esc(r.player)}</b> asked to be removed · <span class="ep-gris">${esc(r.event || (r.kind === 'tournament' ? 'Tournament' : 'Ladder'))} · ${esc(cuando(r.created_at))}</span><br>
            <span class="pc-pill ${visible[1]}">${esc(visible[0])}</span>
          </div>
          <div class="ep-pedido-botones">${r.status === 'new' && r.photo_id ? `
            <button type="button" class="av-btn pc-btn-peligro" data-action="epPedidoBorrar" data-id="${esc(r.photo_id)}">Delete photo</button>
            <button type="button" class="av-btn av-btn-sec" data-action="epPedidoMantener" data-id="${esc(r.id)}">Keep photo</button>` : ''}
          </div>
        </article>`;
      }).join('')}</div>`;
    } catch (err) {
      if (mia !== _vezPedidos) return;
      console.error('[event-photos] no se pudo leer los pedidos:', err);
      caja.innerHTML = `<div class="pc-vacio">${esc(errorLegible(err))}</div>`;
    }
  }

  async function mantener(id) {
    try {
      const { data, error } = await sb().rpc('admin_foto_mantener', { p_request_id: Number(id) });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      window.toast(data.visible ? 'Photo kept. Players can see it again.' : 'Kept. It stays hidden because someone else also asked to be removed.');
    } catch (err) {
      window.toast(errorLegible(err), true);
    }
    await Promise.all([cargarPedidos(), contar()]);
  }

  /* ── Arranque ── */
  window.EventPhotos = { montar, montarEscalera };
  window.AdminPageLoaders.photoRequests = () => { cargarPedidos(); contar(); };
  window.AdminPageLoaders.eventPhotosLadder = montarEscalera;
  Object.assign(window.CLICK_HANDLERS, {
    epBorrar: async (btn) => { if (await borrarFoto(btn.dataset.id)) await cargar(btn.dataset.slot); },
    epPedidoBorrar: async (btn) => { if (await borrarFoto(btn.dataset.id)) await Promise.all([cargarPedidos(), contar()]); },
    epPedidoMantener: (btn) => mantener(btn.dataset.id),
  });

  const empezar = () => {
    contar();
    setInterval(() => { if (document.visibilityState === 'visible') contar(); }, CADA);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') contar(); });
  };
  if (window.app && window.app.authReady) window.app.authReady.then(empezar);
})();
