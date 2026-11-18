// Where the planets are on a given date.
// Keplerian elements and their rates per century from NASA JPL's
// "Approximate Positions of the Planets" (E. M. Standish), Table 1, valid 1800–2050.
// Order: a (AU), e, I (deg), L (deg), longitude of perihelion (deg), longitude of node (deg).
export const PLANETS = [
  { id: 'mercury', name: 'Mercury', el: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], rt: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081] },
  { id: 'venus', name: 'Venus', el: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], rt: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418] },
  { id: 'earth', name: 'Earth', el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], rt: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0] },
  { id: 'mars', name: 'Mars', el: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rt: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343] },
  { id: 'jupiter', name: 'Jupiter', el: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rt: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106] },
  { id: 'saturn', name: 'Saturn', el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rt: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794] },
  { id: 'uranus', name: 'Uranus', el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], rt: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589] },
  { id: 'neptune', name: 'Neptune', el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], rt: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664] },
];

const RAD = Math.PI / 180;
export const jdFromMs = (ms) => ms / 86400000 + 2440587.5;
export const MS_MIN = Date.UTC(1800, 0, 1);
export const MS_MAX = Date.UTC(2050, 0, 1);

function elementsAt(p, jd) {
  const T = (jd - 2451545.0) / 36525;
  return p.el.map((v, i) => v + p.rt[i] * T);
}

// Point on the orbit at eccentric anomaly E (radians), heliocentric ecliptic J2000, AU.
function orbitPoint(a, e, I, wbar, Om, E) {
  const w = (wbar - Om) * RAD, O = Om * RAD, i = I * RAD;
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    (sw * si) * xp + (cw * si) * yp,
  ];
}

// Position now: { pos: [x, y, z] in AU, E: eccentric anomaly in radians }.
export function helio(p, jd) {
  const [a, e, I, L, wbar, Om] = elementsAt(p, jd);
  let M = (L - wbar) % 360;
  if (M > 180) M -= 360; else if (M < -180) M += 360;
  M *= RAD;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return { pos: orbitPoint(a, e, I, wbar, Om, E), E };
}

// The whole orbit as n points, starting at perihelion.
export function orbitPath(p, jd, n) {
  const [a, e, I, , wbar, Om] = elementsAt(p, jd);
  const out = [];
  for (let k = 0; k < n; k++) out.push(orbitPoint(a, e, I, wbar, Om, (k / n) * 2 * Math.PI));
  return out;
}
