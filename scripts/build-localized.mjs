import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSite, rankSites } from "./build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://airanking.github.io";
const PAGE_SIZE = 40;
const MAX_SITES = 500;
const number = {
  en: new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }),
  es: new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }),
  zh: new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }),
};

const TOPICS = [
  { slug: "gpt-zhongzhuanzhan", terms: ["gpt", "openai", "chatgpt"], en: "GPT API Gateways", es: "Gateways de API de GPT", zh: "GPT 中转站" },
  { slug: "claude-zhongzhuanzhan", terms: ["claude", "anthropic"], en: "Claude API Gateways", es: "Gateways de API de Claude", zh: "Claude 中转站" },
  { slug: "codex-zhongzhuanzhan", terms: ["codex"], en: "Codex API Gateways", es: "Gateways de API de Codex", zh: "Codex 中转站" },
  { slug: "gemini-zhongzhuanzhan", terms: ["gemini"], en: "Gemini API Gateways", es: "Gateways de API de Gemini", zh: "Gemini 中转站" },
  { slug: "deepseek-zhongzhuanzhan", terms: ["deepseek", "深度求索"], en: "DeepSeek API Gateways", es: "Gateways de API de DeepSeek", zh: "DeepSeek 中转站" },
  { slug: "glm-zhongzhuanzhan", terms: ["glm", "智谱"], en: "GLM API Gateways", es: "Gateways de API de GLM", zh: "GLM 中转站" },
  { slug: "qwen-zhongzhuanzhan", terms: ["qwen", "通义", "千问"], en: "Qwen API Gateways", es: "Gateways de API de Qwen", zh: "Qwen 中转站" },
  { slug: "kimi-zhongzhuanzhan", terms: ["kimi", "moonshot", "月之暗面"], en: "Kimi API Gateways", es: "Gateways de API de Kimi", zh: "Kimi 中转站" },
];

// Search vocabulary is maintained separately from model matching. It reflects
// the terms observed in Google Trends and Google/Bing result pages, not claims
// about a provider or a guarantee of search volume.
const SEARCH_TERMS = {
  en: [
    "AI API gateway", "AI gateway", "LLM gateway", "AI API proxy", "AI API aggregator",
    "multi-model API", "OpenAI-compatible API", "AI model router", "open source AI gateway",
    "Kimi API", "Bifrost AI gateway", "Helicone",
  ],
  es: [
    "pasarela API de IA", "gateway de IA", "proxy de API de IA", "agregador de API de IA",
    "API unificada de IA", "API multimodelo", "acceso a modelos de IA",
  ],
  zh: [
    "AI 中转站", "API 中转站", "AI API 中转站", "AI 中转站排行榜", "AI 中转站评测",
    "AI 中转站推荐", "中转站价格对比", "AI 中转站靠谱吗", "AI 中转站搭建",
    "国外 API 中转站", "大模型 API 集成平台", "大模型 API 聚合平台", "AI API 网关", "AI 接口代理",
  ],
};

const SEARCH_COPY = {
  en: { title: "Search vocabulary", lead: "Common terms people use to find multi-model API access. Terminology varies by region and search engine; verify providers with the public evidence above." },
  es: { title: "Vocabulario de búsqueda", lead: "Términos habituales para encontrar acceso a API con varios modelos. La terminología cambia según la región y el buscador; verifica cada proveedor con la evidencia pública." },
  zh: { title: "搜索词汇", lead: "下面整理 Google 和 Bing 结果中常见的多模型 API 访问词汇。词汇会随地区和搜索引擎变化，仍需根据公开证据核验站点。" },
};

