import { describe, it, expect, beforeEach } from 'vitest';
import { buildLetterboxdStreams } from '../../../../src/modules/stremio/meta.service.js';
import {
  filmLookupCache,
  userRatingCache,
  imdbToLetterboxdCache,
} from '../../../../src/lib/cache.js';
import type { LetterboxdFilm, AuthenticatedClient } from '../../../../src/modules/letterboxd/letterboxd.client.js';

const IMDB_ID = 'tt1234567';
const USER_ID = 'user-abc';
const LB_FILM_ID = 'lbfilm123';

function seedCaches(): void {
  const film: LetterboxdFilm = {
    type: 'film',
    id: LB_FILM_ID,
    name: 'Test Film',
    releaseYear: 2024,
    links: [{ type: 'letterboxd', id: LB_FILM_ID, url: `https://letterboxd.com/film/${LB_FILM_ID}/` }],
  } as unknown as LetterboxdFilm;

  filmLookupCache.set(IMDB_ID, { letterboxdFilmId: LB_FILM_ID, film });

  userRatingCache.set(`rating:${USER_ID}:${LB_FILM_ID}`, {
    filmId: LB_FILM_ID,
    userRating: 4.0,
    watched: true,
    liked: true,
    inWatchlist: false,
    communityRating: 3.8,
    communityRatings: 12345,
  });
}

// Client never gets called because everything is cached
const fakeClient = {} as AuthenticatedClient;

describe('buildLetterboxdStreams — showRatings gate', () => {
  beforeEach(() => {
    filmLookupCache.clear();
    userRatingCache.clear();
    imdbToLetterboxdCache.clear();
    seedCaches();
  });

  it('omits the rating/info stream when showRatings=false', async () => {
    const streams = await buildLetterboxdStreams(fakeClient, IMDB_ID, USER_ID, true, false);

    // The info stream is the one whose name === 'Letterboxd'
    const infoStream = streams.find(s => s.name === 'Letterboxd');
    expect(infoStream).toBeUndefined();

    // Action streams should still be present (showActions=true)
    expect(streams.length).toBeGreaterThan(0);
    expect(streams.some(s => s.name.includes('Watchlist') || s.name.includes('Watched') || s.name.includes('Like') || s.name.startsWith('★'))).toBe(true);
  });

  it('includes the rating/info stream when showRatings=true', async () => {
    const streams = await buildLetterboxdStreams(fakeClient, IMDB_ID, USER_ID, true, true);

    const infoStream = streams.find(s => s.name === 'Letterboxd');
    expect(infoStream).toBeDefined();
    expect(infoStream?.description).toContain('3.8/5');
  });

  it('defaults showRatings to true when omitted (backwards compatible)', async () => {
    const streams = await buildLetterboxdStreams(fakeClient, IMDB_ID, USER_ID, true);

    expect(streams.find(s => s.name === 'Letterboxd')).toBeDefined();
  });

  it('returns empty array when both showActions=false and showRatings=false', async () => {
    const streams = await buildLetterboxdStreams(fakeClient, IMDB_ID, USER_ID, false, false);

    expect(streams.find(s => s.name === 'Letterboxd')).toBeUndefined();
    expect(streams.length).toBe(0);
  });
});
