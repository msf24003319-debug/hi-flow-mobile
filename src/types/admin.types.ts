// Shared entity types for the admin panel. Mirrors the Supabase schema
// in supabase/migrations (source of truth).

export type UserRole = 'shopkeeper' | 'customer' | 'admin';
export type ShopkeeperStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
/** profiles.verification_status — the CNIC-verification gate for BOTH roles. */
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
/**
 * profiles.cnic_ocr_status — the PaddleOCR entered-vs-detected result.
 * Informational ONLY: it never drives verification_status. The admin still
 * makes the final call.
 */
export type CnicOcrStatus =
  | 'pending'
  | 'processing'
  | 'matched'
  | 'mismatch'
  | 'ocr_failed'
  | 'manual_review';
export type StockStatus = 'available' | 'out_of_stock';
export type FulfillmentType = 'delivery' | 'pickup';
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'dispatched'
  | 'ready_for_pickup'
  | 'delivered'
  | 'completed'
  | 'cancelled';
export type InquiryStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Quotation Sent'
  | 'Approved'
  | 'Completed'
  | 'Cancelled';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'hidden';
export type FranchiseStatus = 'new' | 'contacted' | 'qualified' | 'closed';
export type ServiceCategory = 'china_office' | 'turbine_maintenance';
export type ServiceRequestStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

/**
 * The verification-relevant slice of a `profiles` row, pulled into
 * shopkeeper/customer list queries via an embedded `profiles(...)` select.
 * profiles.verification_status is the single source of truth for both roles;
 * shopkeepers.status is legacy (dual-written by the admin for one release).
 */
export interface ProfileVerification {
  id?: string;
  role?: UserRole;
  name?: string | null;
  verification_status: VerificationStatus;
  verification_rejection_reason?: string | null;
  cnic_number?: string | null;
  /** Private-bucket (cnic-documents) object paths — resolve with signCnicUrl. */
  cnic_front_url?: string | null;
  cnic_back_url?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  created_at?: string;
  /** PaddleOCR result — informational, does not gate anything. */
  cnic_ocr_status?: CnicOcrStatus | null;
  cnic_ocr_detected_number?: string | null;
  /** 0–1 OCR line legibility for the detected number. NOT an authenticity score. */
  cnic_ocr_confidence?: number | null;
  cnic_ocr_checked_at?: string | null;
}

export interface Shopkeeper {
  id: string;
  name: string;
  cnic: string;
  profile_pic_url: string;
  cnic_front_url: string;
  cnic_back_url: string;
  area: string;
  shop_name: string;
  phone: string;
  /** LEGACY — use profiles.verification_status. Dual-written by the admin for one release. */
  status: ShopkeeperStatus;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
  /** Embedded from the profiles table (may be an array from PostgREST — normalize). */
  profiles?: ProfileVerification | ProfileVerification[] | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  cnic?: string | null;
  area?: string | null;
  /** Public URL, same bucket/pattern as Shopkeeper.profile_pic_url. */
  profile_pic_url?: string | null;
  /** Private-bucket object paths (cnic-documents) — resolve with signCnicUrl before display. */
  cnic_front_url?: string | null;
  cnic_back_url?: string | null;
  /** Status mirror written by the admin panel — the customer equivalent of
   *  Shopkeeper.status. profiles.verification_status is still the source of truth.
   *  Added by 20261002000000_customer_verification_mirror. */
  status?: ShopkeeperStatus | null;
  verification_rejection_reason?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  created_at: string;
  updated_at: string;
  /** Embedded from the profiles table (may be an array from PostgREST — normalize). */
  profiles?: ProfileVerification | ProfileVerification[] | null;
}

/** PostgREST returns an embedded to-one relation as an object, but the typings
 *  sometimes widen it to an array — collapse it. */
