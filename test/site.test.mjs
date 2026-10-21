import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeSite, rankSites, scoreSite } from "../scripts/build.mjs";
import { ORIGIN as origin, LOCALES, LOCALE_IDS, alternates, outboundUrl, pagePath, siteSlug } from "../scripts/locales.mjs";
import { TEXT, TOPICS } from "../scripts/content.mjs";
import { EDITORIAL } from "../scripts/editorial.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(path.join(root, "data.json"), "utf8"));
const source = data.sites.map(normalizeSite)
  .sort((a, b) => a.rank - b.rank)
  .filter((site, index, items) => items.findIndex((candidate) =>
    candidate.name.toLowerCase() === site.name.toLowerCase() || candidate.url === site.url) === index)
  .slice(0, 500);
const ranked = rankSites(source, data.updatedDate);
const totalPages = Math.ceil(source.length / 40);
const topicSites = new Map(TOPICS.map((topic) => [topic.slug, ranked.filter((site) =>
  topic.terms.some((term) => [site.name, site.description, ...site.models].join(" ").toLowerCase().includes(term)))]));

// Keep one filesystem inventory and one read per file for the entire ~2,200-page tree.
const htmlCache = new Map();
let inventoryPromise;
function inventory() {
  return inventoryPromise ||= (async () => {
    const files = new Set();
    const excluded = new Set(["scripts", "test", "translations", "docs", "node_modules"]);
    async function walk(directory, relative = "") {
      const entries = await readdir(directory, { withFileTypes: true });
      await Promise.all(entries.map(async (entry) => {
        if (entry.name.startsWith(".") || (!relative && excluded.has(entry.name))) return;
        const name = `${relative}${entry.name}`;
        if (entry.isDirectory()) await walk(path.join(directory, entry.name), `${name}/`);
        else if (entry.isFile()) files.add(name);
      }));
    }
    await walk(root);
    return files;
  })();
}
function read(file) {
  if (!htmlCache.has(file)) htmlCache.set(file, readFile(path.join(root, file), "utf8"));
  return htmlCache.get(file);
}
function routeFile(route) { return `${decodeURIComponent(route).slice(1)}index.html`; }
function decode(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
    if (named[entity]) return named[entity];
    return String.fromCodePoint(entity[2].toLowerCase() === "x" ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)));
  });
}
function text(html) { return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map(([, key, double, single]) => [key, decode(double ?? single)]));
}
function tags(html, name) { return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map(([tag]) => attributes(tag)); }
function hasClass(tag, name) { return (tag.class || "").split(/\s+/).includes(name); }
function jsonLd(html) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, "only static JSON-LD, no executable scripts");
  assert.equal(attributes(scripts[0][1]).type, "application/ld+json");
  return JSON.parse(scripts[0][2]);
}
function rankingRows(html) {
  return [...html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)]
    .filter((match) => hasClass(attributes(match[1]), "ranking-row"))
    .map((match) => {
      const attrs = attributes(match[1]);
      const cell = [...match[2].matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)]
        .find((cell) => hasClass(attributes(cell[1]), "site-cell"));
      assert.ok(cell, "each ranking row has a provider row header");
      assert.equal(attributes(cell[1]).scope, "row");
      const name = cell[2].match(/<a\b[^>]*>([\s\S]*?)<\/a>/)?.[1];
      const description = cell[2].match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1];
      assert.ok(name && description, "each row has a provider name and evidence summary");
      assert.equal(tags(match[2], "td").length, 8, "nine data columns including the row header");
      return { rank: Number(attrs["data-rank"]), score: Number(attrs["data-score"]), name: text(name), description: text(description) };
    });
}

