// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { supportCard } from '../public/js/app/views/settings.js';
import { supportRow } from '../public/js/app/views/dashboard.js';

describe('Settings support card', () => {
  it('is left out when no support link is set', () => {
    expect(supportCard('')).toBeNull();
  });

  it('links to the tip page in a new tab, without passing on the app as referrer', () => {
    const node = supportCard('https://ko-fi.com/example');
    const link = node.querySelector('a.support-link');
    expect(link.getAttribute('href')).toBe('https://ko-fi.com/example');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.textContent).toContain('Buy me a coffee');
    expect(node.textContent).toContain('Support the journal');
  });

  it('shows the QR code of the support page when there is one', () => {
    const img = supportCard('https://ko-fi.com/example', './icons/qr.svg').querySelector('.support-qr img');
    expect(img.getAttribute('src')).toBe('./icons/qr.svg');
    expect(img.alt).toBeTruthy();
    expect(supportCard('https://ko-fi.com/example', '').querySelector('.support-qr')).toBeNull();
  });
});

describe('Dashboard support row', () => {
  it('opens the tip page in a new tab, and is left out without a link', () => {
    const link = supportRow('https://ko-fi.com/example').querySelector('a');
    expect(link.getAttribute('href')).toBe('https://ko-fi.com/example');
    expect(link.target).toBe('_blank');
    expect(link.textContent).toContain('Buy me a coffee');
    expect(supportRow('')).toBeNull();
  });
});
