/* ============================================================
   FEROCIA — ferociasports.com: Ferocia Pickleball Academy
   Ajuste 24 (13 de octubre) — decisiones §33

   Pinta la sección "Play Smarter." con los videos que se cargan en el
   panel (tabla `videos`, sql/84; el público sólo puede leer los
   visibles). TODO ABRE YOUTUBE en una pestaña nueva: el objetivo es
   llevar gente al canal (vistas, suscriptores, horas de reproducción).

   · Sin videos (o si la lectura falla): la sección y la píldora
     "Videos" de la franja se quedan escondidas. Nunca se ve vacía.
   · El grande es el "Video of the Month"; si no hay, el más reciente.
   · "From the library": los 3 más recientes después del grande.
   · Los filtros por tema y la cuadrícula salen cuando hay más de 4
     videos (con menos, ya se ven todos arriba). Sólo los temas que
     tienen videos.
   · Los textos se pintan como texto (textContent), nunca como HTML.
   · Las imágenes son las de YouTube (i.ytimg.com), armadas a partir del
     código del video; la grande intenta la de alta resolución y, si ese
     video no la tiene, usa la normal.
   ============================================================ */

(function () {
  'use strict';

  const FV = window.FerociaVideos;
  const seccion = document.getElementById('academy');
  if (!FV || !seccion || typeof window.api !== 'function') return;

  const SVG = 'http://www.w3.org/2000/svg';
  const MAX_ARRIBA = 4;     // el grande + 3 en la biblioteca
  let _videos = [];
  let _tema = '';

  /* Un elemento con clase y, si se da, texto (siempre como texto). */
  const el = (tag, cls, texto) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  };

  function icono(paths, { size = 14, fill = 'none', stroke = 'currentColor' } = {}) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', fill);
    s.setAttribute('aria-hidden', 'true');
    if (stroke) {
      s.setAttribute('stroke', stroke); s.setAttribute('stroke-width', '2.4');
      s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    }
    paths.forEach((d) => { const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); s.appendChild(p); });
    return s;
  }
  const flecha = () => icono(['M7 17 17 7', 'M8 7h9v9'], { size: 12 });
  const play = (size, color) => icono(['M8 5.5v13l11-6.5z'], { size, fill: color, stroke: null });

  /* El enlace a YouTube, siempre en una pestaña nueva. */
  const enlace = (v, cls) => {
    const a = el('a', cls);
    a.href = FV.verEnYouTube(v.youtube_id);
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  };

  function imagen(v, tam) {
    const caja = el('span', 'ac-imagen');
    const img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    if (tam === 'max') {
      /* La de alta resolución no existe en todos los videos: YouTube
         devuelve entonces una gris de 120 px (o un error). */
      const caer = () => { if (img.dataset.cayo) return; img.dataset.cayo = '1'; img.src = FV.imagen(v.youtube_id, 'hq'); };
      img.addEventListener('error', caer);
      img.addEventListener('load', () => { if (img.naturalWidth > 0 && img.naturalWidth <= 120) caer(); });
    }
    img.src = FV.imagen(v.youtube_id, tam);
    caja.appendChild(img);
    return caja;
  }

  const verEnYouTube = () => {
    const s = el('span', 'ac-ver', 'Watch on YouTube ');
    s.appendChild(flecha());
    return s;
  };

  function destacado(v) {
    const a = enlace(v, 'ac-destacado');
    a.setAttribute('aria-label', `${v.title} — watch on YouTube`);
    const img = imagen(v, 'max');
    img.appendChild(el('span', 'ac-sello', v.is_featured ? 'Video of the Month' : 'Latest video'));
    const boton = el('span', 'ac-play ac-play-grande');
    boton.appendChild(play(30, '#080f2e'));
    img.appendChild(boton);
    const cuerpo = el('span', 'ac-cuerpo');
    cuerpo.appendChild(el('span', 'ac-tema', FV.etiqueta(v.topic)));
    cuerpo.appendChild(el('span', 'ac-nombre-grande', v.title));
    if (v.description) cuerpo.appendChild(el('span', 'ac-desc', v.description));
    cuerpo.appendChild(verEnYouTube());
    a.append(img, cuerpo);
    return a;
  }

  function mini(v) {
    const a = enlace(v, 'ac-mini');
    a.setAttribute('aria-label', `${v.title} — watch on YouTube`);
    const img = imagen(v, 'mq');
    const boton = el('span', 'ac-play ac-play-chico');
    boton.appendChild(play(18, '#C6F221'));
    img.appendChild(boton);
    const txt = el('span', 'ac-mini-txt');
    txt.appendChild(el('span', 'ac-tema', FV.etiqueta(v.topic)));
    txt.appendChild(el('span', 'ac-mini-nombre', v.title));
    a.append(img, txt);
    return a;
  }

  function tarjeta(v) {
    const a = enlace(v, 'ac-tarjeta');
    a.setAttribute('aria-label', `${v.title} — watch on YouTube`);
    const img = imagen(v, 'hq');
    const boton = el('span', 'ac-play ac-play-chico');
    boton.appendChild(play(22, '#C6F221'));
    img.appendChild(boton);
    const cuerpo = el('span', 'ac-cuerpo');
    cuerpo.appendChild(el('span', 'ac-tema', FV.etiqueta(v.topic)));
    cuerpo.appendChild(el('span', 'ac-nombre', v.title));
    cuerpo.appendChild(verEnYouTube());
    a.append(img, cuerpo);
    return a;
  }

  function pintarCuadricula() {
    const g = document.getElementById('ac-grid');
    g.replaceChildren(...(_tema ? _videos.filter((v) => v.topic === _tema) : _videos).map(tarjeta));
    document.querySelectorAll('#ac-chips .ac-chip').forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.tema === _tema ? 'true' : 'false'));
  }

  function pintar() {
    const grande = _videos.find((v) => v.is_featured) || _videos[0];
    const resto = _videos.filter((v) => v !== grande);
    document.getElementById('ac-destacado').replaceChildren(destacado(grande));

    const bib = document.getElementById('ac-biblioteca');
    const recientes = resto.slice(0, MAX_ARRIBA - 1);
    document.getElementById('ac-recientes').replaceChildren(...recientes.map(mini));
    bib.hidden = !recientes.length;

    const chips = document.getElementById('ac-chips');
    const grid = document.getElementById('ac-grid');
    const hayMas = _videos.length > MAX_ARRIBA;
    chips.hidden = !hayMas;
    grid.hidden = !hayMas;
    if (hayMas) {
      const presentes = FV.TOPICS.filter((t) => _videos.some((v) => v.topic === t.key));
      const botones = [{ key: '', label: 'All' }].concat(presentes).map((t) => {
        const b = el('button', 'ac-chip', t.label);
        b.type = 'button';
        b.dataset.tema = t.key;
        b.addEventListener('click', () => { _tema = t.key; pintarCuadricula(); });
        return b;
      });
      chips.replaceChildren(...botones);
      pintarCuadricula();
    }
    seccion.hidden = false;
    const pildora = document.getElementById('pill-videos');
    if (pildora) pildora.hidden = false;
  }

  async function cargar() {
    try {
      /* is_visible=eq.true SIEMPRE, aunque la base ya esconda los ocultos
         al público: una administradora con la sesión del panel abierta
         en el mismo navegador lee con SU permiso, y vería los ocultos en
         la página pública. Lo encontró una prueba. */
      const filas = await window.api('videos?select=id,youtube_id,title,description,topic,is_featured,created_at'
        + '&is_visible=eq.true&order=is_featured.desc,created_at.desc&limit=200');
      _videos = (Array.isArray(filas) ? filas : [])
        .filter((v) => v && FV.idValido(v.youtube_id) && typeof v.title === 'string' && v.title.trim())
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    } catch (err) {
      console.warn('[academy] no se pudieron leer los videos:', err);
      _videos = [];
    }
    if (_videos.length) pintar();
  }

  cargar();
})();
