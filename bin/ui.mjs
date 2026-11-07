// tblock's terminal look: one palette, one set of symbols, aligned columns, and plain text when piped,
// so agents reading the output get words instead of escape codes. Node built-ins only.
import { homedir } from 'node:os';

const EMBER = [[255, 77, 109], [255, 122, 69], [255, 196, 87]]; // rose, orange, gold
const ACCENT = [255, 112, 84];
const STATUS = { PASS: [74, 222, 128], WARN: [251, 191, 36], FAIL: [248, 113, 113], SKIP: null, NOTE: [251, 191, 36] };
const FAMILY = { claude: [222, 128, 96], gpt: [52, 211, 153], gemini: [96, 165, 250] };
const EFFORT_RAMP = [[94, 234, 212], [96, 165, 250], [167, 139, 250], [244, 114, 182], [255, 77, 109]];
const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

const ICON = { PASS: '✔', WARN: '▲', FAIL: '✖', SKIP: '○', NOTE: '▲' };
const WORD = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL', SKIP: 'SKIP', NOTE: 'note:' };

// Two rows of half blocks spell "tblock".
const LOGO = ['▀█▀ █▄▄ █   █▀█ █▀▀ █▄▀', ' █  █▄█ █▄▄ █▄█ █▄▄ █ █'];

