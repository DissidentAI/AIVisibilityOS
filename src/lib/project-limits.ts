/** One shared limit for creation, editing, suggestions and server-side additions. */
export const MAX_COMPETITORS = 50;
export const MAX_BRANDS = MAX_COMPETITORS + 1;
// Accommodates 50 Unicode questions and 50 brand names, with bounded JSON overhead.
export const PROJECT_BODY_LIMIT_BYTES = 250_000;
export const MAX_BROWSER_DRAFT_CHARS = 200_000;
