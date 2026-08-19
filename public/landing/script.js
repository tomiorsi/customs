// ─── Paneles de Servicios: reveal al scrollear + pin en desktop ───
// Dos cosas separadas a propósito, después de un bug (2/8): el reveal del
// texto de cada panel usa su PROPIO IntersectionObserver, que se re-dispara
// cada vez que el panel entra en pantalla — funciona igual en mobile que en
// desktop. El "queda pegado mientras tanto" (sticky) es sólo un bonus de
// escritorio, puro CSS con media query (ver .has-pin en styles.css) — antes
// el reveal dependía del cálculo de scroll del pin, y como en mobile los
// paneles apilados son mucho más altos, el reveal ya había terminado (todo
// en el primer tramo del scroll de #servicios) mucho antes de llegar a
// verlos: se sentía "sin animación" aunque técnicamente sí había corrido.
(function initServicePanels() {
  const pins = Array.from(document.querySelectorAll('.service-panel-pin'));
  if (!pins.length) return;

  // El pin (sticky) sigue existiendo sólo en desktop vía CSS — esta clase
  // no le agrega nada visual en mobile, el media query se encarga.
  pins.forEach((pin) => pin.classList.add('has-pin'));

  const contents = document.querySelectorAll('.service-panel-content');
  if (!contents.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    contents.forEach((el) => el.classList.add('is-in'));
    return;
  }

  if (!('IntersectionObserver' in window)) {
    contents.forEach((el) => el.classList.add('is-in'));
    return;
  }

  // De una sola vía a propósito (2/8): antes esto era un
  // `toggle('is-in', entry.isIntersecting)`, que además de mostrar el texto
  // al entrar lo VOLVÍA A ESCONDER al salir. En la transición de un panel al
  // siguiente eso dejaba una ventana donde el que se va todavía está
  // desvaneciéndose (0.7s) y el que entra todavía no llegó a aparecer: la
  // sección quedaba vacía ~1s y se leía como que "se pone en blanco". Una
  // vez que un panel se mostró, se queda mostrado.
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.3 }
  );
  contents.forEach((el) => observer.observe(el));
})();

// ─── Cada sección se apaga de a poco al bajar a la siguiente ───
// Simple a propósito: nada de scroll-jacking ni pin — sólo la opacidad
// atada a qué tan cerca está el borde inferior de la sección de salir por
// arriba de la pantalla. Mismo recurso en hero→Servicios y Servicios→
// Proyectos, en vez de un corte seco o quedar tapada por la de abajo.
(function initSectionFades() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // El hero mide ~100vh, así que un fundido del 65% de esa altura queda
  // proporcional. Servicios es varios paneles apilados — con esa misma
  // distancia relativa al viewport, el último panel entero (parecido de
  // alto al fundido) quedaba desvaneciéndose de a poco DURANTE toda su
  // lectura, no sólo en el borde final, y se leía como "se pone blanco
  // mientras bajo". Servicios usa una franja fija y chica en vez de un
  // porcentaje del viewport, para que el fundido sea sólo el último tramo
  // justo antes de Proyectos.
  const targets = [
    { el: document.querySelector('.hero--wave'), fadeDistance: () => window.innerHeight * 0.65 },
    { el: document.querySelector('#servicios'), fadeDistance: () => 200 },
  ].filter((t) => t.el);
  if (!targets.length) return;

  let ticking = false;

  function update() {
    ticking = false;
    targets.forEach(({ el, fadeDistance }) => {
      const rect = el.getBoundingClientRect();
      const progress = Math.min(Math.max(rect.bottom / fadeDistance(), 0), 1);
      // Sólo se toca la opacidad mientras el fundido está pasando de verdad.
      // Una opacidad menor a 1 obliga al navegador a componer TODA la sección
      // como una sola capa, y #servicios mide varios miles de píxeles de alto:
      // dejarla puesta siempre mantenía esa capa gigante viva durante todo el
      // scroll. Al terminar se borra la propiedad (no se deja en "1"), así la
      // sección vuelve a pintarse normal, por partes.
      if (progress >= 1) {
        if (el.style.opacity !== '') el.style.opacity = '';
        return;
      }
      el.style.opacity = String(progress);
    });
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', update, { passive: true });
})();

// ─── Entrada del hero ───
function initHeroEntrance() {
  // Los renglones del título entran primero y más pegados entre sí (0.11s)
  // que el resto del hero (0.1s con un arranque más tarde): así el título se
  // arma antes de que aparezca el subtítulo, no todo junto.
  const titleLines = document.querySelectorAll('.hero-name .reveal-child');
  requestAnimationFrame(() => {
    titleLines.forEach((el, i) => {
      el.style.transitionDelay = `${0.05 + i * 0.11}s`;
      el.classList.add('is-visible');
    });
  });

  const items = document.querySelectorAll('.site-header.reveal, .hero-content .reveal');
  requestAnimationFrame(() => {
    items.forEach((el, i) => {
      el.style.transitionDelay = `${0.08 + i * 0.1}s`;
      el.classList.add('is-visible');
    });
  });
}

// ─── Reveals al scrollear ───
const revealIsMobile = window.matchMedia('(max-width: 900px)').matches;

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const el = entry.target;

      el.classList.add('is-visible');
      // Los .reveal internos (encabezados, grillas) también entran, escalonados.
      // Sin esto quedarían en opacity 0 para siempre: nadie más los observa.
      el.querySelectorAll('.reveal').forEach((child, i) => {
        child.style.transitionDelay = `${0.08 + i * 0.12}s`;
        child.classList.add('is-visible');
      });

      revealObserver.unobserve(el);
    });
  },
  {
    threshold: revealIsMobile ? 0.02 : 0.1,
    rootMargin: revealIsMobile ? '0px' : '0px 0px -5% 0px',
  }
);

// El footer queda afuera a propósito (pedido de Tomás, 2/8): el fundido con
// blur+translateY se sentía raro en el pasaje Proyectos→footer. Entra
// directo, sin animación.
//
// #servicios también queda afuera (2/8): ese blur+translateY está pensado
// para elementos chicos que terminan de entrar a la pantalla rápido, pero
// #servicios mide varias pantallas de alto. Si el chequeo de "¿ya entró en
// pantalla?" llega tarde (scroll rápido, hilo principal ocupado con el
// Three.js del hero), el toggle se disparaba con el usuario ya varios
// paneles adentro — toda la sección (fondo celeste incluido) se corría y
// desenfocaba de golpe en medio del scroll, se veía como una franja blanca
// borrosa cruzando la pantalla. Sus hijos (.section-head, cada
// .service-panel) siguen con class="reveal" en el HTML y los revela
// igual la red de seguridad revealWhatIsOnScreen() más abajo, que chequea
// cada elemento por su cuenta — entran de a uno, a su tamaño real, sin el
// salto.
document.querySelectorAll('.section').forEach((el) => {
  if (el.id === 'servicios') return;
  el.classList.add('reveal');
  revealObserver.observe(el);
});

