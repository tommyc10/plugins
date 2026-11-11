import { writeFileSync } from 'node:fs';
import { SCENES, frameFor } from './scenes.mjs';

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function ansiToHtml(text) {
  let foreground = '#c3c9d3', background = 'transparent', bold = false;
  let cursor = 0, html = '';
  const append = value => {
    if (!value) return;
    html += '<span style="color:' + foreground + ';background:' + background + ';font-weight:' + (bold ? 700 : 400) + '">' + escape(value) + '</span>';
  };
  for (const match of text.matchAll(/\x1b\[([0-9;]*)m/g)) {
    append(text.slice(cursor, match.index));
    const values = match[1].split(';').map(Number);
    for (let index = 0; index < values.length; index++) {
      const code = values[index];
      if (code === 0) { foreground = '#c3c9d3'; background = 'transparent'; bold = false; }
      else if (code === 1) bold = true;
      else if (code === 22) bold = false;
      else if (code === 39) foreground = '#c3c9d3';
      else if (code === 49) background = 'transparent';
      else if ((code === 38 || code === 48) && values[index + 1] === 2) {
        const color = 'rgb(' + values.slice(index + 2, index + 5).join(',') + ')';
        if (code === 38) foreground = color; else background = color;
        index += 4;
      }
    }
    cursor = match.index + match[0].length;
  }
  append(text.slice(cursor));
  return html;
}

const actionTimes = [1.65, 2.2, 2.05, 1.85, 2.5];
const descriptions = [
  'Plot three role nodes, acquire a lock, then stretch the star map itself into the jump.',
  'Three model-family currents braid into an accelerating corkscrew and implode into the wordmark.',
  'An incident white beam strikes a wireframe prism; ember refraction writes the logo.',
  'Turbulent cloud shells rush past at different depths, lightning reveals the glowing core.',
  'A segmented annular drive counts down, climbs the effort spectrum, then releases a shock front.',
];
const snapshots = SCENES.map((scene, index) => {
  const times = [actionTimes[index], 3.45, scene.seconds];
  return {
    name: scene.name, title: scene.title, description: descriptions[index],
    color: times.map(time => ansiToHtml(frameFor(scene, time).join('\n'))),
    mono: times.map(time => escape(frameFor(scene, time, { mode: 'mono' }).join('\n'))),
  };
});

const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>tblock / five hyperspace studies</title><style>'
  + ':root{color-scheme:dark;font-family:system-ui,sans-serif;background:#090b11;color:#eceef5}*{box-sizing:border-box}'
  + 'body{max-width:1440px;margin:0 auto;padding:40px 24px}header{max-width:850px;margin-bottom:28px}.eyebrow{letter-spacing:.2em;color:#ffc457;font-size:11px}'
  + 'h1{font-size:clamp(28px,5vw,56px);font-weight:650;letter-spacing:-.055em;margin:12px 0}p{color:#939cab;line-height:1.6}'
  + 'nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}button{border:1px solid #333c4a;border-radius:7px;background:#131924;color:#bdc7d5;padding:9px 14px;cursor:pointer}'
  + 'button[aria-pressed=true]{background:#ff7a45;color:#170b05;border-color:#ff7a45}button:focus-visible{outline:2px solid #ffc457;outline-offset:4px}'
  + 'main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{min-width:0;border:1px solid #29313e;border-radius:12px;overflow:hidden;background:#0c1018}'
  + '.label{padding:18px 20px 0;display:flex;justify-content:space-between;align-items:center;gap:16px}.label b{font-size:18px;font-weight:600}.number{color:#ff7a45;font:12px monospace}'
  + 'article p{font-size:12px;margin:8px 20px 18px;min-height:38px}pre{margin:0;padding:18px 10px;background:#07090e;overflow:auto;line-height:1.25;font-family:"Cascadia Mono","DejaVu Sans Mono",Consolas,monospace;font-size:clamp(5px,.76vw,10.5px);font-variant-ligatures:none}'
  + 'footer{margin-top:28px;color:#8993a3;font-size:12px}code{font-family:monospace;color:#ffc457}@media(max-width:1000px){main{grid-template-columns:1fr}pre{font-size:clamp(5px,1.19vw,11px)}}'
  + '</style></head><body><header><div class="eyebrow">ART SOL / ORIGINAL TERMINAL STUDIES</div><h1>Five ways to leave ordinary space.</h1>'
  + '<p>Not five recolours. Five different motion grammars for the same launch: navigation, torsion, refraction, turbulence, ignition. These are exact terminal frames, not redrawn mockups.</p></header>'
  + '<nav aria-label="Storyboard phase"><button data-phase="0" aria-pressed="false">01 / Signature moment</button><button data-phase="1" aria-pressed="false">02 / Logo arrival</button><button data-phase="2" aria-pressed="true">03 / Final frame</button><button id="mono" aria-pressed="false">Monochrome</button></nav>'
  + '<main id="gallery"></main><footer>88 columns × 22 rows · 40 fps default · truecolor / 256-color / NO_COLOR · original geometry, no franchise imagery.<br><br>Run all five: <code>node prototypes/art-sol/hyperspace/showcase.mjs</code></footer>'
  + '<script>const data=' + JSON.stringify(snapshots).replaceAll('<', '\u003c') + ';let phase=2,mono=false;const gallery=document.getElementById("gallery");'
  + 'function draw(){gallery.innerHTML=data.map((scene,index)=>\'<article><div class="label"><b>\'+scene.name.replace("hyperspace-","")+\'</b><span class="number">0\'+(index+1)+\' / 05</span></div><p>\'+scene.description+\'</p><pre aria-label="\'+scene.name+\' terminal frame">\'+scene[mono?"mono":"color"][phase]+\'</pre></article>\').join("")}'
  + 'document.querySelectorAll("[data-phase]").forEach(button=>button.onclick=()=>{phase=Number(button.dataset.phase);document.querySelectorAll("[data-phase]").forEach(other=>other.setAttribute("aria-pressed",String(other===button)));draw()});'
  + 'document.getElementById("mono").onclick=event=>{mono=!mono;event.currentTarget.setAttribute("aria-pressed",String(mono));draw()};draw();</script></body></html>';

writeFileSync(new URL('./gallery.html', import.meta.url), html);
console.log('Created prototypes/art-sol/hyperspace/gallery.html');