const ANSI = /\x1b\[[0-9;]*m/g;
export const visible = (text) => String(text).replace(ANSI, '').length;

const mix = (stops, t) => {
  const at = Math.min(stops.length - 1.0001, Math.max(0, t) * (stops.length - 1));
  const [a, b] = [stops[Math.floor(at)], stops[Math.floor(at) + 1]];
  return a.map((v, i) => Math.round(v + (b[i] - v) * (at - Math.floor(at))));
};

export function createUI({ color, version, stream = process.stdout, env = process.env }) {
  const truecolor = /truecolor|24bit/i.test(env.COLORTERM || '') || 'WT_SESSION' in env || /vscode|iTerm|WezTerm|ghostty/i.test(env.TERM_PROGRAM || '');
  // Each style closes with its own off-code, not a full reset, so styles nest: a gradient stays bold.
  const sgr = (on, off, text) => (color ? `\x1b[${on}m${text}\x1b[${off}m` : String(text));
  const cube = (v) => Math.round((v / 255) * 5);
  const rgb = (c, text) => (!c || !color ? String(text)
    : sgr(truecolor ? `38;2;${c.join(';')}` : `38;5;${16 + 36 * cube(c[0]) + 6 * cube(c[1]) + cube(c[2])}`, 39, text));
  const bold = (t) => sgr(1, 22, t);
  const dim = (t) => sgr(2, 22, t);
  const accent = (t) => rgb(ACCENT, t);
  const gradient = (text, stops = EMBER, span = visible(text)) => (color ? [...text].map((ch, i) => (ch === ' ' ? ch : rgb(mix(stops, i / Math.max(1, span - 1)), ch))).join('') : text);
  const width = Math.min(stream.columns || 80, 92);
  const pad = (text, n) => `${text}${' '.repeat(Math.max(0, n - visible(text)))}`;
  // Home paths print as ~/…; Windows may report the home folder with either slash.
  const home = homedir().replace(/\\/g, '/').replace(/\/$/, '');
  const homeAt = new RegExp(`${home.replace(/[.*+?^${}()|[\]]/g, '\\$&').replace(/\//g, '[\\\\/]')}((?:[\\\\/][^\\s'"),;]*)?)`, process.platform === 'win32' ? 'gi' : 'g');
  const tildify = (text) => String(text).replace(homeAt, (_, rest) => `~${rest.replace(/\\/g, '/')}`);

  // Wraps plain text to the terminal, indenting every line after the first.
  const wrap = (text, indent) => {
    const room = Math.max(24, width - indent);
    const lines = [];
    let line = '';
    for (const word of String(text).split(' ')) {
      if (line && visible(line) + 1 + visible(word) > room) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
    return lines.join(`\n${' '.repeat(indent)}`);
  };

  const ui = {
    color, bold, dim, accent, pad, tildify, width,

    header(command) {
      if (!color) return `tblock ${version} · ${command}\n\n`;
      const left = `  ${bold(gradient('tblock'))} ${dim('›')} ${bold(command)}`;
      const right = dim(`v${version}`);
      return `\n${left}${' '.repeat(Math.max(2, width - visible(left) - visible(right) - 2))}${right}\n\n`;
    },

    logo(tagline) {
      if (!color) return `tblock ${version}\n${tagline}\n`;
      const span = LOGO[0].length;
      return ['', `  ${bold(gradient(LOGO[0], EMBER, span))}`, `  ${bold(gradient(LOGO[1], EMBER, span))}   ${dim(`v${version}`)}`, `  ${dim(tagline)}`, ''].join('\n');
    },

    section(title) {
      if (!color) return `${title}`;
      const label = ` ${title.toUpperCase()} `;
      return `  ${accent('▍')}${bold(label)}${dim('─'.repeat(Math.max(4, width - visible(label) - 5)))}`;
    },

    icon(level) {
      return color ? rgb(STATUS[level], ICON[level]) : WORD[level];
    },

    // One check or event: icon, bold label, then detail wrapped under itself.
    status(level, label, detail = '', labelWidth = visible(label) + 2) {
      const lead = color ? 5 : 7;
      // A skipped line is dim throughout, so its label isn't bold: bold and dim share an off-code.
      const skip = level === 'SKIP';
      const head = `  ${pad(this.icon(level), lead - 2)}${pad(color && !skip ? bold(label) : label, labelWidth)}`;
      const body = wrap(tildify(detail), lead + labelWidth);
      return skip ? dim(`${head}${body}`) : `${head}${body}`;
    },

    hint(text, indent = 2) {
      return `${' '.repeat(indent)}${color ? accent('→') : '->'} ${color ? bold(text) : text}`;
    },

    note(text) {
      return color ? `  ${rgb(STATUS.NOTE, ICON.NOTE)}  ${wrap(tildify(text), 5)}` : `  note: ${text}`;
    },

    done(label, detail = '') {
      return color ? `  ${rgb(STATUS.PASS, '✔')}  ${bold(label)}${detail ? `  ${dim(tildify(detail))}` : ''}` : `  ${label}${detail ? `  ${detail}` : ''}`;
    },

    // Changed files under a done line: one per line when few, one wrapped line when many.
    changes(sign, items) {
      if (!items.length) return [];
      const mark = color ? rgb(sign === '+' ? STATUS.PASS : STATUS.FAIL, sign === '+' ? '+' : '−') : sign;
      if (items.length <= 4) return items.map((item) => (color ? `     ${mark} ${dim(item)}` : `    ${sign} ${item}`));
      return [`${color ? '     ' : '    '}${mark} ${color ? dim(wrap(items.join(', '), 7)) : items.join(', ')}`];
    },

    // A model as a coloured family dot and its name; `session` means the chat's own model.
    model(id, family) {
      if (id === 'session') return color ? `${dim('◌')} ${dim('session')}` : 'session';
      return color ? `${rgb(FAMILY[family], '●')} ${id}` : id;
    },

    // Effort as a six-cell meter that warms from teal to rose.
    effort(level, { word = true } = {}) {
      if (!level) return color ? dim('default') : '';
      if (!color) return level;
      const filled = EFFORTS.indexOf(level);
      const cells = Array.from({ length: 6 }, (_, i) => (i < filled ? rgb(mix(EFFORT_RAMP, i / 5), '▰') : dim('▱'))).join('');
      return word ? `${cells} ${level}` : cells;
    },

    // Columns sized to their widest cell; a header row prints dim.
    table(rows, { head, indent = 2, gap = 3 } = {}) {
      const all = head ? [head, ...rows] : rows;
      const widths = all[0].map((_, c) => Math.max(...all.map((r) => visible(r[c] ?? ''))));
      const line = (r) => `${' '.repeat(indent)}${r.map((cell, c) => (c === r.length - 1 ? cell : pad(cell ?? '', widths[c] + gap))).join('')}`.trimEnd();
      return [...(head ? [color ? dim(line(head.map((h) => h.toUpperCase()))) : line(head)] : []), ...rows.map(line)].join('\n');
    },

    tally(counts) {
      const parts = [['PASS', 'passed'], ['WARN', counts.WARN === 1 ? 'warning' : 'warnings'], ['FAIL', 'failed'], ['SKIP', 'skipped']]
        .filter(([level]) => counts[level]).map(([level, word]) => (color ? `${rgb(STATUS[level], ICON[level])} ${bold(counts[level])} ${dim(word)}` : `${counts[level]} ${word}`));
      return color ? `  ${dim('─'.repeat(Math.min(48, width - 4)))}\n  ${parts.join('   ')}` : parts.join(', ');
    },

    error(message, stderrColor) {
      return stderrColor ? `  ${rgb(STATUS.FAIL, '✖')}  ${bold(rgb(STATUS.FAIL, 'tblock'))}  ${wrap(message, 13)}\n` : `tblock: ${message}`;
    },
  };
  return ui;
}
