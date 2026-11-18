// Home page: a 3D size ladder (hero + Cosmic Scale) and a live map of the solar system (Orrery).
// Sizes come from the Cosmic Scale catalogue; planet angles from JPL's orbital elements (ephem.js).
import * as THREE from './three.module.min.js';
import { PLANETS, helio, orbitPath, jdFromMs, MS_MIN, MS_MAX } from './ephem.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const RAD = Math.PI / 180;
const HERE = new URL('.', import.meta.url).href;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

// ---------------------------------------------------------------- data
const EARTH_R = 6371, SUN_R = 695700;
// star: colour; surf: 0 a calm surface (hot stars do not boil), 1 boiling, 3 a few giant cells (red supergiants).
// r: radius in km (Cosmic Scale catalogue). tilt: [toward the viewer, sideways] in degrees. day: rotation in Earth days.
const BODIES = [
  { id: 'moon', name: 'The Moon', r: 1737.4, tex: 'moon', tilt: [6, 6.7], day: 27.32 },
  { id: 'mars', name: 'Mars', r: 3389.5, tex: 'mars', tilt: [8, 25.2], day: 1.026, atm: [1.0, 0.5, 0.3, 0.22] },
  { id: 'earth', name: 'Earth', r: 6371, tex: 'earth', earth: true, tilt: [14, 23.44], day: 1, atm: [0.3, 0.58, 1.0, 1.0],
    note: 'Home. To its left, Mars and the Moon.' },
  { id: 'neptune', name: 'Neptune', r: 24622, tex: 'neptune', tilt: [10, 28.3], day: 0.671, atm: [0.3, 0.45, 1.0, 0.45],
    note: '3.9 Earths wide. The farthest planet from the Sun.' },
  { id: 'saturn', name: 'Saturn', r: 58232, tex: 'saturn', tilt: [22, 9], day: 0.444, ring: true, ext: 2.35, atm: [1.0, 0.85, 0.6, 0.2],
    note: '9.1 Earths wide. Its main rings span about 274,000 km.' },
  { id: 'jupiter', name: 'Jupiter', r: 69911, tex: 'jupiter', tilt: [6, 3.1], day: 0.414, atm: [1.0, 0.8, 0.6, 0.2],
    note: '11 Earths wide. The largest planet we have.' },
  { id: 'sun', name: 'The Sun', r: 695700, star: [1.0, 0.9, 0.72], surf: 1, detail: 4.2, seed: 3.1,
    note: '109 Earths wide. It holds 99.86% of the solar system’s mass.' },
  { id: 'sirius', name: 'Sirius', r: 1190342.7, star: [0.74, 0.84, 1.0], surf: 0, detail: 3.0, seed: 7.7,
    note: '1.7 Suns wide. The brightest star in the night sky.' },
  { id: 'pollux', name: 'Pollux', r: 6303042, star: [1.0, 0.78, 0.5], surf: 1, detail: 3.2, seed: 11.3,
    note: '9 Suns wide. An orange giant in Gemini.' },
  { id: 'arcturus', name: 'Arcturus', r: 17670780, star: [1.0, 0.7, 0.4], surf: 1, detail: 2.6, seed: 5.9,
    note: '25 Suns wide. A red giant 37 light-years away.' },
  { id: 'rigel', name: 'Rigel', r: 54890730, star: [0.66, 0.79, 1.0], surf: 0, detail: 3.0, seed: 2.2,
    note: '79 Suns wide. A blue supergiant in Orion.' },
  { id: 'betelgeuse', name: 'Betelgeuse', r: 531514800, star: [1.0, 0.55, 0.3], surf: 3, detail: 2.2, seed: 8.4, approx: true,
    note: 'About 764 Suns wide. In the Sun’s place, it would swallow Mars.' },
  { id: 'stephenson', name: 'Stephenson 2-18', r: 1495755000, star: [1.0, 0.44, 0.2], surf: 3, detail: 2.0, seed: 1.6, approx: true,
    note: 'About 2,150 Suns wide, one of the largest stars known. In the Sun’s place, it would reach about as far as Saturn.' },
];
// Lay them out left to right, touching distance apart (the gaps are not to scale; the page says so).
{
  let x = 0;
  BODIES.forEach((b, i) => {
    b.R = b.r / EARTH_R; b.ext = b.ext || 1;
    if (i) { const p = BODIES[i - 1]; x += p.R * p.ext + 0.3 * Math.max(p.R, b.R) + b.R * b.ext; }
    b.x = x;
  });
  const ex = BODIES.find((b) => b.id === 'earth').x;
  BODIES.forEach((b) => { b.x -= ex; });
}
const byId = Object.fromEntries(BODIES.map((b) => [b.id, b]));
const STOPS = ['earth', 'earth', 'neptune', 'saturn', 'jupiter', 'sun', 'sirius', 'pollux', 'arcturus', 'rigel', 'betelgeuse', 'stephenson'].map((id) => byId[id]);
const NSEG = STOPS.length - 1;

function fmtKm(d) {
  if (d >= 1e9) return (d / 1e9).toFixed(2) + ' billion km';
  if (d >= 1e6) return (d / 1e6).toFixed(d < 1e7 ? 2 : 1) + ' million km';
  return Math.round(d).toLocaleString('en-US') + ' km';
}

