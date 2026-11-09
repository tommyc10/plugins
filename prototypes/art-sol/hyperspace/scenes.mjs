import { Frame, render, LOGO, EMBER, FAMILY, EFFORT_RAMP, WHITE, clamp, lerp, mixc, scale, ramp, seg, ease, hash, noise2 } from '../../art-opus/engine.mjs';

export const WIDTH = 88;
export const HEIGHT = 22;
const TAU = Math.PI * 2;
const INK = [91, 104, 127];
const ICE = [188, 218, 242];
const GOLD = EMBER[2];
const FAMILIES = Object.values(FAMILY);
const LOGO_X = Math.floor((WIDTH - LOGO.w) / 2);
const roles = ['planner', 'delegate', 'reviewer'];

function centre(frame, row, text, color = ICE) {
  frame.say(Math.floor((WIDTH - [...text].length) / 2), row, text, color);
}

function line(frame, startX, startY, endX, endY, color) {
  frame.dline(startX * 2, startY * 2, endX * 2, endY * 2, color);
}

function ellipse(frame, centreX, centreY, radiusX, radiusY, color, start = 0, end = TAU) {
  const steps = Math.max(8, Math.ceil(Math.abs(end - start) * Math.max(radiusX, radiusY) * 3));
  for (let index = 0; index <= steps; index++) {
    const angle = lerp(start, end, index / steps);
    frame.dot((centreX + Math.cos(angle) * radiusX) * 2, (centreY + Math.sin(angle) * radiusY) * 2, color);
  }
}

function erase(frame, startX, startY, width, height) {
  for (let pixelY = Math.floor(startY); pixelY < startY + height; pixelY++) {
    for (let pixelX = Math.floor(startX); pixelX < startX + width; pixelX++) {
      if (pixelX < 0 || pixelX >= frame.w || pixelY < 0 || pixelY >= frame.ph) continue;
      const pixel = pixelY * frame.w + pixelX;
      const cell = (pixelY >> 1) * frame.w + pixelX;
      frame.px[pixel] = null; frame.gl[pixel] = null; frame.br[cell] = 0; frame.ch[cell] = null;
    }
  }
}

function logo(frame, time, arrival, { x = LOGO_X, y = 12, effect = 'settle' } = {}) {
  const reveal = ease.out(seg(time, arrival, arrival + 0.9));
  if (!reveal) return;
  if (reveal > 0.97) erase(frame, x - 1, y, LOGO.w + 2, LOGO.h + 1);
  for (const [pixelX, pixelY] of LOGO.pts) {
    const across = pixelX / LOGO.w;
    let targetX = x + pixelX, targetY = y + pixelY;
    if (effect === 'spiral') {
      const angle = (1 - reveal) * 7;
      const offsetX = pixelX - LOGO.w / 2, offsetY = pixelY - LOGO.h / 2;
      const zoom = 1 + (1 - reveal) * 2.2;
      targetX = x + LOGO.w / 2 + (offsetX * Math.cos(angle) - offsetY * Math.sin(angle)) * zoom;
      targetY = y + LOGO.h / 2 + (offsetX * Math.sin(angle) * 0.5 + offsetY * Math.cos(angle)) * zoom;
    } else if (effect === 'refract') {
      if (across > reveal) continue;
      targetY += Math.sin(across * 9 + pixelY) * (1 - reveal) * 8;
    } else if (effect === 'cloud') {
      if (noise2(pixelX * 0.15, pixelY * 0.2, 8) > reveal) continue;
    } else {
      targetX += (across - 0.5) * (1 - reveal) * 55;
      targetY += (pixelY - 6) * (1 - reveal) * 3;
    }
    let color = mixc(WHITE, ramp(EMBER, across), seg(time, arrival + 0.35, arrival + 1.3));
    if (pixelY % 2) color = scale(color, 0.84);
    frame.pfront(targetX, targetY, color);
  }
}

