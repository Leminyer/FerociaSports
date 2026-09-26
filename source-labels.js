/* ============================================================
   FEROCIA SPORTS CENTER — Etiquetas de origen (compartidas)
   ------------------------------------------------------------
   De dónde vino una persona y qué contestó en el formulario, con su
   nombre visible y su color, en UN SOLO sitio.

   POR QUÉ UN ARCHIVO APARTE
     Lo usan dos pantallas que no se conocen entre sí:
       · Promotions        (admin-promotions.js)  — lista de suscriptores
       · Ficha del jugador (admin-player-profile.js)

     Y admin.html carga la ficha del jugador ANTES que Promotions, así
     que la ficha no puede pedirle nada a Promotions: cuando la ficha se
     carga, Promotions todavía no existe.

     La alternativa era copiar la tabla de etiquetas en los dos
     archivos. Eso funciona el primer día y se rompe el segundo: se
     renombra "QR code" en un sitio, se olvida el otro, y la misma
     persona aparece con dos nombres distintos según la pantalla.

   ⚠️  LAS CLAVES SON LAS DE LA BASE DE DATOS
     Tienen que coincidir EXACTAMENTE con:
       · el CHECK subscribers_source_valido   (script 42)
       · el CHECK players_source_valido       (script 44)
       · la lista ORIGENES de attribution.js
     El texto visible se puede cambiar cuando se quiera. La clave no:
     cambiarla dejaría huérfanas todas las filas ya guardadas.

   Depende de: nada. Se carga antes que cualquier módulo del admin.
   ============================================================ */

(function (window) {
  'use strict';

  /* Fondo teñido + texto oscuro, el mismo patrón que las etiquetas de
     estado que ya existían, para que las tablas no se conviertan en un
     semáforo de colores saturados. */
  var SOURCE_META = {
    instagram:  { label: 'Instagram',  bg: 'rgba(193,53,132,0.12)',  fg: '#8a1f5e' },
    facebook:   { label: 'Facebook',   bg: 'rgba(24,119,242,0.12)',  fg: '#0f4fa8' },
    tiktok:     { label: 'TikTok',     bg: 'rgba(17,17,17,0.10)',    fg: '#2b2b2b' },
    youtube:    { label: 'YouTube',    bg: 'rgba(214,0,0,0.10)',     fg: '#a11212' },
    google:     { label: 'Google',     bg: 'rgba(217,119,6,0.14)',   fg: '#8a4b00' },
    whatsapp:   { label: 'WhatsApp',   bg: 'rgba(37,211,102,0.16)',  fg: '#0a6b33' },
    newsletter: { label: 'Newsletter', bg: 'rgba(13,31,74,0.10)',    fg: '#0d1f4a' },
    qr:         { label: 'QR code',    bg: 'rgba(36,188,150,0.14)',  fg: '#085041' },
    flyer:      { label: 'Flyer',      bg: 'rgba(242,96,36,0.12)',   fg: '#7a3d00' },
    referral:   { label: 'Referral',   bg: 'rgba(124,58,237,0.12)',  fg: '#4c1d95' },
    direct:     { label: 'Direct',     bg: 'rgba(107,122,153,0.12)', fg: '#3d4a63' },
    other:      { label: 'Other',      bg: 'rgba(107,122,153,0.12)', fg: '#3d4a63' },
  };

  /* Lo que la propia persona contestó. Distinto del origen automático:
     esto es lo que ELLA dice, aquello es lo que se midió. Pueden no
     coincidir, y esa discrepancia también es información. */
  var HEARD_META = {
    student:    'Already a Ferocia student',
    tournament: 'Played in a Ferocia tournament',
    ladder:     'Plays in a Ferocia ladder',
    coach:      'A Ferocia coach told them',
    instagram:  'Instagram',
    facebook:   'Facebook',
    google:     'Google or web search',
    friend:     'A friend or family member',
    club:       'Saw it at the club',
    event:      'At an event, clinic or open play',
    other:      'Other',
  };

  /* Los suscriptores anteriores a esta función, y los jugadores dados de
     alta a mano o por importación, no tienen origen. NO son "Direct":
     de ellos no se sabe de dónde vinieron, y decir "Direct" sería
     inventarse un dato que luego ensuciaría toda comparación. */
  var NONE_KEY   = '__none';
  var NONE_LABEL = 'Not recorded';
  var NONE_HINT  = 'Either they were added directly by an admin, or they '
                 + 'subscribed before we started recording where people come from.';

  // Escape propio: este archivo no debe depender de ningún global.
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function clave(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }

  /** Sólo los orígenes conocidos. null si no lo es. */
  function meta(v) {
    var k = clave(v);
    return k && Object.prototype.hasOwnProperty.call(SOURCE_META, k) ? SOURCE_META[k] : null;
  }

  /* Hay TRES estados, no dos, y confundirlos hace mentir al admin:
       1. sin dato            → nadie lo midió
       2. origen conocido     → una de las 12 etiquetas
       3. origen guardado que este archivo no conoce

     El tercero sólo puede pasar si algún día se añade un valor al CHECK
     de la base y se olvida añadirlo aquí. Mostrarlo como "Not recorded"
     sería decir "no sabemos" cuando sí se sabe. Se muestra tal cual. */
  function metaOrRaw(v) {
    var k = clave(v);
    if (!k) return null;
    return meta(k) || { label: k, bg: 'rgba(107,122,153,0.12)', fg: '#3d4a63', unknown: true };
  }

  /**
   * La etiqueta de color.
   * @param {string|null} v
   * @param {{size?:'sm'|'md'}} [opts]
   */
  function pill(v, opts) {
    var o = opts || {};
    var grande = o.size === 'md';
    var base = 'font-size:' + (grande ? '10px' : '9px')
             + ';font-weight:800;padding:' + (grande ? '4px 11px' : '3px 9px')
             + ';border-radius:99px;letter-spacing:.5px;text-transform:uppercase;'
             + 'display:inline-block;line-height:1.4;';
    var m = metaOrRaw(v);
    if (!m) {
      return '<span title="' + esc(NONE_HINT) + '" style="' + base
           + 'border:1px dashed #cbd5e8;color:#6B7280;">' + esc(NONE_LABEL) + '</span>';
    }
    var aviso = m.unknown
      ? ' title="This source is stored in the database but the admin has no label for it yet."'
      : '';
    return '<span' + aviso + ' style="' + base + 'background:' + m.bg + ';color:' + m.fg + ';">'
         + esc(m.label) + '</span>';
  }

  /** Texto legible de la respuesta del formulario. '' si no contestó. */
  function heardLabel(v) {
    var k = clave(v);
    if (!k) return '';
    // Un valor que no esté en la lista se muestra tal cual en vez de
    // desaparecer: si algo raro llegó a la base, hay que poder verlo.
    return Object.prototype.hasOwnProperty.call(HEARD_META, k) ? HEARD_META[k] : String(v);
  }

  window.FerociaSource = {
    SOURCE_META: SOURCE_META,
    HEARD_META:  HEARD_META,
    NONE_KEY:    NONE_KEY,
    NONE_LABEL:  NONE_LABEL,
    NONE_HINT:   NONE_HINT,
    meta:        meta,
    metaOrRaw:   metaOrRaw,
    pill:        pill,
    heardLabel:  heardLabel,
    /** Tres decimales, la misma convención que el coach rating. */
    rating: function (v) {
      return (v === null || v === undefined || v === '') ? '' : Number(v).toFixed(3);
    },
  };

}(window));
