// ─── Wave ribbon 3D (prueba) ───
// Mismo recurso visual que el "torus" de plumas/blades de la referencia
// (Dribbble), pero las piezas van ubicadas a lo largo de una curva de ola
// (seno) en vez de un círculo cerrado. Cada blade además gira sobre su
// propio eje a medida que avanza por la ola — ese giro individual es lo
// que arma el efecto de "cinta retorcida" que se ve en la referencia.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('wave-canvas');
const loadingEl = document.getElementById('loading');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
// Fondo transparente: la ola se apoya sobre el fondo de la página en vez de
// pintar el suyo. Antes forzaba blanco, y eso dejaba un bloque blanco en el
// tema oscuro y una costura visible contra el resto de la portada.
scene.background = null;

const camera = new THREE.PerspectiveCamera(
  36,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, -0.3, 9.6);

// ── Entorno para los reflejos "vidrio/metal" del material físico ──
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ── Luces ──
scene.add(new THREE.AmbientLight(0xffffff, 0.2));
const key = new THREE.DirectionalLight(0xbfe0ff, 0.7);
key.position.set(4, 6, 6);
scene.add(key);
const rim = new THREE.PointLight(0x4d95d4, 3.2, 24);
rim.position.set(-5, -1.5, 3);
scene.add(rim);
const rim2 = new THREE.PointLight(0xffffff, 1.4, 20);
rim2.position.set(3, 2.5, -4);
scene.add(rim2);

// ── Grupo de la ola ──
// Se corre hacia abajo para dejar el título/intro del hero arriba sin que
// se pisen: el texto vive en la mitad superior, la ola en la inferior.
const group = new THREE.Group();
group.scale.setScalar(0.60);
scene.add(group);

// Cuánto baja la ola, como FRACCIÓN de la distancia de la cámara (no en
// unidades fijas). Con perspectiva, un mismo desplazamiento en unidades de
// mundo se ve más chico cuanto más lejos está la cámara — y en celular la
// cámara se aleja bastante (ver fitWaveToViewport), así que con un valor
// fijo la ola terminaba pegada al título justo en mobile. Atado a la
// distancia, se ve a la misma altura en cualquier pantalla.

const BLADES = 52;
const SPAN = 9.2; // ancho total de la ola en unidades de mundo
const WAVES = 1.5; // cuántos lomos entran en ese ancho
const AMP = 0.62; // alto de la ola (antes 1.25 — subidas/bajadas más suaves)
const TWISTS = 2.3; // vueltas de giro fijo a lo largo del recorrido (look "pluma")
const WAVE_SPEED = 0.55; // rad/seg — velocidad a la que la ola viaja por la cinta

// ── Blade en forma de "pastilla" (cápsula) con bisel ──
// La referencia usa piezas con las dos puntas totalmente redondeadas y un
// borde biselado que agarra la luz como una línea de brillo continua. Un
// plano de canto recto (lo que había antes) no puede dar eso: hace falta
// extruir un contorno 2D con esquinas redondeadas y biselar el borde.
function createPillShape(width, height, segments = 20) {
  const w = width / 2;
  const straight = Math.max(height / 2 - w, 0); // mitad del tramo recto
  const pts = [];
  // cap superior: semicírculo de -90° a 90°
  for (let i = 0; i <= segments; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / segments;
    pts.push(new THREE.Vector2(Math.sin(a) * w, straight + Math.cos(a) * w));
  }
  // cap inferior: semicírculo de 90° a 270°
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / segments;
    pts.push(new THREE.Vector2(Math.sin(a) * w, -straight + Math.cos(a) * w));
  }
  const shape = new THREE.Shape(pts);
  return shape;
}

const pillShape = createPillShape(0.58, 1.6);
const bladeGeo = new THREE.ExtrudeGeometry(pillShape, {
  depth: 0.09,
  bevelEnabled: true,
  bevelThickness: 0.05,
  bevelSize: 0.05,
  bevelSegments: 8,
  curveSegments: 20,
});
bladeGeo.center();

// Sólo los dos colores de marca — nada de blanco en la mezcla (el fondo ya
// es blanco, así que el contraste de las piezas tiene que salir de acá).
const colorAccent = new THREE.Color('#4d95d4'); // celeste, principal
const colorNavy = new THREE.Color('#0e2440'); // azul oscuro, secundario

const blades = [];