function stars(frame, time, { count = 65, warp = 0, fade = 1, seed = 1 } = {}) {
  for (let index = 0; index < count; index++) {
    const angle = hash(index, seed) * TAU;
    const depth = (hash(index, seed + 1) + time * (0.015 + warp * 0.1)) % 1;
    const distance = 4 + depth * 62;
    const headX = 44 + Math.cos(angle) * distance, headY = 18 + Math.sin(angle) * distance * 0.52;
    const color = scale(index % 7 ? ICE : GOLD, fade * (0.24 + depth * 0.7));
    const length = Math.min(distance - 2, warp * (1 + depth * 14));
    if (length > 0.6) line(frame, headX, headY, headX - Math.cos(angle) * length, headY - Math.sin(angle) * length * 0.52, color);
    else frame.dot(headX * 2, headY * 2, color);
  }
}

function chrome(frame, number, name, stage, message, time, arrival) {
  erase(frame, 0, 0, WIDTH, 4); erase(frame, 0, 36, WIDTH, 8);
  frame.say(2, 0, 'TBLOCK / HYPERSPACE STUDIES', INK);
  frame.say(51, 0, `${String(number).padStart(2, '0')} / ${name.toUpperCase()}`, GOLD);
  frame.text(2, 1, '─'.repeat(84), scale(INK, 0.5));
  centre(frame, 18, stage, GOLD);
  if (time >= arrival) {
    frame.say(16, 19, 'planner / claude', FAMILY.claude);
    frame.say(37, 19, 'delegate / gpt', FAMILY.gpt);
    frame.say(56, 19, 'reviewer / gemini', FAMILY.gemini);
  } else centre(frame, 19, 'MULTIPLE MINDS. ONE TRAJECTORY.', INK);
  centre(frame, 21, message, INK);
}

function hyperlane(frame, time) {
  const launch = ease.in(seg(time, 1.9, 3));
  const settle = ease.out(seg(time, 3, 4));
  const nodes = [[14, 13], [42, 27], [73, 11]];
  stars(frame, time, { seed: 10, warp: launch * 3 * (1 - settle), fade: 0.6 });
  if (time < 3.15) {
    const projection = ([pointX, pointY]) => [73 + (pointX - 73) * (1 + launch * 8), 11 + (pointY - 11) * (1 + launch * 5)];
    for (let index = 0; index < 22; index++) {
      const [pointX, pointY] = projection([5 + hash(index, 101) * 78, 5 + hash(index, 102) * 28]);
      line(frame, pointX, pointY, pointX + (pointX - 73) * launch * 8, pointY + (pointY - 11) * launch * 8, scale(INK, 0.65));
      if (!launch) frame.put(pointX, Math.round(pointY / 2), '+', INK);
    }
    for (let index = 1; index < nodes.length; index++) {
      const from = projection(nodes[index - 1]), to = projection(nodes[index]);
      const progress = seg(time, 0.25 + (index - 1) * 0.55, 0.95 + (index - 1) * 0.55);
      line(frame, ...from, ...to, scale(FAMILIES[index - 1], 0.35));
      line(frame, ...from, lerp(from[0], to[0], progress), lerp(from[1], to[1], progress), GOLD);
      if (progress > 0 && progress < 1) frame.disk(lerp(from[0], to[0], progress), lerp(from[1], to[1], progress), 1, WHITE);
    }
    nodes.forEach((point, index) => {
      const [pointX, pointY] = projection(point);
      ellipse(frame, pointX, pointY, 2.6 + Math.sin(time * 5 + index) * 0.4, 1.7, FAMILIES[index]);
      frame.put(pointX, pointY / 2, index < time / 0.6 ? '◆' : '◇', FAMILIES[index]);
      if (launch < 0.08) frame.say(pointX - 4, Math.round(pointY / 2) + 2, (index + 1) + ' ' + roles[index], FAMILIES[index]);
    });
    const lock = seg(time, 1.5, 1.9);
    if (lock > 0) {
      ellipse(frame, 73, 11, 8 - lock * 4, 5 - lock * 2.7, GOLD);
      line(frame, 63, 11, 68, 11, GOLD); line(frame, 78, 11, 83, 11, GOLD);
    }
    centre(frame, 3, launch > 0.1 ? 'ROUTE GEOMETRY / STRETCHING' : 'NAV / PLOT THREE MINDS THROUGH THE SAME SKY');
  } else {
    ellipse(frame, 44, 18, 40, 13, scale(FAMILY.gemini, 0.6), Math.PI + 0.1, TAU - 0.1);
    for (let index = 0; index < 3; index++) {
      const pointX = 19 + index * 25;
      if (index < 2) line(frame, pointX + 2, 32, pointX + 23, 32, scale(GOLD, 0.55));
      frame.put(pointX, 16, '◆', FAMILIES[index]); frame.say(pointX - 3, 17, '0' + (index + 1), FAMILIES[index]);
    }
    centre(frame, 3, 'NAV / THREE LOCKS. ONE HYPERLANE.');
  }
  logo(frame, time, 3.05);
  chrome(frame, 1, 'hyperlane', time < 1.5 ? 'PLOTTING / planner → delegate → reviewer'
    : time < 1.95 ? 'ROUTE LOCK / ALL NODES ALIGNED'
      : time < 3.05 ? 'JUMP / THE MAP BECOMES THE MOTION' : 'ROUTE TRAVERSED / PARALLEL ROLES ONLINE',
  'A route is a promise. Execution is the jump.', time, 3.05);
}

