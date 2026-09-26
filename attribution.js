/* ============================================================
   FEROCIA SPORTS CENTER — Atribución (de dónde viene el visitante)
   ------------------------------------------------------------
   Se carga en TODAS las páginas públicas, no sólo en el formulario.

   POR QUÉ EN TODAS
     Un anuncio de Instagram manda a la gente a index.html, no a
     subscribe.html. La persona mira, baja, y recién entonces hace clic
     en "Subscribe Now". Ese clic es una página NUEVA y la etiqueta de
     la dirección se pierde por completo.

     Si sólo leyéramos la etiqueta en el formulario, casi todo quedaría
     marcado como "direct" y la campaña parecería un fracaso aunque
     hubiera funcionado. Por eso este archivo guarda el origen en cuanto
     la persona pisa CUALQUIER página, y el formulario lo recupera
     después.

   PRIMER CONTACTO (first touch)
     Se guarda de dónde vino la PRIMERA vez y no se sobrescribe. Si
     alguien llega por Instagram, se va, y vuelve tres días después
     escribiendo la dirección, el mérito sigue siendo de Instagram: ese
     anuncio fue el que la trajo.

     Caduca a los 30 días. Pasado ese plazo la huella se descarta y la
     siguiente visita empieza de cero — un anuncio que alguien vio hace
     seis meses no trajo la suscripción de hoy.

   NO PUEDE ROMPER NADA
     Todo va dentro de try/catch. En Safari privado y con las cookies
     bloqueadas, localStorage LANZA EXCEPCIÓN al leerlo, no devuelve
     vacío. Si este archivo fallara sin protección, se llevaría por
     delante el resto del script de la página y el formulario dejaría
     de enviarse. Ante cualquier problema devuelve 'direct' y sigue.

   NO GUARDA NADA PERSONAL
     Sólo etiquetas de campaña, el sitio de procedencia y la página de
     entrada. Ni nombre, ni correo, ni nada que identifique a nadie.

   Depende de: nada. Se carga antes que cualquier otro script.
   ============================================================ */

