import { z } from 'zod';

export const ProviderTypeSchema = z.enum(['hetzner']);

export const ProviderNameSchema = z
  .string()
  .min(1, 'Provider name is required')
  .max(50, 'Provider name must be less than 50 characters')
  .regex(
    /^[a-zA-Z0-9-_]+$/,
    'Provider name can only contain letters, numbers, hyphens, and underscores',
  );

export const HetznerTokenSchema = z.string().min(1, 'API token is required');

export const ProviderCreateSchema = z.object({
  name: ProviderNameSchema,
  type: ProviderTypeSchema,
  token: HetznerTokenSchema,
});

export const ProviderIdSchema = z.string().uuid('Invalid provider ID format');

export const ProviderUpdateSchema = z.object({
  id: ProviderIdSchema,
  name: ProviderNameSchema.optional(),
  token: HetznerTokenSchema.optional(),
});

export const ProviderDeleteSchema = z.object({
  id: ProviderIdSchema,
});

export type ProviderType = z.infer<typeof ProviderTypeSchema>;
export type ProviderName = z.infer<typeof ProviderNameSchema>;
export type HetznerToken = z.infer<typeof HetznerTokenSchema>;
export type ProviderCreate = z.infer<typeof ProviderCreateSchema>;
export type ProviderId = z.infer<typeof ProviderIdSchema>;
export type ProviderUpdate = z.infer<typeof ProviderUpdateSchema>;
export type ProviderDelete = z.infer<typeof ProviderDeleteSchema>;

export async function validateHetznerToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.hetzner.cloud/v1/locations', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function validateProviderName(name: string): boolean {
  return ProviderNameSchema.safeParse(name).success;
}

export function validateProviderId(id: string): boolean {
  return ProviderIdSchema.safeParse(id).success;
}
