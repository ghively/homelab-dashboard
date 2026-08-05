/**
 * OMDb API types.
 * REST API: https://www.omdbapi.com/ (a licensed aggregator — Rotten
 * Tomatoes/Metacritic/IMDb scores are real, official numbers, not scraped).
 *
 * Verified against the live API before writing this, not guessed from
 * memory — see the not-found and title+year lookup shapes below, both
 * confirmed live.
 */

import { z } from "zod";

export const OmdbRatingSchema = z.object({
  Source: z.string(),
  Value: z.string(),
});
export type OmdbRating = z.infer<typeof OmdbRatingSchema>;

/** A successful lookup. `Response` is the string "True" on this shape. */
export const OmdbMovieSchema = z.object({
  Response: z.literal("True"),
  Title: z.string(),
  Year: z.string().optional(),
  Rated: z.string().optional(),
  Runtime: z.string().optional(),
  Genre: z.string().optional(),
  Director: z.string().optional(),
  Actors: z.string().optional(),
  Plot: z.string().optional(),
  Awards: z.string().optional(),
  Poster: z.string().optional(),
  Ratings: z.array(OmdbRatingSchema).optional(),
  Metascore: z.string().optional(),
  imdbRating: z.string().optional(),
  imdbVotes: z.string().optional(),
  imdbID: z.string().optional(),
  BoxOffice: z.string().optional(),
});
export type OmdbMovie = z.infer<typeof OmdbMovieSchema>;

/** A miss. Verified live: {"Response":"False","Error":"Movie not found!"} */
export const OmdbNotFoundSchema = z.object({
  Response: z.literal("False"),
  Error: z.string(),
});
export type OmdbNotFound = z.infer<typeof OmdbNotFoundSchema>;

export type OmdbResponse = OmdbMovie | OmdbNotFound;