const expectedPages = new Map();
function addPage(locale, identity, sites) {
  const canonical = `${origin}${pagePath(locale, identity, true)}`;
  for (const route of new Set([pagePath(locale, identity), pagePath(locale, identity, true)])) {
    assert.ok(!expectedPages.has(routeFile(route)), `duplicate generated route: ${route}`);
    expectedPages.set(routeFile(route), { locale, identity, route, canonical, sites });
  }
}
for (const locale of LOCALE_IDS) {
  for (let page = 1; page <= totalPages; page++) addPage(locale, { kind: "home", page }, ranked);
  for (const [slug, sites] of topicSites) {
    for (let page = 1; page <= Math.max(1, Math.ceil(sites.length / 40)); page++) addPage(locale, { kind: "topic", slug, page }, sites);
  }
  for (const site of ranked) addPage(locale, { kind: "site", slug: siteSlug(site) }, [site]);
  for (const kind of ["methodology", "vocabulary", "guides"]) addPage(locale, { kind });
  for (const guide of EDITORIAL[locale].guides) addPage(locale, { kind: "guide", slug: guide.slug });
}

function baseSite(overrides = {}) {
  return {
    name: "测试站", url: "https://example.com/", establishedDate: "", modelCount: 0, models: [],
    uptime: null, latencyMs: null, userRating: null, ratingCount: 0, paymentMethods: [],
    supportsRefund: null, supportsInvoice: null, ...overrides,
  };
}

test("scoring handles Bayesian ratings, missing fields and deterministic ranking", () => {
  const sparse = scoreSite(baseSite(), 0, 2, "2026-08-03");
  assert.ok(Math.abs(sparse.score - 54.15) < 1e-10);
  assert.equal(sparse.scoreCoverage, 0.1);
  const oneRating = scoreSite(baseSite({ userRating: 5, ratingCount: 1 }), 0, 2, "2026-08-03");
  assert.ok(oneRating.scoreComponents.rating < 70, "one five-star review is Bayesian-adjusted");
  const invalid = scoreSite(baseSite({ uptime: 120, latencyMs: -1, userRating: 8, ratingCount: 10 }), 0, 2, "2026-08-03");
  assert.equal(invalid.scoreComponents.uptime, null);
  assert.equal(invalid.scoreComponents.latency, null);
  assert.equal(invalid.scoreComponents.rating, null);
  const full = scoreSite(baseSite({ uptime: 100, latencyMs: 1000, userRating: 5, ratingCount: 10, modelCount: 40,
    establishedDate: "2024-01-01", paymentMethods: ["a", "b", "c"], supportsRefund: true, supportsInvoice: true }), 0, 2, "2026-08-03");
  assert.equal(full.scoreCoverage, 1);
  assert.equal(full.scoreComponents.rating, 81.25);
  assert.equal(full.score, 93.1875);
  const sites = [baseSite({ name: "乙", url: "https://b.example/" }), baseSite({ name: "甲", url: "https://a.example/" })];
  const before = structuredClone(sites);
  assert.deepEqual(rankSites(sites, "2026-08-03"), rankSites(sites, "2026-08-03"));
  assert.deepEqual(sites, before, "ranking does not mutate input");
  assert.deepEqual(rankSites(sites, "2026-08-03").map(({ name }) => name), ["乙", "甲"]);
  assert.equal(source.length, 500, "the committed snapshot retains 500 unique providers");
});