// ---------------------------------------------------------------- page state
const el = {
  hero: $('#hero'), journey: $('#journey'), hud: $('#hud'), hname: $('#hname'), hdia: $('#hdia'), hnote: $('#hnote'), hi: $('#hi'),
  rail: $('#rail'), veil: $('#veil'), orrery: $('#orrery'), ohud: $('#ohud'), labels: $('#labels'), odate: $('#odate'), olive: $('#olive'),
  nav: $('#nav'), progress: $('#progress'), glow: $('#glow'), strip: $('#strip'), marq: $('.marq'),
};
const veils = $$('[data-veil]');
const M = { vh: 1, vw: 1, journeyLen: 1, oTop: 0, oLen: 1, swapY: 0, docLen: 1, veil: [] };
function measure() {
  M.vh = innerHeight; M.vw = innerWidth;
  const top = (e) => e.getBoundingClientRect().top + scrollY;
  M.journeyLen = Math.max(1, el.journey.offsetHeight - M.vh);
  M.oTop = top(el.orrery); M.oLen = Math.max(1, el.orrery.offsetHeight - M.vh);
  M.veil = veils.map((v) => [top(v), v.offsetHeight]);
  M.swapY = M.veil.length ? M.veil[0][0] + M.veil[0][1] * 0.5 : 1e9;
  M.docLen = Math.max(1, document.documentElement.scrollHeight - M.vh);
  M.strip = el.strip ? [top(el.strip.parentElement), el.strip.parentElement.offsetHeight, Math.max(0, el.strip.scrollWidth - M.vw)] : null;
}

STOPS.slice(1).forEach((b) => { const li = document.createElement('li'); li.textContent = b.name; el.rail.appendChild(li); });
const railItems = $$('li', el.rail);
let hudIndex = -1, diaFrom = 12742, diaTo = 12742, diaT = 1, diaApprox = false;
function setHud(i) {
  if (i === hudIndex) return;
  hudIndex = i;
  const b = STOPS[i];
  el.hname.innerHTML = '<span></span>'; el.hname.firstChild.textContent = b.name;
  el.hnote.textContent = b.note;
  for (const n of [el.hname, el.hnote]) { n.classList.remove('swap'); void n.offsetWidth; n.classList.add('swap'); }
  el.hi.textContent = String(i).padStart(2, '0');
  railItems.forEach((li, k) => li.classList.toggle('on', k === i - 1));
  diaFrom = diaTo; diaTo = b.r * 2; diaT = 0; diaApprox = !!b.approx;
}

// ---------------------------------------------------------------- small DOM effects
const io = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) {
    e.target.classList.add('in'); io.unobserve(e.target);
    for (const c of $$('[data-count]', e.target)) countUp(c);
  }
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
$$('[data-r]').forEach((n, i) => { if (!n.style.getPropertyValue('--i')) n.style.setProperty('--i', i % 3); io.observe(n); });
function countUp(n) {
  const to = +n.dataset.count; if (reduced || !to) return;
  const t0 = performance.now();
  const step = (t) => { const k = clamp((t - t0) / 1500); n.textContent = Math.round(to * (1 - Math.pow(2, -10 * k)) / (1 - Math.pow(2, -10))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
if (fine) {
  addEventListener('pointermove', (e) => {
    ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = (e.clientY / innerHeight) * 2 - 1;
    el.glow.style.opacity = 1; el.glow.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  }, { passive: true });
  for (const b of $$('.btn')) {
    b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * 0.22) + 'px'); b.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * 0.3) + 'px'); });
    b.addEventListener('pointerleave', () => { b.style.setProperty('--mx', '0px'); b.style.setProperty('--my', '0px'); });
  }
  for (const t of $$('[data-tilt]')) {
    t.addEventListener('pointermove', (e) => { const r = t.getBoundingClientRect(); t.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 16) + 'deg'); t.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - 0.5) * 12) + 'deg'); });
    t.addEventListener('pointerleave', () => { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); });
  }
  for (const c of $$('.card')) c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); c.style.setProperty('--gx', (e.clientX - r.left) + 'px'); c.style.setProperty('--gy', (e.clientY - r.top) + 'px'); });
}
const parallax = $$('[data-p]');

// ---------------------------------------------------------------- loader
const loader = { total: 0, done: 0, shown: false };
function progress() {
  const p = loader.total ? loader.done / loader.total : 1;
  $('#lbar').style.transform = `scaleX(${p})`; $('#lnum').textContent = Math.round(p * 100) + '%';
  if (p >= 1) ready();
}
function ready() { if (loader.shown) return; loader.shown = true; requestAnimationFrame(() => document.body.classList.add('ready')); }
setTimeout(ready, 6000);

// ---------------------------------------------------------------- WebGL
const STAR_LIB = `
float hash31(vec3 p){ p = fract(p*0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x), mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x), mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*vnoise3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return v/0.984; }
float fbm3(vec3 p){ float v=0., a=.5; for(int i=0;i<3;i++){ v+=a*vnoise3(p); p=p*2.07+vec3(4.1,1.3,7.7); a*=.5; } return v/0.875; }
float ridge(float n){ return 1.0 - abs(n*2.0 - 1.0); }
// distance to the nearest random point: the dark lanes between granules
float cells(vec3 p){ vec3 i=floor(p), f=fract(p); float d=8.0;
  for(int z=-1;z<=1;z++) for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec3 g=vec3(float(x),float(y),float(z));
    vec3 r = g + vec3(hash31(i+g), hash31(i+g+17.3), hash31(i+g+41.9)) - f; d = min(d, dot(r,r)); }
  return sqrt(d); }
// convection cells: x distance to the nearest centre, y to the next, z a random number for the cell
vec3 granules(vec3 s, float t){ vec3 i=floor(s), f=fract(s); float d1=8.0, d2=8.0, id=0.0;
  for(int z=-1;z<=1;z++) for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec3 g=vec3(float(x),float(y),float(z));
    vec3 h = vec3(hash31(i+g), hash31(i+g+17.3), hash31(i+g+41.9));
    vec3 o = 0.5 + 0.35*sin(t*0.8 + 6.2832*h);
    float life = 0.5 + 0.5*sin(t*(1.4 + 0.9*h.x) + 6.2832*h.z);
    float d = length(g + o - f)*(1.3 - 0.5*life);
    if (d < d1) { d2 = d1; d1 = d; id = h.y; } else if (d < d2) { d2 = d; } }
  return vec3(d1, d2, id); }
// a star's colour at heat h: ember red, through its own colour, to white-hot (the Cosmic Scale app's palette)
uniform vec3 uColor;
vec3 starHeat(float h){
  float warmth = clamp((uColor.r - uColor.b)*1.6, 0.0, 1.0);
  vec3 ember = mix(uColor*vec3(0.35,0.4,0.6), vec3(0.55,0.06,0.01), warmth);
  vec3 cool = mix(uColor*0.7, vec3(0.95,0.36,0.05), warmth);
  vec3 mid = mix(uColor, uColor*vec3(1.0,0.74,0.4), warmth);
  vec3 hot = mix(uColor, vec3(1.0,0.95,0.78), 0.32);
  h = clamp(h, 0.0, 1.0);
  return h < 0.3 ? mix(ember, cool, h/0.3) : h < 0.65 ? mix(cool, mid, (h-0.3)/0.35) : mix(mid, hot, (h-0.65)/0.35);
}`;