function vortex(frame, time) {
  const acceleration = ease.in(seg(time, 0.3, 2.35));
  const collapse = ease.inOut(seg(time, 2.5, 3.5));
  const afterglow = seg(time, 3.6, 4.5);
  const rotation = time * 0.65 + time ** 3 * 0.13 * (1 - collapse);
  stars(frame, time, { count: 35, seed: 21, fade: 0.5 });
  for (let family = 0; family < 3; family++) {
    for (let strand = 0; strand < 3; strand++) {
      let previous;
      for (let index = 0; index <= 190; index++) {
        const depth = index / 190;
        const radius = (2 + depth ** 1.5 * 49) * (1 - collapse * (1 - afterglow * 0.75));
        const angle = family * TAU / 3 + strand * 0.075 + depth * (9 + acceleration * 8) - rotation;
        const point = [44 + Math.cos(angle) * radius, 18 + Math.sin(angle) * radius * 0.47];
        const color = scale(FAMILIES[family], (0.35 + depth * 0.65) * (1 - afterglow * 0.35));
        if (previous) line(frame, ...previous, ...point, color);
        previous = point;
        if (index % 19 === 0 && strand === 0) frame.padd(...point, WHITE, 0.5);
      }
    }
  }
  for (let index = 0; index < 7; index++) {
    const radius = ((index * 7 + time * (7 + acceleration * 23)) % 48) * (1 - collapse);
    ellipse(frame, 44, 18, radius, radius * 0.47, scale(FAMILIES[index % 3], 0.24));
  }
  if (time < 2.8) {
    ellipse(frame, 44, 18, 3, 1.5, WHITE); centre(frame, 3, 'THREE CURRENTS / ONE SINGULARITY');
    frame.say(5, 16, 'C / 01', FAMILY.claude); frame.say(38, 16, 'G / 02', FAMILY.gpt); frame.say(73, 16, 'G / 03', FAMILY.gemini);
  } else if (time > 3.8) {
    centre(frame, 3, 'BRAID COLLAPSED / COHERENCE ACHIEVED');
    ellipse(frame, 44, 18, 39, 12.6, scale(FAMILY.gpt, 0.75), 0.25, 2.3);
    ellipse(frame, 44, 18, 39, 12.6, scale(FAMILY.claude, 0.75), 2.4, 4.4);
    ellipse(frame, 44, 18, 39, 12.6, scale(FAMILY.gemini, 0.75), 4.5, 6.4);
  }
  logo(frame, time, 3.05, { effect: 'spiral' });
  chrome(frame, 2, 'vortex', time < 2.5 ? 'BRAIDING / claude × gpt × gemini'
    : time < 3.6 ? 'COLLAPSE / THREE CURRENTS BECOME ONE' : 'SINGULARITY STABLE / ROLES IN PARALLEL',
  'Different intelligences. The same centre of gravity.', time, 3.05);
}

