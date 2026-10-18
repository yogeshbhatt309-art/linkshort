import { z } from 'zod'

export const destinationSchema = z
  .string()
  .trim()
  .url('Enter a valid destination URL.')
  .max(2048, 'Destination URL is too long.')
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Only HTTP and HTTPS links are supported.')

export const createLinkSchema = z.object({
  destination_url: destinationSchema,
  title: z.string().trim().min(1).max(120),
  code: z.string().trim().min(3).max(48).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores.'),
  campaign_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  expires_at: z.string().datetime().nullable().optional(),
  max_clicks: z.number().int().positive().max(10000000).nullable().optional(),
  password: z.string().min(8).max(128).nullable().optional(),
  device_destinations: z.record(z.string(), destinationSchema).default({}),
  qr_enabled: z.boolean().default(true),
})

export type CreateLinkInput = z.infer<typeof createLinkSchema>
