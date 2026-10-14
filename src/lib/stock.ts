// same rule as the server-side "kam qolgan" lists: min_stock > 0 AND stock <= min_stock
export function isLowStock(p: { stock: number; min_stock?: number | null }) {
  const min = Number(p.min_stock || 0);
  return min > 0 && Number(p.stock) <= min;
}
