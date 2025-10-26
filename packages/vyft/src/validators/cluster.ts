import { z } from 'zod';

export const ClusterTypeSchema = z.enum(['kubernetes']);

export const ClusterNameSchema = z
  .string()
  .min(1, 'Cluster name is required')
  .max(50, 'Cluster name must be less than 50 characters')
  .regex(
    /^[a-zA-Z0-9-_]+$/,
    'Cluster name can only contain letters, numbers, hyphens, and underscores',
  );

export const ClusterRegionsSchema = z
  .array(z.string().min(1, 'Region is required'))
  .min(1, 'At least one region is required');

export const ClusterSizeSchema = z.enum(['single', 'ha']);

export const ClusterCreateSchema = z.object({
  name: ClusterNameSchema,
  type: ClusterTypeSchema,
  regions: ClusterRegionsSchema,
  size: ClusterSizeSchema,
  providerId: z.string().uuid('Invalid provider ID format'),
});

export const ClusterIdSchema = z.string().uuid('Invalid cluster ID format');

export const ClusterUpdateSchema = z.object({
  id: ClusterIdSchema,
  name: ClusterNameSchema.optional(),
  regions: ClusterRegionsSchema.optional(),
  size: ClusterSizeSchema.optional(),
});

export const ClusterDeleteSchema = z.object({
  id: ClusterIdSchema,
});

export type ClusterType = z.infer<typeof ClusterTypeSchema>;
export type ClusterName = z.infer<typeof ClusterNameSchema>;
export type ClusterRegions = z.infer<typeof ClusterRegionsSchema>;
export type ClusterSize = z.infer<typeof ClusterSizeSchema>;
export type ClusterCreate = z.infer<typeof ClusterCreateSchema>;
export type ClusterId = z.infer<typeof ClusterIdSchema>;
export type ClusterUpdate = z.infer<typeof ClusterUpdateSchema>;
export type ClusterDelete = z.infer<typeof ClusterDeleteSchema>;

export function validateClusterName(name: string): boolean {
  return ClusterNameSchema.safeParse(name).success;
}

export function validateClusterId(id: string): boolean {
  return ClusterIdSchema.safeParse(id).success;
}
