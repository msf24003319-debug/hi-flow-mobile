import { z } from 'zod';

export const blogSchema = z.object({
  title_en: z.string().trim().min(2, 'English title is required'),
  title_ur: z.string().trim().min(1, 'Urdu title is required'),
  content_en: z.string().trim().min(1, 'English content is required'),
  content_ur: z.string().trim().min(1, 'Urdu content is required'),
  image_url: z.string().url().optional().or(z.literal('')),
  is_published: z.boolean(),
});

export const aboutSchema = z.object({
  body_en: z.string().trim().min(1),
  body_ur: z.string().trim().min(1),
});

export type BlogInput = z.infer<typeof blogSchema>;
