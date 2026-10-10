/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: EDITOR CON FORMATO (COMPARTIDO)
   Depends on: db.js (toast)
   Load order: db.js -> admin-rich-editor.js -> los módulos que lo usan
               (admin-promotions.js, admin-comms-hub.js)

   ── QUÉ ES ────────────────────────────────────────────────────────
   Un editor de texto con formato —negritas, listas, colores, tamaños,
   alineaciones— para las pantallas que escriben correos. Fabrica su
   propia barra de botones y se encarga de que los comandos se apliquen
   a lo que esté seleccionado.

   ── POR QUÉ UN ARCHIVO APARTE ─────────────────────────────────────
   Esto nació dentro de admin-promotions.js, que era el único sitio con
   editor. Hoy lo usan Promotions y el Communications Hub. Copiarlo en
   cada pantalla significa que el próximo arreglo hay que hacerlo en
   cada una, y que a la tercera ya no se parecen entre sí. Aquí hay un
   solo sitio.

   ── LO QUE RESUELVE Y NO SE VE ────────────────────────────────────
   1. LA SELECCIÓN. Un comando de formato se aplica a lo que esté
      seleccionado, pero al tocar un botón el editor pierde el foco y
      con él la selección. Con los botones casi se disimula; con un
      desplegable o un panel de colores, no: abres el menú, eliges, y
      para entonces la selección ya no existe. Se guarda por nuestra
      cuenta y se restaura justo antes de aplicar.

   2. styleWithCSS. Hace que el navegador escriba
      `<span style="color:...">` en vez de la etiqueta antigua
      `<font color=...>`. El saneador del servidor entiende las dos,
      pero la primera sobrevive más limpia en los correos.

   3. UN SOLO ESCUCHADOR POR BARRA. Los botones llevan `data-cmd` y la
      barra entera escucha una vez, en lugar de un `onclick` por botón.
      Así la barra se puede regenerar sin dejar escuchadores sueltos.

   ── LAS CLASES CSS ────────────────────────────────────────────────
   La barra usa `promo-fmt-toolbar`, `promo-fmt-btn`, `promo-fmt-sep` y
   `promo-emoji-item`, que ya existen en las hojas de estilo del admin.
   El nombre dice "promo" porque ahí nacieron; ahora las usan cinco
   pantallas. Renombrarlas obliga a tocar el CSS, así que se quedan —
   a cambio de esta nota.
   ============================================================ */

