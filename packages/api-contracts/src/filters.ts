import { z } from 'zod';

export const filtersSchema = z.object({
  genres: z.array(z.string()).default([]),
  yearRange: z
    .object({ start: z.number().optional(), end: z.number().optional() })
    .nullable()
    .default(null),
  contentRatings: z.array(z.string()).default([]),
  studios: z.array(z.string()).default([]),
  ratingRange: z
    .object({ min: z.number().optional(), max: z.number().optional() })
    .nullable()
    .default(null),
  ratingFilter: z.string().nullable().default(null),
  unwatchedOnly: z.boolean().default(false),
  collections: z.array(z.string()).default([]),
});
export type Filters = z.infer<typeof filtersSchema>;

export const DEFAULT_FILTERS: Filters = filtersSchema.parse({});

export const filterBreakdownSchema = z.object({
  filterName: z.string(),
  label: z.string(),
  beforeCount: z.number(),
  afterCount: z.number(),
  itemsRemoved: z.number(),
  causedEmpty: z.boolean(),
});
export type FilterBreakdown = z.infer<typeof filterBreakdownSchema>;

export const dataStatsSchema = z.object({
  itemsWithRating: z.number(),
  itemsWithContentRating: z.number(),
  itemsWithStudio: z.number(),
  itemsWithYear: z.number(),
  itemsWithGenres: z.number(),
});
export type DataStats = z.infer<typeof dataStatsSchema>;

export const EMPTY_DATA_STATS: DataStats = {
  itemsWithRating: 0,
  itemsWithContentRating: 0,
  itemsWithStudio: 0,
  itemsWithYear: 0,
  itemsWithGenres: 0,
};

export const poolCountResultSchema = z.object({
  totalItems: z.number(),
  matchingItems: z.number(),
  filterBreakdown: z.array(filterBreakdownSchema),
  emptyReason: z.string().nullable(),
  dataStats: dataStatsSchema,
  overseerrWarning: z.string().nullable().optional(),
});
export type PoolCountResult = z.infer<typeof poolCountResultSchema>;