const TEXT = {
  en: {
    lang: "en", locale: "en_US", siteName: "AI API Gateway Rankings", brand: "Gateway", brandStrong: "Rankings",
    navRanking: "Rankings", navTopics: "Model index", navMethod: "Methodology", skip: "Skip to main content",
    homeTitle: "AI API Gateway Rankings", homeH1: "AI API gateways", homeH1Em: "open data rankings",
    homeLead: "Compare multi-model AI API gateways using the same public-data scoring method. Missing fields are treated as unknown, not as zero performance.",
    viewTable: "View data table", viewMethod: "Read the methodology", collected: "Public listings", stations: "AI API gateways",
    page: "Page", range: "Range", perPage: "Per page", rankingTitle: "Public metrics ranking", tableCaption: "AI API gateway ranking {first}-{last}, {total} listings",
    rank: "Rank", siteData: "Gateway and evidence", score: "Data score", coverage: "Coverage", uptime: "Uptime", latency: "Latency", models: "Models", rating: "Reviews", policy: "Policies", visit: "Visit", pending: "Not recorded", supported: "Supported", unsupported: "Not supported", confirm: "Confirm",
    topicsTitle: "Find gateways by model", topicsLead: "Keyword matching creates a review shortlist. Confirm the model, protocol, pricing and data policy on the provider site before use.", topicMatches: "public matches", viewTopic: "View topic", currentTopic: "Current topic",
    methodologyTitle: "Scoring methodology", methodologyLead: "This directory applies a deterministic formula to public data. Scores organize evidence; they are not certification or a guarantee of availability.",
    detailTitle: "Gateway profile", details: "Current public record", sourceDescription: "Source description", translatedDescription: "Translated description", sourcePage: "Open provider page", back: "Back to rankings", updated: "Updated", modelsList: "Listed models", payments: "Payment methods", noDescription: "No description recorded.",
    footer: "Compare first, test with a small balance, and keep a backup provider.", previous: "Previous", next: "Next", language: "Language", faqTitle: "Frequently asked questions",
    scoreSentence: (s) => `Current public-data score: ${s.score}, with ${s.coverage}% field coverage.`, performance: (s) => `Uptime ${s.uptime}; latency ${s.latency}.`,
  },
  es: {
    lang: "es", locale: "es_ES", siteName: "Ranking de gateways de API de IA", brand: "Gateway", brandStrong: "Ranking",
    navRanking: "Ranking", navTopics: "Índice de modelos", navMethod: "Metodología", skip: "Saltar al contenido principal",
    homeTitle: "Ranking de gateways de API de IA", homeH1: "Gateways de API de IA", homeH1Em: "ranking de datos públicos",
    homeLead: "Compara gateways de API de IA con múltiples modelos usando el mismo método de puntuación basado en datos públicos. Los campos ausentes se consideran desconocidos, no rendimiento cero.",
    viewTable: "Ver tabla de datos", viewMethod: "Leer la metodología", collected: "Registros públicos", stations: "gateways de API de IA",
    page: "Página", range: "Rango", perPage: "Por página", rankingTitle: "Ranking de métricas públicas", tableCaption: "Ranking de gateways de API de IA {first}-{last}, {total} registros",
    rank: "Puesto", siteData: "Gateway y evidencia", score: "Puntuación", coverage: "Cobertura", uptime: "Disponibilidad", latency: "Latencia", models: "Modelos", rating: "Opiniones", policy: "Políticas", visit: "Visitar", pending: "Sin registrar", supported: "Compatible", unsupported: "No compatible", confirm: "Confirmar",
    topicsTitle: "Buscar gateways por modelo", topicsLead: "Las coincidencias de palabras clave crean una lista para revisar. Confirma el modelo, el protocolo, el precio y la política de datos en el sitio antes de usarlo.", topicMatches: "coincidencias públicas", viewTopic: "Ver tema", currentTopic: "Tema actual",
    methodologyTitle: "Metodología de puntuación", methodologyLead: "Este directorio aplica una fórmula determinista a datos públicos. Las puntuaciones organizan evidencias; no son una certificación ni garantizan disponibilidad.",
    detailTitle: "Perfil del gateway", details: "Registro público actual", sourceDescription: "Descripción de origen", translatedDescription: "Descripción traducida", sourcePage: "Abrir página del proveedor", back: "Volver al ranking", updated: "Actualizado", modelsList: "Modelos registrados", payments: "Métodos de pago", noDescription: "No hay descripción registrada.",
    footer: "Compara primero, prueba con un saldo pequeño y conserva un proveedor de respaldo.", previous: "Anterior", next: "Siguiente", language: "Idioma", faqTitle: "Preguntas frecuentes",
    scoreSentence: (s) => `Puntuación basada en datos públicos: ${s.score}, con una cobertura del ${s.coverage} % de los campos.`, performance: (s) => `Disponibilidad ${s.uptime}; latencia ${s.latency}.`,
  },
  zh: {
    lang: "zh-CN", locale: "zh-CN", siteName: "AI 中转站推荐榜", brand: "中转站", brandStrong: "推荐榜",
    navRanking: "数据榜", navTopics: "模型索引", navMethod: "评分方法", skip: "跳到主要内容",
    homeTitle: "AI 中转站数据榜", homeH1: "AI 中转站", homeH1Em: "公开数据排名", homeLead: "使用同一套公开数据评分方法比较多模型 AI API 中转站。缺失字段按未知处理，不等于零分。",
    viewTable: "查看数据表", viewMethod: "阅读评分方法", collected: "公开收录", stations: "家 AI API 中转站", page: "第", range: "范围", perPage: "每页", rankingTitle: "公开指标排名", tableCaption: "AI 中转站公开数据排名 {first}–{last}，共 {total} 家",
    rank: "排名", siteData: "站点与数据说明", score: "数据评分", coverage: "覆盖度", uptime: "在线率", latency: "延迟", models: "模型", rating: "评价", policy: "服务信息", visit: "访问", pending: "暂无", supported: "支持", unsupported: "不支持", confirm: "待确认",
    topicsTitle: "按模型查找中转站", topicsLead: "关键词匹配只用于建立核验清单。使用前仍需进入站点确认模型、协议、价格和数据政策。", topicMatches: "家公开资料匹配", viewTopic: "查看专题", currentTopic: "当前专题",
    methodologyTitle: "数据评分方法", methodologyLead: "本站把公开数据放入同一套确定性公式。分数用于整理证据，不是认证或实时可用性保证。", detailTitle: "站点详情", details: "当前公开记录", sourceDescription: "来源描述", translatedDescription: "翻译描述", sourcePage: "打开站点", back: "返回榜单", updated: "更新时间", modelsList: "收录模型", payments: "支付方式", noDescription: "暂无描述记录。", footer: "先比较，后测试；少量充值，为关键调用保留备用方案。", previous: "上一页", next: "下一页", language: "语言", faqTitle: "常见问题",
    scoreSentence: (s) => `当前公开数据综合分 ${s.score}，评分字段覆盖 ${s.coverage}%。`, performance: (s) => `在线率 ${s.uptime}；延迟 ${s.latency}。`,
  },
};

