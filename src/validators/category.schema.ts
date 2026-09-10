import { z } from 'zod';

export const categorySchema = z.object({
  // Live DB column is `name` (English), not `name_en`.
  name: z.string().trim().min(2, 'English name is required'),
  name_ur: z.string().trim().min(1, 'Urdu name is required'),
});

export type CategoryInput = z.infer<typeof categorySchema>;