// El stack de Proyectos se revela como un solo bloque, no tarjeta por
// tarjeta: las tarjetas viven superpuestas y su posición la controla
// initProjectStack con transform inline, así que no conviene que el sistema
// de reveal les pelee ese mismo transform durante la animación de entrada.
document.querySelectorAll('.project-stack-section').forEach((el) => {
  el.classList.add('reveal');
  revealObserver.observe(el);
});

// Red de seguridad: si el observer no dispara (pasa en algunos navegadores y
// contextos), el contenido quedaría invisible para siempre. Esto revela por
// scroll lo que ya está en pantalla, así la página nunca se ve vacía.
function revealWhatIsOnScreen() {
  const limit = window.innerHeight * 0.95;
  document
    .querySelectorAll('.reveal:not(.is-visible), .reveal-child:not(.is-visible)')
    .forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.top < limit && box.bottom > 0) el.classList.add('is-visible');
    });

  // Misma red para el texto de los paneles de Servicios, que usa otra clase
  // (.is-in, de initServicePanels) y hasta ahora no tenía ninguna: arranca en
  // opacity 0 y sólo su IntersectionObserver podía mostrarlo, así que si ese
  // observer no llegaba a disparar el panel quedaba vacío para siempre.
  document.querySelectorAll('.service-panel-content:not(.is-in)').forEach((el) => {
    const box = el.getBoundingClientRect();
    if (box.top < limit && box.bottom > 0) el.classList.add('is-in');
  });
}

window.addEventListener('scroll', revealWhatIsOnScreen, { passive: true });
window.addEventListener('resize', revealWhatIsOnScreen, { passive: true });
window.addEventListener('load', revealWhatIsOnScreen);
setTimeout(revealWhatIsOnScreen, 400);

// ─── Navegación interna ───
function resetToHomeOnLoad() {
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  window.scrollTo(0, 0);
}

function initInPageNav() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const href = link.getAttribute('href');
      if (!href || href === '#') {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

resetToHomeOnLoad();
initInPageNav();
initHeroEntrance();

// ─── Stack de proyectos: abanico de tarjetas ───
// Motor genérico: toma las tarjetas ya presentes en el DOM dentro de
// #stack-track, calcula la geometría del abanico según el índice activo y
// mueve cada tarjeta con transform inline. Se instancia una vez por
// categoría más abajo.
function initProjectStack(root, options = {}) {
  const track = root.querySelector('.project-stack-track');
  if (!track) return null;

  const cards = Array.from(track.children).filter((el) => el.tagName === 'ARTICLE');
  if (!cards.length) return null;

  const isMobile = window.matchMedia('(max-width: 900px)').matches;

  const { loop = true } = options;

  let active = 0;
  let dragging = false;
  let dragCard = null;
  let dragStartX = 0;

  const dotsWrap = root.querySelector('.stack-dots');
  const dots = cards.map((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stack-dot';
    b.setAttribute('aria-label', `Ver proyecto ${i + 1} de ${cards.length}`);
    b.addEventListener('click', () => goTo(i));
    dotsWrap?.appendChild(b);
    return b;
  });

  root.querySelector('.stack-arrow-prev')?.addEventListener('click', () => goTo(active - 1));
  root.querySelector('.stack-arrow-next')?.addEventListener('click', () => goTo(active + 1));

  function wrapIndex(n) {
    return ((n % cards.length) + cards.length) % cards.length;
  }

  // Offset con signo más corto a `active`, considerando el wrap (para que
  // ir "para atrás" desde la tarjeta 0 lleve a la última, no arrastre todo
  // el abanico del lado contrario).
  function signedOffset(i) {
    let off = i - active;
    if (!loop || cards.length <= 1) return off;
    const alt = off > 0 ? off - cards.length : off + cards.length;
    return Math.abs(alt) < Math.abs(off) ? alt : off;
  }

  function layout() {
    const w = cards[0].getBoundingClientRect().width || 320;
    const stepPx = isMobile ? w * 0.14 : w * 0.16;
    const spreadDeg = isMobile ? 4 : 7;
    const maxVisible = isMobile ? 2 : 3;

    cards.forEach((card, i) => {
      if (card === dragCard) return; // el pointermove ya la está moviendo
      const off = signedOffset(i);
      const abs = Math.abs(off);
      const hidden = abs > maxVisible;

      card.classList.toggle('is-stack-inactive', off !== 0);
      card.classList.toggle('is-stack-hidden', hidden);

      const x = off * stepPx;
      const rot = off * spreadDeg;
      const scale = off === 0 ? 1 : Math.max(0.86, 1 - abs * 0.05);
      card.style.transform = `translate(-50%, -50%) translateX(${x}px) rotate(${rot}deg) scale(${scale})`;
      card.style.zIndex = String(100 - abs);
    });

    dots.forEach((d, i) => d.classList.toggle('is-active', i === active));
  }

  function goTo(i) {
    active = wrapIndex(i);
    layout();
  }

  // Arrastre solo sobre la tarjeta activa; tocar una de atrás salta a ella.
  // Ojo: si el target es un elemento interactivo (botón "Qué hace", "Ver
  // sitio", o el input/send del chat en vivo) NO se agarra el puntero — si
  // no, setPointerCapture() se lo lleva a la tarjeta entera y el click nunca
  // le llega al botón. El arrastre es solo para la parte "de fondo" de la
  // tarjeta, nunca para sus controles.
  //
  // Además, en la tarjeta activa el arrastre sólo puede EMPEZAR desde los
  // bordes (25% del ancho a cada lado) — no desde el medio. El chat en vivo
  // ocupa justo el centro de la tarjeta, y antes cualquier toque ahí (por
  // ejemplo para hablarle al bot) quedaba capturado como el inicio de un
  // arrastre y podía terminar deslizando al proyecto siguiente. Así, tocar
  // el medio es siempre un toque normal; el swipe sigue andando igual que
  // antes, arrancando desde el borde.
  const DRAG_EDGE_RATIO = 0.25;

  track.addEventListener('pointerdown', (event) => {
    // En touch el cambio de proyecto queda sólo para las flechas (pedido de
    // Tomás, 2/8): ni arrastre ni tocar una tarjeta de atrás para saltar a
    // ella. Con mouse (desktop) el arrastre sigue igual que siempre.
    if (event.pointerType === 'touch') return;
    if (event.target.closest('button, a, input, textarea, select')) return;

    const card = event.target.closest('.project, .web-project');
    if (!card) return;

    const idx = cards.indexOf(card);
    if (idx === -1) return;

    if (idx !== active) {
      goTo(idx);
      return;
    }

    const rect = card.getBoundingClientRect();
    const edge = rect.width * DRAG_EDGE_RATIO;
    const xInCard = event.clientX - rect.left;
    if (xInCard > edge && xInCard < rect.width - edge) return;

    dragging = true;
    dragCard = card;
    dragStartX = event.clientX;
    card.classList.add('is-dragging');
    card.setPointerCapture?.(event.pointerId);
  });

  track.addEventListener('pointermove', (event) => {
    if (!dragging || !dragCard) return;
    const dx = event.clientX - dragStartX;
    dragCard.style.transform = `translate(-50%, -50%) translateX(${dx}px)`;
  });

  function endDrag(event) {
    if (!dragging || !dragCard) return;
    const dx = event.clientX - dragStartX;
    const card = dragCard;
    dragging = false;
    dragCard = null;
    card.classList.remove('is-dragging');

    const threshold = 56;
    if (dx > threshold) goTo(active - 1);
    else if (dx < -threshold) goTo(active + 1);
    else layout();
  }

  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', layout, { passive: true });

  layout();

  return { goTo, layout };
}

// Las demos de software (Escaneo IVA, Villar Capital, etc.) ya reflow-ean
// solas a su ancho por container query (previews.css). Si el resultado a
// ese ancho es más alto que la tarjeta estándar, se achica todo el bloque
// con un transform:scale — nunca se recorta contenido con overflow.
function fitPreviewsToStackCards(root) {
  const cardH = parseFloat(getComputedStyle(root).getPropertyValue('--stack-card-h')) || 380;

  root.querySelectorAll('.project-preview').forEach((preview) => {
    // .project-preview trae DOS hijos (.preview-chrome + la demo) que tienen
    // que escalarse juntos como un solo bloque, no uno a costa del otro —
    // por eso se envuelven en un wrapper propio la primera vez que corre.
    let inner = preview.querySelector(':scope > .stack-fit-inner');
    if (!inner) {
      inner = document.createElement('div');
      inner.className = 'stack-fit-inner';
      while (preview.firstChild) inner.appendChild(preview.firstChild);
      preview.appendChild(inner);
    }

    inner.style.width = '100%';
    inner.style.transform = 'none';
    const naturalH = inner.getBoundingClientRect().height;
    if (naturalH <= cardH || naturalH === 0) return;

    const scale = cardH / naturalH;
    inner.style.transformOrigin = 'top left';
    inner.style.width = `${100 / scale}%`;
    inner.style.transform = `scale(${scale})`;
  });
}

// ─── Video en loop de los proyectos web ───
// Mismo patrón que .hero-video: la fuente (desktop/mobile) se elige acá y no
// con <source media>, por su soporte irregular entre navegadores.
function initWebProjectVideos() {
  const videos = document.querySelectorAll('.web-project-img');
  if (!videos.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Con movimiento reducido el poster queda fijo y ni se llega a pedir el mp4:
  // ese es justo el punto de respetar la preferencia.
  if (reducedMotion) return;

  const hd = window.matchMedia('(min-width: 900px)').matches;

  videos.forEach((video) => {
    video.src = hd ? video.dataset.srcHd : video.dataset.srcMobile;
    video.load();

    // Safari en iOS a veces ignora el autoplay del markup cuando el elemento
    // todavía no está pintado (acá pasa seguro: arranca oculto tras la
    // pestaña Software). play() puede rechazar por política de autoplay; si
    // pasa, el poster queda como imagen fija y la tarjeta se ve bien igual.
    const intentarPlay = () => {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    intentarPlay();
    video.addEventListener('canplay', intentarPlay, { once: true });
  });

  // Al volver a la pestaña, algunos navegadores dejan el video pausado.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    videos.forEach((video) => {
      if (video.paused) {
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    });
  });
}

