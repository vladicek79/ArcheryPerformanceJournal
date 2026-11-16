// Renders the Ko-fi graphics (cover, avatar, gallery cards) to PNG with headless Chrome.
// Usage: node marketing/kofi/src/build.mjs
/* global console */
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = join(SRC, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TARGET = readFileSync(join(SRC, 'target.svg.txt'), 'utf8');

const page = (body, css = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="kofi.css"><style>${css}</style></head><body>${body}</body></html>`;

const card = (eyebrow, title, text, art) =>
  page(
    `<div class="card"><div class="art">${art}</div><div class="txt"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="muted">${text}</p></div></div>`,
    `.card{height:100%;display:flex;flex-direction:column;padding:64px 72px}
     .art{flex:1;display:flex;align-items:center;justify-content:center}
     .eyebrow{font-size:22px;margin-bottom:12px}
     h1{font-size:52px;line-height:1.1;letter-spacing:-0.02em;margin-bottom:14px}
     .txt .muted{font-size:24px;line-height:1.4}`,
  );

const ASSETS = {
  // 1500 x 500: content kept in the middle so a narrow crop still shows it
  cover: [
    1500,
    500,
    page(
      `<div class="wrap"><div><p class="eyebrow">Free training journal for archers</p>
        <h1>Archery Performance Journal</h1>
        <p class="tag">Train the whole archer.</p>
        <p class="pills"><span class="pill">Score</span><span class="pill">Mind</span><span class="pill">SPT</span><span class="pill">Live scan</span></p></div>
        <svg viewBox="-110 -110 220 220" width="330" height="330">${TARGET}</svg></div>`,
      `.wrap{height:100%;display:flex;align-items:center;justify-content:center;gap:90px}
       .eyebrow{font-size:20px;margin-bottom:14px}
       h1{font-size:60px;letter-spacing:-0.02em;line-height:1.05;max-width:720px}
       .tag{font-size:30px;color:var(--ink-soft);margin:14px 0 26px}
       .pills{display:flex;gap:12px;font-size:20px}`,
    ),
  ],
  avatar: [
    800,
    800,
    page(
      `<svg viewBox="-110 -110 220 220" width="800" height="800"><rect x="-110" y="-110" width="220" height="220" fill="#14181c"/><circle r="100" fill="#ffffff"/><circle r="80" fill="#1a1a1a"/><circle r="60" fill="#00a6d6"/><circle r="40" fill="#ee4049"/><circle r="20" fill="#ffe14d"/><circle r="5" fill="none" stroke="#c9a800" stroke-width="1"/></svg>`,
      'body{background:#14181c}',
    ),
  ],
  'gallery-1-scan': [
    1200,
    900,
    card(
      'See',
      'Your phone reads your arrows. Live.',
      'Point the camera at the target and the score appears next to each hit. Nothing is recorded.',
      `<svg viewBox="-115 -110 230 220" width="470" height="450">${TARGET}</svg>`,
    ),
  ],
  'gallery-2-mind': [
    1200,
    900,
    card(
      'Mind',
      'Grade the shot, not just the score.',
      'Grade every arrow 1–5 on mental program and shooting cycle, and see what a lost routine costs you.',
      `<svg viewBox="0 0 300 200" width="720" height="480">
        <line x1="20" y1="170" x2="290" y2="170" stroke="#2a3238"/>
        <rect x="30" y="46" width="40" height="124" fill="#0b6e4f"/><rect x="85" y="58" width="40" height="112" fill="#7cc29a"/>
        <rect x="140" y="80" width="40" height="90" fill="#f2d65c"/><rect x="195" y="96" width="40" height="74" fill="#f2994a"/>
        <rect x="250" y="118" width="40" height="52" fill="#b3261e"/>
        <g fill="#eef1f3" font-family="Inter" font-weight="700" font-size="13" text-anchor="middle">
          <text x="50" y="40">9.4</text><text x="105" y="52">9.1</text><text x="160" y="74">8.7</text><text x="215" y="90">8.4</text><text x="270" y="112">7.9</text></g>
        <g fill="#a3adb5" font-family="Inter" font-weight="600" font-size="12" text-anchor="middle">
          <text x="50" y="188">M1</text><text x="105" y="188">M2</text><text x="160" y="188">M3</text><text x="215" y="188">M4</text><text x="270" y="188">M5</text></g>
        <text x="20" y="14" fill="#a3adb5" font-family="Inter" font-size="11">Avg arrow by mental grade · example data</text>
      </svg>`,
    ),
  ],
  'gallery-3-spt': [
    1200,
    900,
    card(
      'Body',
      'A built-in SPT timer for holds.',
      'Hold, rest, reps and sets, counted for you, and logged in the same journal as your scores.',
      `<svg viewBox="0 0 200 200" width="440" height="440">
        <circle cx="100" cy="100" r="80" fill="none" stroke="#222a30" stroke-width="12"/>
        <circle cx="100" cy="100" r="80" fill="none" stroke="#4fd1a1" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="70 100" transform="rotate(-90 100 100)"/>
        <text x="100" y="86" fill="#4fd1a1" font-family="Inter" font-weight="700" font-size="14" letter-spacing="2" text-anchor="middle">HOLD</text>
        <text x="100" y="124" fill="#eef1f3" font-family="Inter" font-weight="700" font-size="40" text-anchor="middle">0:07</text>
        <text x="100" y="148" fill="#a3adb5" font-family="Inter" font-weight="500" font-size="11" text-anchor="middle">Set 2 / 3 · Rep 4 / 6</text>
      </svg>`,
    ),
  ],
  'gallery-4-score': [
    1200,
    900,
    card(
      'Score',
      'Every arrow, in three taps.',
      'Touch the face or tap a key, then grade it. Gear, sight marks and notes are kept with each session.',
      `<div class="keys">${[
        ['X', '#ffe14d', '#14181b'],
        ['10', '#ffe14d', '#14181b'],
        ['9', '#ffe14d', '#14181b'],
        ['8', '#ee4049', '#fff'],
        ['7', '#ee4049', '#fff'],
        ['6', '#00a6d6', '#fff'],
        ['M', '#d7d9db', '#14181b'],
      ]
        .map(([k, bg, fg]) => `<span style="background:${bg};color:${fg}">${k}</span>`)
        .join('')}</div>`,
    ).replace(
      '</style>',
      '.keys{display:grid;grid-template-columns:repeat(4,130px);gap:22px}.keys span{height:130px;border-radius:22px;display:grid;place-items:center;font-size:48px;font-weight:700}</style>',
    ),
  ],
};

const profile = mkdtempSync(join(tmpdir(), 'kofi-chrome-'));
try {
  for (const [name, [w, h, html]] of Object.entries(ASSETS)) {
    const file = join(SRC, `${name}.html`);
    writeFileSync(file, html);
    execFileSync(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      `--user-data-dir=${profile}`,
      `--window-size=${w},${h}`,
      '--virtual-time-budget=2000',
      `--screenshot=${join(OUT, `${name}.png`)}`,
      pathToFileURL(file).href,
    ], { stdio: 'ignore' });
    console.log(`${name}.png ${w}x${h}`);
  }
} finally {
  rmSync(profile, { recursive: true, force: true });
}
