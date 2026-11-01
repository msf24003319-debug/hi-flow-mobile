interface AddressOrder {
  customer_address?: string | null;
  delivery_address?: string | null;
  account?: { address?: string | null } | null;
  location_snapshot?: { is_custom?: boolean; is_manual?: boolean; address_line?: string | null; city?: string | null; area?: string | null;
    tehsil?: string | null; district?: string | null; landmark?: string | null;
    shop_name?: string | null; shop_number?: string | null; market?: string | null;
    village?: string | null; adda?: string | null;
    station?: { name?: string | null; address?: string | null } | string | null } | null;
}
export function isCustomLocation(order: AddressOrder): boolean {
  return order.location_snapshot?.is_custom === true || order.location_snapshot?.is_manual === true || /^(Custom Location|Manual Address):/i.test(order.customer_address?.trim() ?? '');
}
export function orderAddress(order: AddressOrder): string {
  if (order.customer_address?.trim()) return order.customer_address.trim();
  const loc = order.location_snapshot;
  if (loc?.is_manual || loc?.is_custom) {
    const station = typeof loc.station === 'string' ? loc.station : loc.station?.name;
    const labelled = (label: string, value?: string | null) => value?.trim() ? `${label} ${value.trim()}` : null;
    return 'Custom Location: ' + [loc.shop_name, loc.shop_number, loc.market, loc.address_line,
      labelled('Ada', loc.area), loc.village, loc.adda, station, loc.tehsil,
      labelled('City', loc.city), labelled('District', loc.district),
      loc.landmark !== loc.address_line ? loc.landmark : null].filter(value => value?.trim()).join(', ');
  }
  return order.account?.address?.trim() || order.delivery_address?.trim()
    || [loc?.area, loc?.tehsil, loc?.district].filter(Boolean).join(', ');
}