export function pickProfile(
  p: ProfileVerification | ProfileVerification[] | null | undefined,
): ProfileVerification | null {
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

// --- South Punjab location hierarchy ---
export interface Division {
  id: string;
  name: string;
  province: string;
  sort_order: number;
  is_active: boolean;
  needs_verification: boolean;
  created_at: string;
  updated_at: string;
}
export interface District {
  id: string;
  division_id: string;
  name: string;
  is_active: boolean;
  needs_verification: boolean;
  created_at: string;
  updated_at: string;
}
export interface Tehsil {
  id: string;
  district_id: string;
  name: string;
  is_active: boolean;
  needs_verification: boolean;
  created_at: string;
  updated_at: string;
}
export interface Area {
  id: string;
  tehsil_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  needs_verification: boolean;
  created_at: string;
  updated_at: string;
}
export interface Station {
  id: string;
  name: string;
  address: string | null;
  district_id: string;
  tehsil_id: string | null;
  area_id: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  needs_verification: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderLocationSnapshot {
  province: string;
  division: string;
  district: string;
  tehsil: string;
  area: string;
  station: { name: string; address: string | null };
  distance_km: number | null;
}

export interface Category {
  id: string;
  /** English name. NOTE: the live DB column is `name` (not `name_en`); the
      migration files are stale on this point. */
  name: string;
  name_ur: string;
  parent_id?: string | null;
  sort_order: number;
}

export interface PickupLocation {
  id: string;
  name_en: string;
  name_ur: string;
  address_en: string;
  address_ur: string;
  city: string;
  is_active: boolean;
}

export interface ProductPrice {
  product_id: string;
  customer_price: number;
  wholesale_price: number;
  updated_at: string;
}

export interface Product {
  id: string;
  category_id?: string | null;
  /**
   * The live `products` table carries three drifted name columns: `title` is
   * populated and correct for every row; `name` is empty for some; `name_en`
   * values are misaligned/shuffled. Prefer `title` for display — see
   * resolveProductName().
   */
  title?: string | null;
  name?: string | null;
  name_en: string;
  name_ur: string;
  description_en?: string;
  description_ur?: string;
  specifications_en?: string;
  specifications_ur?: string;
  image_url: string;
  stock_status: StockStatus;
  featured: boolean;
  avg_rating: number;
  review_count: number;
  sku?: string | null;
  unit: string;
  stock_quantity: number;
  low_stock_threshold: number;
  created_at: string;
  updated_at: string;
  category?: Category;
  /** Admin-only — joined from product_prices (RLS restricts it to admins). */
  product_prices?: Pick<ProductPrice, 'customer_price' | 'wholesale_price'> | null;
}

/** Computed inventory status — derived client-side from stock vs. threshold, never stored. */
export type InventoryStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export function computeInventoryStatus(available: number, threshold: number): InventoryStatus {
  if (available <= 0) return 'out_of_stock';
  if (available <= threshold) return 'low_stock';
  return 'in_stock';
}

/**
 * Row shape returned by the live get_inventory_overview() RPC. The deployed
 * function's column names differ from earlier migrations — verified against the
 * live DB: it returns `ordered`/`available`/`price`/`stock` (not `ordered_qty`/
 * `available_qty`/`customer_price`), and does not return sku/name_ur/image_url.
 * `title` is not from the RPC — the inventory page merges it in from `products`
 * so the displayed name matches /dashboard/products.
 */
export interface InventoryOverviewRow {
  id: string;
  title?: string | null;
  name: string;
  name_en: string;
  name_ur?: string;
  sku?: string | null;
  unit: string;
  image_url?: string;
  category_id?: string | null;
  stock: number;
  stock_quantity: number;
  low_stock_threshold: number;
  ordered: number;
  available: number;
  status?: string;
  price: number | null;
  wholesale_price: number | null;
}

/**
 * Result of the get_inventory_summary() RPC. The live function returns a single
 * JSON object (not an array of one row) with these keys — verified against the
 * live DB.
 */
export interface InventorySummary {
  total_products: number;
  in_stock_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
  total_inventory_value: number;
}

export type InventoryAdjustmentType = 'increase' | 'decrease' | 'set';

export interface InventoryAdjustment {
  id: string;
  product_id: string;
  previous_quantity: number;
  adjustment: number;
  new_quantity: number;
  adjustment_type: InventoryAdjustmentType;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  qty: number;
  price: number;
  customer_note: string;
  created_at: string;
  product?: Pick<Product, 'name_en' | 'name_ur' | 'image_url'>;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: OrderStatus;
  notes?: string;
  changed_by?: string;
  created_at: string;
}

export interface Order {
  id: string;
  order_number?: string;
  buyer_id: string;
  fulfillment_type: FulfillmentType;
  pickup_location_id?: string | null;
  delivery_address?: string | null;
  division_id?: string | null;
  district_id?: string | null;
  tehsil_id?: string | null;
  area_id?: string | null;
  station_id?: string | null;
  location_snapshot?: OrderLocationSnapshot | null;
  status: OrderStatus;
  total: number;
  created_at: string;
  updated_at: string;
  /** buyer_id -> profiles(id) -> either shopkeepers or customers (one is null). */
  buyer?: {
    shopkeepers: Pick<Shopkeeper, 'name' | 'shop_name' | 'phone' | 'area'> | null;
    customers: Pick<Customer, 'name' | 'phone'> | null;
  } | null;
  pickup_location?: PickupLocation;
  items?: OrderItem[];
  status_history?: OrderStatusHistory[];
}

export interface MotorInquiry {
  id: string;
  buyer_id: string;
  buyer_role: 'shopkeeper' | 'customer';
  brand: string;
  requirement_text: string;
  status: InquiryStatus;
  quotation_amount: number | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
  /** buyer_id -> profiles(id) -> either shopkeepers or customers (one is null). */
  buyer?: {
    shopkeepers: Pick<Shopkeeper, 'name' | 'shop_name' | 'phone'> | null;
    customers: Pick<Customer, 'name' | 'phone'> | null;
  } | null;
}

export interface ProductReview {
  id: string;
  product_id: string;
  buyer_id: string;
  buyer_role: 'shopkeeper' | 'customer';
  order_id: string;
  rating: number;
  comment_ur?: string;
  image_url?: string;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
  product?: Pick<Product, 'name_en' | 'name_ur'>;
  /** buyer_id -> profiles(id) -> either shopkeepers or customers (one is null). */
  buyer?: {
    shopkeepers: Pick<Shopkeeper, 'name' | 'shop_name'> | null;
    customers: Pick<Customer, 'name'> | null;
  } | null;
}

export interface FranchiseLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  occupation: string;
  city: string;
  other_franchise: boolean;
  other_franchise_name?: string;
  owns_property: boolean;
  heard_from: string;
  investment: string;
  office_address: string;
  status: FranchiseStatus;
  internal_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Feedback {
  id: string;
  buyer_id: string;
  buyer_role: 'shopkeeper' | 'customer';
  message: string;
  is_read: boolean;
  internal_notes?: string;
  created_at: string;
  /** buyer_id -> profiles(id) -> either shopkeepers or customers (one is null). */
  buyer?: {
    shopkeepers: Pick<Shopkeeper, 'name' | 'shop_name' | 'phone'> | null;
    customers: Pick<Customer, 'name' | 'phone'> | null;
  } | null;
}

export interface Service {
  id: string;
  category: ServiceCategory;
  name_en: string;
  name_ur: string;
  description_en?: string;
  description_ur?: string;
  image_url?: string | null;
  price: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequest {
  id: string;
  service_id: string;
  buyer_id: string;
  buyer_role: 'shopkeeper' | 'customer';
  name: string;
  phone: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  description?: string;
  preferred_date?: string | null;
  preferred_time?: string | null;
  images: string[];
  status: ServiceRequestStatus;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
  service?: Pick<Service, 'id' | 'name_en' | 'name_ur' | 'category'>;
  buyer?: {
    shopkeepers: Pick<Shopkeeper, 'name' | 'shop_name'> | null;
    customers: Pick<Customer, 'name'> | null;
  } | null;
}

export interface BlogPost {
  id: string;
  title_en: string;
  title_ur: string;
  content_en: string;
  content_ur: string;
  image_url?: string;
  is_published: boolean;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SiteContent {
  key: string;
  body_en: string;
  body_ur: string;
  updated_at: string;
}

export interface ProductPriceHistory {
  id: string;
  product_id: string;
  old_price: number;
  new_price: number;
  changed_by: string;
  created_at: string;
}