function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function slug(site) { try { return new URL(site.url).pathname.replace(/^\/|\/$/g, "").split("/").pop() || "site"; } catch { return "site"; } }
function sitePath(locale, id) { return locale === "zh" ? `/sites/${id}/` : `/${locale}/sites/${id}/`; }
function basePath(locale) { return locale === "en" ? "/en" : locale === "zh" ? "/cn" : "/es"; }
function pagePath(locale, page) { const base = basePath(locale); return page === 1 ? `${base}/` : `${base}/page/${page}/`; }
function topicPath(locale, topic, page = 1) { const base = basePath(locale); return page === 1 ? `${base}/${topic.slug}/` : `${base}/${topic.slug}/page/${page}/`; }
function formatDate(date, locale) { if (!date) return TEXT[locale].pending; const [y, m, d] = date.split("-"); return locale === "en" ? `${y}-${m}-${d}` : locale === "es" ? `${d}/${m}/${y}` : `${y} 年 ${Number(m)} 月 ${Number(d)} 日`; }
function formatUptime(value, locale) { return value === null ? TEXT[locale].pending : `${number[locale].format(value)}%`; }
function formatLatency(value, locale) { if (value === null) return TEXT[locale].pending; if (locale === "en") return value >= 1000 ? `${number.en.format(value / 1000)} s` : `${Math.round(value)} ms`; if (locale === "es") return value >= 1000 ? `${number.es.format(value / 1000)} s` : `${Math.round(value)} ms`; return value >= 1000 ? `${number.zh.format(value / 1000)} 秒` : `${Math.round(value)} 毫秒`; }
function status(value, locale) { const t = TEXT[locale]; return value === true ? t.supported : value === false ? t.unsupported : t.confirm; }
function translation(locale, cache, site) { return cache?.sites?.[slug(site)] || { name: site.name, description: site.description, paymentMethods: site.paymentMethods }; }
function scoreCopy(locale, site) { const t = TEXT[locale]; const coverage = Math.round(site.scoreCoverage * 100); const uptime = formatUptime(site.uptime, locale); const latency = formatLatency(site.latencyMs, locale); const description = t.scoreSentence({ score: number[locale].format(site.score), coverage }); return `${site.displayName}: ${description} ${t.performance({ uptime, latency })}`; }
function searchable(site) { return [site.name, site.description, ...site.models].join(" ").toLowerCase(); }