test("all localized and alias ranking pages preserve deterministic 40-row semantic tables", async () => {
  for (const [file, { locale, identity, sites }] of expectedPages) {
    if (!["home", "topic"].includes(identity.kind)) continue;
    const html = await read(file);
    const rows = rankingRows(html);
    const page = identity.page;
    const expected = sites.slice((page - 1) * 40, page * 40);
    assert.equal(rows.length, expected.length, file);
    assert.ok(rows.length <= 40, file);
    assert.deepEqual(rows.map(({ name }) => name), expected.map(({ name }) => name), file);
    assert.deepEqual(rows.map(({ rank }) => rank), expected.map(({ rank }) => rank), file);
    rows.forEach((row, index) => assert.equal(row.score, Number(expected[index].score.toFixed(6)), file));
    if (rows.length) {
      assert.equal(tags(html, "table").filter((tag) => hasClass(tag, "ranking-table")).length, 1, file);
      assert.ok(text(html.match(/<caption>([\s\S]*?)<\/caption>/)?.[1] || ""), file);
      assert.match(html, /<colgroup>/, file);
      const head = html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] || "";
      assert.equal(tags(head, "th").filter((tag) => tag.scope === "col").length, 9, file);
      assert.equal(tags(html, "tbody").length, 1, file);
      assert.ok(tags(html, "div").some((tag) => hasClass(tag, "ranking-table-wrap") && tag.role === "region" && tag.tabindex === "0" && tag["aria-label"]), file);
      assert.equal(new Set(rows.map(({ name }) => name)).size, rows.length, file);
    } else {
      assert.ok(html.includes(TEXT[locale].empty), file);
    }
    const links = tags(html, "link");
    const count = Math.max(1, Math.ceil(sites.length / 40));
    for (const [rel, number, present] of [["prev", page - 1, page > 1], ["next", page + 1, page < count]]) {
      assert.deepEqual(links.filter((link) => link.rel === rel).map(({ href }) => href),
        present ? [`${origin}${pagePath(locale, { ...identity, page: number }, true)}`] : [], `${file}: ${rel}`);
    }
    const pagination = [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)].find((match) => hasClass(attributes(match[1]), "pagination"));
    assert.equal(Boolean(pagination), count > 1, file);
    if (pagination) {
      assert.equal(text(pagination[2].match(/<span\b[^>]*aria-current="page"[^>]*>([\s\S]*?)<\/span>/)?.[1] || ""), String(page), file);
      const hrefs = tags(pagination[2], "a").map(({ href }) => href);
      if (page > 1) assert.ok(hrefs.includes(pagePath(locale, { ...identity, page: page - 1 })), file);
      if (page < count) assert.ok(hrefs.includes(pagePath(locale, { ...identity, page: page + 1 })), file);
    }
    assert.doesNotMatch(html, /ranking-detail-row|ranking-note|page-analysis|station-card|station-list/, file);
  }
});

test("generated output contains every required route and no obsolete HTML routes", async () => {
  const files = await inventory();
  const actual = [...files].filter((file) => file.endsWith(".html")).sort();
  assert.deepEqual(actual, [...expectedPages.keys(), "404.html"].sort());
  for (const asset of ["favicon.svg", "og-image.svg", "styles.css", "styles.min.css"]) assert.ok(files.has(`assets/${asset}`));
});