initWebProjectVideos();

// Arranca el stack de Proyectos al cargar — es el único que hay ahora.
const stackHandles = {};
const softwareStackRoots = [];

function setupStack(stackRoot) {
  const cat = stackRoot.dataset.stack;
  if (stackHandles[cat]) return stackHandles[cat];

  const handle = initProjectStack(stackRoot);
  stackHandles[cat] = handle;

  if (cat === 'software') {
    fitPreviewsToStackCards(stackRoot);
    softwareStackRoots.push(stackRoot);
  }

  return handle;
}

const initialSoftwareStack = document.querySelector('.project-stack[data-stack="software"]');
if (initialSoftwareStack) setupStack(initialSoftwareStack);

// El ancho de tarjeta cambia en el breakpoint mobile (card-stack.css), y con
// eso la altura natural de cada demo (container query) — hay que re-medir y
// recalcular la geometría del abanico de los stacks ya inicializados.
let fitResizeTimer = null;
window.addEventListener(
  'resize',
  () => {
    if (fitResizeTimer) window.clearTimeout(fitResizeTimer);
    fitResizeTimer = window.setTimeout(() => {
      softwareStackRoots.forEach(fitPreviewsToStackCards);
      Object.values(stackHandles).forEach((handle) => handle?.layout());
    }, 150);
  },
  { passive: true },
);

// ─── Copiar contacto ───
async function copyContactText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  }
}

// ─── Conversión de "Contacto" (Google Ads + Meta Pixel) ───
// Se dispara cuando alguien realmente nos contacta (copia el email/teléfono
// o abre WhatsApp), no en cada carga de página.
// Si el visitante rechazó las cookies no se manda ningún evento. `consent revoke`
// ya frena a Meta puertas adentro, pero cortar acá es explícito y no depende de
// que el SDK haya llegado a cargar.
function trackingPermitido() {
  return window.WABE_TRACKING_OK !== false;
}

function trackContactConversion() {
  if (!trackingPermitido()) return;
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'conversion', {
    send_to: 'AW-18330886700/9ZqqCM-5p9IcEKzE7KRE',
    value: 1.0,
    currency: 'ARS',
  });
}

function trackMetaContact() {
  if (!trackingPermitido()) return;
  if (typeof window.fbq !== 'function') return;
  // Dataset propio de Wabe → evento estándar 'Contact'. Los 3 botones de contacto
  // (email, WhatsApp, Instagram) disparan el mismo evento: cuentan como una conversión.
  window.fbq('track', 'Contact', { content_name: 'contacto' });
}

// Dispara ambas (Google + Meta) en cada contacto real.
function trackContact() {
  trackContactConversion();
  trackMetaContact();
}

function initContactCopy() {
  document.querySelectorAll('.site-contact-link[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.dataset.copy;
      const label = button.querySelector('.site-contact-text');
      if (!value || !label) return;

      const original = label.textContent;
      const copied = await copyContactText(value);
      if (!copied) return;

      trackContact();

      label.textContent = 'Copiado';
      button.classList.add('is-copied');

      window.setTimeout(() => {
        label.textContent = original;
        button.classList.remove('is-copied');
      }, 1600);
    });
  });
}