const VERT = `
varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vO;
void main(){ vUv = uv; vO = position; vN = normalize(mat3(modelMatrix)*normal);
  vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;

const PLANET_FRAG = `
precision highp float;
uniform sampler2D uMap, uNight, uClouds; uniform float uEarth, uShift, uFade; uniform vec3 uLight; uniform vec4 uAtm;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float ndl = dot(N, uLight);
  float day = smoothstep(-0.1, 0.42, ndl);
  vec3 col = texture2D(uMap, vUv).rgb * (day*1.12 + 0.012);
  if (uEarth > 0.5) {
    float c = texture2D(uClouds, vec2(vUv.x + uShift, vUv.y)).r;
    col = mix(col, vec3(day*1.05 + 0.012), c*0.86);
    float night = pow(1.0 - day, 3.0);
    col += texture2D(uNight, vUv).r * night * (1.0 - c*0.75) * vec3(1.0, 0.76, 0.42) * 1.5;
    vec3 H = normalize(uLight + V);
    col += pow(max(dot(N, H), 0.0), 60.0) * (1.0 - c) * day * 0.28 * vec3(1.0, 0.95, 0.85) * step(texture2D(uMap, vUv).r + 0.04, texture2D(uMap, vUv).b);
  }
  float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uAtm.rgb * uAtm.a * fr * (day*0.95 + 0.04);
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

const HALO_FRAG = `
precision highp float;
uniform vec3 uLight; uniform vec4 uAtm; uniform float uFade;
varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float a = clamp(abs(dot(N, V)) / 0.33, 0.0, 1.0);
  float lit = smoothstep(-0.35, 0.5, dot(N, uLight));
  gl_FragColor = vec4(uAtm.rgb * uAtm.a * a*a * (lit*0.9 + 0.03) * uFade, 1.0);
}`;

const STAR_FRAG = `
precision highp float;
uniform float uTime, uDetail, uSeed, uFade; uniform int uSurf;
varying vec3 vN; varying vec3 vW; varying vec3 vO;
${STAR_LIB}
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float z = max(dot(N, V), 0.0), t = uTime;
  vec3 q = normalize(vO), s = q*uDetail + vec3(uSeed);
  float turb = 0.5, h;
  if (uSurf == 0) {
    // hot stars carry their heat by radiation, not convection: no boiling surface
    h = 0.64 + 0.04*(fbm3(s*0.8) - 0.5);
  } else {
    // boiling plasma: turbulence folded through itself, drifting slowly
    vec3 w = vec3(fbm3(s*0.9 + t*0.01), fbm3(s*0.9 + 5.2 - t*0.012), fbm3(s*0.9 + 9.7)) - 0.5;
    turb = fbm(s*2.2 + w*2.4 + vec3(0.0, 0.0, t*0.03));
    if (uSurf == 3) {
      // a handful of convection cells, each wider than the Sun, as interferometers see on Betelgeuse
      vec3 gq = q*1.4 + uSeed;
      gq += (vec3(fbm3(gq*1.3), fbm3(gq*1.3 + 5.1), fbm3(gq*1.3 + 9.3)) - 0.5)*1.1;
      vec3 gc = granules(gq, t*0.04);
      float up = smoothstep(0.0, 0.6, gc.y - gc.x)*(1.0 - 0.5*gc.x)*(0.5 + gc.z);
      h = 0.24 + 0.55*up + 0.24*(turb - 0.5);
    } else {
      // granulation: bright cells of rising gas, dark lanes between, dark filaments, cooler active regions
      float c = cells(s*9.0 + w*1.5 + vec3(t*0.02));
      float lanes = smoothstep(0.55, 0.15, c)*0.18;
      float veins = pow(ridge(fbm3(s*1.6 + w*3.0)), 6.0);
      h = 0.34 + 0.85*turb - lanes - 0.32*veins;
      h -= 0.22*smoothstep(0.45, 0.72, fbm3(s*0.7 + w*1.2 + 21.0));
      h += 0.12*(fbm3(s*16.0 + t*0.04) - 0.5);
    }
  }
  // limb darkening: the edge shows cooler, higher layers. Weakest on hot stars, strongest on supergiants
  float mu = pow(z, uSurf == 0 ? 0.3 : (uSurf == 3 ? 0.85 : 0.55));
  h = h*(0.62 + 0.42*mu) - 0.06*(1.0 - mu);
  vec3 col = starHeat(h)*(0.84 + 0.36*mu);
  col += starHeat(0.55)*0.6*pow(1.0 - mu, 3.0);
  if (uSurf == 1) col += starHeat(0.9)*smoothstep(0.62, 0.75, turb)*(1.0 - mu)*0.35;   // faculae near the limb
  gl_FragColor = vec4(col*uFade, 1.0);
}`;