test("every page has consistent static metadata, canonical language links and exact branding", async () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const [file, page] of expectedPages) {
    const { locale, identity, canonical } = page;
    const html = await read(file);
    assert.ok(html.startsWith("<!doctype html>"), file);
    assert.equal(tags(html, "html")[0]?.lang, LOCALES[locale].lang, file);
    assert.equal(tags(html, "h1").length, 1, file);
    assert.equal(tags(html, "main").filter((tag) => tag.id === "main").length, 1, file);
    assert.doesNotMatch(html, /<meta\b[^>]*(?:http-equiv="refresh"|name="keywords")|href="javascript:|\son[a-z]+\s*=/i, file);
    const links = tags(html, "link");
    assert.deepEqual(links.filter((link) => link.rel === "canonical").map(({ href }) => href), [canonical], file);
    const alternateLinks = links.filter((link) => link.rel === "alternate");
    const expectedAlternates = alternates(identity).map(({ lang, url }) => [lang, url]);
    assert.deepEqual(alternateLinks.map(({ hreflang, href }) => [hreflang, href]).sort(),
      [...expectedAlternates, ["x-default", expectedAlternates.find(([lang]) => lang === "en")[1]]].sort(), file);
    const languageLinks = tags(html, "a").filter((tag) => hasClass(tag, "language-link"));
    assert.deepEqual(languageLinks.map(({ hreflang, href }) => [hreflang, href]).sort(), [...expectedAlternates].sort(), file);
    assert.equal(languageLinks.filter((tag) => tag["aria-current"] === "page").length, 1, file);
    assert.equal(languageLinks.find((tag) => tag["aria-current"] === "page").hreflang, LOCALES[locale].lang, file);
    languageLinks.forEach((tag) => assert.equal(tag.lang, tag.hreflang, file));
    const metadata = tags(html, "meta");
    const meta = (name) => {
      const values = metadata.filter((tag) => tag.name === name || tag.property === name);
      assert.equal(values.length, 1, `${file}: ${name}`);
      return values[0].content;
    };
    const title = decode(html.match(/<title>([^<]+)<\/title>/)?.[1] || "");
    const description = meta("description");
    assert.ok(title && description, file);
    assert.match(title, / \| AI Ranking$/, file);
    assert.equal(meta("og:title"), title, file);
    assert.equal(meta("og:description"), description, file);
    assert.equal(meta("og:url"), canonical, file);
    assert.equal(meta("og:site_name"), "AI Ranking", file);
    assert.equal(meta("og:locale"), LOCALES[locale].og, file);
    assert.equal(meta("og:image"), `${origin}/assets/og-image.svg`, file);
    assert.match(meta("robots"), /^index, follow/, file);
    const ld = jsonLd(html);
    assert.equal(ld["@context"], "https://schema.org", file);
    assert.equal(ld["@type"], ["home", "topic"].includes(identity.kind) ? "CollectionPage" : "WebPage", file);
    assert.equal(ld.url, canonical, file);
    assert.equal(ld.name, title, file);
    assert.equal(ld.description, description, file);
    assert.equal(ld.inLanguage, LOCALES[locale].lang, file);
    assert.deepEqual(ld.isPartOf, { "@type": "WebSite", name: "AI Ranking", url: `${origin}/` }, file);
    const wordmarks = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter((match) => hasClass(attributes(match[1]), "wordmark"));
    assert.equal(wordmarks.length, 2, file);
    for (const mark of wordmarks) {
      assert.equal(attributes(mark[1])["aria-label"], "AI Ranking", file);
      assert.equal(text(mark[2]), "AI Ranking", file);
    }
    assert.doesNotMatch(canonical, /\/page\/1\/$/, file);
    if (locale === "en" && identity.kind === "home" && !page.route.startsWith("/en/")) {
      assert.ok(!titles.has(title), `${file}: distinct pagination title`);
      assert.ok(!descriptions.has(description), `${file}: distinct pagination description`);
      titles.add(title);
      descriptions.add(description);
    }
  }
  assert.equal(titles.size, totalPages);
  const notFound = await read("404.html");
  assert.ok(tags(notFound, "meta").some((tag) => tag.name === "robots" && tag.content === "noindex, follow"));
  assert.equal(jsonLd(notFound).url, `${origin}/404.html`);
  assert.deepEqual(tags(notFound, "link").filter((tag) => tag.rel === "canonical").map(({ href }) => href), [`${origin}/404.html`]);
  assert.equal(tags(notFound, "meta").find((tag) => tag.property === "og:url")?.content, `${origin}/404.html`);
  assert.equal(tags(notFound, "link").filter((tag) => tag.hreflang).length, 0);
});