function htmlHead({ locale, title, description, canonical, alternates, root = "", previous = "", next = "" }) {
  const t = TEXT[locale];
  const keywords = SEARCH_TERMS[locale].join(", ");
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: title, description, url: canonical, inLanguage: t.lang, isPartOf: { "@type": "WebSite", name: t.siteName, url: `${ORIGIN}${basePath(locale)}/` } }).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="keywords" content="${esc(keywords)}"><meta name="robots" content="index, follow, max-image-preview:large"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:site_name" content="${esc(t.siteName)}"><meta property="og:locale" content="${t.locale}"><link rel="canonical" href="${canonical}">${alternates.map((item) => `<link rel="alternate" hreflang="${item.lang}" href="${item.url}">`).join("")}<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">${previous ? `<link rel="prev" href="${previous}">` : ""}${next ? `<link rel="next" href="${next}">` : ""}<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/styles.min.css"><script type="application/ld+json">${jsonLd}</script></head>`;
}
function shell({ locale, body, title, description, canonical, alternates, root, previous = "", next = "" }) {
  const t = TEXT[locale];
  const labels = { en: "EN", es: "ES", "zh-CN": "中文" };
  const languageLinks = alternates.map((item) => `<a class="language-link${item.lang === t.lang ? " is-current" : ""}" href="${item.url}" hreflang="${item.lang}"${item.lang === t.lang ? " aria-current=\"page\"" : ""}>${labels[item.lang] || item.lang}</a>`).join("");
  return `${htmlHead({ locale, title, description, canonical, alternates, root, previous, next })}<body><a class="skip-link" href="#main">${t.skip}</a><header class="topbar"><a class="wordmark" href="${basePath(locale)}/" aria-label="${esc(t.siteName)}"><span>${esc(t.brand)}</span><strong>${esc(t.brandStrong)}</strong></a><nav aria-label="${esc(t.navRanking)}"><a href="${basePath(locale)}/#ranking">${t.navRanking}</a><a href="${basePath(locale)}/#topics">${t.navTopics}</a><a href="${basePath(locale)}/methodology/">${t.navMethod}</a></nav><nav class="language-switcher" aria-label="${esc(t.language)}">${languageLinks}</nav></header>${body}<footer class="footer"><a class="wordmark" href="${basePath(locale)}/"><span>${esc(t.brand)}</span><strong>${esc(t.brandStrong)}</strong></a><p>${t.footer}</p><a href="#main">↑</a></footer></body></html>\n`;
}

function renderTable(locale, sites, caption, root) {
  const t = TEXT[locale];
  return `<div class="ranking-table-wrap" role="region" aria-label="${esc(t.rankingTitle)}" tabindex="0"><table class="ranking-table"><caption>${esc(caption)}</caption><colgroup><col class="col-rank"><col class="col-site"><col class="col-score"><col class="col-uptime"><col class="col-latency"><col class="col-models"><col class="col-rating"><col class="col-policy"><col class="col-action"></colgroup><thead><tr><th scope="col">${t.rank}</th><th scope="col">${t.siteData}</th><th scope="col">${t.score}</th><th scope="col">${t.uptime}</th><th scope="col">${t.latency}</th><th scope="col">${t.models}</th><th scope="col">${t.rating}</th><th scope="col">${t.policy}</th><th scope="col">${t.visit}</th></tr></thead><tbody>${sites.map((site) => { const url = esc(site.url); const detail = sitePath(locale, slug(site)); const rating = site.userRating === null || site.ratingCount === 0 ? t.pending : `${number[locale].format(site.userRating)} / 5 (${site.ratingCount})`; return `<tr class="ranking-row" id="rank-${site.rank}" data-rank="${site.rank}" data-score="${site.score.toFixed(6)}"><td class="rank-cell numeric"><strong>${site.rank}</strong></td><th class="site-cell" scope="row" id="station-${site.rank}"><a href="${url}" target="_blank" rel="nofollow noopener">${esc(site.displayName)}</a><p>${esc(scoreCopy(locale, site))}</p><a class="table-link" href="${detail}">${t.detailTitle} →</a></th><td class="score-cell numeric"><strong>${number[locale].format(site.score)}</strong><small>${t.coverage} ${Math.round(site.scoreCoverage * 100)}%</small></td><td class="numeric">${formatUptime(site.uptime, locale)}</td><td class="numeric">${formatLatency(site.latencyMs, locale)}</td><td class="numeric">${site.modelCount > 0 ? site.modelCount : t.pending}</td><td class="numeric">${esc(rating)}</td><td class="policy-cell"><span class="data-${site.supportsRefund === null ? "unknown" : site.supportsRefund ? "known" : "negative"}">${locale === "en" ? "Refund" : locale === "es" ? "Reembolso" : "退"}: ${status(site.supportsRefund, locale)}</span><span class="data-${site.supportsInvoice === null ? "unknown" : site.supportsInvoice ? "known" : "negative"}">${locale === "en" ? "Invoice" : locale === "es" ? "Factura" : "票"}: ${status(site.supportsInvoice, locale)}</span></td><td><a class="table-link" href="${url}" target="_blank" rel="nofollow noopener" referrerpolicy="origin" aria-label="${esc(t.visit)} ${esc(site.displayName)}">↗</a></td></tr>`; }).join("")}</tbody></table></div>`;
}