const GLOW_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const GLOW_FRAG = `
precision highp float;
uniform float uK, uFade, uGain, uTime, uSeed; uniform int uKind; varying vec2 vUv;
${STAR_LIB}
void main(){
  vec2 pv = (vUv - 0.5)*2.0*uK;            // in star radii from the centre
  float r = length(pv), d = max(r - 1.0, 0.0), t = uTime;
  vec3 L = vec3(pv / max(r, 1e-4), 0.0);
  // chromosphere: a thin hot rim; then a glow falling off with height
  vec3 col = starHeat(0.4)*exp(-d*55.0)*0.9;
  col += starHeat(0.6)*(0.5*exp(-d*6.0) + 0.16*exp(-d*1.7));
  if (uKind == 1) {
    // the Sun's corona as eclipses show it: streamers shaped by direction; and prominences lifting off the limb
    float wide = pow(vnoise3(L*3.0 + vec3(0.0, 0.0, uSeed + d*0.6 - t*0.04)), 2.0);
    float mid = pow(vnoise3(L*8.0 + vec3(0.0, 0.0, uSeed + 3.0 + d*0.5 - t*0.05)), 3.0);
    float fine = pow(vnoise3(L*20.0 + vec3(0.0, 0.0, uSeed + d*0.4 - t*0.05)), 6.0);
    col += starHeat(0.7)*(wide*0.7 + mid*0.45 + fine*0.5)*exp(-d*1.8)*smoothstep(0.0, 0.05, d)*1.3;
    float region = smoothstep(0.45, 0.7, vnoise3(L*2.2 + vec3(0.0, 0.0, uSeed + 7.0)));
    float flame = smoothstep(0.55, 0.85, fbm3(L*7.0 + vec3(0.0, 0.0, d*9.0 - t*0.12) + uSeed));
    col += starHeat(0.3)*flame*region*exp(-d*11.0)*1.7;
  } else if (uKind == 3) {
    // cool supergiants sit in a clumpy envelope of the gas and dust they shed
    float cool = clamp((uColor.r - uColor.b)*1.4, 0.0, 1.0);
    float clump = 0.55 + 0.9*fbm3(L*2.2 + vec3(0.0, 0.0, d*0.7 + uSeed));
    col += starHeat(0.32)*(0.28*exp(-d*2.2) + 0.12*exp(-d*0.8))*clump*cool;
  }
  gl_FragColor = vec4(col*smoothstep(uK - 1.0, 0.0, d)*uFade*uGain, 1.0);
}`;

const RING_VERT = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const RING_FRAG = `
precision highp float;
uniform sampler2D uRing; uniform vec3 uL; uniform float uFade; varying vec2 vP;
void main(){
  float rad = length(vP);
  float u = (rad - 1.28) / (2.35 - 1.28);
  if (u < 0.0 || u > 1.0) discard;
  vec4 t = texture2D(uRing, vec2(u, 0.5));
  vec3 p = vec3(vP, 0.0);
  float along = dot(p, uL);
  float sh = along < 0.0 ? smoothstep(0.96, 1.03, length(p - along*uL)) : 1.0;
  float lit = 0.5 + 0.6*abs(uL.z);
  gl_FragColor = vec4(t.rgb * 1.5 * lit * (0.06 + 0.94*sh) * uFade, t.a);
}`;

const SKY_VERT = `
attribute float aMag; attribute vec3 aCol; uniform float uPx; uniform mat3 uSky; varying vec3 vCol; varying float vBig;
void main(){
  vec4 mv = viewMatrix * vec4(uSky * position, 0.0);
  gl_Position = projectionMatrix * vec4(mv.xyz, 1.0); gl_Position.z = gl_Position.w * 0.9999;
  float s = pow(10.0, -0.2*aMag) * 3.6;      // brightness as a width: 5 magnitudes = 10 times wider
  gl_PointSize = max(s, 1.25) * uPx * 2.4;
  vBig = clamp((s - 1.5) / 3.0, 0.0, 1.0);
  vCol = mix(vec3(1.0), aCol, 0.75) * clamp(s, 0.14, 1.0);
}`;
const SKY_FRAG = `
precision mediump float; varying vec3 vCol; varying float vBig; uniform float uFade;
void main(){
  float d = length(gl_PointCoord - 0.5)*2.0;
  float core = exp(-d*d*9.0), halo = exp(-d*3.2)*0.35*vBig;
  gl_FragColor = vec4(vCol * (core + halo) * smoothstep(1.0, 0.7, d) * uFade, 1.0);
}`;

// the Milky Way: NASA's Deep Star Maps 2020 (from Gaia), stored in right ascension and declination
const MW_VERT = `
uniform mat3 uSky; varying vec3 vDir;
void main(){ vDir = position; vec4 mv = viewMatrix * vec4(uSky * position, 0.0);
  gl_Position = projectionMatrix * vec4(mv.xyz, 1.0); gl_Position.z = gl_Position.w * 0.99995; }`;
