import { z } from 'zod';

export const serviceSchema = z.object({
  category: z.enum(['china_office', 'turbine_maintenance']),
  name_en: z.string().trim().min(2, 'English name is required'),
  name_ur: z.string().trim().min(1, 'Urdu name is required'),
  description_en: z.string().optional(),
  description_ur: z.string().optional(),
  image_url: z.string().optional().or(z.literal('')),
  price: z.number().nonnegative('Price must be 0 or more').nullable(),
  is_active: z.boolean(),
  sort_order: z.number().int(),
});

export type ServiceInput = z.infer<typeof serviceSchema>;
