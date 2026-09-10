import { z } from 'zod';

export const productSchema = z.object({
  name_en: z.string().trim().min(2, 'English name is required'),
  name_ur: z.string().trim().min(1, 'Urdu name is required'),
  category_id: z.string().uuid('Please select a category'),
  description_en: z.string().optional(),
  description_ur: z.string().optional(),
  specifications_en: z.string().optional(),
  specifications_ur: z.string().optional(),
  image_url: z.string().url('A product image is required'),
  customer_price: z.number().nonnegative('Customer price must be 0 or more'),
  wholesale_price: z.number().nonnegative('Wholesale price must be 0 or more'),
  stock_status: z.enum(['available', 'out_of_stock']),
  featured: z.boolean(),
  sku: z.string().trim().optional().or(z.literal('')),
  unit: z.string().trim().min(1, 'Unit is required'),
  stock_quantity: z.number().int('Stock must be a whole number').nonnegative('Stock cannot be negative'),
  low_stock_threshold: z
    .number()
    .int('Threshold must be a whole number')
    .nonnegative('Threshold cannot be negative'),
});

export type ProductInput = z.infer<typeof productSchema>;