function prism(frame, time) {
  const impact = ease.out(seg(time, 0.9, 1.6)), writing = seg(time, 1.6, 3.9);
  stars(frame, time, { seed: 31, count: 36, fade: 0.4 });
  for (let beam = 0; beam < 5; beam++) {
    const beamY = 15 + beam * 1.4, tip = lerp(-18, 17, seg(time, 0, 1));
    line(frame, tip - 26, beamY, tip, beamY, scale(WHITE, 0.5 + beam * 0.1));
    if (impact) line(frame, 0, beamY, 17, beamY, scale(WHITE, 0.6));
  }
  if (impact) {
    for (let band = 0; band < 7; band++) {
      const endY = 4 + band * 5, color = ramp(EMBER, band / 6), endX = lerp(19, 87, impact);
      line(frame, 18, 18, endX, lerp(18, endY, impact), scale(color, 0.7));
      line(frame, 19, 18.7, endX, lerp(18.7, endY + 0.9, impact), scale(color, 0.25));
    }
    const scanX = 22 + writing * LOGO.w;
    if (writing < 1) line(frame, scanX, 9, scanX, 27, WHITE);
    for (let index = 0; index < 25; index++) {
      const progress = (time * 0.7 + hash(index, 37)) % 1, endpoint = 6 + hash(index, 38) * 28;
      frame.padd(lerp(18, 87, progress), lerp(18, endpoint, progress), ramp(EMBER, index / 24), 0.8);
    }
  }
  const outline = impact ? mixc(ICE, GOLD, 0.35) : scale(ICE, 0.25);
  line(frame, 10, 5, 22, 18, outline); line(frame, 22, 18, 10, 32, outline); line(frame, 10, 32, 10, 5, outline);
  line(frame, 10, 5, 16, 26, scale(ICE, 0.32));
  if (impact && !frame.mono) frame.glowDisk(18, 18, 9, GOLD, 0.6);
  logo(frame, time, 2.6, { x: 22, effect: 'refract' });
  centre(frame, 3, time < 1 ? 'INCIDENT / UNRESOLVED WHITE LIGHT' : 'ONE SIGNAL / AN ENTIRE EMBER SPECTRUM');
  frame.say(3, 17, 'WHITE', ICE); frame.say(67, 17, 'R / O / G', GOLD);
  chrome(frame, 3, 'prism', time < 0.9 ? 'APPROACH / PHOTON FRONT'
    : time < 2.6 ? 'REFRACTION / DIFFERENCE BECOMES DIRECTION'
      : time < 3.8 ? 'SPECTRUM WRITING / TBLOCK' : 'SPECTRUM RESOLVED / ROLES DISPATCHED',
  'One command in. A spectrum of agents out.', time, 2.6);
}

function cloudContour(frame, time, layer, transit) {
  const zoom = 1 + transit * (0.7 + layer * 0.35), radius = (16 + layer * 10) * zoom;
  const strength = 0.35 + layer * 0.17;
  const palette = [[114, 78, 173], [233, 102, 157], [255, 122, 69]];
  for (let band = 0; band < 5; band++) {
    let previous;
    for (let index = 0; index <= 230; index++) {
      const angle = index / 230 * TAU;
      const curl = noise2(Math.cos(angle) * 3 + layer * 5, Math.sin(angle) * 3 + time * 0.12, 53);
      const wave = 1 + 0.13 * Math.sin(angle * 5 + layer + time * 0.3) + (curl - 0.5) * 0.45;
      const ring = (radius + band * 1.1) * wave;
      const point = [44 + Math.cos(angle) * ring, 18 + Math.sin(angle) * ring * 0.44];
      const color = scale(palette[layer], strength * (1 - band * 0.13));
      if (previous) line(frame, ...previous, ...point, color);
      if (band < 2 && index % 3 === 0 && !frame.mono) frame.glow(...point, color, 0.45);
      previous = point;
    }
  }
}

