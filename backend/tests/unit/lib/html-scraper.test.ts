import { describe, it, expect } from 'vitest';
import { extractBoxdShortlinkId, extractListIdFromListPage } from '../../../src/lib/html-scraper.js';

describe('extractBoxdShortlinkId', () => {
  it('extracts ID from https shortlink', () => {
    const html = '<html><a href="https://boxd.it/abc123">link</a></html>';
    expect(extractBoxdShortlinkId(html)).toBe('abc123');
  });

  it('extracts ID from http shortlink', () => {
    const html = '<html><a href="http://boxd.it/XyZ9"></a></html>';
    expect(extractBoxdShortlinkId(html)).toBe('XyZ9');
  });

  it('returns null when no shortlink present', () => {
    const html = '<html><body>no links here</body></html>';
    expect(extractBoxdShortlinkId(html)).toBeNull();
  });

  it('returns first match when multiple shortlinks exist', () => {
    const html = 'https://boxd.it/first and https://boxd.it/second';
    expect(extractBoxdShortlinkId(html)).toBe('first');
  });
});

describe('extractListIdFromListPage', () => {
  it('extracts from rel="shortlink" link tag (standard order)', () => {
    const html = '<link rel="shortlink" href="https://boxd.it/listABC">';
    expect(extractListIdFromListPage(html)).toBe('listABC');
  });

  it('extracts from rel="shortlink" link tag (reversed attribute order)', () => {
    const html = '<link href="https://boxd.it/rev42" rel="shortlink">';
    expect(extractListIdFromListPage(html)).toBe('rev42');
  });

  it('extracts from data-likeable-identifier JSON', () => {
    const encoded = '{"type":"list","lid":"myListId"}'
      .replace(/"/g, '&#034;');
    const html = `<span data-likeable-identifier='${encoded}'></span>`;
    expect(extractListIdFromListPage(html)).toBe('myListId');
  });

  it('extracts from data-likeable-identifier with &quot; encoding', () => {
    const encoded = '{"type":"list","lid":"quotId"}'
      .replace(/"/g, '&quot;');
    const html = `<span data-likeable-identifier='${encoded}'></span>`;
    expect(extractListIdFromListPage(html)).toBe('quotId');
  });

  it('ignores data-likeable-identifier with wrong type', () => {
    const encoded = '{"type":"film","lid":"nope"}'.replace(/"/g, '&#034;');
    const html = `<span data-likeable-identifier='${encoded}'></span>`;
    expect(extractListIdFromListPage(html)).toBeNull();
  });

  it('returns null for empty HTML', () => {
    expect(extractListIdFromListPage('')).toBeNull();
  });

  it('returns null for invalid JSON in data-likeable-identifier', () => {
    const html = `<span data-likeable-identifier='not-json'></span>`;
    expect(extractListIdFromListPage(html)).toBeNull();
  });

  it('prefers shortlink tag over data-likeable-identifier', () => {
    const encoded = '{"type":"list","lid":"fromLikeable"}'.replace(/"/g, '&#034;');
    const html = `
      <link rel="shortlink" href="https://boxd.it/fromTag">
      <span data-likeable-identifier='${encoded}'></span>
    `;
    expect(extractListIdFromListPage(html)).toBe('fromTag');
  });

  // Letterboxd removed <link rel="shortlink"> and data-likeable-identifier
  // from list pages around 2026-09, replacing them with the ListSidebar
  // widget's data-list-identifier / data-list-boxdit-url attributes (#135).
  describe('current markup (2026-09): ListSidebar widget', () => {
    it('extracts from data-list-identifier JSON', () => {
      const encoded = '{"lid":"3ZVxm","uid":"filmlist:5908819","type":"list","typeName":"list"}'
        .replace(/"/g, '&#034;');
      const html = `<section data-component-class="ListSidebar" data-list-identifier='${encoded}'></section>`;
      expect(extractListIdFromListPage(html)).toBe('3ZVxm');
    });

    it('extracts from data-list-boxdit-url when data-list-identifier is absent', () => {
      const html = '<section data-list-name="Some List" data-list-boxdit-url="https://boxd.it/5IwDy"></section>';
      expect(extractListIdFromListPage(html)).toBe('5IwDy');
    });

    it('reproduces the real ListSidebar markup for the #135 lists', () => {
      // Trimmed snippet of the actual markup fetched from
      // letterboxd.com/official/list/top-250-films-by-women-directors/
      const html = `
        <section id="userpanel" class="actions-panel react-component"
          data-component-class="ListSidebar"
          data-list-identifier='{&#034;lid&#034;:&#034;3ZVxm&#034;,&#034;uid&#034;:&#034;filmlist:5908819&#034;,&#034;type&#034;:&#034;list&#034;,&#034;typeName&#034;:&#034;list&#034;}'
          data-list-name="Top 250 Films by Women Directors"
          data-list-boxdit-url="https://boxd.it/3ZVxm"
          data-owner="official">
        </section>
      `;
      expect(extractListIdFromListPage(html)).toBe('3ZVxm');
    });

    it('ignores data-list-identifier with wrong type', () => {
      const encoded = '{"type":"film","lid":"nope"}'.replace(/"/g, '&#034;');
      const html = `<section data-list-identifier='${encoded}'></section>`;
      expect(extractListIdFromListPage(html)).toBeNull();
    });

    it('prefers data-list-identifier over data-list-boxdit-url', () => {
      const encoded = '{"type":"list","lid":"fromIdentifier"}'.replace(/"/g, '&#034;');
      const html = `
        <section data-list-identifier='${encoded}' data-list-boxdit-url="https://boxd.it/fromBoxdit"></section>
      `;
      expect(extractListIdFromListPage(html)).toBe('fromIdentifier');
    });

    it('prefers shortlink tag over data-list-identifier', () => {
      const encoded = '{"type":"list","lid":"fromIdentifier"}'.replace(/"/g, '&#034;');
      const html = `
        <link rel="shortlink" href="https://boxd.it/fromTag">
        <section data-list-identifier='${encoded}'></section>
      `;
      expect(extractListIdFromListPage(html)).toBe('fromTag');
    });

    it('falls back to legacy data-likeable-identifier when neither current attribute is present', () => {
      const encoded = '{"type":"list","lid":"legacyId"}'.replace(/"/g, '&#034;');
      const html = `<span data-likeable-identifier='${encoded}'></span>`;
      expect(extractListIdFromListPage(html)).toBe('legacyId');
    });
  });
});