function initWhatsAppConversion() {
  // .cta-btn: los botones de conversión del hero, del pie de Servicios y de
  // #contacto (12/8/2026). Disparan la misma conversión que los links de la
  // barra — son el mismo destino (wa.me), sólo cambia dónde viven.
  document
    .querySelectorAll('.site-contact-link[href^="https://wa.me"], .cta-btn[href^="https://wa.me"]')
    .forEach((link) => {
      link.addEventListener('click', trackContact);
    });
}

// Instagram: tercer botón de contacto. Solo cuenta como contacto en Meta
// (no dispara Google Ads, que queda para contactos directos como email/WhatsApp).
function initInstagramConversion() {
  document.querySelectorAll('.site-contact-link[href*="instagram.com"]').forEach((link) => {
    link.addEventListener('click', trackMetaContact);
  });
}

// ─── Escalera de eventos de Meta: dos escalones de profundidad ───
//
// No se dispara uno solo. Un evento que no mandaste hoy no se recupera después:
// para ELEGIR por cuál optimizar alcanza con uno, pero para RECOLECTAR conviene
// tener los dos y decidir en dos semanas con el conteo real en la mano.
//
// Profundidad medida en celular (390x844), que es casi toda la pauta:
//   QuePodemosHacer   pie de las 4 tarjetas   3,7 pantallas   ~28% de la página
//   VerProyectos      2do proyecto            5,4 pantallas   ~41%
//
// Todos son eventos personalizados: se eligen directo como conversión en el
// conjunto de anuncios, sin armar una conversión personalizada por parámetro.
// `origen` (boton | scroll) queda solo para poder leer el desglose después.
function unaVezPorVisita(nombreEvento) {
  let disparado = false;
  return function (origen) {
    if (disparado) return;
    disparado = true;
    if (!trackingPermitido()) return;
    if (typeof window.fbq !== 'function') return;
    window.fbq('trackCustom', nombreEvento, { origen: origen || 'boton' });
  };
}

const trackQuePodemosHacer = unaVezPorVisita('QuePodemosHacer');
const trackVerProyectos = unaVezPorVisita('VerProyectos');

// Cada botón declara qué evento dispara con data-track, así no hay que atarlo
// a clases de estilo (.hero-cta la usan varios botones distintos).
const CLICKS_TRACKEADOS = {
  'que-podemos-hacer': trackQuePodemosHacer,
  'ver-proyectos': trackVerProyectos,
};

function initClickConversions() {
  Object.entries(CLICKS_TRACKEADOS).forEach(([marca, track]) => {
    document.querySelectorAll('[data-track="' + marca + '"]').forEach((cta) => {
      cta.addEventListener('click', () => track('boton'));
    });
  });
}

// Dispara `onDwell` cuando `target` estuvo visible de corrido `ms` milisegundos.
// Salir de pantalla antes de tiempo cancela y reinicia la cuenta; una vez que
// dispara, deja de observar.
//
// El tiempo de permanencia es lo que hace comparables desktop y celular: en
// desktop las 4 tarjetas entran en una fila (una pantalla) y en celular van
// apiladas (cuatro), así que llegar abajo es mucho más barato en desktop.
// Exigir que se FRENE ahí — y no que pase de largo — empareja las dos.
function fireOnDwell(target, ms, onDwell) {
  if (!target || typeof IntersectionObserver !== 'function') return;

  let timer = null;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (timer) return;
          timer = window.setTimeout(() => {
            onDwell();
            observer.disconnect();
          }, ms);
        } else if (timer) {
          window.clearTimeout(timer);
          timer = null;
        }
      });
    },
    { threshold: 0.5 },
  );

  observer.observe(target);
}

// Los tres caminos por scroll. En celular —casi toda la pauta— la gente baja con
// el dedo en vez de tocar un botón de ancla, así que ESTE es el camino principal,
// no el de respaldo: sin él los eventos dependerían de una tasa de click bajísima.
const DWELL_MS = 2500;

// Se apunta siempre a un elemento CHICO (un título, la fila de botones) y
// nunca a una tarjeta de proyecto: con el stack en abanico las tarjetas ya
// no se apilan una debajo de otra (miden todas lo mismo, superpuestas en un
// solo lugar), así que "cuál tarjeta se ve" ya no es una posición de scroll.
function initScrollConversions() {
  // 1 · Leyó las 4 tarjetas de servicios. Anclado al PIE de la sección, no a su
  //     comienzo: entrar a la sección lo hace cualquiera que scrollee un poco y
  //     sería un PageView disfrazado.
  // 18/8/2026: apuntaba a `.services-foot`, que NO EXISTE en el HTML — ni antes
  // del reposicionamiento. O sea que este evento no disparó nunca y estuvimos
  // midiendo de menos sin enterarnos. Se ancla al último panel, que es el pie
  // real de la sección y sigue cumpliendo el criterio original: no cuenta a
  // quien apenas entró, sino a quien llegó al final de las cuatro tarjetas.
  const paneles = document.querySelectorAll('#servicios .service-panel-pin');
  fireOnDwell(paneles[paneles.length - 1], DWELL_MS, () => trackQuePodemosHacer('scroll'));

  // 2 · Llegó a Proyectos. Anclado al label de la sección, lo primero estable
  //     que aparece (antes eran las pestañas Software/Webs, ya no existen).
  fireOnDwell(document.querySelector('#work .section-label'), DWELL_MS, () => trackVerProyectos('scroll'));
}

initContactCopy();
initWhatsAppConversion();
initInstagramConversion();
initClickConversions();
initScrollConversions();