for (let i = 0; i < BLADES; i++) {
  const t = i / (BLADES - 1); // 0..1 a lo largo de la ola
  const x = (t - 0.5) * SPAN;
  const phase = t * Math.PI * 2 * WAVES;
  const y = Math.sin(phase) * AMP;

  // tangente de la curva → orientación del blade siguiendo la ola
  const dy = Math.cos(phase) * AMP * ((Math.PI * 2 * WAVES) / SPAN);
  const tangentAngle = Math.atan2(dy, 1);

  const mixT = 0.5 + 0.5 * Math.sin(phase * 1.15);
  const color = colorNavy.clone().lerp(colorAccent, mixT);

  const mat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.55,
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.6,
  });

  const blade = new THREE.Mesh(bladeGeo, mat);
  blade.position.set(x, y, Math.sin(phase * 1.3) * 0.55);
  blade.rotation.z = tangentAngle;
  // Giro fijo (no animado) según la posición: es lo que da el look "pluma
  // en abanico" de la referencia. No se toca en el loop — el movimiento de
  // la ola es sólo posición/inclinación, no rotación de cada pieza.
  blade.rotation.y = t * Math.PI * 2 * TWISTS;
  blade.userData.baseAngle = phase;
  blade.userData.x = x;
  group.add(blade);
  blades.push(blade);
}

// ── Parallax de mouse ──
// Sólo con mouse real (pointerType:'mouse'). En touch, pointermove también
// dispara al arrastrar el dedo para scrollear la página — eso movía la ola
// de forma errática cada vez que alguien bajaba scrolleando sobre el hero
// en celular. Con mouse no pasa: el hover sin click no es un gesto de
// scroll, así que el parallax de escritorio queda intacto.
let mx = 0;
let my = 0;
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  mx = e.clientX / window.innerWidth - 0.5;
  my = e.clientY / window.innerHeight - 0.5;
});

// ── Loop ──
// Una sola ola viajando por la cinta: se corre la FASE de cada blade con el
// tiempo (todas atadas al mismo reloj) en vez de rotar cada pieza sobre su
// propio eje. Eso da el efecto de "ola real" coordinada en vez de "turbina".
const TANGENT_K = (Math.PI * 2 * WAVES) / SPAN;

function animate(tms) {
  const t = tms * 0.001;
  if (!reducedMotion) {
    group.rotation.y = Math.sin(t * 0.1) * 0.16 + mx * 0.35;
    group.rotation.x = my * 0.12;
    blades.forEach((blade) => {
      const phase = blade.userData.baseAngle - t * WAVE_SPEED;
      blade.position.y = Math.sin(phase) * AMP;
      blade.position.z = Math.sin(phase * 1.3) * 0.55;
      blade.rotation.z = Math.atan2(Math.cos(phase) * AMP * TANGENT_K, 1);
    });
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
if (loadingEl) requestAnimationFrame(() => loadingEl.classList.add('is-hidden'));

// En pantallas angostas (celular) el FOV horizontal efectivo se achica junto
// con el aspect ratio, y la ola —pensada para desktop— se sale por los
// costados. Alejar la cámara según el ancho real disponible la vuelve a
// meter completa en el cuadro, de punta a punta, sin tocar el desktop.
const BASE_CAMERA_Z = 9.6;
/**
 * Hasta dónde se puede alejar la cámara.
 *
 * Sin tope, en pantalla vertical la cuenta pedía z ≈ 37 para meter los 9,2 de
 * ancho de la ola en 375 px: a esa distancia queda del alto de un hilo y cae
 * fuera del cuadro. Es mejor que sangre por los costados y se vea.
 */
const MAX_CAMERA_Z = 15;

/**
 * Dónde se para la ola en la pantalla.
 *
 * En pantalla ancha va **a la derecha**: el hero pone el título a la izquierda
 * y la ola ocupa la otra mitad, sin taparlo. Las dos medidas van en mitades de
 * lo visible a esa distancia —no en unidades de mundo— porque eso es lo que se
 * mantiene igual cuando cambia el tamaño de la ventana.
 *
 * En pantalla angosta no hay dos columnas: la ola se centra y baja, y queda
 * como una banda debajo del texto.
 */
const POSICION = {
  // Abajo a la derecha: el título ocupa el alto de la izquierda, así que
  // correrla solo al costado no alcanzaba —le cruzaba el último renglón—.
  ancha: { x: 0.58, y: -0.62 },
  angosta: { x: 0, y: -0.72 },
};

function fitWaveToViewport() {
  const aspect = window.innerWidth / window.innerHeight;
  const esAncha = aspect > 1.1;
  const halfWidth = (SPAN / 2) * group.scale.x + 0.45; // + pad de la última pieza
  const vFovRad = THREE.MathUtils.degToRad(camera.fov);

  // Por debajo de 1 la ola sangra por el borde: se lee como algo que sigue más
  // allá del cuadro y no como una pieza apoyada en el medio.
  const pad = esAncha ? 0.95 : 1.05;
  const neededZ = (halfWidth / (Math.tan(vFovRad / 2) * aspect)) * pad;
  camera.position.z = Math.min(MAX_CAMERA_Z, Math.max(BASE_CAMERA_Z, neededZ));

  const mitadAlto = Math.tan(vFovRad / 2) * camera.position.z;
  const mitadAncho = mitadAlto * aspect;
  const donde = esAncha ? POSICION.ancha : POSICION.angosta;
  group.position.x = donde.x * mitadAncho;
  group.position.y = donde.y * mitadAlto;
}
fitWaveToViewport();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  fitWaveToViewport();
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
