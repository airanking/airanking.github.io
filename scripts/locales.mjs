export const ORIGIN = "https://airanking.github.io";
export const BRAND = "AI Ranking";
export const LOCALES = Object.freeze({
  en: { lang: "en", label: "English", base: "/en", intl: "en-US", og: "en_US" },
  es: { lang: "es", label: "Español", base: "/es", intl: "es-ES", og: "es_ES" },
  ru: { lang: "ru", label: "Русский", base: "/ru", intl: "ru-RU", og: "ru_RU" },
  zh: { lang: "zh-CN", label: "简体中文", base: "/cn", intl: "zh-CN", og: "zh_CN" },
});
export const LOCALE_IDS = Object.keys(LOCALES);

export function localeConfig(locale) {
  if (!Object.hasOwn(LOCALES, locale)) throw new Error(`Unknown locale: ${locale}`);
  return LOCALES[locale];
}

// A page identity is shared by all translations and English compatibility routes.
export function pagePath(locale, page = { kind: "home" }, canonical = false) {
  const config = localeConfig(locale);
  const base = locale === "en" && canonical ? "" : config.base;
  const number = page.page || 1;
  const suffix = number > 1 ? `page/${number}/` : "";
  switch (page.kind) {
    case "home": return `${base}/${suffix}`;
    case "topic": return `${base}/${page.slug}/${suffix}`;
    case "site": return `${locale === "zh" ? "" : config.base}/sites/${encodeURIComponent(page.slug)}/`;
    case "guide": return `${base}/guides/${page.slug}/`;
    case "guides": return `${base}/guides/`;
    case "methodology": return `${base}/methodology/`;
    case "vocabulary": return `${base}/search-vocabulary/`;
    default: throw new Error(`Unknown page kind: ${page.kind}`);
  }
}

export function alternates(page) {
  return LOCALE_IDS.map((locale) => ({ locale, lang: LOCALES[locale].lang, url: `${ORIGIN}${pagePath(locale, page, true)}` }));
}

export function siteSlug(site) {
  return new URL(site.url).pathname.split("/").filter(Boolean).at(-1) || "site";
}

export function outboundUrl(value, locale = "en") {
  localeConfig(locale);
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Only HTTP(S) destinations are supported");
  if (!["hvoyai.com", "www.hvoyai.com"].includes(url.hostname)) return value;
  url.protocol = "https:";
  url.hostname = "www.hvoyai.com";
  url.port = "";
  url.username = "";
  url.password = "";
  const pathname = url.pathname.replace(/^\/(?:en|es|ru|cn|zh|zh-CN)(?=\/|$)/i, "") || "/";
  url.pathname = `${locale === "zh" ? "" : `/${locale}`}${pathname}`;
  return url.href;
}