// ─── Legales: modales de privacidad y términos ───
// Se usa <dialog> nativo: showModal() ya atrapa el foco adentro y cierra con
// Escape, así que acá solo hace falta abrir, cerrar y frenar el scroll de fondo.
// Los legales (privacidad/términos) siguen siendo <dialog> nativo — andan
// bien, sin motivo para tocarlos. Los "Qué hace" de cada proyecto del stack
// son <div hidden> + un backdrop compartido: Safari no estaba prometiendo
// esos <dialog> al "top layer" de forma confiable (quedaban
// position:absolute relativos al documento en vez de fixed al viewport, así
// que con la página scrolleada se veían pegados arriba de todo y angostos).
// Un <div>+position:fixed manual no depende de esa promoción del navegador.
function initLegalModals() {
  const backdrop = document.querySelector('.popover-backdrop');
  let popoverAbierto = null;

  const esDialog = (modal) => modal.tagName === 'DIALOG';

  const restaurarScroll = (scrollY) => {
    // overflow:hidden en body puede hacer que Safari salte el scroll a 0
    // (bug conocido del motor) — se restaura después de que el navegador
    // termine de reacomodar el layout.
    window.scrollTo(0, scrollY);
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  };

  const abrir = (nombre) => {
    const modal = document.getElementById(`legal-${nombre}`);
    if (!modal) return;

    const scrollY = window.scrollY;

    if (esDialog(modal)) {
      if (modal.open) return;
      modal.showModal();
    } else {
      if (!modal.hidden) return;
      modal.hidden = false;
      if (backdrop) backdrop.hidden = false;
      popoverAbierto = modal;
      modal.querySelector('.legal-close')?.focus();
    }

    modal.querySelector('.legal-body').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    restaurarScroll(scrollY);
  };

  // El overflow se restaura acá y no en el evento 'close' del <dialog>: hay
  // motores que no lo disparan, y si no se restaura el sitio queda sin scroll.
  const cerrar = (modal) => {
    if (esDialog(modal)) {
      if (!modal.open) return;
      modal.close();
    } else {
      if (modal.hidden) return;
      modal.hidden = true;
      if (backdrop) backdrop.hidden = true;
      popoverAbierto = null;
    }
    document.body.style.overflow = '';
  };

  document.querySelectorAll('[data-legal]').forEach((boton) => {
    boton.addEventListener('click', () => abrir(boton.dataset.legal));
  });

  document.querySelectorAll('.legal-modal').forEach((modal) => {
    modal.querySelectorAll('[data-legal-close]').forEach((boton) => {
      boton.addEventListener('click', () => cerrar(modal));
    });

    // Clic afuera de la tarjeta: en el <dialog> el target es el propio
    // elemento (el contenido no llega hasta el borde, clickear el margen
    // cuenta como click en el dialog). Los popover <div> no tienen ese
    // truco — para ellos cierra el backdrop compartido, más abajo.
    if (esDialog(modal)) {
      modal.addEventListener('click', (evento) => {
        if (evento.target === modal) cerrar(modal);
      });
    }
  });

  backdrop?.addEventListener('click', () => {
    if (popoverAbierto) cerrar(popoverAbierto);
  });

  // Escape a mano por el mismo motivo: el cierre nativo no es confiable en
  // todos los motores. Si el navegador ya lo cerró, cerrar() no hace nada.
  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    document.querySelectorAll('.legal-modal').forEach(cerrar);
    document.body.style.overflow = '';
  });
}

// ─── Cookies: aviso y opt-out ───
// Consentimiento implícito: el tracking arranca por defecto y el aviso solo
// informa, sin botonera que obligue a decidir. Rechazar sigue siendo posible,
// pero desde la política de privacidad: quien lo busca lo encuentra, y el que
// solo quiere ver el sitio no se topa con una decisión en la cara.
function guardarConsentimiento(valor) {
  try { localStorage.setItem('wabe-cookies', valor); } catch (e) { /* modo privado */ }
  window.WABE_CONSENT = valor;

  if (valor !== 'rechazado') return;

  window.WABE_TRACKING_OK = false;
  if (typeof window.fbq === 'function') window.fbq('consent', 'revoke');
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      ad_storage: 'denied', ad_user_data: 'denied',
      ad_personalization: 'denied', analytics_storage: 'denied',
    });
  }
}

function initCookieBar() {
  const barra = document.getElementById('cookie-bar');
  if (!barra) return;

  // El aviso queda sobre la fila de contacto del hero, así que no puede
  // quedarse ahí: se va solo a los 5 segundos de haber aparecido.
  const SEGUNDOS_EN_PANTALLA = 5000;
  let temporizador = null;

  const cerrar = () => {
    window.clearTimeout(temporizador);
    barra.classList.remove('is-visible');
    window.setTimeout(() => { barra.hidden = true; }, 550);
  };

  // Ya lo vio en otra visita: no se le muestra de nuevo.
  if (window.WABE_CONSENT === 'aceptado' || window.WABE_CONSENT === 'rechazado') return;

  barra.hidden = false;

  // Se espera un cuadro para que el navegador registre el estado inicial y se
  // vea la transición de entrada. El setTimeout es red de seguridad: en una
  // pestaña de fondo rAF queda congelado y el aviso nunca aparecería.
  let mostrado = false;
  const mostrar = () => {
    if (mostrado) return;
    mostrado = true;
    barra.classList.add('is-visible');
    // La cuenta arranca recién acá, no al cargar la página: si no, en una
    // conexión lenta los 5 segundos se consumirían antes de verse.
    temporizador = window.setTimeout(() => {
      guardarConsentimiento('aceptado');
      cerrar();
    }, SEGUNDOS_EN_PANTALLA);
  };
  requestAnimationFrame(() => requestAnimationFrame(mostrar));
  window.setTimeout(mostrar, 120);

  barra.querySelectorAll('[data-cookie]').forEach((boton) => {
    boton.addEventListener('click', () => {
      guardarConsentimiento(boton.dataset.cookie);
      cerrar();
    });
  });

  // Si se puso a leer el sitio, ya se dio por notificado: el aviso se va solo.
  // El piso de 300px evita que un innerHeight de 0 (pasa en pestañas ocultas)
  // deje el umbral en cero y lo cierre con el primer píxel de scroll.
  const alDesplazar = () => {
    const umbral = Math.max((window.innerHeight || 0) * 0.6, 300);
    if (window.scrollY < umbral) return;
    guardarConsentimiento('aceptado');
    cerrar();
    window.removeEventListener('scroll', alDesplazar);
  };
  window.addEventListener('scroll', alDesplazar, { passive: true });
}

function initCookieOptOut() {
  document.querySelectorAll('[data-cookie-optout]').forEach((boton) => {
    boton.addEventListener('click', () => {
      guardarConsentimiento('rechazado');
      boton.disabled = true;
      const aviso = document.querySelector('[data-optout-ok]');
      if (aviso) aviso.hidden = false;
    });
  });
}

function initFooterYear() {
  const slot = document.querySelector('[data-year]');
  if (slot) slot.textContent = String(new Date().getFullYear());
}

initLegalModals();
initCookieBar();
initCookieOptOut();
initFooterYear();

