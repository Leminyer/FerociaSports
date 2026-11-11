/* ============================================================
   FEROCIA — Un clic a la vez (§117) · 10 de noviembre de 2026

   Mientras un botón está guardando, enviando o borrando, no se puede
   volver a pulsar: así un doble clic no crea registros repetidos ni
   manda dos veces lo mismo.

   Cómo se ve: el botón se pone gris y aparece una ruedita. Si el botón
   tiene data-busy="Saving…" (o "Sending…", "Deleting…"), además cambia
   su texto mientras espera. Al terminar (bien o mal) vuelve a ser como
   era. Si la pantalla cambia el botón por su cuenta (su propio texto,
   o lo desactiva), se respeta lo suyo.

   Tres formas de usarlo:
     1. El repartidor de clics de app.js (data-action) lo hace solo:
        FerociaBoton.ejecutar(boton, () => accion(boton)).
     2. Funciones que se llaman desde onclick="…" en el HTML:
        FerociaBoton.unaVez(['saveMatch', 'processForfeit', …]).
        Mientras trabaja la llamada de UN botón, otro clic en ESE botón
        no hace nada (los botones de otras filas siguen funcionando).
     3. Formularios: form.addEventListener('submit',
        FerociaBoton.formulario(guardar)).

   No toca la propiedad "disabled" del botón (la usan las pantallas para
   sus propias reglas): usa una clase, aria-busy y aria-disabled.
   ============================================================ */
