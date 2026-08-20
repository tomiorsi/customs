/* ══════════════════════════════════════════════════════════════
   Noticias y nomenclador en la portada.

   La portada es un archivo estático servido tal cual; las notas cambian cada
   hora y el nomenclador se consulta a demanda, así que las dos secciones se
   llenan desde el navegador contra rutas propias.

   Lo que Google indexa NO es esto: son /noticias y /noticias/<id>, que se
   arman en el servidor. Acá la prioridad es que la portada abra rápido y no
   se rompa si una de las dos rutas no contesta.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /** Texto a nodo, sin construir HTML a mano: lo que llega es de terceros. */
  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function aviso(donde, texto) {
    donde.replaceChildren(el('p', 'nom-aviso', texto));
  }

  /* ─────────────────────────── Noticias ─────────────────────────── */

  function pintarNoticias(grilla, noticias) {
    if (!noticias.length) {
      grilla.replaceChildren(
        el('p', 'seccion-cargando', 'Ahora mismo no hay notas para mostrar.')
      );
      return;
    }
    const frag = document.createDocumentFragment();
    for (const n of noticias) {
      const a = el('a', 'noticia');
      a.href = n.href;

      if (n.imagen) {
        const img = el('img', 'noticia-foto');
        img.src = n.imagen;
        img.alt = '';
        img.loading = 'lazy';
        // Si el medio borra la foto, la tarjeta sigue viva sin el hueco.
        img.addEventListener('error', () => img.remove());
        a.appendChild(img);
      }

      const cuerpo = el('div', 'noticia-cuerpo');
      cuerpo.appendChild(el('span', 'noticia-medio', n.medio + ' · ' + n.cuando));
      cuerpo.appendChild(el('h3', 'noticia-titulo', n.titulo));
      if (n.resumen) cuerpo.appendChild(el('p', 'noticia-resumen', n.resumen));
      a.appendChild(cuerpo);
      frag.appendChild(a);
    }
    grilla.replaceChildren(frag);
  }

  function cargarNoticias() {
    const grilla = document.getElementById('noticias-grilla');
    if (!grilla) return;
    fetch('/api/publico/noticias?n=3', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => pintarNoticias(grilla, d.noticias || []))
      .catch(() => {
        // Sin inventar: se dice que no se pudieron traer y se ofrece la página
        // completa, que se arma en el servidor y puede andar aunque esto falle.
        grilla.replaceChildren(
          el('p', 'seccion-cargando', 'No se pudieron cargar las noticias ahora.')
        );
      })
      .finally(() => grilla.setAttribute('aria-busy', 'false'));
  }

  /* ───────────────────────── Nomenclador ───────────────────────── */

  const salida = document.getElementById('nom-resultado');
  const form = document.getElementById('nom-form');
  const input = document.getElementById('nom-input');

  function consultar(params) {
    return fetch('/api/nomenclador/explorar?' + params, {
      headers: { accept: 'application/json' },
    }).then((r) => r.json().then((d) => ({ ok: r.ok, d })));
  }

  /** Las partidas candidatas de una búsqueda por texto. */
  function pintarPartidas(consulta, partidas) {
    if (!partidas.length) {
      // Un «no hay resultados» pelado se lee como que el buscador está roto.
      // Casi siempre lo que pasa es otra cosa: el nomenclador está escrito en
      // lenguaje legal y la palabra de todos los días no figura. «Notebook»
      // no existe; existe «máquinas automáticas para tratamiento de datos».
      // Decirlo convierte un fondo ciego en algo que se puede intentar de nuevo.
      const caja = el('div', 'nom-ficha');
      caja.appendChild(
        el('p', 'nom-ficha-texto', '«' + consulta + '» no aparece en el texto del nomenclador.')
      );
      caja.appendChild(
        el(
          'p',
          'nom-ficha-texto',
          'El nomenclador está escrito en lenguaje legal, no en el de todos los ' +
            'días: una notebook figura como «máquinas automáticas para tratamiento ' +
            'o procesamiento de datos». Probá con el término técnico, con el ' +
            'material, o con el número de partida si lo tenés.'
        )
      );
      salida.replaceChildren(caja);
      return;
    }
    const ul = el('ul', 'nom-lista');
    for (const p of partidas) {
      const li = document.createElement('li');
      const b = el('button', 'nom-fila');
      b.type = 'button';
      b.appendChild(el('span', 'nom-codigo', p.partida));
      b.appendChild(el('span', 'nom-texto', p.descripcion || ''));
      b.addEventListener('click', () => abrirPartida(p.partida));
      li.appendChild(b);
      ul.appendChild(li);
    }
    salida.replaceChildren(ul);
  }

  /** El contenido de una partida: sus posiciones. */
  function abrirPartida(partida) {
    aviso(salida, 'Abriendo la partida ' + partida + '…');
    consultar('partida=' + encodeURIComponent(partida)).then(({ ok, d }) => {
      if (!ok || !d.ok) {
        aviso(salida, d.error || 'No se pudo abrir la partida.');
        return;
      }
      const cont = document.createDocumentFragment();
      const ficha = el('div', 'nom-ficha');
      ficha.appendChild(el('div', 'nom-ficha-codigo', partida));
      if (d.descripcion) ficha.appendChild(el('p', 'nom-ficha-texto', d.descripcion));
      cont.appendChild(ficha);

      const lineas = d.posiciones || [];
      if (lineas.length) {
        const ul = el('ul', 'nom-lista');
        for (const l of lineas) {
          const codigo = l.codigo;
          if (!codigo) continue;
          const li = document.createElement('li');
          const b = el('button', 'nom-fila');
          b.type = 'button';
          b.appendChild(el('span', 'nom-codigo', codigo));
          b.appendChild(el('span', 'nom-texto', l.descripcion || l.texto || ''));
          b.addEventListener('click', () => abrirPosicion(codigo, l.descripcion || l.texto));
          li.appendChild(b);
          ul.appendChild(li);
        }
        cont.appendChild(ul);
      }
      salida.replaceChildren(cont);
      salida.appendChild(volverA(() => form.requestSubmit()));
    });
  }

  /** La ficha de una posición: arancel, unidad, sufijos. */
  function abrirPosicion(ncm, descripcion) {
    aviso(salida, 'Buscando ' + ncm + '…');
    consultar('ncm=' + encodeURIComponent(ncm)).then(({ ok, d }) => {
      if (!ok || !d.ok) {
        aviso(salida, d.error || 'No se pudo consultar la posición.');
        return;
      }
      const ficha = el('div', 'nom-ficha');
      ficha.appendChild(el('div', 'nom-ficha-codigo', ncm));
      if (descripcion) ficha.appendChild(el('p', 'nom-ficha-texto', descripcion));

      const datos = el('div', 'nom-datos');
      const a = d.arancel || {};
      // Solo lo que vino. Un cero puesto por defecto donde el dato falta se
      // lee como «no paga», que es una respuesta distinta a «no lo sé».
      const pct = (v) => (v == null ? null : v + '%');
      const campos = [
        ['Derecho de importación', pct(a.di)],
        ['Estadística', pct(a.te)],
        ['IVA', pct(a.iva)],
        ['IVA adicional', pct(a.ivaAdicional)],
        ['Ganancias', pct(a.ganancias)],
        ['Ingresos brutos', pct(a.iibb)],
        ['Reintegro', pct(a.reintegro)],
        ['Derecho de exportación', pct(a.de)],
        ['Unidad estadística', d.unidad || null],
      ];
      for (const [nombre, valor] of campos) {
        if (valor == null) continue;
        const dd = el('div', 'nom-dato', nombre);
        dd.appendChild(el('b', null, String(valor)));
        datos.appendChild(dd);
      }
      if (datos.childNodes.length) ficha.appendChild(datos);

      // Los sufijos son la parte que más se olvida al declarar: cada uno es una
      // pregunta que el SIM va a hacer sobre esta posición. Se listan enteros,
      // con su texto, porque el código solo («NA01») no le dice nada a nadie.
      if (Array.isArray(d.sufijos) && d.sufijos.length) {
        const caja = el('div', 'nom-sufijos');
        caja.appendChild(
          el('div', 'nom-sufijos-titulo', 'Sufijos de valor que pide esta posición')
        );
        const ul = el('ul', 'nom-sufijos-lista');
        for (const x of d.sufijos) {
          const li = document.createElement('li');
          li.appendChild(el('span', 'nom-codigo', x.sufijo || ''));
          li.appendChild(el('span', 'nom-texto', x.descripcion || ''));
          ul.appendChild(li);
        }
        caja.appendChild(ul);
        ficha.appendChild(caja);
      }

      salida.replaceChildren(ficha);
      salida.appendChild(volverA(() => form.requestSubmit()));
    });
  }

  function volverA(accion) {
    const b = el('button', 'nom-volver', '← Volver a la búsqueda');
    b.type = 'button';
    b.addEventListener('click', accion);
    return b;
  }

  function buscar(e) {
    e.preventDefault();
    const q = (input.value || '').trim();
    if (q.length < 2) {
      aviso(salida, 'Escribí al menos dos letras, o un número de partida.');
      return;
    }
    aviso(salida, 'Buscando…');
    consultar('q=' + encodeURIComponent(q)).then(({ ok, d }) => {
      if (!ok || !d.ok) {
        aviso(salida, d.error || 'No se pudo consultar el nomenclador.');
        return;
      }
      // La misma ruta contesta dos cosas según lo que se le pida: una partida
      // abierta cuando el texto era un número, o la lista de candidatas.
      if (d.partidas) pintarPartidas(q, d.partidas);
      else if (d.posiciones || d.descripcion) abrirPartida(q.replace(/\D/g, ''));
      else aviso(salida, 'No se encontró nada para «' + q + '».');
    });
  }

  function iniciar() {
    cargarNoticias();
    if (form) form.addEventListener('submit', buscar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