// ─── Chatbot: demo REAL contra la API ───
//
// No es una animación en loop: el visitante escribe y contesta el modelo.
// Es la única forma honesta de demostrar un chatbot sin exponer el de un
// cliente — un bot de WhatsApp no tiene URL pública que mostrar.
//
// Todo el objetivo de la conversación es que la persona termine en WhatsApp.
// Los límites viven también en el servidor (functions/api/chat.js): lo de acá
// es comodidad, no seguridad — cualquiera puede editarlo desde la consola.
(function initChatLive() {
  const cuerpo = document.getElementById('chat-live');
  const formulario = document.getElementById('chat-form');
  const campo = document.getElementById('chat-input');
  const botonWa = document.getElementById('chat-wa');
  const invitacion = document.getElementById('chat-invite');
  if (!cuerpo || !formulario || !campo) return;

  // En celular, al enfocar el input el navegador hace scroll-into-view solo
  // para dejar lugar al teclado — pero esta tarjeta vive dentro del abanico
  // de Proyectos (position:absolute + transform), así que ese salto de
  // página se ve roto en vez de un scroll normal (pedido de Tomás, 2/8). Se
  // ancla el scroll donde estaba, reaplicándolo en varias ventanas de
  // tiempo porque la animación del teclado no dispara un único evento
  // predecible entre navegadores.
  if (window.matchMedia('(max-width: 900px)').matches) {
    campo.addEventListener('focus', () => {
      const y = window.scrollY;
      const reanclar = () => window.scrollTo(0, y);
      requestAnimationFrame(reanclar);
      [50, 150, 300, 500].forEach((ms) => window.setTimeout(reanclar, ms));
    });
  }

  const MAX_MENSAJES = 8; // igual al tope del servidor
  const SALUDO =
    '¡Hola! 👋 Soy el asistente de Wabe. Contame qué tarea te está comiendo el tiempo y te digo si se puede automatizar.';

  const historial = [];
  let enviando = false;
  let arrancado = false;

  function burbuja(quien, texto) {
    const msg = document.createElement('div');
    msg.className = `p-chat-msg ${quien}`;
    msg.textContent = texto;
    cuerpo.appendChild(msg);
    // setTimeout y no rAF: en una pestaña de fondo rAF queda congelado.
    window.setTimeout(() => msg.classList.add('is-in'), 20);
    cuerpo.scrollTop = cuerpo.scrollHeight;
    return msg;
  }

  function escribiendo() {
    const typing = document.createElement('div');
    typing.className = 'p-chat-msg bot p-chat-typing is-in';
    typing.innerHTML = '<i></i><i></i><i></i>';
    cuerpo.appendChild(typing);
    cuerpo.scrollTop = cuerpo.scrollHeight;
    return typing;
  }

  // ─── El contexto viaja a WhatsApp ───
  // wa.me acepta un texto prellenado. No sirve para escribirle nosotros a la
  // persona (para eso haría falta su número), pero sí para lo contrario: le
  // abre WhatsApp con el resumen ya redactado y solo tiene que enviarlo.
  //
  // El resumen se arma con SUS respuestas, no con las preguntas del bot: es lo
  // único que aporta información nueva, y en sus palabras textuales vale más
  // que cualquier parafraseo. Así el cliente no tiene que repetir todo.
  const WA_BASE = 'https://wa.me/5491123703680';
  const WA_MAX = 900; // margen cómodo: un texto larguísimo puede truncarse

  function actualizarEnlaceWhatsApp() {
    if (!botonWa) return;

    const dichos = historial
      .filter((m) => m.role === 'user')
      .map((m) => m.content.trim().replace(/\s+/g, ' '))
      .filter(Boolean);

    if (!dichos.length) {
      botonWa.href = WA_BASE;
      return;
    }

    let texto = 'Hola! Vengo de wabe.dev, estuve probando el asistente.\n\nEsto es lo que le conté:';
    for (const dicho of dichos) {
      const linea = `\n• ${dicho.length > 160 ? dicho.slice(0, 157) + '…' : dicho}`;
      if (texto.length + linea.length > WA_MAX) {
        texto += '\n• (…)';
        break;
      }
      texto += linea;
    }

    botonWa.href = `${WA_BASE}?text=${encodeURIComponent(texto)}`;
  }

  function mostrarWhatsApp() {
    if (!botonWa || !botonWa.hidden) return;
    botonWa.hidden = false;
    window.setTimeout(() => botonWa.classList.add('is-in'), 20);
  }

  function cerrarChat(motivo) {
    campo.disabled = true;
    formulario.classList.add('is-cerrado');
    campo.placeholder = motivo;
    mostrarWhatsApp();
  }

  async function responder(texto) {
    historial.push({ role: 'user', content: texto });
    burbuja('user', texto);
    // Se actualiza en cada mensaje, no al hacer clic: si el pedido a la API
    // falla, el enlace ya quedó armado con lo que dijo hasta ese momento.
    actualizarEnlaceWhatsApp();

    const typing = escribiendo();
    enviando = true;

    let datos = null;
    let estado = 0;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensajes: historial }),
      });
      estado = r.status;
      datos = await r.json().catch(() => null);
    } catch (e) {
      datos = null;
    }

    typing.remove();
    enviando = false;

    if (estado === 429) {
      const diario = datos && datos.limite === 'diario';
      burbuja(
        'bot',
        diario
          ? 'Llegamos al límite de la demo por hoy 🙌 Seguimos por WhatsApp, que ahí te atendemos nosotros.'
          : 'Hasta acá llega la demo 🙌 Contame el resto por WhatsApp y lo vemos a fondo.'
      );
      cerrarChat('Seguimos por WhatsApp');
      return;
    }

    if (!datos || !datos.respuesta) {
      burbuja('bot', 'Se me cortó la conexión. Escribinos por WhatsApp y te respondemos al toque.');
      mostrarWhatsApp();
      return;
    }

    historial.push({ role: 'assistant', content: datos.respuesta });
    burbuja('bot', datos.respuesta);

    // A partir del segundo ida y vuelta ya hay contexto suficiente para que
    // el salto a WhatsApp tenga sentido; antes suena apurado.
    const míos = historial.filter((m) => m.role === 'user').length;
    if (míos >= 2) mostrarWhatsApp();
    if (míos >= MAX_MENSAJES) cerrarChat('Seguimos por WhatsApp');
  }

  // Ya escribió: la invitación cumplió su función y solo ocuparía lugar.
  // Se saca del DOM después de la transición para que no quede un elemento
  // vacío empujando el layout.
  function ocultarInvitacion() {
    if (!invitacion || invitacion.classList.contains('is-out')) return;
    invitacion.classList.add('is-out');
    window.setTimeout(() => invitacion.remove(), 600);
  }

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const texto = campo.value.trim();
    if (!texto || enviando || campo.disabled) return;
    campo.value = '';
    ocultarInvitacion();
    responder(texto);
  });

  // Un clic acá es un contacto real: cuenta como conversión en Google y Meta.
  if (botonWa) botonWa.addEventListener('click', trackContact);

  // El saludo espera a que el chat entre en pantalla, así el visitante lo ve
  // aparecer en vez de encontrarlo ya escrito.
  function arrancar() {
    if (arrancado) return;
    arrancado = true;
    burbuja('bot', SALUDO);
  }

  if (typeof IntersectionObserver === 'function') {
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        observador.disconnect();
        arrancar();
      },
      { threshold: 0.25 }
    );
    observador.observe(cuerpo);
    // Red de seguridad: si el observer no dispara (pestaña oculta, viewport
    // degenerado), el saludo aparece igual y el chat no queda vacío.
    window.setTimeout(arrancar, 2500);
  } else {
    arrancar();
  }
})();