test("all output internal hrefs, fragments and hreflang destinations exist", async () => {
  const files = await inventory();
  const ids = new Map();
  async function targetIds(file) {
    if (!ids.has(file)) ids.set(file, new Set([...((await read(file)).matchAll(/\bid="([^"]+)"/g))].map((match) => decode(match[1]))));
    return ids.get(file);
  }
  for (const file of [...expectedPages.keys(), "404.html"]) {
    const html = await read(file);
    const base = new URL(file === "404.html" ? "/404.html" : expectedPages.get(file).route, origin);
    for (const tag of [...tags(html, "a"), ...tags(html, "link")]) {
      if (!tag.href) continue;
      const url = new URL(tag.href, base);
      if (url.origin !== origin) continue;
      const pathname = decodeURIComponent(url.pathname).slice(1);
      const target = !pathname || pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      assert.ok(files.has(target), `${file}: broken href ${tag.href}`);
      if (url.hash && target.endsWith(".html")) {
        assert.ok((await targetIds(target)).has(decodeURIComponent(url.hash.slice(1))), `${file}: missing fragment ${tag.href}`);
      }
      if (tag.hreflang) {
        assert.ok(expectedPages.has(target), `${file}: hreflang must resolve to a generated page`);
        assert.equal(url.href, expectedPages.get(target).canonical, `${file}: hreflang points to an alias`);
      }
    }
  }
});

test("sitemap contains exactly the unique canonical pages, never English aliases or 404", async () => {
  const xml = await read("sitemap.xml");
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]));
  const canonicalUrls = new Set([...expectedPages.values()].map(({ canonical }) => canonical));
  assert.equal(locations.length, new Set(locations).size, "no duplicate sitemap entries");
  assert.deepEqual([...locations].sort(), [...canonicalUrls].sort());
  assert.ok(locations.includes(`${origin}/`));
  for (const locale of ["es", "ru", "cn"]) assert.ok(locations.includes(`${origin}/${locale}/`));
  assert.ok(!locations.includes(`${origin}/en/`));
  assert.ok(!locations.includes(`${origin}/404.html`));
  for (const location of locations) {
    assert.equal(new URL(location).origin, origin);
    assert.doesNotMatch(location, /\/en\/(?!sites\/)|\/cn\/sites\/|\/page\/1\//);
    const target = routeFile(new URL(location).pathname);
    assert.equal(expectedPages.get(target)?.canonical, location, "sitemap target is self-canonical");
  }
  assert.match(await read("robots.txt"), /Sitemap: https:\/\/airanking\.github\.io\/sitemap\.xml/);
});

test("all hvoyai links use the page locale and safe external-link attributes", async () => {
  const allowed = new Map(LOCALE_IDS.map((locale) => [locale, new Set(source.map((site) => outboundUrl(site.url, locale)))]));
  for (const [file, { locale, identity, sites }] of expectedPages) {
    const html = await read(file);
    const anchors = tags(html, "a");
    const destinations = [];
    for (const anchor of anchors) {
      const url = new URL(anchor.href, origin);
      if (!["hvoyai.com", "www.hvoyai.com"].includes(url.hostname)) continue;
      assert.equal(url.protocol, "https:", file);
      assert.equal(url.hostname, "www.hvoyai.com", file);
      assert.equal(url.port, "", file);
      assert.equal(url.username + url.password, "", file);
      const prefix = locale === "zh" ? "/sites/" : `/${locale}/sites/`;
      assert.ok(url.pathname.startsWith(prefix), `${file}: ${anchor.href}`);
      assert.ok(allowed.get(locale).has(anchor.href), `${file}: unknown provider destination`);
      assert.equal(anchor.target, "_blank", file);
      assert.ok(anchor.rel.split(/\s+/).includes("nofollow"), file);
      assert.ok(anchor.rel.split(/\s+/).includes("noopener"), file);
      assert.equal(anchor.referrerpolicy, "origin", file);
      destinations.push(anchor.href);
    }
    if (identity.kind === "site") assert.deepEqual(destinations, [outboundUrl(sites[0].url, locale)], file);
    if (["home", "topic"].includes(identity.kind)) {
      assert.deepEqual(destinations, sites.slice((identity.page - 1) * 40, identity.page * 40).flatMap((site) => Array(2).fill(outboundUrl(site.url, locale))), file);
    }
  }
});

test("summaries and detail bodies contain evidence, not raw provider promotional descriptions", async () => {
  for (const locale of LOCALE_IDS) {
    const summaries = [];
    for (let page = 1; page <= totalPages; page++) {
      const html = await read(routeFile(pagePath(locale, { kind: "home", page }, true)));
      const rows = rankingRows(html);
      summaries.push(...rows.map(({ description }) => description));
      rows.forEach((row) => {
        const site = ranked[row.rank - 1];
        const score = new Intl.NumberFormat(LOCALES[locale].intl, { maximumFractionDigits: 1 }).format(site.score);
        assert.ok(row.description.includes(TEXT[locale].scoreSentence({ score, coverage: Math.round(site.scoreCoverage * 100) })), `${locale}: ${site.name}`);
        if (site.description && site.description !== site.name) assert.ok(!row.description.includes(site.description.replace(/\s+/g, " ")), site.name);
      });
    }
    assert.equal(summaries.length, source.length);
    assert.ok(new Set(summaries).size >= source.length * 0.9);
    for (const site of ranked) {
      const file = routeFile(pagePath(locale, { kind: "site", slug: siteSlug(site) }));
      const html = await read(file);
      assert.ok(text(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] || "") === site.name, file);
      const body = text(html.match(/<body>([\s\S]*?)<\/body>/)?.[1] || "");
      if (site.description && site.description !== site.name) assert.ok(!body.includes(site.description.replace(/\s+/g, " ").trim()), `${file}: raw source description leaked`);
      assert.ok(body.includes(TEXT[locale].detailLead), file);
      assert.ok(body.includes(TEXT[locale].evidence), file);
      for (const check of EDITORIAL[locale].detailChecks) assert.ok(body.includes(check), file);
    }
  }
});

