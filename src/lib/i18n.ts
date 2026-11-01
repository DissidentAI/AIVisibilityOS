import chinese from "./locales/zh-CN.json";
export const LOCALES = ["fr", "en", "zh-CN"] as const;
export type Locale = (typeof LOCALES)[number];
export function localeOf(value: unknown): Locale {
  return value === "en" || value === "zh-CN" ? value : "fr";
}
export function translator(locale: Locale) {
  return (fr: string, en: string, zh?: string): string =>
    locale === "fr"
      ? fr
      : locale === "zh-CN"
        ? (zh ?? (chinese as Record<string, string>)[en] ?? en)
        : en;
}
export function intlLocale(locale: Locale) {
  return locale === "fr" ? "fr-FR" : locale === "en" ? "en-GB" : "zh-CN";
}