const MW_FRAG = `
precision highp float; uniform sampler2D uMW; uniform float uGain, uFade; varying vec3 vDir;
void main(){
  vec3 v = normalize(vDir);
  vec3 e = vec3(v.x, -v.z, v.y);                                              // this page's frame to ecliptic
  vec3 q = vec3(e.x, e.y*0.917482 - e.z*0.397777, e.y*0.397777 + e.z*0.917482);   // ecliptic to equatorial
  vec2 uv = vec2(0.5 - atan(q.y, q.x)/6.2831853, 0.5 + asin(clamp(q.z, -1.0, 1.0))/3.14159265);
  vec3 c = texture2D(uMW, uv).rgb;
  gl_FragColor = vec4(c*c*(0.4 + 0.6*c)*uGain*uFade*2.2, 1.0);
}`;

const ORBIT_VERT = `attribute float aPhase; varying float vPh; void main(){ vPh = aPhase; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const ORBIT_FRAG = `
precision highp float; uniform float uHead, uFade; uniform vec3 uColor; varying float vPh;
void main(){ float back = fract(uHead - vPh); float tr = pow(1.0 - back, 5.0); gl_FragColor = vec4(uColor * (0.2 + 1.3*tr) * uFade, 1.0); }`;

function startGL() {
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x04050a);
  const scene = new THREE.Scene();
  const FOV = 35, TAN = Math.tan(FOV * RAD / 2);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
  const fade = { value: 1 }, time = { value: 0 };
  const LIGHT = new THREE.Vector3(0.62, 0.3, 0.62).normalize();
  let W = 1, H = 1, aspect = 1, frames = [];

  // textures
  const manager = new THREE.LoadingManager();
  const tl = new THREE.TextureLoader(manager);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const critical = new Set(['earth', 'earth_clouds', 'earth_lights']);
  loader.total += critical.size + 1;
  const texCache = {};
  const tex = (name, ext = 'webp') => texCache[name] || (texCache[name] = tl.load(`${HERE}tex/${name}.${ext}`, (t) => {
    if (critical.has(name)) { loader.done++; progress(); }
  }, undefined, () => { if (critical.has(name)) { loader.done++; progress(); } }));
  const prep = (t, repeat) => { t.anisotropy = maxAniso; if (repeat) t.wrapS = THREE.RepeatWrapping; return t; };

  const sphere = new THREE.SphereGeometry(1, 128, 80);
  const sphereLo = new THREE.SphereGeometry(1, 48, 32);
  const quad = new THREE.PlaneGeometry(1, 1);
  const ringGeo = new THREE.RingGeometry(1.28, 2.35, 160, 1);
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const rings = [], spinners = [], billboards = [];

  function makePlanet(b, radius, geo, light) {
    const g = new THREE.Group();
    const tilt = new THREE.Group(); tilt.rotation.set(b.tilt[0] * RAD, 0, -b.tilt[1] * RAD); g.add(tilt);
    const atm = new THREE.Vector4(...(b.atm || [0, 0, 0, 0]));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: PLANET_FRAG,
      uniforms: {
        uMap: { value: prep(tex(b.tex)) }, uNight: { value: b.earth ? prep(tex('earth_lights')) : black },
        uClouds: { value: b.earth ? prep(tex('earth_clouds'), true) : black }, uEarth: { value: b.earth ? 1 : 0 }, uShift: { value: 0 },
        uLight: { value: light }, uAtm: { value: atm }, uFade: fade,
      },
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.scale.setScalar(radius); mesh.rotation.y = b.spin0 || 0; tilt.add(mesh);
    spinners.push({ mesh, mat, day: b.day, earth: b.earth });
    if (b.atm && b.atm[3] > 0.3) {
      const halo = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: HALO_FRAG, uniforms: { uLight: { value: light }, uAtm: { value: atm }, uFade: fade },
        side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      }));
      halo.scale.setScalar(radius * 1.06); g.add(halo);
    }
    if (b.ring) {
      const rm = new THREE.ShaderMaterial({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG, uniforms: { uRing: { value: tex('saturn_ring', 'png') }, uL: { value: new THREE.Vector3(0, 0, 1) }, uFade: fade },
        side: THREE.DoubleSide, transparent: true, depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, rm); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(radius); tilt.add(ring);
      rings.push({ ring, light, u: rm.uniforms.uL });
    }
    return g;
  }
  function makeStar(b, radius, glowK, geo) {
    const g = new THREE.Group();
    const col = { value: new THREE.Vector3(...b.star) }, seed = { value: b.seed };
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: STAR_FRAG,
      uniforms: { uColor: col, uTime: time, uDetail: { value: b.detail }, uSeed: seed, uSurf: { value: b.surf }, uFade: fade } }));
    m.scale.setScalar(radius); g.add(m);
    const glow = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
      uniforms: { uColor: col, uK: { value: glowK }, uFade: fade, uGain: { value: 1 }, uTime: time, uSeed: seed, uKind: { value: b.id === 'sun' ? 1 : b.surf === 3 ? 3 : 0 } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    glow.scale.setScalar(radius * 2 * glowK); g.add(glow); billboards.push(glow);
    g.userData.gain = glow.material.uniforms.uGain;
    return g;
  }

  // ---- the size ladder
  const ladder = new THREE.Group(); scene.add(ladder);
  byId.earth.spin0 = 4.25; byId.jupiter.spin0 = 1.2; byId.mars.spin0 = 2.0;
  for (const b of BODIES) {
    const o = b.star ? makeStar(b, b.R, 2.0, sphere) : makePlanet(b, b.R, sphere, LIGHT);
    o.position.x = b.x; ladder.add(o); b.obj = o;
  }

  // ---- the solar system
  const orrery = new THREE.Group(); orrery.visible = false; scene.add(orrery);
  const AU = (a) => 3.3 * Math.sqrt(a);
  const place = (p, out) => { const r = Math.hypot(p[0], p[1], p[2]); const s = AU(r) / r; return out.set(p[0] * s, p[2] * s, -p[1] * s); };
  orrery.add(makeStar({ ...byId.sun, detail: 3.2 }, 0.62, 4.5, sphereLo));
  const LOOK = {
    mercury: { rad: 0.12, tilt: [0, 0], day: 58.6 }, venus: { rad: 0.19, tilt: [0, 3], day: 243, atm: [1, 0.85, 0.6, 0.35] },
    earth: { rad: 0.2, tilt: [0, 23.44], day: 1, earth: true, atm: [0.3, 0.58, 1, 1] }, mars: { rad: 0.15, tilt: [0, 25.2], day: 1.026 },
    jupiter: { rad: 0.52, tilt: [0, 3.1], day: 0.414 }, saturn: { rad: 0.44, tilt: [0, 26.7], day: 0.444, ring: true },
    uranus: { rad: 0.31, tilt: [0, 82], day: 0.718 }, neptune: { rad: 0.3, tilt: [0, 28.3], day: 0.671 },
  };
  const NPTS = 360;
  const worlds = PLANETS.map((p) => {
    const look = LOOK[p.id], light = new THREE.Vector3(1, 0, 0);
    const obj = makePlanet({ ...look, tex: p.id }, look.rad, sphereLo, light); orrery.add(obj);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NPTS * 3), 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(Float32Array.from({ length: NPTS }, (_, k) => k / NPTS), 1));
    const head = { value: 0 };
    const line = new THREE.LineLoop(geo, new THREE.ShaderMaterial({
      vertexShader: ORBIT_VERT, fragmentShader: ORBIT_FRAG, uniforms: { uHead: head, uFade: fade, uColor: { value: new THREE.Vector3(0.5, 0.6, 0.86) } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    line.frustumCulled = false; orrery.add(line);
    const label = document.createElement('span'); label.textContent = p.name; label.style.transform = 'translate(-999px,-999px)'; el.labels.appendChild(label);
    return { p, obj, light, geo, head, label, rad: look.rad };
  });
  let pathJd = -1e9;
  const v3 = new THREE.Vector3();
  function setOrbits(jd) {
    pathJd = jd;
    for (const w of worlds) {
      const pts = orbitPath(w.p, jd, NPTS), a = w.geo.attributes.position;
      pts.forEach((pt, k) => { place(pt, v3); a.setXYZ(k, v3.x, v3.y, v3.z); });
      a.needsUpdate = true;
    }
  }

  // ---- the real sky
  // In the solar-system view the sky is where it really is. In the size ladder, where no direction means anything,
  // the same sky is turned so the view looks towards the centre of the Milky Way.
  const skyRot = { value: new THREE.Matrix3() }, skyLadder = new THREE.Matrix3(), skyTrue = new THREE.Matrix3();
  const eqToGl = (ra, dec) => {
    const x = Math.cos(dec * RAD) * Math.cos(ra * RAD), y = Math.cos(dec * RAD) * Math.sin(ra * RAD), z = Math.sin(dec * RAD);
    const ce = 0.917482, se = 0.397777, ye = y * ce + z * se, ze = -y * se + z * ce;
    return new THREE.Vector3(x, ze, -ye);
  };
  function aimSky(land) {
    const g = eqToGl(266.405, -28.936), n = eqToGl(192.859, 27.128);      // galactic centre and north galactic pole
    const d = (land ? new THREE.Vector3(-0.1, 0.17, -1) : new THREE.Vector3(0.02, 0.03, -1)).normalize();   // where the centre goes on screen
    const tilt = (land ? 20 : 62) * RAD;
    const up = new THREE.Vector3(-Math.sin(tilt), Math.cos(tilt), 0); up.addScaledVector(d, -up.dot(d)).normalize();
    const S = new THREE.Matrix4().makeBasis(g, n, new THREE.Vector3().crossVectors(g, n));
    const T = new THREE.Matrix4().makeBasis(d, up, new THREE.Vector3().crossVectors(d, up));
    skyLadder.setFromMatrix4(T.multiply(S.transpose()));
  }
  const mwGain = { value: 0.5 };
  const mwTex = tl.load(`${HERE}tex/milkyway.webp`);
  const mwSetup = (t) => { t.wrapS = THREE.RepeatWrapping; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; };
  const mwMat = new THREE.ShaderMaterial({ vertexShader: MW_VERT, fragmentShader: MW_FRAG, uniforms: { uMW: { value: mwSetup(mwTex) }, uSky: skyRot, uGain: mwGain, uFade: fade }, side: THREE.BackSide, depthTest: false, depthWrite: false });
  const mw = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mwMat); mw.frustumCulled = false; mw.renderOrder = -20; scene.add(mw);
  if (fine) tl.load(`${HERE}tex/milkyway4k.webp`, (t) => { mwMat.uniforms.uMW.value = mwSetup(t); t.needsUpdate = true; });   // sharper map for big screens
  const sky = { mat: null };
  fetch(`${HERE}stars.bin`).then((r) => r.arrayBuffer()).then((buf) => {
    const n = new DataView(buf).getUint32(0, true);
    const dirs = new Int16Array(buf, 4, n * 3), meta = new Uint8Array(buf, 4 + n * 6, n * 4);
    const pos = new Float32Array(n * 3), mag = new Float32Array(n), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = dirs[i * 3] / 32767; pos[i * 3 + 1] = dirs[i * 3 + 1] / 32767; pos[i * 3 + 2] = dirs[i * 3 + 2] / 32767;
      mag[i] = meta[i * 4] / 25 - 2; col[i * 3] = meta[i * 4 + 1] / 255; col[i * 3 + 1] = meta[i * 4 + 2] / 255; col[i * 3 + 2] = meta[i * 4 + 3] / 255;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    sky.mat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uPx: { value: renderer.getPixelRatio() }, uSky: skyRot, uFade: fade }, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false });
    const pts = new THREE.Points(g, sky.mat); pts.frustumCulled = false; pts.renderOrder = -10; scene.add(pts);
  }).catch(() => {}).finally(() => { loader.done++; progress(); });

  // ---- framing
  function frameFor(k) {
    const land = aspect >= 1, b = STOPS[k];
    let size, px, py;
    if (k === 0) [size, px, py] = land ? [1.08, lerp(0.72, 0.5, clamp((aspect - 1.2) / 0.7)), -0.36] : [1.5, 0.05, -0.56];
    else if (k === 1) [size, px, py] = land ? [0.34, 0.3, 0.04] : [0.44, 0.43, 0.22];
    else { [size, px, py] = land ? [0.5, 0.22, 0.05] : [0.62, 0.12, 0.22]; size /= Math.pow(b.ext, 0.8); }
    const halfMin = b.R / size, halfV = land ? halfMin : halfMin / aspect, halfH = halfV * aspect;
    return { d: halfV / TAN, tx: b.x - px * halfH, ty: -py * halfV };
  }
  let maxRatio = 2, slow = 0;
  function resize(force) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === W && h === H && !force) return;
    W = w; H = h; aspect = W / H;
    aimSky(aspect >= 1);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxRatio));
    renderer.setSize(W, H, false);
    camera.aspect = aspect;
    frames = STOPS.map((_, k) => frameFor(k));
    if (sky.mat) sky.mat.uniforms.uPx.value = renderer.getPixelRatio();
  }

  // ---- time in the solar system view
  const sim = { ms: Date.now(), rate: 0, started: false };
  const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const buttons = $$('#octl button');
  function setRate(r) {
    sim.rate = r; if (r === 0) sim.ms = Date.now();
    buttons.forEach((b) => b.classList.toggle('on', +b.dataset.rate === r));
    el.olive.textContent = r === 0 ? 'Live' : 'Time running'; el.olive.classList.toggle('off', r !== 0);
  }
  buttons.forEach((b) => b.addEventListener('click', () => { sim.started = true; setRate(+b.dataset.rate); }));
  setRate(0);

  const q = new THREE.Quaternion();
  let mode = 'ladder', cut = 0, cutDir = 0, lastDate = '';

  return function render(dt, sy, t, raw) {
    resize();
    // if this device cannot keep 25 frames a second, draw fewer pixels rather than stutter
    if (raw > 0.04 && raw < 0.2) { if (++slow > 45 && maxRatio > 1) { maxRatio = Math.max(1, maxRatio - 0.5); slow = 0; resize(true); } } else if (raw < 0.03) slow = 0;
    time.value += reduced ? 0 : dt;
    ptr.sx += (ptr.x - ptr.sx) * Math.min(1, dt * 3); ptr.sy += (ptr.y - ptr.sy) * Math.min(1, dt * 3);

    // which scene, with a short dip to black when it changes
    const want = sy + M.vh * 0.5 < M.swapY ? 'ladder' : 'orrery';
    if (want !== mode && cutDir === 0) cutDir = 1;
    if (cutDir) {
      cut = clamp(cut + cutDir * dt * 5);
      if (cut >= 1 && cutDir > 0) { mode = want; ladder.visible = mode === 'ladder'; orrery.visible = mode === 'orrery'; cutDir = -1; }
      else if (cut <= 0 && cutDir < 0) cutDir = 0;
    }
    fade.value = 1 - cut;
    skyRot.value = mode === 'ladder' ? skyLadder : skyTrue;
    mwGain.value = mode === 'ladder' ? (aspect >= 1 ? 0.5 : 0.4) : 0.42;

    for (const s of spinners) {
      if (!reduced) s.mesh.rotation.y += dt * (Math.PI * 2) / (Math.max(s.day, 0.3) * 90);
      if (s.earth) s.mat.uniforms.uShift.value = time.value * 0.0016;
    }

    if (mode === 'ladder') {
      const i = Math.min(Math.floor(t), NSEG - 1), s = ease((t - i - 0.1) / 0.8);
      const A = frames[i], B = frames[i + 1];
      const d = A.d * Math.pow(B.d / A.d, s), k = (1 - s) * d / A.d;
      const tx = B.tx - (B.tx - A.tx) * k, ty = B.ty - (B.ty - A.ty) * k;
      camera.position.set(tx + ptr.sx * d * 0.03, ty - ptr.sy * d * 0.03, d);
      camera.lookAt(tx, ty, 0);
      camera.near = d * 0.04; camera.far = d * 40;
      if (camera.view) camera.clearViewOffset();
      // a star's glow only shows once the view is wide enough to hold the star, so it never washes over smaller neighbours
      for (const b of BODIES) if (b.star) b.obj.userData.gain.value = clamp((d / b.R - 2.2) / 2.5);
      // the Moon and Mars arrive as the view pulls back from the opening close-up
      const pop = ease((t - 0.25) / 0.6);
      byId.mars.obj.scale.setScalar(pop); byId.moon.obj.scale.setScalar(ease((t - 0.4) / 0.6));
    } else {
      const qq = clamp((sy - M.oTop) / M.oLen);
      if (!sim.started && qq > 0.02) { sim.started = true; if (!reduced) setRate(7); }
      if (sim.rate) { sim.ms += sim.rate * 86400000 * dt; if (sim.ms > MS_MAX || sim.ms < MS_MIN) sim.ms = Date.now(); }
      else sim.ms = Date.now();
      const jd = jdFromMs(sim.ms);
      if (Math.abs(jd - pathJd) > 9000) setOrbits(jd);
      for (const w of worlds) {
        const h = helio(w.p, jd);
        place(h.pos, w.obj.position);
        w.light.copy(w.obj.position).multiplyScalar(-1).normalize();
        w.head.value = ((h.E / (2 * Math.PI)) % 1 + 1) % 1;
      }
      const ds = fmtDate.format(sim.ms); if (ds !== lastDate) { lastDate = ds; el.odate.textContent = ds; }

      const land = aspect >= 1;
      const half = lerp(land ? 4.6 : 5.2, land ? 12.5 : 20.5, ease(qq * 1.35));
      const D = (land ? half : half / aspect) / TAN;
      const elv = lerp(74, land ? 24 : 34, ease(qq)) * RAD, az = 0.5 + qq * 1.5 + time.value * 0.012 + ptr.sx * 0.12;
      camera.position.set(D * Math.cos(elv) * Math.sin(az), D * Math.sin(elv), D * Math.cos(elv) * Math.cos(az));
      camera.lookAt(0, 0, 0);
      camera.near = Math.max(0.5, D * 0.05); camera.far = D * 3 + 80;
      // sit the system clear of the text: right of centre on wide screens, above centre on tall ones
      camera.setViewOffset(W, H, land ? -W * 0.1 : 0, H * (land ? 0.05 : 0.11), W, H);
    }
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();

    for (const b of billboards) b.quaternion.copy(camera.quaternion);
    scene.updateMatrixWorld();
    for (const r of rings) { r.ring.getWorldQuaternion(q).invert(); r.u.value.copy(r.light).applyQuaternion(q); }

    if (mode === 'orrery') {
      v3.set(0, 0, 0).project(camera);
      const sx = (v3.x * 0.5 + 0.5) * W, sy0 = (-v3.y * 0.5 + 0.5) * H;
      for (const w of worlds) {
        v3.copy(w.obj.position).project(camera);
        const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * H;
        w.label.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(12px,-150%)`;
        // names of planets crowded against the Sun would sit on top of each other: hide them until there is room
        w.label.style.opacity = Math.hypot(x - sx, y - sy0) < 46 ? 0 : 1;
      }
    }
    renderer.render(scene, camera);
    return { cut, mode };
  };
}

