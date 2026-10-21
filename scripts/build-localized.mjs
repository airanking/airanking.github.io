import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minifyCss, normalizeSite, rankSites } from "./build.mjs";
import { BRAND, ORIGIN, LOCALES, LOCALE_IDS, alternates, outboundUrl, pagePath, siteSlug } from "./locales.mjs";
import { TEXT, TOPICS } from "./content.mjs";
import { EDITORIAL } from "./editorial.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_SIZE = 40;
const MAX_SITES = 500;
const SOURCE = "https://github.com/hvoyai/awesome-ai-api";
const numbers = Object.fromEntries(LOCALE_IDS.map((locale) => [locale, new Intl.NumberFormat(LOCALES[locale].intl, { maximumFractionDigits: 1 })]));
const generated = new Set();
const canonicalUrls = new Set();

function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function num(value, locale) { return numbers[locale].format(value); }
function status(value, locale) { return value === true ? TEXT[locale].yes : value === false ? TEXT[locale].no : TEXT[locale].pending; }
function formatDate(value, locale) {
  if (!value) return TEXT[locale].pending;
  return new Intl.DateTimeFormat(LOCALES[locale].intl, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
function uptime(site, locale) { return site.uptime === null ? TEXT[locale].pending : `${num(site.uptime, locale)}%`; }
function latency(site, locale) {
  if (site.latencyMs === null) return TEXT[locale].pending;
  return site.latencyMs >= 1000 ? `${num(site.latencyMs / 1000, locale)} ${TEXT[locale].units.s}` : `${num(site.latencyMs, locale)} ${TEXT[locale].units.ms}`;
}
function scoreCopy(site, locale) {
  const t = TEXT[locale];
  return `${site.displayName}: ${t.scoreSentence({ score: num(site.score, locale), coverage: Math.round(site.scoreCoverage * 100) })} ${t.performance({ uptime: uptime(site, locale), latency: latency(site, locale) })}`;
}
function paymentLabel(value, locale) {
  const labels = {
    "支付宝": { en: "Alipay", es: "Alipay", ru: "Alipay" },
    "微信": { en: "WeChat Pay", es: "WeChat Pay", ru: "WeChat Pay" },
    "微信支付": { en: "WeChat Pay", es: "WeChat Pay", ru: "WeChat Pay" },
    "银行卡": { en: "Bank card", es: "Tarjeta bancaria", ru: "Банковская карта" },
    "信用卡": { en: "Credit card", es: "Tarjeta de crédito", ru: "Кредитная карта" },
    "银行转账": { en: "Bank transfer", es: "Transferencia bancaria", ru: "Банковский перевод" },
    "对公转账": { en: "Business bank transfer", es: "Transferencia bancaria empresarial", ru: "Перевод на счёт организации" },
  };
  if (locale === "zh") return value;
  return labels[value]?.[locale] || (/\p{Script=Han}/u.test(value) ? TEXT[locale].unknownPayment : value);
}
function modelLabel(value, locale) {
  if (locale === "zh" || !/\p{Script=Han}/u.test(value)) return value;
  const aliases = { "智谱": "GLM / Zhipu", "通义千问": "Qwen", "通义": "Qwen", "千问": "Qwen", "月之暗面": "Kimi / Moonshot", "深度求索": "DeepSeek", "阿里云": "Alibaba Cloud", "百度": "Baidu", "文心一言": "ERNIE", "讯飞": "iFLYTEK", "豆包": "Doubao" };
  return aliases[value] || value.replace(/[\p{Script=Han}（）]+/gu, " ").trim();
}
function sourceLink(site, locale, label, attributes = "") {
  return `<a href="${esc(outboundUrl(site.url, locale))}" target="_blank" rel="nofollow noopener" referrerpolicy="origin"${attributes}>${esc(label)}</a>`;
}
function sectionContent(sections) {
  return sections.map(({ title, paragraphs = [], bullets = [] }) => `<section><h2>${esc(title)}</h2>${paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}${bullets.length ? `<ul>${bullets.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}</section>`).join("");
}
function list(items) { return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`; }
function wordmark(locale) { return `<a class="wordmark" href="${pagePath(locale)}" aria-label="AI Ranking"><span>AI</span><strong>Ranking</strong></a>`; }
function shell({ locale, page, title, description, body, updatedDate, previous = "", next = "", noindex = false }) {
  const t = TEXT[locale];
  const config = LOCALES[locale];
  const canonical = noindex ? `${ORIGIN}/404.html` : `${ORIGIN}${pagePath(locale, page, true)}`;
  const links = alternates(page);
  const alternateTags = noindex ? "" : `${links.map((item) => `<link rel="alternate" hreflang="${item.lang}" href="${item.url}">`).join("")}<link rel="alternate" hreflang="x-default" href="${ORIGIN}${pagePath("en", page, true)}">`;
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": ["home", "topic"].includes(page.kind) ? "CollectionPage" : "WebPage", name: title, description, url: canonical, inLanguage: config.lang, isPartOf: { "@type": "WebSite", name: BRAND, url: `${ORIGIN}/` } }).replaceAll("<", "\\u003c");
  const languageLinks = links.map((item) => `<a class="language-link${item.locale === locale ? " is-current" : ""}" href="${item.url}" lang="${item.lang}" hreflang="${item.lang}"${item.locale === locale ? ' aria-current="page"' : ""}>${LOCALES[item.locale].label}</a>`).join("");
  return `<!doctype html><html lang="${config.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${noindex ? "noindex, follow" : "index, follow, max-image-preview:large"}"><meta name="theme-color" content="#2854bd"><link rel="canonical" href="${canonical}">${alternateTags}<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:site_name" content="${BRAND}"><meta property="og:locale" content="${config.og}"><meta property="og:image" content="${ORIGIN}/assets/og-image.svg"><meta name="twitter:card" content="summary_large_image">${previous ? `<link rel="prev" href="${ORIGIN}${previous}">` : ""}${next ? `<link rel="next" href="${ORIGIN}${next}">` : ""}<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/styles.min.css"><script type="application/ld+json">${jsonLd}</script></head><body><!-- Generated by AI Ranking --><a class="skip-link" href="#main">${t.skip}</a><header class="topbar">${wordmark(locale)}<nav class="primary-nav" aria-label="${t.ranking}"><a href="${pagePath(locale)}#ranking">${t.ranking}</a><a href="${pagePath(locale)}#topics">${t.topics}</a><a href="${pagePath(locale, { kind: "guides" })}">${t.guides}</a><a href="${pagePath(locale, { kind: "methodology" })}">${t.method}</a></nav><nav class="language-switcher" aria-label="${t.language}">${languageLinks}</nav></header>${body}<footer class="footer">${wordmark(locale)}<p>${t.footer}</p><div class="footer-links"><a href="${pagePath(locale, { kind: "guides" })}">${t.guides}</a><a href="${pagePath(locale, { kind: "methodology" })}">${t.method}</a><a href="${pagePath(locale, { kind: "vocabulary" })}">${t.vocabulary}</a><a href="${SOURCE}" rel="noopener" target="_blank">${t.source}</a><a href="#main">${t.top} ↑</a></div><small>${t.updated}: ${esc(formatDate(updatedDate, locale))}</small></footer></body></html>\n`;
}
function breadcrumbs(locale, label) { return `<nav class="breadcrumbs" aria-label="${TEXT[locale].back}"><a href="${pagePath(locale)}">${BRAND}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(label)}</span></nav>`; }
function evidence(locale) { return `<aside class="evidence-note"><p>${TEXT[locale].evidence}</p></aside>`; }
function renderTable(locale, sites, caption) {
  const t = TEXT[locale];
  if (!sites.length) return `<p class="empty-state">${t.empty}</p>`;
  const columns = [t.rank, t.provider, t.score, t.uptime, t.latency, t.models, t.reviews, t.policy, t.visit];
  return `<div class="ranking-table-wrap" role="region" aria-label="${esc(t.rankingTitle)}" tabindex="0"><table class="ranking-table"><caption>${esc(caption)}</caption><colgroup>${["rank", "site", "score", "uptime", "latency", "models", "rating", "policy", "action"].map((col) => `<col class="col-${col}">`).join("")}</colgroup><thead><tr>${columns.map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${sites.map((site) => {
    const rating = site.userRating === null || site.ratingCount === 0 ? t.pending : `${num(site.userRating, locale)} / 5 (${num(site.ratingCount, locale)})`;
    return `<tr class="ranking-row" id="rank-${site.rank}" data-rank="${site.rank}" data-score="${site.score.toFixed(6)}"><td class="rank-cell numeric"><strong>${site.rank}</strong></td><th class="site-cell" scope="row" id="station-${site.rank}">${sourceLink(site, locale, site.displayName)}<p>${esc(scoreCopy(site, locale))}</p><a class="table-link" href="${pagePath(locale, { kind: "site", slug: siteSlug(site) })}">${t.profile} →</a></th><td class="score-cell numeric"><strong>${num(site.score, locale)}</strong><small>${t.coverage} ${Math.round(site.scoreCoverage * 100)}%</small></td><td class="numeric">${uptime(site, locale)}</td><td class="numeric">${latency(site, locale)}</td><td class="numeric">${site.modelCount > 0 ? num(site.modelCount, locale) : t.pending}</td><td class="numeric">${esc(rating)}</td><td class="policy-cell"><span>${t.refund}: ${status(site.supportsRefund, locale)}</span><span>${t.invoice}: ${status(site.supportsInvoice, locale)}</span></td><td>${sourceLink(site, locale, "↗", ` class="table-link" aria-label="${esc(`${t.visit}: ${site.displayName}`)}"`)}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}
function pagination(locale, page, total, identity) {
  if (total <= 1) return "";
  const t = TEXT[locale];
  const href = (number) => pagePath(locale, { ...identity, page: number });
  const values = Array.from({ length: total }, (_, i) => i + 1).filter((value) => value === 1 || value === total || Math.abs(value - page) <= 1);
  return `<nav class="pagination" aria-label="${t.page}">${page > 1 ? `<a class="page-step" href="${href(page - 1)}">← ${t.previous}</a>` : `<span class="page-step is-disabled">${t.previous}</span>`}<div class="page-numbers">${values.map((value, i) => `${i && value - values[i - 1] > 1 ? '<span class="page-gap">…</span>' : ""}${value === page ? `<span class="page-number is-current" aria-current="page">${value}</span>` : `<a class="page-number" href="${href(value)}">${value}</a>`}`).join("")}</div>${page < total ? `<a class="page-step" href="${href(page + 1)}">${t.next} →</a>` : `<span class="page-step is-disabled">${t.next}</span>`}</nav>`;
}
function topicCards(locale, topics) {
  const t = TEXT[locale];
  const e = EDITORIAL[locale];
  return `<section class="topic-directory" id="topics"><div class="topic-directory__head"><div><p class="section-kicker">${t.topics}</p><h2>${t.topicsTitle}</h2></div><p>${t.topicsLead}</p></div><div class="topic-directory__grid">${topics.map(({ topic, matches }) => `<article><h3>${topic.name}</h3><p>${esc(e.topicChecks[topic.id].intro)}</p><div><span>${num(matches.length, locale)} ${t.matches}</span><a href="${pagePath(locale, { kind: "topic", slug: topic.slug })}">${t.viewTopic} →</a></div></article>`).join("")}</div></section>`;
}
function guideCards(locale) {
  const e = EDITORIAL[locale];
  return `<section class="editorial-section guide-index"><p class="section-kicker">${TEXT[locale].guides}</p><h2>${esc(e.guidesTitle)}</h2><p>${esc(e.guidesLead)}</p><div class="card-grid">${e.guides.map((guide) => `<article class="guide-card"><h3><a href="${pagePath(locale, { kind: "guide", slug: guide.slug })}">${esc(guide.title)}</a></h3><p>${esc(guide.summary)}</p><a class="table-link" href="${pagePath(locale, { kind: "guide", slug: guide.slug })}">${esc(e.readGuide)} →</a></article>`).join("")}</div></section>`;
}
function homeEditorial(locale) {
  const e = EDITORIAL[locale];
  return `<section class="editorial-section"><p class="section-kicker">${BRAND}</p><h2>${esc(e.introTitle)}</h2><p>${esc(e.introText)}</p><h3>${esc(e.scenariosTitle)}</h3><div class="card-grid">${e.scenarios.map((s) => `<article class="guide-card"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></article>`).join("")}</div></section>${guideCards(locale)}<section class="faq-section"><h2>${esc(e.faqTitle)}</h2>${e.faq.map(({ question, answer }) => `<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join("")}</section>`;
}
function renderRanking({ locale, identity, sites, topics, updatedDate, topic = null }) {
  const t = TEXT[locale];
  const e = EDITORIAL[locale];
  const page = identity.page || 1;
  const totalPages = Math.max(1, Math.ceil(sites.length / PAGE_SIZE));
  const rows = sites.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const first = rows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = rows.length ? first + rows.length - 1 : 0;
  const label = topic ? `${topic.name} · ${t.topics}` : t.homeTitle;
  const title = `${label}${page > 1 ? ` — ${t.page} ${page}` : ""} | ${BRAND}`;
  const lead = topic ? e.topicChecks[topic.id].intro : t.lead;
  const description = `${lead} ${t.page} ${page}. ${t.range}: ${first}–${last} / ${sites.length}.`;
  const caption = t.tableCaption.replace("{first}", first).replace("{last}", last).replace("{total}", sites.length);
  const body = `<main id="main" tabindex="-1">${breadcrumbs(locale, page > 1 ? `${label} / ${t.page} ${page}` : label)}<section class="hero${topic ? " topic-hero" : ""}"><div class="hero__copy"><p class="eyebrow">${BRAND} / ${topic ? topic.name : t.snapshot}</p><h1>${esc(topic ? topic.name : t.homeH1)}<br><em>${esc(topic ? t.topics : t.homeEm)}</em></h1><p class="hero-copy">${esc(lead)}</p><div class="hero-actions"><a href="#ranking">${t.viewTable}</a><a href="${pagePath(locale, { kind: "methodology" })}">${t.viewMethod}</a></div></div><aside class="hero__panel"><p>${topic ? t.matches : t.collected}</p><strong>${sites.length}</strong><span>${t.snapshot}</span><dl><div><dt>${t.updated}</dt><dd>${esc(formatDate(updatedDate, locale))}</dd></div><div><dt>${t.page}</dt><dd>${page} / ${totalPages}</dd></div><div><dt>${t.range}</dt><dd>${first}–${last}</dd></div></dl></aside></section><section class="ranking" id="ranking">${evidence(locale)}<div class="ranking-head"><div><p>${t.page} ${String(page).padStart(2, "0")}</p><h2>${t.rankingTitle}</h2></div></div>${renderTable(locale, rows, caption)}${pagination(locale, page, totalPages, identity)}</section>${topic && page === 1 ? `<section class="editorial-section topic-checks"><h2>${esc(e.topicChecksTitle)}</h2><p>${t.topicsLead}</p>${list(e.topicChecks[topic.id].checks)}</section>${guideCards(locale)}` : ""}${!topic && page === 1 ? `${topicCards(locale, topics)}${homeEditorial(locale)}` : ""}</main>`;
  return shell({ locale, page: identity, title, description, body, updatedDate, previous: page > 1 ? pagePath(locale, { ...identity, page: page - 1 }, true) : "", next: page < totalPages ? pagePath(locale, { ...identity, page: page + 1 }, true) : "" });
}
function renderSite({ locale, site, updatedDate }) {
  const t = TEXT[locale];
  const e = EDITORIAL[locale];
  const identity = { kind: "site", slug: siteSlug(site) };
  const description = scoreCopy(site, locale);
  const modelLabels = site.models.map((value) => modelLabel(value, locale)).filter(Boolean);
  const facts = [
    [t.rank, String(site.rank)], [t.score, `${num(site.score, locale)} / 100`], [t.coverage, `${Math.round(site.scoreCoverage * 100)}%`],
    [t.uptime, uptime(site, locale)], [t.latency, latency(site, locale)], [t.models, site.modelCount || t.pending],
    [t.reviews, site.userRating !== null && site.ratingCount > 0 ? `${num(site.userRating, locale)} / 5 (${num(site.ratingCount, locale)})` : t.pending],
    [t.established, formatDate(site.establishedDate, locale)], [t.refund, status(site.supportsRefund, locale)], [t.invoice, status(site.supportsInvoice, locale)],
    [t.payments, site.paymentMethods.length ? [...new Set(site.paymentMethods.map((value) => paymentLabel(value, locale)))].join(" · ") : t.pending],
  ];
  const body = `<main id="main" tabindex="-1">${breadcrumbs(locale, site.displayName)}<article class="methodology"><header class="article-header"><p class="eyebrow">${t.profile}</p><h1>${esc(site.displayName)}</h1><p class="methodology__lead">${esc(description)}</p><p>${t.detailLead}</p><div class="hero-actions">${sourceLink(site, locale, `${t.sourcePage} ↗`)}<a href="${pagePath(locale)}">${t.back}</a></div></header>${evidence(locale)}<section><h2>${t.detailTitle}</h2><dl class="detail-facts">${facts.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></section><section><h2>${t.modelsList}</h2><p>${esc(modelLabels.length ? modelLabels.join(", ") : t.missingModels)}</p><p>${t.topicsLead}</p></section><section><h2>${esc(e.detailChecksTitle)}</h2>${list(e.detailChecks)}</section></article>${guideCards(locale)}</main>`;
  return shell({ locale, page: identity, title: `${site.displayName} — ${t.profile} | ${BRAND}`, description, body, updatedDate });
}
function renderArticle({ locale, identity, updatedDate }) {
  const t = TEXT[locale];
  const e = EDITORIAL[locale];
  let title, lead, content;
  if (identity.kind === "methodology") {
    title = t.methodTitle; lead = t.methodLead; content = `${evidence(locale)}${sectionContent(e.methodologySections)}`;
  } else if (identity.kind === "vocabulary") {
    title = e.vocabularyTitle; lead = e.vocabularyLead;
    content = `<section class="search-vocabulary"><div class="search-vocabulary__terms">${e.vocabularyTerms.map((term) => `<span>${esc(term)}</span>`).join("")}</div><p>${t.topicsLead}</p></section>`;
  } else if (identity.kind === "guides") {
    title = e.guidesTitle; lead = e.guidesLead; content = "";
  } else {
    const guide = e.guides.find((item) => item.slug === identity.slug);
    title = guide.title; lead = guide.summary; content = sectionContent(guide.sections);
  }
  const body = `<main id="main" tabindex="-1">${breadcrumbs(locale, title)}<article class="methodology prose"><header class="article-header"><p class="eyebrow">${BRAND} / ${identity.kind === "methodology" ? t.method : identity.kind === "vocabulary" ? t.vocabulary : t.guideLabel}</p><h1>${esc(title)}</h1><p class="methodology__lead">${esc(lead)}</p></header><div class="article-body">${content}</div></article>${["guide", "guides"].includes(identity.kind) ? guideCards(locale) : ""}</main>`;
  return shell({ locale, page: identity, title: `${title} | ${BRAND}`, description: lead, body, updatedDate });
}
async function write(target, content) {
  const file = path.join(ROOT, target);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  generated.add(file);
}
async function emit(locale, identity, html) {
  const route = pagePath(locale, identity);
  const canonical = pagePath(locale, identity, true);
  await write(`${route.slice(1)}index.html`, html);
  if (route !== canonical) await write(`${canonical.slice(1)}index.html`, html);
  canonicalUrls.add(`${ORIGIN}${canonical}`);
}
// Remove only obsolete generated HTML, never whole user-owned directories.
async function prune(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) { await prune(target); continue; }
    if (!entry.isFile() || entry.name !== "index.html" || generated.has(target)) continue;
    const html = await readFile(target, "utf8");
    if (html.includes(`rel="canonical" href="${ORIGIN}/`) && html.includes("<!-- Generated by AI Ranking -->")) await unlink(target);
  }
}

const payload = JSON.parse(await readFile(path.join(ROOT, "data.json"), "utf8"));
if (!Array.isArray(payload.sites)) throw new Error("Expected a sites array");
if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.updatedDate || "")) throw new Error("Expected a stable snapshot date");
const updatedDate = payload.updatedDate;
const normalized = payload.sites.map(normalizeSite).sort((a, b) => a.rank - b.rank).filter((site, index, items) => items.findIndex((candidate) => candidate.name.toLowerCase() === site.name.toLowerCase() || candidate.url === site.url) === index).slice(0, MAX_SITES);
const ranked = rankSites(normalized, updatedDate);
for (const locale of LOCALE_IDS) {
  // Proper names are source identifiers; promotional source descriptions are never rendered.
  const sites = ranked.map((site) => ({ ...site, displayName: site.name }));
  const topics = TOPICS.map((topic) => ({ topic, matches: sites.filter((site) => topic.terms.some((term) => [site.name, site.description, ...site.models].join(" ").toLowerCase().includes(term))) }));
  for (let page = 1; page <= Math.max(1, Math.ceil(sites.length / PAGE_SIZE)); page++) {
    const identity = { kind: "home", page };
    await emit(locale, identity, renderRanking({ locale, identity, sites, topics, updatedDate }));
  }
  for (const { topic, matches } of topics) {
    for (let page = 1; page <= Math.max(1, Math.ceil(matches.length / PAGE_SIZE)); page++) {
      const identity = { kind: "topic", slug: topic.slug, page };
      await emit(locale, identity, renderRanking({ locale, identity, sites: matches, topics, updatedDate, topic }));
    }
  }
  for (const site of sites) await emit(locale, { kind: "site", slug: siteSlug(site) }, renderSite({ locale, site, updatedDate }));
  for (const identity of [{ kind: "methodology" }, { kind: "vocabulary" }, { kind: "guides" }, ...EDITORIAL[locale].guides.map((guide) => ({ kind: "guide", slug: guide.slug }))]) {
    await emit(locale, identity, renderArticle({ locale, identity, updatedDate }));
  }
}
await write("assets/styles.min.css", minifyCss(await readFile(path.join(ROOT, "assets/styles.css"), "utf8")));
await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...canonicalUrls].sort().map((url) => `<url><loc>${esc(url)}</loc></url>`).join("")}</urlset>\n`);
await write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
await write("404.html", shell({ locale: "en", page: { kind: "home" }, title: `Page not found | ${BRAND}`, description: "This address is not in the AI Ranking directory.", updatedDate, noindex: true, body: `<main id="main" tabindex="-1"><section class="methodology not-found"><p class="eyebrow">404 / AI Ranking</p><h1>This page is off the list.</h1><p>The address may have changed. Choose a language to return to the rankings.</p><div class="hero-actions">${LOCALE_IDS.map((locale) => `<a href="${pagePath(locale)}" lang="${LOCALES[locale].lang}">${LOCALES[locale].label}</a>`).join("")}</div></section></main>` }));
for (const directory of ["en", "es", "ru", "cn", "sites", "page", "guides", "methodology", "search-vocabulary", ...TOPICS.map((topic) => topic.slug)]) await prune(path.join(ROOT, directory));
process.stdout.write(`Generated ${canonicalUrls.size} canonical pages in ${LOCALE_IDS.length} languages; snapshot ${updatedDate}\n`);