(function () {
  'use strict';

  /* ─── LO QUE OFRECE LA BARRA ───────────────────────────────── */

  const EMOJIS = ['👋','📅','📍','🎾','🏆','⚡','🔥','✅','🎉','👑','⭐','📢'];

  /* Colores de la marca y poco más. Una paleta corta empuja a que los
     correos se parezcan entre sí, que es lo que se quiere. */
  const COLORES = [
    ['#0d1f4a', 'Navy'],   ['#174CCC', 'Blue'],  ['#24BC96', 'Teal'],
    ['#4a5e00', 'Olive'],  ['#F26024', 'Orange'],['#d61f4e', 'Red'],
    ['#7c3aed', 'Purple'], ['#6b7a99', 'Gray'],  ['#111827', 'Black'],
  ];

  /* La escala 1–7 de HTML. El servidor la traduce a píxeles fijos
     (3 = 14px, el normal) para que el tamaño no dependa del programa
     de correo que abra cada persona. */
  const TAMANOS = [
    ['',  'Size'],   ['2', 'Small'], ['3', 'Normal'],
    ['4', 'Large'],  ['5', 'X-Large'], ['6', 'Huge'],
  ];

  const SVG = {
    bold:      '<path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>',
    italic:    '<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>',
    underline: '<path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/>',
    ul:        '<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
    ol:        '<line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4" stroke-width="2"/><path d="M4 10h2" stroke-width="2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" stroke-width="2"/>',
    link:      '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    left:      '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="14" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>',
    center:    '<line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/>',
    right:     '<line x1="3" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>',
    justify:   '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    color:     '<path d="M12 3l4.5 11h-9L12 3z"/><line x1="4" y1="20" x2="20" y2="20" stroke-width="3.5"/>',
  };

  const icono = (k, grosor) =>
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"`
    + ` stroke-width="${grosor || 2.5}" stroke-linecap="round" stroke-linejoin="round">${SVG[k]}</svg>`;

  const boton = (cmd, titulo, k, grosor) =>
    `<button type="button" class="promo-fmt-btn" data-cmd="${cmd}" title="${titulo}">`
    + `${icono(k, grosor)}</button>`;

  const sep = '<div class="promo-fmt-sep"></div>';

  /** El HTML de la barra. `id` sirve para que cada editor tenga sus
      propios paneles de emoji y de color, y no se pisen entre sí. */
  const barraHTML = (id) => `
    ${boton('bold', 'Bold', 'bold', 3)}
    ${boton('italic', 'Italic', 'italic')}
    ${boton('underline', 'Underline', 'underline')}
    ${sep}
    ${boton('insertUnorderedList', 'Bullet list', 'ul')}
    ${boton('insertOrderedList', 'Numbered list', 'ol')}
    <button type="button" class="promo-fmt-btn" data-accion="link" title="Link">${icono('link')}</button>
    ${sep}
    ${boton('justifyLeft', 'Align left', 'left')}
    ${boton('justifyCenter', 'Align center', 'center')}
    ${boton('justifyRight', 'Align right', 'right')}
    ${boton('justifyFull', 'Justify', 'justify')}
    ${sep}
    <select data-accion="tamano" title="Font size"
      style="height:24px;border:0.5px solid var(--divider-color);border-radius:6px;background:white;font-family:'Inter',sans-serif;font-size:10px;font-weight:700;color:var(--text);cursor:pointer;padding:0 4px;">
      ${TAMANOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}
    </select>
    <div style="position:relative;display:inline-block;">
      <button type="button" class="promo-fmt-btn" data-accion="colores" title="Text color">${icono('color')}</button>
      <div id="fe-colores-${id}" style="display:none;position:absolute;top:32px;left:0;background:white;border:0.5px solid var(--divider-color);border-radius:8px;padding:8px;box-shadow:0 4px 16px rgba(8,15,46,.12);z-index:999;grid-template-columns:repeat(3,1fr);gap:4px;">
        ${COLORES.map(([h, n]) =>
          `<button type="button" data-color="${h}" title="${n}" style="width:22px;height:22px;border:1px solid rgba(0,0,0,.12);border-radius:5px;background:${h};cursor:pointer;padding:0;"></button>`).join('')}
      </div>
    </div>
    <div style="position:relative;display:inline-block;">
      <button type="button" class="promo-fmt-btn" data-accion="emojis" title="Emoji">😊</button>
      <div id="fe-emojis-${id}" style="display:none;position:absolute;top:32px;left:0;background:white;border:0.5px solid var(--divider-color);border-radius:8px;padding:8px;box-shadow:0 4px 16px rgba(8,15,46,.12);z-index:999;grid-template-columns:repeat(6,1fr);gap:2px;width:180px;">
        ${EMOJIS.map((e) =>
          `<button type="button" class="promo-emoji-item" data-emoji="${e}">${e}</button>`).join('')}
      </div>
    </div>`;

  /* ─── EL EDITOR ─────────────────────────────────────────────── */

  /**
   * Convierte un <div contenteditable> en un editor con formato.
   *
   * @param {string} editorId  id del div editable
   * @param {object} [opts]
   * @param {string} [opts.barraId]  id del contenedor donde va la barra.
   *        Si no se da, se crea una justo encima del editor.
   * @param {function} [opts.alEscribir]  se llama con la longitud del
   *        texto en cada cambio — para los contadores de caracteres.
   * @returns {object|null} manejador, o null si el editor no existe
   */
  const mount = (editorId, opts) => {
    const ed = document.getElementById(editorId);
    if (!ed) return null;
    if (ed._feManejador) return ed._feManejador;   // nunca dos veces

    const o = opts || {};

    // ── La barra ────────────────────────────────────────────────
    let barra = o.barraId ? document.getElementById(o.barraId) : null;
    if (!barra) {
      barra = document.createElement('div');
      barra.className = 'promo-fmt-toolbar';
      ed.parentNode.insertBefore(barra, ed);
    }
    /* Se INSERTA al principio, no se sustituye el contenido. La barra
       de Promotions lleva además el contador de caracteres al final;
       con innerHTML se perdería. */
    barra.insertAdjacentHTML('afterbegin', barraHTML(editorId));

    const panelColores = barra.querySelector(`#fe-colores-${CSS.escape(editorId)}`);
    const panelEmojis  = barra.querySelector(`#fe-emojis-${CSS.escape(editorId)}`);

    // ── La selección ────────────────────────────────────────────
    let rango = null;

    const guardar = () => {
      const sel = window.getSelection && window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      if (ed.contains(r.commonAncestorContainer)) rango = r.cloneRange();
    };

    ['keyup', 'mouseup', 'input', 'focus'].forEach((ev) =>
      ed.addEventListener(ev, guardar));
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === ed) guardar();
    });

    const cmd = (comando, valor) => {
      ed.focus();
      if (rango) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(rango);
      }
      try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
      document.execCommand(comando, false, valor === undefined ? null : valor);
      guardar();
      if (o.alEscribir) o.alEscribir(ed.innerText.length);
    };

    // ── Los paneles ─────────────────────────────────────────────
    const cerrarPaneles = () => {
      if (panelColores) panelColores.style.display = 'none';
      if (panelEmojis)  panelEmojis.style.display  = 'none';
    };

    const alternar = (panel) => {
      const abierto = panel.style.display === 'grid';
      cerrarPaneles();
      if (!abierto) panel.style.display = 'grid';
    };

    document.addEventListener('click', (e) => {
      if (!barra.contains(e.target)) cerrarPaneles();
    });

    // ── Un solo escuchador para toda la barra ───────────────────
    /* mousedown y no click: al bajar el ratón sobre un botón, el
       editor pierde el foco, y para cuando llegaría el click la
       selección ya se habría perdido. preventDefault lo evita. */
    barra.addEventListener('mousedown', (e) => {
      const el = e.target.closest('[data-cmd],[data-accion],[data-color],[data-emoji]');
      if (!el || el.tagName === 'SELECT') return;
      e.preventDefault();
      guardar();

      if (el.dataset.cmd)   { cmd(el.dataset.cmd); cerrarPaneles(); return; }
      if (el.dataset.color) { cmd('foreColor', el.dataset.color); cerrarPaneles(); return; }
      if (el.dataset.emoji) { cmd('insertText', el.dataset.emoji); cerrarPaneles(); return; }

      if (el.dataset.accion === 'colores' && panelColores) return alternar(panelColores);
      if (el.dataset.accion === 'emojis'  && panelEmojis)  return alternar(panelEmojis);

      if (el.dataset.accion === 'link') {
        cerrarPaneles();
        const url = prompt('Enter URL:');
        if (!url) return;
        /* El servidor lo vuelve a comprobar —él es la autoridad— pero
           avisar aquí evita mandar la campaña y descubrirlo luego. */
        if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
          if (window.toast) toast('Links must start with https:// or mailto:', true);
          return;
        }
        cmd('createLink', url.trim());
      }
    });

    barra.addEventListener('change', (e) => {
      const sel = e.target;
      if (sel.dataset.accion !== 'tamano' || !sel.value) return;
      cmd('fontSize', sel.value);
      sel.selectedIndex = 0;   // vuelve a "Size" para poder repetir
    });

    if (o.alEscribir) {
      ed.addEventListener('input', () => o.alEscribir(ed.innerText.length));
    }

    /* ── EL MANEJADOR ───────────────────────────────────────────
       getHTML() y getText() no son lo mismo y la diferencia importa:

         getHTML → lo que se MANDA. Lleva el formato.
         getText → para VALIDAR y para el texto de la bandeja de
                   entrada. Un editor "vacío" no es una cadena vacía:
                   suele tener un <br> dentro, así que con el HTML no
                   se puede saber si hay algo escrito. Con el texto, sí. */
    const manejador = {
      getHTML: () => ed.innerHTML.trim(),
      getText: () => ed.innerText.trim(),
      setHTML: (h) => { ed.innerHTML = h || ''; rango = null; },
      clear:   () => { ed.innerHTML = ''; rango = null; },
      focus:   () => ed.focus(),
      /** ¿Hay algo escrito de verdad? */
      vacio:   () => ed.innerText.trim() === '',
      el: ed,
    };
    ed._feManejador = manejador;
    return manejador;
  };

  /* ─── TEXTO DE ANTES → HTML ────────────────────────────────
     Las pantallas de avisos traen mensajes ya escritos que se cargan
     con un clic. Están guardados como TEXTO, con saltos de línea, y
     eso era correcto cuando el campo era una caja de texto normal.

     En un editor con formato, meter ese texto tal cual pega todas las
     líneas en un solo bloque: los saltos dejan de verse. Aquí se
     convierten en párrafos y saltos de verdad, así que la plantilla
     se sigue viendo como siempre.

     Se escapa antes de nada: son textos nuestros, pero uno de ellos
     lleva un "<" cualquier día y ahí se acabó el editor. */
  const textoAHTML = (txt) => {
    const escapar = (s) => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escapar(txt || '')
      .split(/\n{2,}/)                          // párrafos
      .map((p) => p.replace(/\n/g, '<br>'))     // saltos sueltos
      .filter((p) => p.trim() !== '')
      .map((p) => `<p>${p}</p>`)
      .join('');
  };

  window.FerociaEditor = { mount, textoAHTML, EMOJIS, COLORES, TAMANOS };
})();
