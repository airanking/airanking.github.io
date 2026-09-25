import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { rankSites, scoreSite } from "../scripts/build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "https://airanking.github.io";
const data = JSON.parse(await readFile(path.join(root, "data.json"), "utf8"));
const source = [...data.sites]
  .sort((a, b) => Number(a.rank) - Number(b.rank))
  .filter((site, index, items) => items.findIndex((candidate) =>
    String(candidate.name).trim().toLowerCase() === String(site.name).trim().toLowerCase()
    || new URL(candidate.url).href === new URL(site.url).href) === index)
  .slice(0, 500);
const totalPages = Math.ceil(source.length / 40);
const topicSlugs = ["gpt", "claude", "codex", "gemini", "deepseek", "glm", "qwen", "kimi"]
  .map((name) => `${name}-zhongzhuanzhan`);

async function pageHtml(page) {
  const file = page === 1 ? path.join(root, "index.html") : path.join(root, "page", String(page), "index.html");
  return readFile(file, "utf8");
}

function jsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "JSON-LD should exist");
  return JSON.parse(match[1]);
}

function rankingRows(html) {
  return [...html.matchAll(/<tr class="ranking-row"[^>]*data-rank="(\d+)" data-score="([\d.]+)"[\s\S]*?<th class="site-cell"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<p>([^<]+)<\/p>/g)]
    .map((match) => ({ rank: Number(match[1]), score: Number(match[2]), name: match[3], description: match[4] }));
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
  assert.ok(sparse.score > 54 && sparse.score < 55);
  assert.equal(sparse.scoreCoverage, 0.1);
  const oneRating = scoreSite(baseSite({ userRating: 5, ratingCount: 1 }), 0, 2, "2026-08-03");
  assert.ok(oneRating.scoreComponents.rating < 70, "one five-star review is Bayesian-adjusted");
  const invalid = scoreSite(baseSite({ uptime: 120, latencyMs: -1, userRating: 8, ratingCount: 10 }), 0, 2, "2026-08-03");
  assert.equal(invalid.scoreComponents.uptime, null);
  assert.equal(invalid.scoreComponents.latency, null);
  assert.equal(invalid.scoreComponents.rating, null);
  const sites = [baseSite({ name: "乙", url: "https://b.example/" }), baseSite({ name: "甲", url: "https://a.example/" })];
  assert.deepEqual(rankSites(sites, "2026-08-03"), rankSites(sites, "2026-08-03"));
});

test("main ranking uses semantic tables and at most 40 sites per page", async () => {
  const rendered = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await pageHtml(page);
    const rows = rankingRows(html);
    assert.ok(rows.length > 0 && rows.length <= 40);
    assert.match(html, /<table class="ranking-table"><caption>/);
    assert.match(html, /<colgroup>/);
    assert.match(html, /<thead><tr><th scope="col">/);
    assert.equal((html.match(/<th class="site-cell" scope="row"/g) || []).length, rows.length);
    assert.equal((html.match(/<tbody><tr class="ranking-row"/g) || []).length, 1);
    assert.equal((html.match(/<tr class="ranking-row"/g) || []).length, rows.length);
    assert.doesNotMatch(html, /ranking-detail-row|ranking-note|page-analysis|PAGE DATA|table-scroll-hint|当前显示第/);
    assert.match(html, /<\/div><div class="ranking-table-wrap"/);
    assert.doesNotMatch(html, /station-card|station-list/);
    rendered.push(...rows);
  }
  assert.equal(rendered.length, source.length);
  assert.equal(new Set(rendered.map(({ name }) => name.toLowerCase())).size, source.length);
  assert.deepEqual(rendered.map(({ rank }) => rank), Array.from({ length: rendered.length }, (_, index) => index + 1));
  rendered.slice(1).forEach((row, index) => assert.ok(rendered[index].score >= row.score));
});

test("generated descriptions are factual, varied, and do not copy source descriptions", async () => {
  const descriptions = [];
  let combined = "";
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await pageHtml(page);
    combined += html;
    descriptions.push(...rankingRows(html).map(({ description }) => description));
  }
  assert.equal(descriptions.length, source.length);
  assert.ok(new Set(descriptions).size >= source.length * 0.9);
  assert.ok(descriptions.every((text) => text.includes("score") || text.includes("Puntuación") || text.includes("综合分")));
  assert.doesNotMatch(combined, /absolute guarantee|garantía de disponibilidad/);
});

