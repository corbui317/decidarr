import { z } from 'zod';

export const adminUserApprovalBodySchema = z.object({ approved: z.boolean() });
export type AdminUserApprovalBody = z.infer<typeof adminUserApprovalBodySchema>;

export const adminUserApprovalParamsSchema = z.object({ plexUserId: z.string() });
export type AdminUserApprovalParams = z.infer<typeof adminUserApprovalParamsSchema>;
