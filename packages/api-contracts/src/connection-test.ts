import { z } from 'zod';

export const connectionTestBodySchema = z.object({
  url: z.string().min(1, 'URL and API key are required'),
  apiKey: z.string().min(1, 'URL and API key are required'),
});
export type ConnectionTestBody = z.infer<typeof connectionTestBodySchema>;