function pagination(locale, page, total, pathForPage) {
  if (total <= 1) return "";
  const t = TEXT[locale];
  const links = Array.from({ length: total }, (_, i) => i + 1).filter((value) => value === 1 || value === total || Math.abs(value - page) <= 1).map((value, index, values) => `${index && value - values[index - 1] > 1 ? "<span class=\"page-gap\">…</span>" : ""}${value === page ? `<span class="page-number is-current" aria-current="page">${value}</span>` : `<a class="page-number" href="${pathForPage(value)}">${value}</a>`}`).join("");
  return `<nav class="pagination" aria-label="${esc(t.rankingTitle)}">${page > 1 ? `<a class="page-step" href="${pathForPage(page - 1)}">← ${t.previous}</a>` : `<span class="page-step is-disabled">← ${t.previous}</span>`}<div class="page-numbers">${links}</div>${page < total ? `<a class="page-step" href="${pathForPage(page + 1)}">${t.next} →</a>` : `<span class="page-step is-disabled">${t.next} →</span>`}</nav>`;
}

function topicCards(locale, topics) { const t = TEXT[locale]; return `<section class="topic-directory" id="topics"><div class="topic-directory__head"><div><p class="section-kicker">${t.navTopics}</p><h2 id="topics-title">${t.topicsTitle}</h2></div><p>${t.topicsLead}</p></div><div class="topic-directory__grid">${topics.map(({ topic, matches }) => `<article><span>${esc(topic.en)}</span><h3>${esc(topic[locale])}</h3><p>${esc(topic.intro?.[locale] || t.topicsLead)}</p><div><strong>${matches.length}</strong><small>${t.topicMatches}</small><a href="${topicPath(locale, topic)}">${t.viewTopic} →</a></div></article>`).join("")}</div></section>`; }

function searchVocabulary(locale) {
  const copy = SEARCH_COPY[locale];
  return `<section class="search-vocabulary" aria-labelledby="search-vocabulary-title"><div class="topic-directory__head"><div><p class="section-kicker">SEARCH TERMS</p><h2 id="search-vocabulary-title">${copy.title}</h2></div><p>${copy.lead}</p></div><p class="search-vocabulary__terms">${SEARCH_TERMS[locale].map((term) => `<span>${esc(term)}</span>`).join("")}</p></section>`;
}

function renderHome({ locale, page, totalPages, sites, allSites, topics, updatedDate }) {
  const t = TEXT[locale];
  const first = (page - 1) * PAGE_SIZE + 1; const last = first + sites.length - 1;
  const canonical = `${ORIGIN}${pagePath(locale, page)}`;
  const title = page === 1 ? t.homeTitle : `${t.homeTitle} - ${t.page} ${page}`;
  const description = page === 1 ? `${t.homeLead} ${allSites.length} ${t.stations}.` : `${t.homeTitle}, ${t.page} ${page}, ${t.range} ${first}-${last}.`;
  const alternates = [{ lang: "en", url: `${ORIGIN}${pagePath("en", page)}` }, { lang: "es", url: `${ORIGIN}${pagePath("es", page)}` }, { lang: "zh-CN", url: `${ORIGIN}${pagePath("zh", page)}` }];
  const root = page === 1 ? "." : "../..";
  const body = `<main id="main"><nav class="breadcrumbs"><a href="${basePath(locale)}/">${esc(t.siteName)}</a>${page > 1 ? `<span>/</span><span>${t.page} ${page}</span>` : ""}</nav><section class="hero"><div class="hero__copy"><p class="eyebrow">OPEN DATA RANKING · ${updatedDate.replaceAll("-", ".")}</p><h1>${esc(t.homeH1)}<br><em>${esc(t.homeH1Em)}</em></h1><p class="hero-copy">${esc(t.homeLead)}</p><div class="hero-actions"><a href="#ranking">${t.viewTable}</a><a href="${basePath(locale)}/methodology/">${t.viewMethod}</a></div></div><aside class="hero__panel"><p>${t.collected}</p><strong>${allSites.length}</strong><span>${t.stations}</span><dl><div><dt>${t.page}</dt><dd>${page} / ${totalPages}</dd></div><div><dt>${t.range}</dt><dd>${first}-${last}</dd></div><div><dt>${t.updated}</dt><dd>${updatedDate}</dd></div></dl></aside></section><section class="ranking" id="ranking"><div class="ranking-head"><div><p>DATA TABLE / ${String(page).padStart(2, "0")}</p><h2>${t.rankingTitle}</h2></div></div>${renderTable(locale, sites, t.tableCaption.replace("{first}", first).replace("{last}", last).replace("{total}", allSites.length), root)}${pagination(locale, page, totalPages, (value) => pagePath(locale, value))}</section>${page === 1 ? `${topicCards(locale, topics)}${searchVocabulary(locale)}` : ""}</main>`;
  return shell({ locale, body, title, description, canonical, alternates, root, previous: page > 1 ? `${ORIGIN}${pagePath(locale, page - 1)}` : "", next: page < totalPages ? `${ORIGIN}${pagePath(locale, page + 1)}` : "" });
}

