import { z } from "zod";
import type { Query } from "./types";

export const QUERY_INTENTS = [
  "unspecified",
  "discovery",
  "comparison",
  "purchase",
  "support",
] as const;
export const QUERY_PRIORITIES = ["low", "normal", "high"] as const;
export const queryMetadataSchema = z.object({
  theme: z.string().trim().max(80),
  intent: z.enum(QUERY_INTENTS),
  priority: z.enum(QUERY_PRIORITIES),
});
export const queryFilterSchema = z.object({
  search: z.string().trim().max(200).default(""),
  theme: z.string().max(80).nullable().default(null),
  intent: z.enum(QUERY_INTENTS).nullable().default(null),
  priority: z.enum(QUERY_PRIORITIES).nullable().default(null),
});
export type QueryFilters = z.infer<typeof queryFilterSchema>;
export type QueryMetadata = z.infer<typeof queryMetadataSchema>;
export type QueryView = { id: string; name: string; filters: QueryFilters };
export const emptyQueryFilters: QueryFilters = {
  search: "",
  theme: null,
  intent: null,
  priority: null,
};
export function filterQueries(queries: Query[], filters: QueryFilters) {
  return queries.filter(
    (q) =>
      (!filters.search ||
        `${q.text} ${q.theme ?? ""}`
          .toLocaleLowerCase()
          .includes(filters.search.toLocaleLowerCase())) &&
      (filters.theme === null || (q.theme ?? "") === filters.theme) &&
      (filters.intent === null || (q.intent ?? "unspecified") === filters.intent) &&
      (filters.priority === null || (q.priority ?? "normal") === filters.priority),
  );
}
