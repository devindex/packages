/**
 * Shapes a page from rows fetched with `limit + 1` — the extra row is what reveals `hasMore`.
 *
 * @param {Array} rows - Up to `limit + 1` rows, in order.
 * @param {number} limit - The page size the caller asked for.
 * @param {number} [total] - Matching document count, when the resource exposes one.
 * @return {{items: Array, hasMore: boolean, total?: number}} The page.
 */
export function paginate(rows, limit, total) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return total === undefined ? { items, hasMore } : { items, hasMore, total };
}