// ─── Escaneo IVA: demo de escaneo de factura ───
(function initIvaDemo() {
  const status = document.getElementById('iva-scan-status');
  if (!status) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const doc = document.getElementById('iva-doc');
  const fields = Array.from(document.querySelectorAll('#iva-fields li'));
  const newRow = document.getElementById('iva-newrow');
  const credito = document.getElementById('iva-credito');
  const pagar = document.getElementById('iva-pagar');
  const count = document.getElementById('iva-count');

  const fmt = (n) => '$ ' + n.toLocaleString('es-AR');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Contador animado (suaviza el cambio de importes)
  function tween(el, from, to, ms) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      function frame(t) {
        const k = Math.min(1, (t - t0) / ms);
        const eased = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(Math.round(from + (to - from) * eased));
        if (k < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  async function playLoop() {
    for (;;) {
      // Estado inicial: sin la factura nueva
      fields.forEach((f) => f.classList.add('pv-hide'));
      newRow.classList.add('pv-hide');
      credito.textContent = fmt(1756140);
      pagar.textContent = fmt(656440);
      count.textContent = '2 este mes';
      status.textContent = 'QR AFIP · esperando';
      status.className = 'p-iva-scan-badge';
      await wait(1300);

      // Escaneo del documento
      status.textContent = 'Escaneando…';
      status.className = 'p-iva-scan-badge busy';
      doc.classList.add('is-scanning');
      await wait(1750);
      doc.classList.remove('is-scanning');

      // La IA extrae los datos, campo por campo
      for (const f of fields) {
        f.classList.remove('pv-hide');
        await wait(500);
      }
      status.textContent = 'Cargada ✓';
      status.className = 'p-iva-scan-badge ok';
      await wait(450);

      // El comprobante entra al listado y la posición se actualiza sola
      newRow.classList.remove('pv-hide');
      count.textContent = '3 este mes';
      await Promise.all([
        tween(credito, 1756140, 1800240, 950),
        tween(pagar, 656440, 612340, 950),
      ]);

      await wait(4600);
    }
  }

  const obs = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      obs.disconnect();
      playLoop();
    },
    { threshold: 0.3 }
  );

  obs.observe(doc);
})();

// ─── Estudio Aduanero: demo de documento + análisis IA ───
(function initDespDemo() {
  const file = document.getElementById('desp-file');
  if (!file) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const progress = document.getElementById('desp-progress');
  const ok = document.getElementById('desp-ok');
  const ai = document.getElementById('desp-ai');
  const aiText = document.getElementById('desp-ai-text');
  const fields = Array.from(document.querySelectorAll('#desp-fields > div'));
  const lines = Array.from(document.querySelectorAll('#desp-lines .p-desp-line'));
  const steps = Array.from(document.querySelectorAll('#desp-steps .p-desp-step'));

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const AI_PHASES = [
    'Leyendo el documento (OCR)…',
    'Detectando mercadería…',
    'Buscando posición NCM…',
  ];

  async function playLoop() {
    for (;;) {
      // Estado inicial: operación abierta, sin documento todavía
      file.classList.add('pv-hide');
      progress.style.width = '0%';
      ok.classList.add('pv-hide');
      ai.classList.add('pv-hide');
      ai.classList.remove('done');
      fields.forEach((f) => f.classList.add('pv-hide'));
      lines.forEach((l) => l.classList.add('pv-hide'));
      if (steps[1]) steps[1].className = 'p-desp-step on';
      if (steps[2]) steps[2].className = 'p-desp-step';
      await wait(1100);

      // Sube el documento
      file.classList.remove('pv-hide');
      await wait(400);
      progress.style.width = '100%';
      await wait(1350);
      ok.classList.remove('pv-hide');

      // La IA lo analiza
      ai.classList.remove('pv-hide');
      for (const phase of AI_PHASES) {
        aiText.textContent = phase;
        await wait(950);
      }
      ai.classList.add('done');
      aiText.textContent = 'Clasificación lista · confianza 96%';

      // Completa la clasificación, campo por campo
      for (const f of fields) {
        f.classList.remove('pv-hide');
        await wait(430);
      }

      // La operación avanza de etapa
      if (steps[1]) steps[1].className = 'p-desp-step done';
      if (steps[2]) steps[2].className = 'p-desp-step on';
      await wait(550);

      // Y la cotización se arma sola, línea por línea
      for (const l of lines) {
        l.classList.remove('pv-hide');
        await wait(360);
      }

      await wait(4800);
    }
  }

  const obs = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      obs.disconnect();
      playLoop();
    },
    { threshold: 0.3 }
  );

  obs.observe(file);
})();

