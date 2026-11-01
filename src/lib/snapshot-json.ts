/** Stable serialization of JSON snapshots, including after PostgreSQL jsonb reorders keys. */
export function snapshotJson(value: unknown): string {
  function ordered(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(ordered);
    if (item !== null && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, entry]) => [key, ordered(entry)]),
      );
    return item;
  }
  return JSON.stringify(ordered(value));
}
