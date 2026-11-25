import { z } from 'zod';
import type { Filters } from '@/types/filters';

/** Shared zod contract for selection requests (random pick and pool count). */
export const filtersSchema = z
  .object({
    genres: z.array(z.string()).optional(),
    contentRatings: z.array(z.string()).optional(),
    studios: z.array(z.string()).optional(),
    collections: z.array(z.string()).optional(),
    unwatchedOnly: z.boolean().optional(),
    ratingFilter: z.string().nullable().optional(),
    yearRange: z
      .object({ start: z.number().optional(), end: z.number().optional() })
      .nullable()
      .optional(),
    ratingRange: z
      .object({ min: z.number().optional(), max: z.number().optional() })
      .nullable()
      .optional(),
  })
  .nullable()
  .optional()
  // Fields left out of the request stay undefined; callers treat a partial Filters
  // the same way the legacy parser did.
  .transform((value): Filters => (value ?? {}) as Filters);

export const selectionRequestBody = z.object({
  libraryIds: z.array(z.string().min(1)),
  mediaType: z.enum(['movie', 'show']).default('movie'),
  filters: filtersSchema,
  tvSelectionMode: z.enum(['show', 'episode']).optional(),
});