function nebula(frame, time) {
  const dive = seg(time, 0.5, 3.25), calm = seg(time, 3.3, 4.3);
  stars(frame, time, { seed: 51, count: 100, warp: Math.sin(dive * Math.PI) * 1.9, fade: 0.7 });
  for (let layer = 2; layer >= 0; layer--) {
    const cycle = (dive * 2.8 + layer * 0.32) % 1;
    cloudContour(frame, time, layer, lerp(cycle, 0.3, calm));
  }
  if (!frame.mono) frame.glowDisk(44, 18, 24, [164, 57, 75], 0.35 + calm * 0.2);
  for (let bolt = 0; bolt < 3; bolt++) {
    const flash = Math.max(0, 1 - Math.abs(time - (1 + bolt * 0.85)) / 0.16);
    if (!flash) continue;
    let previous = [6 + bolt * 29, 8];
    for (let index = 1; index < 9; index++) {
      const point = [previous[0] + (hash(index, bolt + 57) - 0.5) * 9, 8 + index * 2.7];
      line(frame, ...previous, ...point, scale(WHITE, flash));
      if (!frame.mono) frame.glowDisk(...point, 5, [244, 114, 182], flash * 0.6);
      previous = point;
    }
  }
  if (time > 3.1) {
    for (let index = 0; index < 6; index++) {
      const angle = index / 6 * TAU + 0.2, radius = 35 + Math.sin(time + index) * 2;
      frame.put(44 + Math.cos(angle) * radius, (18 + Math.sin(angle) * radius * 0.43) / 2, '✦', GOLD);
    }
  }
  logo(frame, time, 3.05, { effect: 'cloud' });
  centre(frame, 3, time < 3.1 ? 'NEBULA / DESCENT THROUGH THE UNKNOWN' : 'THE CORE / FOUND IN THE NOISE');
  frame.say(4, 16, calm > 0.5 ? 'CLEAR' : 'LAYER ' + Math.min(3, 1 + Math.floor(dive * 3)), ICE);
  frame.say(70, 16, 'CORE / 01', GOLD);
  chrome(frame, 4, 'nebula-dive', time < 3.05 ? 'DIVE / CLOUDS SHEAR PAST THE VIEWPORT'
    : time < 4 ? 'CONTACT / THE LOGO EMERGES FROM TURBULENCE' : 'CORE REACHED / SIGNAL ABOVE THE NOISE',
  'Past the noise. Into the work.', time, 3.05);
}

const DIGITS = { 3: [0, 1, 2, 3, 6], 2: [0, 1, 3, 4, 6], 1: [1, 2] };
const SEGMENTS = [
  [0, 0, 7, 0], [7, 0, 7, 5], [7, 5, 7, 10], [0, 10, 7, 10],
  [0, 5, 0, 10], [0, 0, 0, 5], [0, 5, 7, 5],
];