// ─── Villar Capital: la demo recorre el flujo entero de la herramienta ───
//
// Cargar activos → repartir pesos → ejecutar → resultados. Mostrando solo el
// gráfico final había que adivinar para qué servía; contada así, se entiende.
//
// Toda la coreografía va con setTimeout y no con requestAnimationFrame: en una
// pestaña de fondo rAF queda congelado y la demo se quedaría a mitad de camino.
(function initVillarCapital() {
  const panel = document.getElementById('vc-demo');
  if (!panel) return;

  const tipeo = document.getElementById('vc-tipeo');
  const activos = [...panel.querySelectorAll('[data-vc-asset]')];
  const pesos = [...panel.querySelectorAll('[data-vc-peso]')];
  const metricas = [...panel.querySelectorAll('[data-vc-num]')];
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // El largo del trazo se mide en unidades del viewBox, pero el SVG se estira
  // a lo ancho y con non-scaling-stroke el guion va en píxeles de pantalla.
  // Sin corregir por ese factor, la curva se dibuja truncada.
  function medirTrazos() {
    panel.querySelectorAll('.p-vc-eq, .p-vc-dd').forEach((trazo) => {
      const svg = trazo.closest('svg');
      const anchoCaja = svg.viewBox.baseVal.width || 420;
      const escalaX = (svg.clientWidth || anchoCaja) / anchoCaja;
      trazo.style.setProperty('--largo', Math.ceil(trazo.getTotalLength() * escalaX * 1.15));
    });
  }

  medirTrazos();
  window.addEventListener('resize', medirTrazos, { passive: true });

  const esperar = (ms) => new Promise((r) => window.setTimeout(r, ms));

  // Sube un número hasta su destino. Sin rAF, a propósito.
  //
  // Dos cuidados que hacen falta sí o sí:
  // 1. Cancelar la animación anterior del mismo elemento. El efectivo recibe
  //    una por cada activo que se agrega; sin cancelar, los relojes se pisan
  //    entre sí y el número salta para todos lados.
  // 2. Garantizar el valor final con un setTimeout. Si el navegador ralentiza
  //    los timers (pestaña de fondo), el número se quedaría a mitad de camino.
  function animarNumero(el, hasta, decimales, suf, duracion) {
    if (el._reloj) window.clearInterval(el._reloj);
    if (el._final) window.clearTimeout(el._final);

    const escribirFinal = () => {
      window.clearInterval(el._reloj);
      el._reloj = null;
      el.textContent = hasta.toFixed(decimales) + suf;
    };

    const desde = parseFloat(el.textContent) || 0;
    const pasos = Math.max(1, Math.round(duracion / 45));
    let i = 0;

    el._reloj = window.setInterval(() => {
      i += 1;
      const t = Math.min(i / pasos, 1);
      // Desacelera al final: se lee como un cálculo que se acomoda,
      // no como un contador de dígitos.
      const suave = 1 - Math.pow(1 - t, 3);
      el.textContent = (desde + (hasta - desde) * suave).toFixed(decimales) + suf;
      if (t >= 1) escribirFinal();
    }, 45);

    el._final = window.setTimeout(escribirFinal, duracion + 500);
  }

  function estadoFinal() {
    if (tipeo) tipeo.textContent = 'AAPL';
    activos.forEach((a) => a.classList.add('is-in'));
    pesos.forEach((p) => { p.textContent = p.dataset.hasta; });
    metricas.forEach((m) => {
      const v = parseFloat(m.dataset.hasta);
      m.textContent = v.toFixed(2) + (m.dataset.suf || '');
    });
    panel.classList.add('paso-listo', 'paso-resultados');
  }

  // Vuelve todo al estado inicial para el siguiente pase del loop: sin esto
  // el preview queda congelado en el resultado final, distinto del resto de
  // los proyectos, que corren en bucle.
  function reiniciar() {
    panel.classList.remove('paso-listo', 'paso-corriendo', 'paso-resultados');
    tipeo.textContent = '';
    activos.forEach((a) => a.classList.remove('is-in'));
    pesos.forEach((p) => {
      if (p.closest('.p-vc-cash')) p.textContent = '100';
      else p.textContent = '0';
    });
    metricas.forEach((m) => { m.textContent = '—'; });
  }

  async function reproducir() {
    for (;;) {
      // 1 · Se escribe un símbolo en el buscador
      for (const simbolo of ['YPF', 'GGAL', 'AAPL']) {
        const indice = ['YPF', 'GGAL', 'AAPL'].indexOf(simbolo);
        tipeo.textContent = '';
        for (const letra of simbolo) {
          tipeo.textContent += letra;
          await esperar(110);
        }
        await esperar(260);

        // 2 · El activo entra a la cartera y su peso sube desde cero
        const fila = activos[indice];
        fila.classList.add('is-in');
        const peso = fila.querySelector('[data-vc-peso]');
        animarNumero(peso, parseFloat(peso.dataset.hasta), 0, '', 450);

        // 3 · El efectivo baja: lo que se asigna sale de ahí
        const cash = activos[3].querySelector('[data-vc-peso]');
        const restante = 100 - [35, 25, 20].slice(0, indice + 1).reduce((a, b) => a + b, 0);
        animarNumero(cash, restante, 0, '', 450);
        await esperar(520);
      }

      // 4 · Cartera completa: el botón se enciende
      await esperar(420);
      panel.classList.add('paso-listo');
      await esperar(700);

      // 5 · Corriendo el backtest
      panel.classList.remove('paso-listo');
      panel.classList.add('paso-corriendo');
      await esperar(1150);

      // 6 · Resultados: curvas y métricas
      panel.classList.remove('paso-corriendo');
      panel.classList.add('paso-listo', 'paso-resultados');
      metricas.forEach((m) => {
        animarNumero(m, parseFloat(m.dataset.hasta), 2, m.dataset.suf || '', 1500);
      });

      // 7 · Pausa mostrando el resultado, después vuelve al paso 1
      await esperar(3600);
      reiniciar();
      await esperar(500);
    }
  }

  let arrancado = false;
  function arrancar() {
    if (arrancado) return;
    arrancado = true;
    if (reducido) { estadoFinal(); return; }
    reproducir();
  }

  if (typeof IntersectionObserver === 'function') {
    const obs = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        obs.disconnect();
        arrancar();
      },
      { threshold: 0.25 }
    );
    obs.observe(panel);
    // Red de seguridad: si el observer no dispara, la demo no puede quedarse
    // congelada a medias mostrando una cartera vacía.
    window.setTimeout(arrancar, 5000);
  } else {
    arrancar();
  }
})();

// ─── Video de fondo del hero ───
(function initHeroVideo() {
  const video = document.querySelector('.hero-video');
  const hero = document.querySelector('.hero--video');
  if (!video || !hero) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Con movimiento reducido el CSS ya oculta el video y deja el poster fijo:
  // ni siquiera se baja el mp4, que es el punto de respetar la preferencia.
  if (reducedMotion) return;

  // La fuente se elige acá y no con <source media> porque ese atributo tiene
  // soporte irregular entre navegadores. Lo que importa es no bajar 1.3 MB en
  // un celular: el corte en 900px coincide con el resto de los breakpoints.
  const hd = window.matchMedia('(min-width: 900px)').matches;
  video.src = hd ? '/landing/media/wave-loop.mp4' : '/landing/media/wave-loop-mobile.mp4';
  video.load();

  // Safari en iOS a veces ignora el autoplay del markup cuando el elemento
  // todavía no está pintado. play() devuelve una promesa que puede rechazar
  // (política de autoplay); si pasa, el poster queda como fondo estático y la
  // página se ve bien igual, así que el error se ignora a propósito.
  const intentarPlay = () => {
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };
  intentarPlay();
  video.addEventListener('canplay', intentarPlay, { once: true });

  // Al volver a la pestaña, algunos navegadores dejan el video pausado.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && video.paused) intentarPlay();
  });

  const header = document.querySelector('.site-header');

  // El hero se mete debajo del header (ver .hero--video en styles.css) y para
  // eso el CSS necesita saber cuánto mide. Se publica como variable en vez de
  // hardcodearla: el header cambia de alto entre breakpoints y con el tamaño
  // del logo, y un número fijo se desincroniza en silencio.
  if (header) {
    const medirHeader = () => {
      const alto = header.getBoundingClientRect().height;
      if (alto > 0) document.documentElement.style.setProperty('--header-h', alto + 'px');
    };
    medirHeader();
    window.addEventListener('resize', medirHeader);
    // Las fuentes web cambian el alto del logo al terminar de cargar.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(medirHeader);
  }

  // El logo del header se pinta blanco sólo mientras el header se superpone
  // al hero oscuro. Se usa IntersectionObserver en vez de escuchar 'scroll'
  // para no correr código en cada píxel de desplazamiento.
  if (header && 'IntersectionObserver' in window) {
    const obs = new IntersectionObserver(
      ([entry]) => header.classList.toggle('is-over-hero', entry.isIntersecting),
      // El margen negativo recorta la zona observada a la franja superior:
      // el header deja de ser blanco justo cuando el hero sale de atrás suyo.
      { rootMargin: '-72px 0px -100% 0px', threshold: 0 }
    );
    obs.observe(hero);
  }
})();
