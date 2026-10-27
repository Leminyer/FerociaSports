/* ============================================================
   FEROCIA — Videos de la Ferocia Pickleball Academy: lo común
   Ajuste 24 (13 de octubre) — decisiones §33

   Lo usan la página pública (index-videos.js) y el panel
   (admin-videos.js), para que los temas y los enlaces no se separen.

   ⚠️  En la base sólo se guarda el CÓDIGO de 11 caracteres de cada video
   (sql/84). Los enlaces y las imágenes se arman AQUÍ, siempre hacia
   youtube.com / i.ytimg.com: así nadie puede colar un enlace a otro sitio.
   Los temas válidos son los mismos que exige el SQL 84 (videos_topic_valido)
   y el SQL 121 (videos_topics_validos: uno o varios por video).
   ============================================================ */

(function () {
  'use strict';

  const CANAL = 'https://www.youtube.com/@ferociasports';

  /* El orden es el de los filtros de la página. */
  const TOPICS = [
    { key: 'dinking',       label: 'Dinking' },
    { key: 'serve_return',  label: 'Serve & Return' },
    { key: 'third_shot',    label: 'Third Shot' },
    { key: 'strategy',      label: 'Strategy' },
    { key: 'drills',        label: 'Drills' },
    { key: 'kitchen_rules', label: 'Kitchen Rules' },
    { key: 'mistakes',      label: 'Mistakes' },
    /* Ajuste 25 (sql/85). */
    { key: 'ratings',       label: 'Ratings & Levels' },
  ];
  const ETIQUETA = Object.fromEntries(TOPICS.map((t) => [t.key, t.label]));

  const ID_OK = /^[A-Za-z0-9_-]{11}$/;

  /** El código del video a partir de lo que se pegue: el enlace de
      cualquier forma (watch, youtu.be, shorts, embed, live, m., music.)
      o el código suelto. null si no es de YouTube. */
  function codigoDe(texto) {
    const t = String(texto || '').trim();
    if (ID_OK.test(t)) return t;
    let u;
    try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); } catch (_) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
    let id = null;
    if (host === 'youtu.be') {
      id = u.pathname.split('/')[1] || null;
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
        if (m) id = m[1];
      }
    }
    return id && ID_OK.test(id) ? id : null;
  }

  const verEnYouTube = (id) => ID_OK.test(id) ? `https://www.youtube.com/watch?v=${id}` : CANAL;
  /* hq: 480×360 (con bandas, se recorta a 16:9); mq: 320×180;
     maxres: 1280×720, no siempre existe (ver index-videos.js). */
  const imagen = (id, tam = 'hq') => ID_OK.test(id)
    ? `https://i.ytimg.com/vi/${id}/${{ hq: 'hqdefault', mq: 'mqdefault', max: 'maxresdefault' }[tam] || 'hqdefault'}.jpg`
    : '';

  /* §109 (SQL 121): un video puede tener varios tópicos (v.topics). Si
     todavía no los trae (la base de antes), vale su único v.topic. Siempre
     sin repetidos y en el orden de la lista de arriba. */
  function temas(v) {
    const lista = (v && Array.isArray(v.topics) && v.topics.length) ? v.topics : (v && v.topic ? [v.topic] : []);
    return TOPICS.map((t) => t.key).filter((k) => lista.includes(k));
  }
  /* "Serve & Return · Mistakes" */
  const etiquetas = (v) => temas(v).map((k) => ETIQUETA[k]).join(' \u00b7 ');

  window.FerociaVideos = {
    CANAL,
    SUSCRIBIRSE: `${CANAL}?sub_confirmation=1`,
    TODOS: `${CANAL}/videos`,
    TOPICS,
    etiqueta: (k) => ETIQUETA[k] || '',
    temas,
    etiquetas,
    codigoDe,
    verEnYouTube,
    imagen,
    idValido: (id) => ID_OK.test(String(id || '')),
  };
})();