function reactor(frame, time) {
  const charge = seg(time, 0.15, 2.8), release = ease.out(seg(time, 2.8, 3.65));
  const settled = seg(time, 3.7, 4.7), rotation = time * 0.16 + charge ** 3 * 0.5;
  stars(frame, time, { seed: 70, count: 110, warp: Math.sin(release * Math.PI) * 5, fade: 0.7 });
  if (time < 3.7) {
    for (let index = 0; index < 36; index++) {
      const angle = index / 36 * TAU + rotation, active = index / 36 <= charge;
      const color = active ? ramp(EFFORT_RAMP, index / 35) : scale(INK, 0.4);
      const radiusX = 27 * (1 + release * 2), radiusY = 12.4 * (1 + release * 2);
      ellipse(frame, 44, 18, radiusX, radiusY, color, angle, angle + 0.12);
      line(frame, 44 + Math.cos(angle) * (radiusX - 2.5), 18 + Math.sin(angle) * (radiusY - 1.2),
        44 + Math.cos(angle) * radiusX, 18 + Math.sin(angle) * radiusY, color);
    }
    ellipse(frame, 44, 18, 22 * (1 + release * 2.5), 10 * (1 + release * 2.5), scale(ICE, 0.4));
    if (!release) {
      const digit = Math.max(1, 3 - Math.floor(time / 0.94));
      for (const segment of DIGITS[digit]) {
        const [startX, startY, endX, endY] = SEGMENTS[segment];
        frame.pline(40 + startX, 13 + startY, 40 + endX, 13 + endY, ramp(EFFORT_RAMP, charge));
      }
      frame.say(39, 13, 'IGNITION', ICE);
      for (let index = 0; index < 3; index++) {
        const angle = index * TAU / 3 - time * (0.6 + charge * 4), radius = 15 - charge * 8;
        frame.disk(44 + Math.cos(angle) * radius, 18 + Math.sin(angle) * radius * 0.5, 1, mixc(FAMILIES[index], WHITE, charge * 0.5));
      }
    }
  }
  if (release > 0) {
    ellipse(frame, 44, 18, 4 + release * 80, 2 + release * 35, scale(WHITE, 1 - release * 0.65));
    ellipse(frame, 44, 18, 3 + release * 69, 1 + release * 29, GOLD);
    if (settled < 1) line(frame, 44 - release * 44, 18, 44 + release * 44, 18, scale(GOLD, 1 - settled));
  }
  if (settled) {
    ellipse(frame, 44, 18, 38, 13, scale(EMBER[0], 0.6), 0.25, Math.PI - 0.25);
    ellipse(frame, 44, 18, 38, 13, scale(GOLD, 0.6), Math.PI + 0.25, TAU - 0.25);
  }
  logo(frame, time, 3.15);
  centre(frame, 3, time < 2.8 ? 'ANNULAR DRIVE / EFFORT BECOMES VELOCITY' : 'RELEASE / ALL SYSTEMS THROUGH THE THRESHOLD');
  frame.say(12, 16, 'EFFORT', INK);
  for (let index = 0; index < 35; index++) frame.put(22 + index, 16, index / 35 < charge ? '━' : '┄', ramp(EFFORT_RAMP, index / 34));
  frame.say(59, 16, charge < 1 ? String(Math.floor(charge * 100)).padStart(3) + ' / 100' : 'MAX / ONLINE', GOLD);
  centre(frame, 17, 'teal  →  blue  →  violet  →  pink  →  rose', INK);
  chrome(frame, 5, 'reactor-charge', time < 2.8 ? 'CHARGING / CONTAINMENT RING ENGAGED'
    : time < 3.7 ? 'IGNITION / SHOCK FRONT RELEASED' : 'DRIVE STABLE / PARALLEL EXECUTION',
  'Give the work the effort it deserves.', time, 3.15);
}

export const SCENES = [
  { name: 'hyperspace-hyperlane', title: 'The map becomes the jump', seconds: 5.2, draw: hyperlane },
  { name: 'hyperspace-vortex', title: 'Three currents, one singularity', seconds: 5.2, draw: vortex },
  { name: 'hyperspace-prism', title: 'One signal, a spectrum of agents', seconds: 5.2, draw: prism },
  { name: 'hyperspace-nebula-dive', title: 'A turbulent descent to the core', seconds: 5.4, draw: nebula },
  { name: 'hyperspace-reactor-charge', title: 'Effort becomes velocity', seconds: 5.4, draw: reactor },
];

export function frameFor(scene, time, { mode = 'true', width = WIDTH, height = HEIGHT } = {}) {
  const frame = new Frame(WIDTH, HEIGHT, mode === 'mono');
  scene.draw(frame, clamp(time, 0, scene.seconds));
  return render(frame, mode, Math.max(1, Math.min(width, WIDTH))).slice(0, Math.max(1, Math.min(height, HEIGHT)));
}