function renderTopic({ locale, topic, page, totalPages, sites, allMatches, topics, updatedDate }) {
  const t = TEXT[locale]; const label = topic[locale]; const first = (page - 1) * PAGE_SIZE + 1; const last = first + sites.length - 1; const canonical = `${ORIGIN}${topicPath(locale, topic, page)}`; const root = page === 1 ? ".." : "../../.."; const alternates = [{ lang: "en", url: `${ORIGIN}${topicPath("en", topic, page)}` }, { lang: "es", url: `${ORIGIN}${topicPath("es", topic, page)}` }, { lang: "zh-CN", url: `${ORIGIN}${topicPath("zh", topic, page)}` }];
  const title = `${label} | ${t.siteName}`; const description = `${label}: ${allMatches.length} ${t.topicMatches}. ${t.topicsLead}`;
  const body = `<main id="main"><nav class="breadcrumbs"><a href="${basePath(locale)}/">${esc(t.siteName)}</a><span>/</span><span>${esc(label)}</span></nav><section class="hero topic-hero"><div class="hero__copy"><p class="eyebrow">MODEL DIRECTORY · ${updatedDate.replaceAll("-", ".")}</p><h1>${esc(label)}<br><em>${esc(t.rankingTitle)}</em></h1><p class="hero-copy">${esc(description)}</p><div class="hero-actions"><a href="#topic-ranking">${t.viewTable}</a><a href="${basePath(locale)}/#topics">${t.back}</a></div></div><aside class="hero__panel"><p>${t.topicMatches}</p><strong>${allMatches.length}</strong><span>${esc(label)}</span><dl><div><dt>${t.page}</dt><dd>${page} / ${totalPages}</dd></div><div><dt>${t.range}</dt><dd>${first}-${last}</dd></div></dl></aside></section>${page === 1 ? topicCards(locale, topics) : ""}<section class="ranking topic-ranking" id="topic-ranking"><div class="ranking-head"><div><p>MODEL DATA / ${esc(topic.en)}</p><h2>${esc(label)}</h2></div></div>${renderTable(locale, sites, `${label} ${t.tableCaption.replace("{first}", first).replace("{last}", last).replace("{total}", allMatches.length)}`, root)}${pagination(locale, page, totalPages, (value) => topicPath(locale, topic, value))}</section></main>`;
  return shell({ locale, body, title, description, canonical, alternates, root, previous: page > 1 ? `${ORIGIN}${topicPath(locale, topic, page - 1)}` : "", next: page < totalPages ? `${ORIGIN}${topicPath(locale, topic, page + 1)}` : "" });
}

function renderSite({ locale, site, translated, updatedDate }) {
  const t = TEXT[locale]; const id = slug(site); const canonical = `${ORIGIN}${sitePath(locale, id)}`; const root = locale === "zh" ? "../.." : "../../.."; const description = `${site.displayName}: ${scoreCopy(locale, site)}`; const alternates = [{ lang: "en", url: `${ORIGIN}${sitePath("en", id)}` }, { lang: "es", url: `${ORIGIN}${sitePath("es", id)}` }, { lang: "zh-CN", url: `${ORIGIN}${sitePath("zh", id)}` }]; const body = `<main id="main"><nav class="breadcrumbs"><a href="${basePath(locale)}/">${esc(t.siteName)}</a><span>/</span><span>${esc(site.displayName)}</span></nav><section class="hero"><div class="hero__copy"><p class="eyebrow">${t.detailTitle.toUpperCase()} · ${updatedDate.replaceAll("-", ".")}</p><h1>${esc(site.displayName)}<br><em>${esc(t.detailTitle)}</em></h1><p class="hero-copy">${esc(scoreCopy(locale, site))} ${esc(translated.description || t.noDescription)}</p><div class="hero-actions"><a href="${esc(site.url)}" target="_blank" rel="nofollow noopener" referrerpolicy="origin">${t.sourcePage} ↗</a><a href="${basePath(locale)}/">${t.back}</a></div></div><aside class="hero__panel"><p>${t.score}</p><strong>${number[locale].format(site.score)}</strong><span>${t.coverage} ${Math.round(site.scoreCoverage * 100)}%</span><dl><div><dt>${t.updated}</dt><dd>${updatedDate}</dd></div><div><dt>${t.rank}</dt><dd>${site.rank}</dd></div></dl></aside></section><section class="methodology"><h2>${t.details}</h2><p>${esc(scoreCopy(locale, site))}</p><div class="method-grid"><article><h3>${t.modelsList}</h3><p>${site.models.length ? esc(site.models.join(", ")) : t.pending}</p></article><article><h3>${t.payments}</h3><p>${translated.paymentMethods?.length ? esc(translated.paymentMethods.join(", ")) : t.pending}</p></article><article><h3>${t.sourceDescription}</h3><p>${esc(site.description || t.noDescription)}</p></article><article><h3>${t.translatedDescription}</h3><p>${esc(translated.description || t.noDescription)}</p></article></div></section></main>`; return shell({ locale, body, title: `${site.displayName} | ${t.siteName}`, description, canonical, alternates, root });
}

