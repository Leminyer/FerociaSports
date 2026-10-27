/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: VIDEOS (Ferocia Pickleball Academy)
   Ajuste 24 (13 de octubre) — decisiones §33

   La pantalla donde se cargan los videos de la sección "Play Smarter."
   de ferociasports.com: añadir, editar, marcar el Video of the Month,
   ocultar / mostrar y borrar (sólo de la web: el video sigue en YouTube).

   Depende de: db.js (api, esc, toast, confirmModal, window.supabase),
   videos-common.js (FerociaVideos), admin-state.js (AdminPageLoaders,
   CLICK_HANDLERS). La seguridad de verdad está en la base (sql/84): esta
   pantalla sólo funciona para una administradora activa.
   Estilos: admin-pages.css (av-).

   §109 (27 de octubre, SQL 121):
     · Un video puede tener VARIOS tópicos (casillas; al menos uno).
     · "From YouTube — not on the website yet": la lista de los videos
       públicos del canal que faltan en el sitio (función youtube-videos).
       Al elegir uno se llenan el enlace y el título. "Not for the website"
       lo saca de la lista para siempre (se puede deshacer: Restore).
   ============================================================ */

(function () {
  'use strict';

  const FV = window.FerociaVideos;
  const esc = (x) => window.esc(x == null ? '' : String(x));
  const COLS = 'id,youtube_id,title,description,topic,topics,is_featured,is_visible,created_at';

  let _videos = [];
  let _editando = null;     // id del video que se edita, o null (añadir)
  let _ocupada = false;     // guardando: no se aceptan más clics
  let _vezTitulo = 0;       // la respuesta de un título viejo no se pinta

  const $ = (id) => document.getElementById(id);

  const ICON = {
    star: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    eye: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>',
    ext: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
    trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  };

  /* Los mensajes de la base, en palabras. */
  const errorLegible = (err) => {
    const m = String((err && err.message) || err || '');
    if (/videos_youtube_id_unico|duplicate key/.test(m)) return 'That video is already on the website.';
    if (/videos_youtube_id_valido/.test(m)) return 'That is not a valid YouTube video.';
    if (/videos_title_valido/.test(m)) return 'The title is missing or too long (120 characters at most).';
    if (/videos_description_valida/.test(m)) return 'The description is too long (200 characters at most).';
    if (/videos_topic_valido|videos_topics_validos/.test(m)) return 'Choose one or more topics from the list.';
    if (/videos_un_solo_destacado/.test(m)) return 'Another video was just made the Video of the Month. Refresh and try again.';
    if (/row-level security|not_authorized|permission denied|not_saved/i.test(m)) return 'The change was not saved — your admin access could not be confirmed. Sign in again.';
    return 'Something went wrong. Please try again in a moment.';
  };

  /* Texto de una línea, como lo guarda la base. */
  /* Se corta por letras, no por mitades de emoji (la base rechazaría el
     trozo suelto). */
  const limpio = (t, max) => [...String(t || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()]
    .slice(0, max).join('').trim();

  /* La base no avisa si NO cambió nada (por ejemplo, si la sesión de
     administradora caducó: el permiso filtra la fila y ya está). Así
     que después de guardar se lee y se comprueba. */
  async function comprobar(id, esperado) {
    const [fila] = await api(`videos?id=eq.${Number(id)}&select=${COLS}`);
    /* Las listas (topics) se comparan por su contenido. */
    const igual = (a, b) => (Array.isArray(a) || Array.isArray(b)) ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null) : a === b;
    const ok = esperado === null ? !fila
      : !!fila && Object.keys(esperado).every((k) => igual(fila[k] ?? null, esperado[k] ?? null));
    if (!ok) throw new Error('not_saved');
  }

  // ── EL FORMULARIO ─────────────────────────────────────────

  /* §109: una casilla por tópico (mismo aspecto que los días de las clínicas). */
  function pintarTemas() {
    const caja = $('av-topics');
    if (!caja || caja.children.length) return;
    caja.innerHTML = FV.TOPICS.map((t) =>
      `<label class="ev-day"><input type="checkbox" value="${esc(t.key)}"><span>${esc(t.label)}</span></label>`).join('');
  }
  /* Los marcados, en el orden de la lista (el mismo que guarda la base). */
  const leerTemas = () => [...document.querySelectorAll('#av-topics input:checked')].map((c) => c.value)
    .filter((k) => FV.etiqueta(k)).sort((a, b) => FV.TOPICS.findIndex((t) => t.key === a) - FV.TOPICS.findIndex((t) => t.key === b));
  const ponerTemas = (lista) => document.querySelectorAll('#av-topics input').forEach((c) => { c.checked = lista.includes(c.value); });

  function pintarVista() {
    const caja = $('av-vista');
    if (!caja) return;
    const id = _editando ? (_videos.find((v) => v.id === _editando) || {}).youtube_id : FV.codigoDe($('av-link').value);
    if (!id) {
      caja.innerHTML = '<div class="av-vista-vacia">The video preview shows up here.</div>';
      return;
    }
    const titulo = limpio($('av-title').value, 120) || 'Title';
    const tema = FV.etiquetas({ topics: leerTemas() });
    caja.innerHTML = `<div class="av-vista-img"><img src="${esc(FV.imagen(id, 'mq'))}" alt=""></div>
      <div class="av-vista-tema">${esc(tema || 'Topic')}</div>
      <div class="av-vista-titulo">${esc(titulo)}</div>
      <a class="av-vista-ver" href="${esc(FV.verEnYouTube(id))}" target="_blank" rel="noopener">Watch on YouTube ${ICON.ext}</a>`;
  }

  /* Al pegar un enlace: se intenta traer el título de YouTube. Si YouTube
     no contesta, o no deja, se escribe a mano: nunca bloquea. */
  async function alCambiarEnlace() {
    if (_editando) return;
    const ayuda = $('av-link-ayuda');
    const txt = $('av-link').value.trim();
    const id = FV.codigoDe(txt);
    pintarVista();
    if (!txt) { ayuda.textContent = 'Paste the link of a video from your channel.'; ayuda.className = 'av-ayuda'; return; }
    if (!id) { ayuda.textContent = 'That does not look like a YouTube video link.'; ayuda.className = 'av-ayuda av-ayuda-error'; return; }
    if (_videos.some((v) => v.youtube_id === id)) {
      ayuda.textContent = 'That video is already on the website.'; ayuda.className = 'av-ayuda av-ayuda-error'; return;
    }
    ayuda.textContent = 'Getting the title from YouTube…'; ayuda.className = 'av-ayuda';
    const mia = ++_vezTitulo;
    let datos = null;
    try {
      const corte = new AbortController();
      const reloj = setTimeout(() => corte.abort(), 5000);
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(FV.verEnYouTube(id))}`,
        { signal: corte.signal, credentials: 'omit' });
      clearTimeout(reloj);
      if (r.ok) datos = await r.json();
    } catch (_) { /* sin título: se escribe a mano */ }
    if (mia !== _vezTitulo || FV.codigoDe($('av-link').value) !== id) return;
    const titulo = datos && typeof datos.title === 'string' ? limpio(datos.title, 120) : '';
    if (titulo && !$('av-title').value.trim()) $('av-title').value = titulo;
    const deOtro = datos && typeof datos.author_url === 'string'
      && !/youtube\.com\/@ferociasports\/?$/i.test(datos.author_url);
    if (deOtro) {
      ayuda.textContent = 'Heads up: this video is not from the @ferociasports channel.';
      ayuda.className = 'av-ayuda av-ayuda-aviso';
    } else {
      /* §109: elegido de la lista, el título ya viene puesto aunque YouTube no conteste. */
      ayuda.textContent = (titulo || $('av-title').value.trim()) ? 'Title filled in from YouTube — change it if you like.'
        : 'Could not get the title from YouTube. Type it in.';
      ayuda.className = 'av-ayuda';
    }
    pintarVista();
  }

  function limpiarFormulario() {
    _editando = null;
    $('av-form').reset();
    $('av-link').disabled = false;
    $('av-form-titulo-txt').textContent = 'Add a video';
    $('av-save').textContent = 'Add video';
    $('av-cancel').hidden = true;
    $('av-link-ayuda').textContent = 'Paste the link of a video from your channel.';
    $('av-link-ayuda').className = 'av-ayuda';
    $('av-yt-grupo').hidden = false;
    pintarYouTube();
    pintarVista();
  }

  function editar(id) {
    if (_ocupada) return;
    const v = _videos.find((x) => x.id === Number(id));
    if (!v) return;
    _editando = v.id;
    $('av-link').value = FV.verEnYouTube(v.youtube_id);
    $('av-link').disabled = true;
    $('av-title').value = v.title;
    ponerTemas(FV.temas(v));
    $('av-yt-grupo').hidden = true;   // al editar no se elige otro video
    $('av-desc').value = v.description || '';
    $('av-featured').checked = !!v.is_featured;
    $('av-form-titulo-txt').textContent = 'Edit video';
    $('av-save').textContent = 'Save changes';
    $('av-cancel').hidden = false;
    $('av-link-ayuda').textContent = 'The link cannot be changed. To use another video, add it as new.';
    $('av-link-ayuda').className = 'av-ayuda';
    pintarVista();
    $('av-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('av-title').focus(), 50);
  }

  async function guardar(e) {
    e.preventDefault();
    if (_ocupada) return;
    const id = _editando ? null : FV.codigoDe($('av-link').value);
    const title = limpio($('av-title').value, 120);
    const topics = leerTemas();
    const description = limpio($('av-desc').value, 200) || null;
    const destacado = $('av-featured').checked;
    if (!_editando && !id) { toast('Paste a valid YouTube video link first.', true); $('av-link').focus(); return; }
    if (!title) { toast('Write a title.', true); $('av-title').focus(); return; }
    if (!topics.length) {
      toast('Choose at least one topic.', true);
      const primera = document.querySelector('#av-topics input');
      if (primera) primera.focus();
      return;
    }

    _ocupada = true;
    const btn = $('av-save');
    const texto = btn.textContent;
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      let vid = _editando;
      if (_editando) {
        const antes = _videos.find((v) => v.id === _editando);
        const cambios = { title, topics, description };
        /* Quitar la marca de "del mes" se hace aquí; ponerla, con la
           función de la base (de una vez, sin dejar dos ni ninguno). */
        if (antes && antes.is_featured && !destacado) cambios.is_featured = false;
        await api(`videos?id=eq.${_editando}`, 'PATCH', cambios);
        await comprobar(_editando, { title, topics, description });
      } else {
        await api('videos', 'POST', { youtube_id: id, title, topics, description, is_visible: true });
        const [nuevo] = await api(`videos?youtube_id=eq.${encodeURIComponent(id)}&select=id`);
        vid = nuevo && nuevo.id;
        if (!vid) throw new Error('not_saved');
      }
      if (destacado && vid) await marcarDelMes(vid, false);
      toast(_editando ? '✅ Video updated.' : `✅ "${title}" is now on the website.`);
      /* Ya está en el sitio: fuera de la lista de "faltan". */
      if (!_editando) _yt.videos = _yt.videos.filter((v) => v.youtube_id !== id);
      limpiarFormulario();
      await cargar();
    } catch (err) {
      console.error('[videos] no se pudo guardar:', err);
      toast(errorLegible(err), true);
    } finally {
      _ocupada = false;
      btn.disabled = false;
      if (btn.textContent === 'Saving...') btn.textContent = texto;
    }
  }

  // ── LAS ACCIONES DE CADA VIDEO ────────────────────────────

  async function marcarDelMes(id, avisar = true) {
    const sb = window.supabase;
    if (!sb || typeof sb.rpc !== 'function') throw new Error('no_client');
    const { error } = await sb.rpc('marcar_video_del_mes', { p_id: Number(id) });
    if (error) throw new Error(error.message);
    if (avisar) toast('✅ That is now the Video of the Month.');
  }

  async function accion(fn, okMsg) {
    if (_ocupada) return;
    _ocupada = true;
    try {
      await fn();
      if (okMsg) toast(okMsg);
    } catch (err) {
      console.error('[videos]', err);
      toast(errorLegible(err), true);
    } finally {
      _ocupada = false;
    }
    await cargar();
  }

  async function mostrarOcultar(id) {
    const v = _videos.find((x) => x.id === Number(id));
    if (!v) return;
    if (v.is_visible && v.is_featured) {
      const ok = await window.confirmModal({
        title: 'Hide the Video of the Month?',
        message: `"${v.title}" will no longer be on the website, and there will be no Video of the Month until you choose another one.`,
        okLabel: 'Hide it', cancelLabel: 'Keep it',
      });
      if (!ok) return;
    }
    await accion(async () => {
      await api(`videos?id=eq.${v.id}`, 'PATCH',
        v.is_visible ? { is_visible: false, is_featured: false } : { is_visible: true });
      await comprobar(v.id, { is_visible: !v.is_visible });
    },
      v.is_visible ? `"${v.title}" is hidden from the website. It is still on YouTube.` : `"${v.title}" is back on the website.`);
  }

  async function borrar(id) {
    const v = _videos.find((x) => x.id === Number(id));
    if (!v) return;
    const ok = await window.confirmModal({
      title: 'Remove this video from the website?',
      message: `"${v.title}" will be removed from ferociasports.com. It stays on YouTube with all its views. `
        + 'If you only want to take it down for a while, use Hide instead.',
      okLabel: 'Remove', cancelLabel: 'Cancel', danger: true, focusCancel: true,
    });
    if (!ok) return;
    if (_editando === v.id) limpiarFormulario();
    await accion(async () => {
      await api(`videos?id=eq.${v.id}`, 'DELETE');
      await comprobar(v.id, null);
    }, `"${v.title}" was removed from the website.`);
  }

  // ── LA LISTA ──────────────────────────────────────────────

  function pintarLista() {
    const caja = $('av-list');
    if (!caja) return;
    const visibles = _videos.filter((v) => v.is_visible).length;
    $('av-count').textContent = _videos.length ? `${visibles} shown${_videos.length > visibles ? ` · ${_videos.length - visibles} hidden` : ''}` : '';
    if (!_videos.length) {
      caja.innerHTML = '<div class="av-vacio">No videos yet. Add the first one above — until then, the videos section does not show on the website.</div>';
      return;
    }
    caja.innerHTML = _videos.map((v) => `
      <div class="av-fila-video${v.is_visible ? '' : ' av-oculto'}">
        <a class="av-mini" href="${esc(FV.verEnYouTube(v.youtube_id))}" target="_blank" rel="noopener" aria-label="Watch ${esc(v.title)} on YouTube">
          <img src="${esc(FV.imagen(v.youtube_id, 'mq'))}" alt="" loading="lazy">
        </a>
        <div class="av-datos">
          <div class="av-pills">
            ${v.is_featured ? '<span class="av-pill av-pill-mes">Video of the Month</span>' : ''}
            ${v.is_visible ? '' : '<span class="av-pill av-pill-oculto">Hidden</span>'}
            ${FV.temas(v).map((k) => `<span class="av-pill av-pill-tema">${esc(FV.etiqueta(k))}</span>`).join('')}
          </div>
          <div class="av-nombre">${esc(v.title)}</div>
          ${v.description ? `<div class="av-desc">${esc(v.description)}</div>` : ''}
        </div>
        <div class="av-acciones">
          ${v.is_featured || !v.is_visible ? '' : `<button type="button" class="av-icono" data-action="avDelMes" data-vid="${esc(v.id)}" title="Make it the Video of the Month" aria-label="Make it the Video of the Month">${ICON.star}</button>`}
          <button type="button" class="av-icono" data-action="avEditar" data-vid="${esc(v.id)}" title="Edit" aria-label="Edit">${ICON.edit}</button>
          <button type="button" class="av-icono" data-action="avOcultar" data-vid="${esc(v.id)}" title="${v.is_visible ? 'Hide from the website' : 'Show on the website'}" aria-label="${v.is_visible ? 'Hide from the website' : 'Show on the website'}">${v.is_visible ? ICON.eyeOff : ICON.eye}</button>
          <a class="av-icono" href="${esc(FV.verEnYouTube(v.youtube_id))}" target="_blank" rel="noopener" title="Open on YouTube" aria-label="Open on YouTube">${ICON.ext}</a>
          <button type="button" class="av-icono av-icono-peligro" data-action="avBorrar" data-vid="${esc(v.id)}" title="Remove from the website" aria-label="Remove from the website">${ICON.trash}</button>
        </div>
      </div>`).join('');
  }

  let _vezLista = 0;   // una lista vieja que llega tarde no se pinta
  async function cargar() {
    const caja = $('av-list');
    const mia = ++_vezLista;
    try {
      const filas = await api(`videos?select=${COLS}&order=is_featured.desc,created_at.desc`);
      if (mia !== _vezLista) return;
      _videos = (Array.isArray(filas) ? filas : []).filter((v) => FV.idValido(v.youtube_id));
      pintarLista();
      pintarYouTube();   // lo que acaba de entrar al sitio sale de la lista de YouTube
    } catch (err) {
      if (mia !== _vezLista) return;
      console.error('[videos] no se pudieron leer:', err);
      if (caja) caja.innerHTML = '<div class="av-vacio">Could not load the videos. Please try again in a moment.</div>';
    }
  }

  // ── §109: "FROM YOUTUBE — NOT ON THE WEBSITE YET" ──────────

  const _yt = { videos: [], vez: 0, listo: false, aviso: '', descartados: [], shorts: 0 };

  /* Lo que contesta la función, en palabras. Pegar un enlace funciona siempre. */
  const AVISOS_YT = {
    missing_key: 'The YouTube list is not set up yet: the Google key (YOUTUBE_API_KEY) is missing in Supabase → Edge Functions → Secrets. You can still paste a link below.',
    youtube_key_problem: 'YouTube did not accept the Google key. Check YOUTUBE_API_KEY in Supabase, and that "YouTube Data API v3" is enabled in Google Cloud. You can still paste a link below.',
    youtube_quota: 'YouTube\u2019s daily limit was reached. Try again tomorrow — you can still paste a link below.',
    channel_not_found: 'YouTube could not find the @ferociasports channel. You can still paste a link below.',
    not_authorized: 'Your admin access could not be confirmed. Sign in again.',
  };
  const AVISO_YT_OTRO = 'Could not get the list from YouTube right now. Try Refresh in a moment — you can still paste a link below.';

  const fechaCorta = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  };

  function pintarYouTube() {
    const sel = $('av-yt'), ayuda = $('av-yt-ayuda'), quitar = $('av-yt-descartar');
    if (!sel) return;
    const elegido = sel.value;
    /* Por si alguno se añadió por enlace: lo que ya está en el sitio no sale. */
    const lista = _yt.videos.filter((v) => !_videos.some((x) => x.youtube_id === v.youtube_id)
      && !_yt.descartados.some((d) => d.youtube_id === v.youtube_id));
    const primera = document.createElement('option');
    primera.value = '';
    sel.replaceChildren(primera);
    if (!_yt.listo) {
      primera.textContent = _yt.aviso ? 'The list is not available' : 'Looking for new videos on YouTube…';
      sel.disabled = true;
    } else if (!lista.length) {
      primera.textContent = 'All your YouTube videos are on the website';
      sel.disabled = true;
    } else {
      primera.textContent = `Choose a video… (${lista.length} not on the website yet)`;
      lista.forEach((v) => {
        const o = document.createElement('option');
        o.value = v.youtube_id;
        const f = fechaCorta(v.published_at);
        o.textContent = `${f ? `${f} — ` : ''}${v.title || v.youtube_id}`;   // como texto, nunca como HTML
        sel.appendChild(o);
      });
      sel.disabled = false;
      /* Si el que estaba elegido sigue en la lista, se queda elegido. */
      if (elegido && lista.some((v) => v.youtube_id === elegido)) sel.value = elegido;
    }
    quitar.disabled = !sel.value;
    ayuda.textContent = _yt.aviso || (_yt.listo
      ? `Public videos from your channel, newest first. ${_yt.shorts ? `${_yt.shorts} Short${_yt.shorts === 1 ? ' was' : 's were'} left out.` : 'Shorts are left out.'}`
      : 'Looking for new videos on YouTube…');
    ayuda.className = _yt.aviso ? 'av-ayuda av-ayuda-aviso' : 'av-ayuda';
  }

  async function leerCodigoDeError(error) {
    try {
      const resp = error && error.context;
      if (resp && typeof resp.json === 'function') return ((await resp.clone().json()) || {}).error || '';
    } catch (_) { /* sin cuerpo legible */ }
    return '';
  }

  async function cargarYouTube() {
    const mia = ++_yt.vez;
    _yt.listo = false; _yt.aviso = '';
    pintarYouTube();
    let codigo = '';
    try {
      const sb = window.supabase;
      if (!sb || !sb.functions) throw new Error('no_client');
      const { data, error } = await sb.functions.invoke('youtube-videos', { body: {} });
      if (error) codigo = (await leerCodigoDeError(error)) || 'unexpected';
      else if (!data || data.ok !== true || !Array.isArray(data.videos)) codigo = (data && data.error) || 'unexpected';
      if (mia !== _yt.vez) return;
      if (!codigo) {
        _yt.videos = data.videos.filter((v) => v && FV.idValido(v.youtube_id))
          .map((v) => ({ youtube_id: v.youtube_id, title: limpio(v.title, 120), published_at: String(v.published_at || '') }));
        _yt.shorts = Number(data.shorts) || 0;
        _yt.listo = true;
      }
    } catch (err) {
      console.error('[videos] la lista de YouTube:', err);
      codigo = 'unexpected';
    }
    if (mia !== _yt.vez) return;
    if (codigo) { _yt.aviso = AVISOS_YT[codigo] || AVISO_YT_OTRO; _yt.videos = []; }
    pintarYouTube();
  }

  /* Al elegir uno: el enlace y el título, como si se hubiera pegado. */
  function alElegirDeYouTube() {
    const id = $('av-yt').value;
    $('av-yt-descartar').disabled = !id;
    if (!id) return;
    const v = _yt.videos.find((x) => x.youtube_id === id);
    $('av-link').value = FV.verEnYouTube(id);
    $('av-title').value = v ? v.title : '';
    alCambiarEnlace();
  }

  async function cargarDescartados() {
    try {
      const filas = await api('videos_descartados?select=youtube_id,title,created_at&order=created_at.desc');
      _yt.descartados = (Array.isArray(filas) ? filas : []).filter((d) => FV.idValido(d.youtube_id));
    } catch (err) {
      console.error('[videos] los "Not for the website":', err);
      _yt.descartados = [];
    }
    const caja = $('av-yt-ocultos'), lista = $('av-yt-ocultos-lista');
    if (!caja) return;
    caja.hidden = !_yt.descartados.length;
    $('av-yt-ocultos-n').textContent = `(${_yt.descartados.length})`;
    lista.innerHTML = _yt.descartados.map((d) => `
      <div class="av-yt-oculto">
        <a href="${esc(FV.verEnYouTube(d.youtube_id))}" target="_blank" rel="noopener">${esc(d.title || d.youtube_id)}</a>
        <button type="button" class="av-yt-restaurar" data-action="avYtRestaurar" data-yt="${esc(d.youtube_id)}">Restore</button>
      </div>`).join('');
  }

  async function descartar() {
    const id = $('av-yt').value;
    const v = _yt.videos.find((x) => x.youtube_id === id);
    if (!v || _ocupada) return;
    _ocupada = true;
    try {
      await api('videos_descartados', 'POST', { youtube_id: v.youtube_id, title: v.title || null });
      _yt.videos = _yt.videos.filter((x) => x.youtube_id !== v.youtube_id);
      if (FV.codigoDe($('av-link').value) === v.youtube_id) limpiarFormulario();
      toast(`"${v.title}" is out of this list. It stays on YouTube — "Restore" brings it back.`);
    } catch (err) {
      console.error('[videos] Not for the website:', err);
      toast(/duplicate key/.test(String(err && err.message)) ? 'That video was already out of the list.' : errorLegible(err), true);
    } finally {
      _ocupada = false;
    }
    pintarYouTube();
    await cargarDescartados();
    pintarYouTube();
    $('av-yt').focus();   // el botón se apagó: el cursor vuelve a la lista
  }

  async function restaurar(yt) {
    if (!FV.idValido(yt) || _ocupada) return;
    _ocupada = true;
    try {
      await api(`videos_descartados?youtube_id=eq.${encodeURIComponent(yt)}`, 'DELETE');
      toast('Back in the list.');
    } catch (err) {
      console.error('[videos] Restore:', err);
      toast(errorLegible(err), true);
    } finally {
      _ocupada = false;
    }
    await cargarDescartados();
    $('av-yt-ocultos').hidden ? $('av-yt').focus() : $('av-yt-ocultos').querySelector('summary').focus();
    await cargarYouTube();
  }

  function abrir() {
    pintarTemas();
    if (!$('av-form')._enganchado) {
      $('av-form')._enganchado = true;
      $('av-form').addEventListener('submit', guardar);
      $('av-link').addEventListener('input', alCambiarEnlace);
      $('av-title').addEventListener('input', pintarVista);
      $('av-topics').addEventListener('change', pintarVista);
      $('av-yt').addEventListener('change', alElegirDeYouTube);
    }
    cargar();
    cargarYouTube();
    cargarDescartados();
  }

  window.AdminPageLoaders.videos = abrir;
  Object.assign(window.CLICK_HANDLERS, {
    avEditar:  (btn) => editar(btn.dataset.vid),
    avCancelar: () => limpiarFormulario(),
    avOcultar: (btn) => mostrarOcultar(btn.dataset.vid),
    avBorrar:  (btn) => borrar(btn.dataset.vid),
    avDelMes:  (btn) => accion(() => marcarDelMes(btn.dataset.vid, false), '✅ That is now the Video of the Month.'),
    avYtRefrescar: () => cargarYouTube(),
    avYtDescartar: () => descartar(),
    avYtRestaurar: (btn) => restaurar(btn.dataset.yt),
  });
})();
