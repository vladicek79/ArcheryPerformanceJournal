import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTokensCss, OUT } from '../scripts/apl-tokens.mjs';

const tokens = JSON.parse(readFileSync(new URL('../design/apl/tokens.json', import.meta.url), 'utf8'));

describe('APL tokens', () => {
  it('public/css/apl-tokens.css is generated from design/apl/tokens.json (run npm run tokens)', () => {
    expect(readFileSync(OUT, 'utf8')).toBe(buildTokensCss());
  });

  it('keeps every design-system token under its own name', () => {
    const css = buildTokensCss();
    const names = [...tokens.color.tokens, ...tokens.spacing.tokens, ...tokens.radius.tokens].map(
      (t) => t.name,
    );
    for (const name of names) expect(css).toMatch(new RegExp(`--${name}: `));
    expect(css).toContain('--space-5: 16px;');
    expect(css).toContain('--accent: #0b7a55;');
  });

  it('makes dark the default and gives the light theme its own values', () => {
    const css = buildTokensCss();
    const [root, rest] = css.split(":root[data-theme='light'] {");
    // dark in :root
    expect(root).toContain('--ground: #0b0e10;');
    expect(root).toContain('--accent-bright: #4fd1a1;');
    expect(root).toContain('color-scheme: dark;');
    // light when chosen in Settings, and when the device is light and Settings says System
    const light = rest.split('}')[0];
    expect(light).toContain('--ground: #f3f4f2;');
    expect(light).toContain('--accent-bright: #086646;');
    expect(light).toContain('--danger: #c62828;');
    expect(light).toContain('color-scheme: light;');
    expect(css).toMatch(
      /@media \(prefers-color-scheme: light\) \{\n {2}:root:not\(\[data-theme\]\) \{\n {4}--ground: #f3f4f2;/,
    );
    // every themed design-system token has a light value; target-* stay the same in both themes
    for (const t of tokens.color.tokens) {
      if (typeof t.value === 'object') expect(light).toContain(`--${t.name}: ${t.value.light};`);
      else expect(light).not.toContain(`--${t.name}:`);
    }
    expect(light).not.toContain('--target-');
  });

  it('turns each text style into a font shorthand', () => {
    const css = buildTokensCss();
    expect(css).toContain('--type-screen-title: 700 20px/26px var(--font-sans);');
    expect(css).toContain('--type-label-tracking: 0.06em;');
  });
});