(function (window, document) {
  'use strict';

  var CLAVE    = 'ferocia_attr_v1';
  var DIAS     = 30;
  var MAX_TEXTO = 200;

  /* Lista cerrada. Tiene que coincidir EXACTAMENTE con el CHECK de
     subscribers_source_valido en la base de datos. Si aquí mandamos un
     valor que allá no existe, la función lo convierte en 'other' y
     perdemos precisión sin que nadie se entere. */
  var ORIGENES = [
    'instagram', 'facebook', 'tiktok', 'youtube', 'google', 'whatsapp',
    'newsletter', 'qr', 'flyer', 'referral', 'direct', 'other'
  ];

  /* Las mismas equivalencias que normalize_source() en la base. Se
     repiten a propósito en los dos lados: aquí para que el dato viaje
     ya limpio, y allá porque la función es una API y puede llamarse sin
     pasar por esta página. */
  var EQUIVALENCIAS = {
    instagram: ['instagram', 'ig', 'insta', 'instagramads', 'igstory', 'reels'],
    facebook:  ['facebook', 'fb', 'meta', 'facebookads', 'metaads'],
    tiktok:    ['tiktok', 'tt'],
    youtube:   ['youtube', 'yt'],
    google:    ['google', 'googleads', 'adwords', 'gads', 'search', 'bing', 'duckduckgo', 'yahoo'],
    whatsapp:  ['whatsapp', 'wa'],
    newsletter:['newsletter', 'email', 'nl', 'mail', 'mailing'],
    qr:        ['qr', 'qrcode', 'codigoqr'],
    flyer:     ['flyer', 'print', 'poster', 'sign', 'impreso'],
    referral:  ['referral', 'partner', 'link', 'ref'],
    direct:    ['direct', 'none', 'directo']
  };

  /* De qué sitio viene, cuando no hay etiqueta. Es el plan B: si la
     persona llega desde Instagram sin que hayamos etiquetado el link,
     el navegador igual nos dice de dónde venía. Menos fiable que la
     etiqueta (Instagram muchas veces no lo manda), pero mejor que nada. */
  var DOMINIOS = [
    [/(^|\.)instagram\.com$/,            'instagram'],
    [/(^|\.)l\.instagram\.com$/,         'instagram'],
    [/(^|\.)facebook\.com$/,             'facebook'],
    [/(^|\.)fb\.(com|me)$/,              'facebook'],
    [/(^|\.)messenger\.com$/,            'facebook'],
    [/(^|\.)tiktok\.com$/,               'tiktok'],
    [/(^|\.)youtube\.com$/,              'youtube'],
    [/(^|\.)youtu\.be$/,                 'youtube'],
    [/(^|\.)google\./,                   'google'],
    [/(^|\.)bing\.com$/,                 'google'],
    [/(^|\.)duckduckgo\.com$/,           'google'],
    [/(^|\.)search\.yahoo\.com$/,        'google'],
    [/(^|\.)whatsapp\.com$/,             'whatsapp'],
    [/(^|\.)wa\.me$/,                    'whatsapp']
  ];

  // ── Utilidades ───────────────────────────────────────────────────

  function texto(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, MAX_TEXTO);
  }

  /* Reduce cualquier variante a un valor de la lista. Copia exacta de
     lo que hace normalize_source() en Postgres. */
  function normalizar(valor) {
    var v = texto(valor).toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!v) return null;
    for (var destino in EQUIVALENCIAS) {
      if (Object.prototype.hasOwnProperty.call(EQUIVALENCIAS, destino)
          && EQUIVALENCIAS[destino].indexOf(v) !== -1) {
        return destino;
      }
    }
    return 'other';
  }

  /* Minúsculas, sin acentos, guiones en vez de espacios. Igual que en
     la base, para que "Octubre 2026" y "octubre-2026" no acaben siendo
     dos campañas distintas en el reporte. */
  function normalizarCampana(valor) {
    var v = texto(valor).toLowerCase();
    if (String.prototype.normalize) {
      v = v.normalize('NFD').replace(/[̀-ͯ]/g, '');   // quita acentos
    }
    v = v.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return v ? v.slice(0, 100) : null;
  }

  function parametros() {
    var out = {};
    try {
      var qs = window.location.search || '';
      if (qs.charAt(0) === '?') qs = qs.slice(1);
      if (!qs) return out;
      qs.split('&').forEach(function (par) {
        if (!par) return;
        var i = par.indexOf('=');
        var k = (i === -1 ? par : par.slice(0, i));
        var v = (i === -1 ? ''  : par.slice(i + 1));
        try { k = decodeURIComponent(k.replace(/\+/g, ' ')); } catch (e) { /* mal codificado */ }
        try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { /* mal codificado */ }
        k = k.trim().toLowerCase();
        if (k) out[k] = texto(v);
      });
    } catch (e) { /* una dirección rota no puede tumbar la página */ }
    return out;
  }

  function hostDe(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
  }

  function origenPorReferente(ref) {
    var host = hostDe(ref);
    if (!host) return null;
    // Navegación dentro del propio sitio: no es un origen, es la persona
    // moviéndose de index.html a subscribe.html.
    try { if (host === window.location.hostname.toLowerCase()) return null; } catch (e) { /* noop */ }
    for (var i = 0; i < DOMINIOS.length; i++) {
      if (DOMINIOS[i][0].test(host)) return DOMINIOS[i][1];
    }
    return 'referral';
  }

  // ── Almacenamiento (siempre protegido) ───────────────────────────

  function leer() {
    try {
      var crudo = window.localStorage.getItem(CLAVE);
      if (!crudo) return null;
      var obj = JSON.parse(crudo);
      if (!obj || typeof obj !== 'object' || !obj.source) return null;
      var guardado = Date.parse(obj.at || '');
      if (!guardado || isNaN(guardado)) return null;
      // Caducado: se descarta en silencio.
      if (Date.now() - guardado > DIAS * 24 * 60 * 60 * 1000) return null;
      if (ORIGENES.indexOf(obj.source) === -1) return null;
      return obj;
    } catch (e) {
      return null;   // Safari privado, cookies bloqueadas, JSON corrupto.
    }
  }

  function guardar(obj) {
    try { window.localStorage.setItem(CLAVE, JSON.stringify(obj)); }
    catch (e) { /* sin almacenamiento seguimos funcionando, sólo que sin memoria */ }
  }

  // ── Lo que pasa al cargar cualquier página ───────────────────────

  function capturar() {
    var p = parametros();

    var utmSource = p['utm_source'] || '';
    var etiquetado = !!(utmSource || p['utm_medium'] || p['utm_campaign'] || p['utm_content'] || p['utm_term']);

    var origen = normalizar(utmSource);

    /* Sin utm_source pero con fbclid: Meta lo añade solo a todo clic en
       un anuncio suyo. No distingue Instagram de Facebook, así que cae
       en 'facebook' — es lo más cercano a la verdad que se puede
       afirmar. Por eso conviene etiquetar los anuncios a mano. */
    if (!origen && p['fbclid']) origen = 'facebook';
    if (!origen && p['gclid'])  origen = 'google';

    var ref = '';
    try { ref = texto(document.referrer || ''); } catch (e) { /* noop */ }

    if (!origen) origen = origenPorReferente(ref);

    var nuevo = {
      source:   origen || 'direct',
      campaign: normalizarCampana(p['utm_campaign'] || ''),
      at:       new Date().toISOString(),
      detail: {
        utm_source:   p['utm_source']   || undefined,
        utm_medium:   p['utm_medium']   || undefined,
        utm_campaign: p['utm_campaign'] || undefined,
        utm_content:  p['utm_content']  || undefined,
        utm_term:     p['utm_term']     || undefined,
        fbclid:       p['fbclid']       || undefined,
        gclid:        p['gclid']        || undefined,
        referrer:     ref || undefined,
        /* Sólo dominio y ruta, sin la parte de la dirección que lleva
           las etiquetas: ésas ya van en sus propios campos y repetirlas
           sólo ocuparía espacio. */
        landing_page: (function () {
          try { return window.location.origin + window.location.pathname; }
          catch (e) { return undefined; }
        }()),
        first_seen_at: new Date().toISOString()
      }
    };

    var previo = leer();

    /* ── La regla del primer contacto ──────────────────────────────
       Sólo se escribe si no hay nada guardado, o si lo guardado es
       'direct' y ahora sí sabemos de dónde vino. Ese segundo caso
       importa más de lo que parece: alguien que ya conocía el sitio y
       lo tenía en favoritos, y más tarde entra por tu anuncio, debe
       contar para el anuncio. Un origen real siempre gana a 'direct'. */
    if (!previo) {
      guardar(nuevo);
      return nuevo;
    }
    if (previo.source === 'direct' && nuevo.source !== 'direct') {
      guardar(nuevo);
      return nuevo;
    }
    return previo;
  }

  var estado = null;
  try { estado = capturar(); } catch (e) { estado = null; }

  // ── Lo que el formulario usa ─────────────────────────────────────

  window.FerociaAttribution = {
    /**
     * Lo que hay que mandarle a subscribe_signup.
     * Nunca lanza excepción y nunca devuelve null: si todo falló,
     * devuelve 'direct' con el detalle vacío.
     */
    get: function () {
      var s = estado;
      if (!s) { try { s = leer() || capturar(); } catch (e) { s = null; } }
      if (!s) return { source: 'direct', campaign: null, detail: null };

      // Fuera las claves sin valor, para no guardar un objeto lleno de
      // huecos. La base también las descarta, pero enviar menos es mejor.
      var detalle = {};
      var hay = false;
      var d = s.detail || {};
      for (var k in d) {
        if (Object.prototype.hasOwnProperty.call(d, k) && d[k]) {
          detalle[k] = String(d[k]).slice(0, MAX_TEXTO);
          hay = true;
        }
      }

      return {
        source:   ORIGENES.indexOf(s.source) === -1 ? 'other' : s.source,
        campaign: s.campaign || null,
        detail:   hay ? detalle : null
      };
    },

    /** Para depurar desde la consola del navegador. */
    debug: function () { return { estado: estado, guardado: leer() }; },

    /** Borra la huella. Sólo para probar: no se llama desde la app. */
    reset: function () {
      try { window.localStorage.removeItem(CLAVE); } catch (e) { /* noop */ }
      estado = null;
    }
  };

}(window, document));