function renderMethodology({ locale, sites, updatedDate }) { const t = TEXT[locale]; const canonical = `${ORIGIN}${basePath(locale)}/methodology/`; const root = locale === "zh" ? ".." : "../.."; const alternates = [{ lang: "en", url: `${ORIGIN}/methodology/` }, { lang: "es", url: `${ORIGIN}/es/methodology/` }, { lang: "zh-CN", url: `${ORIGIN}/zh/methodology/` }]; const paragraphs = locale === "en" ? ["We deduplicate the source list, keep up to 500 records, and rank them with the same deterministic formula on every build.", "Uptime is weighted at 25%, latency at 20%, reviews at 15%, model breadth at 10%, tenure at 5%, payment methods at 5%, refund at 5%, invoice at 5%, and source continuity at 10%.", "Missing values are excluded from the available-weight denominator and the result is pulled toward 50 according to field coverage. Unknown is not the same as an explicit negative.", "The ranking is a research index. Verify the provider, model mapping, privacy policy, limits and billing with your own requests before production use."] : locale === "es" ? ["Eliminamos duplicados, conservamos hasta 500 registros y los ordenamos con la misma fórmula determinista en cada compilación.", "La disponibilidad pesa un 25 %, la latencia un 20 %, las opiniones un 15 %, la amplitud de modelos un 10 %, la antigüedad un 5 %, los métodos de pago un 5 %, el reembolso un 5 %, la factura un 5 % y la continuidad de la fuente un 10 %.", "Los campos ausentes se excluyen del denominador y el resultado se acerca a 50 según la cobertura. Desconocido no significa negativo explícito.", "Este ranking es un índice de investigación. Verifica el proveedor, el modelo, la privacidad, los límites y la facturación con tus propias solicitudes antes de usarlo en producción."] : ["先去重并保留最多 500 条公开资料，再用同一套确定性公式排序。", "在线率 25%、延迟 20%、评价 15%、模型广度 10%、运营时间 5%、支付方式 5%、退款 5%、发票 5%、来源连续性 10%。", "缺失字段从可用权重分母中剔除，并按覆盖度把结果向 50 分收缩。未知不等于明确不支持。", "榜单用于整理研究线索。生产使用前，请用自己的请求核对供应商、模型映射、隐私、限制和账单。"]; const body = `<main id="main"><nav class="breadcrumbs"><a href="${basePath(locale)}/">${esc(t.siteName)}</a><span>/</span><span>${t.navMethod}</span></nav><article class="methodology"><p class="eyebrow">METHODOLOGY · ${updatedDate.replaceAll("-", ".")}</p><h1>${t.methodologyTitle}</h1><p class="methodology__lead">${t.methodologyLead} ${sites.length}.</p>${paragraphs.map((p) => `<section><p>${esc(p)}</p></section>`).join("")}</article></main>`; return shell({ locale, body, title: `${t.methodologyTitle} | ${t.siteName}`, description: t.methodologyLead, canonical, alternates, root }); }

async function write(target, content) { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content, "utf8"); }
function localizedSite(site, locale, caches) { const translated = translation(locale, caches[locale], site); return { ...site, displayName: translated.name || site.name, translated }; }

