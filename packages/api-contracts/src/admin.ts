import { z } from 'zod';

export const adminUserApprovalBodySchema = z.object({ approved: z.boolean() });
export type AdminUserApprovalBody = z.infer<typeof adminUserApprovalBodySchema>;

export const adminUserApprovalParamsSchema = z.object({ plexUserId: z.string() });
export type AdminUserApprovalParams = z.infer<typeof adminUserApprovalParamsSchema>;

export const plexFriendUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  thumb: z.string().optional(),
  hasServerAccess: z.boolean(),
  isApproved: z.boolean(),
});
export type PlexFriendUser = z.infer<typeof plexFriendUserSchema>;

export const adminUsersListResponseSchema = z.object({ users: z.array(plexFriendUserSchema) });
export type AdminUsersListResponse = z.infer<typeof adminUsersListResponseSchema>;

export const adminUserApprovalResponseSchema = z.object({
  success: z.boolean(),
  plexUserId: z.string(),
  approved: z.boolean(),
});
export type AdminUserApprovalResponse = z.infer<typeof adminUserApprovalResponseSchema>;