test("ranking pages have unique static SEO and correct relations", async () => {
  const titles = new Set();
  const descriptions = new Set();
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await pageHtml(page);
    const canonical = page === 1 ? `${origin}/` : `${origin}/page/${page}/`;
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`));
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
    assert.equal((html.match(/<script type="application\/ld\+json">/g) || []).length, 1);
    assert.match(html, /<html lang="en">/);
    assert.doesNotMatch(html, /\/page\/1\//);
    titles.add(html.match(/<title>([^<]+)<\/title>/)?.[1]);
    descriptions.add(html.match(/<meta name="description" content="([^"]+)"/)?.[1]);
    assert.doesNotThrow(() => jsonLd(html));
    assert.equal((html.match(/<link rel="prev"/g) || []).length, page > 1 ? 1 : 0);
    assert.equal((html.match(/<link rel="next"/g) || []).length, page < totalPages ? 1 : 0);
  }
  assert.equal(titles.size, totalPages);
  assert.equal(descriptions.size, totalPages);
});

test("topic results are completely paginated at 40 items", async () => {
  for (const slug of topicSlugs) {
    const first = await readFile(path.join(root, slug, "index.html"), "utf8");
    const total = Number(first.match(/topic-hero[\s\S]*?<strong>(\d+)<\/strong>/)?.[1]);
    assert.ok(total > 0);
    const pages = Math.ceil(total / 40);
    const names = [];
    for (let page = 1; page <= pages; page += 1) {
      const file = page === 1 ? path.join(root, slug, "index.html") : path.join(root, slug, "page", String(page), "index.html");
      const html = await readFile(file, "utf8");
      const rows = rankingRows(html);
      assert.ok(rows.length > 0 && rows.length <= 40);
      assert.equal((html.match(/<tr class="ranking-row"/g) || []).length, rows.length);
      assert.doesNotMatch(html, /ranking-detail-row|ranking-note|page-analysis|PAGE DATA|table-scroll-hint|>当前 \d+–\d+，共/);
      names.push(...rows.map(({ name }) => name));
      assert.ok(html.includes(`<link rel="canonical" href="${origin}/${slug}/${page === 1 ? "" : `page/${page}/`}"`));
      assert.doesNotThrow(() => jsonLd(html));
    }
    assert.equal(names.length, total);
    assert.equal(new Set(names).size, total);
  }
});

test("methodology, sitemap, resources and CSS match the generated site", async () => {
  const methodology = await readFile(path.join(root, "methodology", "index.html"), "utf8");
  assert.ok(methodology.includes("deterministic formula"));
  assert.match(methodology, /<html lang="en">/);
  assert.ok(methodology.includes("Missing values"));
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(locations).size, locations.length);
  assert.ok(locations.includes(`${origin}/page/13/`));
  assert.ok(locations.includes(`${origin}/es/`));
  assert.ok(locations.includes(`${origin}/cn/`));
  assert.ok(locations.includes(`${origin}/en/`));
  assert.ok(locations.includes(`${origin}/en/sites/yundulol/`));
  assert.ok(locations.includes(`${origin}/es/sites/yundulol/`));
  assert.ok(locations.includes(`${origin}/sites/yundulol/`));
  assert.ok(locations.some((url) => /-zhongzhuanzhan\/page\/2\/$/.test(url)));
  const css = await readFile(path.join(root, "assets", "styles.css"), "utf8");
  assert.match(css, /\.ranking-table-wrap[\s\S]*overflow-x: auto/);
  assert.match(css, /\.ranking-table \{[^}]*min-width: 900px[^}]*table-layout: fixed/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.doesNotMatch(css, /\.station-card|\.station-list|\.rank-badge|\.ranking-detail-row|\.ranking-note|\.page-analysis|\.analysis-grid|\.table-scroll-hint/);
  for (const asset of ["favicon.svg", "og-image.svg", "styles.css", "styles.min.css"]) await access(path.join(root, "assets", asset));
  const pageDirs = (await readdir(path.join(root, "page"), { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));
  assert.equal(pageDirs.length, totalPages - 1);
});

test("localized entry routes use the GitHub Pages origin", async () => {
  for (const [locale, expectedPath] of [["en", "/en/"], ["es", "/es/"], ["cn", "/cn/"]]) {
    const html = await readFile(path.join(root, locale, "index.html"), "utf8");
    assert.ok(html.includes(`<link rel="canonical" href="${origin}${expectedPath}"`));
    assert.match(html, /<meta name="keywords" content="[^"]+">/);
    assert.match(html, /search-vocabulary__terms/);
    assert.match(html, new RegExp(`class="language-link[^>]+href="${origin}/en/`));
    assert.match(html, new RegExp(`class="language-link[^>]+href="${origin}/es/`));
    assert.match(html, new RegExp(`class="language-link[^>]+href="${origin}/cn/`));
    assert.doesNotMatch(html, /class="language-link[^>]+www\.hvoyai\.com/);
  }
  const rootHome = await readFile(path.join(root, "index.html"), "utf8");
  assert.ok(rootHome.includes(`<link rel="canonical" href="${origin}/"`));
  assert.match(rootHome, /AI API gateway/);
});

test("external station links use safe attributes", async () => {
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await pageHtml(page);
    for (const match of html.matchAll(/<a href="(https:[^"]+)" target="_blank" rel="([^"]+)" referrerpolicy="([^"]+)"/g)) {
      assert.equal(match[2], "nofollow noopener");
      assert.equal(match[3], "origin");
    }
    assert.doesNotMatch(html, /href="javascript:/i);
  }
});