const payload = JSON.parse(await readFile(path.join(ROOT, "data.json"), "utf8"));
const caches = {};
for (const locale of ["en", "es"]) { try { caches[locale] = JSON.parse(await readFile(path.join(ROOT, "translations", `${locale}.json`), "utf8")); } catch { caches[locale] = { sites: {} }; } }
caches.zh = { sites: {} };
const updatedDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.updatedDate || "") ? payload.updatedDate : new Date().toISOString().slice(0, 10);
const normalized = payload.sites.map(normalizeSite).sort((a, b) => a.rank - b.rank).filter((site, index, items) => items.findIndex((candidate) => candidate.name.toLowerCase() === site.name.toLowerCase() || candidate.url === site.url) === index).slice(0, MAX_SITES);
const ranked = rankSites(normalized, updatedDate);
const localeSites = Object.fromEntries(["en", "es", "zh"].map((locale) => [locale, ranked.map((site) => localizedSite(site, locale, caches))]));
const allTopicData = Object.fromEntries(["en", "es", "zh"].map((locale) => [locale, TOPICS.map((topic) => ({ topic, matches: localeSites[locale].filter((site) => topic.terms.some((term) => searchable(site).includes(term))) }))]));
const generatedUrls = [];

for (const locale of ["en", "es", "zh"]) {
  const sites = localeSites[locale]; const topics = allTopicData[locale]; const totalPages = Math.ceil(sites.length / PAGE_SIZE);
  for (let page = 1; page <= totalPages; page += 1) {
    const content = renderHome({ locale, page, totalPages, sites: sites.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), allSites: sites, topics, updatedDate });
    const target = page === 1
      ? path.join(ROOT, basePath(locale).replace(/^\//, ""), "index.html")
      : path.join(ROOT, basePath(locale).replace(/^\//, ""), "page", String(page), "index.html");
    await write(target, content); generatedUrls.push(`${ORIGIN}${pagePath(locale, page)}`);
    if (locale === "en") {
      const aliasTarget = page === 1 ? path.join(ROOT, "index.html") : path.join(ROOT, "page", String(page), "index.html");
      const aliasPath = page === 1 ? "/" : `/page/${page}/`;
      const aliasContent = content.replace(`<link rel="canonical" href="${ORIGIN}${pagePath("en", page)}"`, `<link rel="canonical" href="${ORIGIN}${aliasPath}"`);
      await write(aliasTarget, aliasContent);
      generatedUrls.push(`${ORIGIN}${page === 1 ? "/" : `/page/${page}/`}`);
    }
  }
  const methodology = renderMethodology({ locale, sites, updatedDate })
    .replaceAll(`${ORIGIN}/zh/`, `${ORIGIN}/cn/`)
    .replaceAll(`${ORIGIN}/methodology/`, `${ORIGIN}/en/methodology/`);
  await write(path.join(ROOT, basePath(locale).replace(/^\//, ""), "methodology", "index.html"), methodology);
  generatedUrls.push(`${ORIGIN}${basePath(locale)}/methodology/`);
  if (locale === "en") {
    await write(path.join(ROOT, "methodology", "index.html"), methodology);
    generatedUrls.push(`${ORIGIN}/methodology/`);
  }
  for (const { topic, matches } of topics) {
    const pages = Math.ceil(matches.length / PAGE_SIZE);
    for (let page = 1; page <= pages; page += 1) {
      const content = renderTopic({ locale, topic, page, totalPages: pages, sites: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), allMatches: matches, topics, updatedDate });
      const target = page === 1
        ? path.join(ROOT, basePath(locale).replace(/^\//, ""), topic.slug, "index.html")
        : path.join(ROOT, basePath(locale).replace(/^\//, ""), topic.slug, "page", String(page), "index.html");
      await write(target, content); generatedUrls.push(`${ORIGIN}${topicPath(locale, topic, page)}`);
      if (locale === "en") {
        const aliasTarget = page === 1 ? path.join(ROOT, topic.slug, "index.html") : path.join(ROOT, topic.slug, "page", String(page), "index.html");
        const aliasPath = page === 1 ? `/${topic.slug}/` : `/${topic.slug}/page/${page}/`;
        const aliasContent = content.replace(`<link rel="canonical" href="${ORIGIN}${topicPath("en", topic, page)}"`, `<link rel="canonical" href="${ORIGIN}${aliasPath}"`);
        await write(aliasTarget, aliasContent);
        generatedUrls.push(`${ORIGIN}/${topic.slug}/${page === 1 ? "" : `page/${page}/`}`);
      }
    }
  }
  for (const site of sites) { await write(path.join(ROOT, sitePath(locale, slug(site)).replace(/^\//, ""), "index.html"), renderSite({ locale, site, translated: site.translated, updatedDate })); generatedUrls.push(`${ORIGIN}${sitePath(locale, slug(site))}`); }
}

await write(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(generatedUrls)].map((url) => `<url><loc>${url}</loc><lastmod>${updatedDate}</lastmod><changefreq>daily</changefreq></url>`).join("")}</urlset>\n`);
process.stdout.write(`已生成多语言页面：${generatedUrls.length} 个 URL；数据日期 ${updatedDate}\n`);