(function () {
  'use strict';

  const CLASE = 'fb-busy';
  const ESPERA_VISUAL_MS = 150;   // lo que tarda menos que esto no parpadea
  /* Red de seguridad: si una acción se queda esperando algo que nunca
     llega, el botón se suelta solo pasado este tiempo. */
  const TOPE_MS = 90000;
  const SELECTOR = 'button, a, [role="button"], input[type="submit"], input[type="button"]';

  function esBoton(el) {
    return !!(el && el.nodeType === 1 && el.matches(SELECTOR));
  }

  /* El botón que se acaba de pulsar (para llamadas desde onclick="…" u
     onsubmit="…"). */
  function botonDelEvento() {
    const ev = window.event;
    const t = ev && ev.target;
    if (!t || !t.closest) return null;
    if (ev.type === 'submit' && t.tagName === 'FORM') {
      return (ev.submitter && t.contains(ev.submitter) ? ev.submitter : null)
        || t.querySelector('button[type="submit"], input[type="submit"]');
    }
    return t.closest(SELECTOR) || null;
  }

  function ocupado(btn) {
    return !!(btn && btn.classList && btn.classList.contains(CLASE));
  }

  /* Cómo estaba el botón ANTES de que la acción empezara (la acción
     puede cambiarlo en su primer instante, y eso cuenta como "suyo"). */
  function foto(btn) {
    return esBoton(btn) ? { html: btn.innerHTML, disabled: btn.disabled } : null;
  }

  /* Mientras la ventana "Are you sure?" está abierta, el botón de detrás
     todavía no está guardando: no se le pone "Deleting…" aún. */
  const hayConfirmacion = () => !!document.querySelector('#confirm-modal.open');

  /* Marca el botón como ocupado. Devuelve la función que lo suelta. */
  function ocupar(btn, antes) {
    if (!esBoton(btn) || ocupado(btn)) return () => {};
    const antesHTML = antes ? antes.html : btn.innerHTML;
    const antesDisabled = antes ? antes.disabled : btn.disabled;
    const antesMinWidth = btn.style.minWidth;
    let puesto = null;          // HTML que pusimos nosotros
    let conRuedita = false;
    let temporizador = null;
    btn.classList.add(CLASE);
    btn.setAttribute('aria-busy', 'true');
    btn.setAttribute('aria-disabled', 'true');
    const pintar = () => {
      temporizador = null;
      if (!btn.isConnected || !ocupado(btn)) return;
      if (hayConfirmacion()) { temporizador = setTimeout(pintar, ESPERA_VISUAL_MS); return; }
      /* Si la pantalla ya cambió el botón por su cuenta, no se le pisa. */
      if (btn.innerHTML !== antesHTML || btn.disabled !== antesDisabled) return;
      btn.classList.add('fb-busy-visible');
      if (btn.tagName === 'INPUT') return;
      const texto = btn.dataset.busy;
      if (texto) {
        btn.style.minWidth = `${btn.offsetWidth}px`;
        btn.innerHTML = `<span class="fb-spin" aria-hidden="true"></span><span>${texto.replace(/[<>&"]/g, '')}</span>`;
        puesto = btn.innerHTML;
      } else if (btn.textContent.trim()) {
        const r = document.createElement('span');
        r.className = 'fb-spin';
        r.setAttribute('aria-hidden', 'true');
        btn.prepend(r);
        conRuedita = true;
      }
    };
    temporizador = setTimeout(pintar, ESPERA_VISUAL_MS);
    let suelto = false;
    return function soltar() {
      if (suelto) return;
      suelto = true;
      clearTimeout(temporizador);
      btn.classList.remove(CLASE, 'fb-busy-visible');
      btn.removeAttribute('aria-busy');
      btn.removeAttribute('aria-disabled');
      if (puesto !== null) {
        if (btn.innerHTML === puesto) btn.innerHTML = antesHTML;
        btn.style.minWidth = antesMinWidth;
      }
      /* Toda ruedita nuestra fuera (también una que la pantalla copiara
         al guardar y reponer su propio texto). */
      if (conRuedita) btn.querySelectorAll(':scope > .fb-spin').forEach((n) => n.remove());
    };
  }

  /* El botón queda ocupado hasta que la promesa termina. */
  function mientras(btn, promesa, antes) {
    const soltar = ocupar(btn, antes);
    const tope = setTimeout(soltar, TOPE_MS);
    const fin = () => { clearTimeout(tope); soltar(); };
    Promise.resolve(promesa).then(fin, fin);
    return promesa;
  }

  /* Ejecuta la acción de un botón: mientras su promesa no termina, el
     botón queda ocupado. Lo usa el repartidor de clics de app.js. */
  function ejecutar(btn, accion) {
    const antes = foto(btn);
    const r = accion();
    if (r && typeof r.then === 'function') mientras(btn, r, antes);
    return r;
  }

  /* Envuelve una función: mientras trabaja la llamada de un botón, otra
     llamada desde ESE botón (o, sin botón, con los mismos datos) se
     ignora y devuelve la misma promesa. */
  function envolver(fn, nombre) {
    if (typeof fn !== 'function' || fn.__fbEnvuelta) return fn;
    const porBoton = new WeakMap();
    const porDatos = new Map();
    const envuelta = function (...args) {
      const btn = botonDelEvento();
      let clave = null;
      if (!btn) { try { clave = JSON.stringify(args); } catch (_) { clave = null; } }
      const enCurso = btn ? porBoton.get(btn) : (clave !== null ? porDatos.get(clave) : null);
      if (enCurso) {
        /* Ignorado: que tampoco haga lo de por defecto (por ejemplo,
           mandar un formulario recargando la página). */
        const ev = window.event;
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        return enCurso;
      }
      const antes = foto(btn);
      const r = fn.apply(this, args);
      if (!r || typeof r.then !== 'function') return r;
      if (btn) porBoton.set(btn, r); else if (clave !== null) porDatos.set(clave, r);
      const soltar = btn ? ocupar(btn, antes) : () => {};
      let tope = null;
      const fin = () => {
        clearTimeout(tope);
        if (btn) { if (porBoton.get(btn) === r) porBoton.delete(btn); }
        else if (clave !== null && porDatos.get(clave) === r) porDatos.delete(clave);
        soltar();
      };
      tope = setTimeout(fin, TOPE_MS);
      r.then(fin, fin);
      return r;
    };
    envuelta.__fbEnvuelta = true;
    envuelta.__fbNombre = nombre || fn.name;
    return envuelta;
  }

  /* Para funciones globales que se llaman desde onclick="…". */
  function unaVez(nombres) {
    for (const n of nombres) {
      if (typeof window[n] === 'function') window[n] = envolver(window[n], n);
    }
  }

  /* Para formularios: mientras guarda, otro "submit" (doble clic o
     Enter) se ignora, y el botón de enviar se ve ocupado. */
  function formulario(handler) {
    if (typeof handler !== 'function') return handler;
    return function (e) {
      const form = e && e.currentTarget;
      if (form && form.dataset.fbEnviando === '1') { e.preventDefault(); return undefined; }
      const btn = form ? ((e.submitter && form.contains(e.submitter) ? e.submitter : null)
        || form.querySelector('button[type="submit"], input[type="submit"]')) : null;
      const antes = foto(btn);
      const r = handler.call(this, e);
      if (!form || !r || typeof r.then !== 'function') return r;
      form.dataset.fbEnviando = '1';
      const soltar = btn ? ocupar(btn, antes) : () => {};
      let tope = null;
      const fin = () => { clearTimeout(tope); delete form.dataset.fbEnviando; soltar(); };
      tope = setTimeout(fin, TOPE_MS);
      r.then(fin, fin);
      return r;
    };
  }

  window.FerociaBoton = { ejecutar, mientras, unaVez, formulario, ocupado, envolver };
})();