// ---------------------------------------------------------------- main loop
let render = null;
try { render = startGL(); } catch (e) { document.documentElement.classList.add('nogl'); loader.total = 0; progress(); }

measure();
addEventListener('resize', measure);
addEventListener('load', measure);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
new ResizeObserver(measure).observe(document.body);

let sy = scrollY, last = performance.now(), lastY = scrollY, hudOn = null, ohudOn = null;
function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(raw, 0.05); last = now;
  const y = scrollY;
  // ease toward the real scroll position; if frames are far apart (a background tab), jump instead
  sy = reduced || raw > 0.25 ? y : sy + (y - sy) * (1 - Math.exp(-dt * 10));
  if (Math.abs(y - sy) < 0.05) sy = y;

  // the last stop is reached half a screen before the section ends, so it gets time on screen
  const t = clamp(sy / (M.journeyLen - M.vh * 0.5)) * NSEG;
  // hero copy leaves as the zoom starts
  const hk = clamp(t / 0.6);
  el.hero.style.opacity = 1 - hk; el.hero.style.transform = `translateY(${-hk * 60}px)`; el.hero.style.pointerEvents = hk > 0.6 ? 'none' : '';

  const on = t > 0.72 && sy < M.journeyLen + M.vh * 0.03 && !!render;
  if (on !== hudOn) { hudOn = on; el.hud.classList.toggle('on', on); }
  setHud(clamp(Math.round(t), 1, NSEG));
  if (diaT < 1) {
    diaT = Math.min(1, diaT + dt * 1.8);
    const v = Math.exp(lerp(Math.log(diaFrom), Math.log(diaTo), ease(diaT)));
    el.hdia.textContent = (diaApprox ? '≈ ' : '') + fmtKm(v);
  }

  const oq = (sy - M.oTop) / M.oLen;
  const oOn = oq > -0.12 && sy < M.oTop + M.oLen - M.vh * 0.04 && !!render;
  if (oOn !== ohudOn) { ohudOn = oOn; el.ohud.classList.toggle('on', oOn); el.labels.classList.toggle('on', oOn); }

  // dark veil while the app sections pass over the 3D view
  let veil = 0;
  for (const [top, h] of M.veil) {
    const a = clamp((sy + M.vh - top) / (M.vh * 0.7)) * clamp((top + h - sy - M.vh * 0.2) / (M.vh * 0.6));
    veil = Math.max(veil, a);
  }
  const out = render ? render(dt, sy, t, raw) : null;
  el.veil.style.opacity = (veil * 0.9).toFixed(3);

  // page chrome
  el.progress.style.transform = `scaleX(${clamp(y / M.docLen)})`;
  if (y > lastY + 4 && y > 300) el.nav.classList.add('hide'); else if (y < lastY - 4 || y < 300) el.nav.classList.remove('hide');
  const vel = y - lastY; lastY = y;
  if (el.marq && !reduced) el.marq.style.setProperty('--skew', clamp(-vel * 0.25, -14, 14).toFixed(2) + 'deg');
  if (M.strip && M.strip[2] > 0) {
    const k = clamp((sy + M.vh - M.strip[0]) / (M.vh + M.strip[1]));
    el.strip.style.transform = `translate3d(${(-k * M.strip[2]).toFixed(1)}px,0,0)`;
  }
  if (!reduced) for (const p of parallax) {
    const r = p.parentElement.getBoundingClientRect();
    p.style.translate = `0 ${(((r.top + r.height / 2) / M.vh - 0.5) * +p.dataset.p).toFixed(1)}px`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