test("localized editorial content renders on home, topics, methodology, vocabulary and guides", async () => {
  for (const locale of LOCALE_IDS) {
    const e = EDITORIAL[locale];
    const home = await read(routeFile(pagePath(locale, { kind: "home" }, true)));
    for (const copy of [e.introTitle, e.introText, ...e.scenarios.flatMap(({ title, text }) => [title, text]), ...e.faq.flatMap(({ question, answer }) => [question, answer])]) {
      assert.ok(text(home).includes(copy), `${locale}: home editorial is rendered`);
    }
    assert.doesNotMatch(home, /search-vocabulary__terms/);
    const method = text(await read(routeFile(pagePath(locale, { kind: "methodology" }, true))));
    for (const section of e.methodologySections) {
      for (const copy of [section.title, ...(section.paragraphs || []), ...(section.bullets || [])]) assert.ok(method.includes(copy), `${locale}: methodology content`);
    }
    const vocabulary = await read(routeFile(pagePath(locale, { kind: "vocabulary" }, true)));
    assert.match(vocabulary, /search-vocabulary__terms/);
    for (const term of e.vocabularyTerms) assert.ok(text(vocabulary).includes(term), locale);
    for (const topic of TOPICS) {
      const html = text(await read(routeFile(pagePath(locale, { kind: "topic", slug: topic.slug }, true))));
      for (const copy of [e.topicChecks[topic.id].intro, ...e.topicChecks[topic.id].checks]) assert.ok(html.includes(copy), `${locale}: ${topic.id}`);
    }
    const guideIndex = await read(routeFile(pagePath(locale, { kind: "guides" }, true)));
    for (const guide of e.guides) {
      assert.ok(tags(guideIndex, "a").some(({ href }) => href === pagePath(locale, { kind: "guide", slug: guide.slug })), locale);
      const html = text(await read(routeFile(pagePath(locale, { kind: "guide", slug: guide.slug }, true))));
      for (const section of guide.sections) {
        for (const copy of [section.title, ...(section.paragraphs || []), ...(section.bullets || [])]) assert.ok(html.includes(copy), `${locale}: ${guide.slug}`);
      }
    }
  }
});

test("CSS keeps accessible horizontally scrollable semantic tables", async () => {
  const css = await read("assets/styles.css");
  assert.match(css, /\.ranking-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.ranking-table\s*\{[^}]*min-width:\s*900px[^}]*table-layout:\s*fixed/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)/);
  assert.doesNotMatch(css, /\.station-card|\.station-list|\.ranking-detail-row|\.ranking-note|\.page-analysis/);
});
