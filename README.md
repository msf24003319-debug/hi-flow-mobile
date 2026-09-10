# Hi Flow — Admin Panel

Next.js 14 (App Router) + Tailwind + Supabase. Gold-on-dark, matches the mobile app.
Covers the Admin Panel Flow section of `../HiFlow_App_Flow.pdf`.

## Setup

```bash
npm install
cp .env.example .env.local   # Supabase URL + anon key + SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

An admin user = a row in `auth.users` whose `profiles.role = 'admin'`. Set it in the Supabase
dashboard (SQL: `update profiles set role = 'admin' where id = '<user-id>'`).

## Sections (sidebar)

| Route | Purpose |
|---|---|
| `/dashboard` | KPI overview (pending approvals, open orders, inquiries, leads, feedback, reviews) |
| `/dashboard/shopkeepers` | Approve / reject shopkeepers; CNIC viewer (signed URLs) |
| `/dashboard/products` | Bilingual product CRUD, image upload (auto-compress + delete old), stock, featured |
| `/dashboard/products/bulk-price` | Edit every price in a category on one screen (logs price history) |
| `/dashboard/products/inventory` | Fast stock-status toggle |
| `/dashboard/orders` | Process orders, move status (writes `order_status_history`), highlighted customer notes |
| `/dashboard/motor-inquiries` | Quote-request inbox |
| `/dashboard/franchise-leads` | Leads + CSV export |
| `/dashboard/feedback` | Shopkeeper feedback, mark read |
| `/dashboard/reviews` | Approve / reject / hide ratings (avg recomputes via DB trigger) |
| `/dashboard/content/about` · `/blog` | Edit About text + bilingual blog posts |

## Structure

- `src/lib/supabase-client.ts` — browser anon client (RLS `is_admin()` grants access)
- `src/lib/supabase-admin.ts` — service-role client, server only
- `src/components/ui/` — `DataTable`, `Modal`, `ImagePreviewModal`, `StatusBadge`, `MultilingualInput`
- `tailwind.config.js` — shared design tokens (`bg`, `surface`, `card`, `border`, `brand`, `ok`, `danger`, …)

Typecheck: `npx tsc --noEmit`
