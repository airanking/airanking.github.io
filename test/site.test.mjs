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
    assert.equal((html.match(/<tr class="ranking-detail-row"/g) || []).length, rows.length);
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
  assert.ok(descriptions.every((text) => text.includes("分") || text.includes("快照")));
  for (const site of source.filter(({ description }) => String(description).trim().length >= 80).slice(0, 80)) {
    assert.ok(!combined.includes(String(site.description).trim().slice(0, 80)), `raw description not copied: ${site.name}`);
  }
  assert.doesNotMatch(combined, /绝对稳定|质量保证|最靠谱/);
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
    assert.doesNotMatch(html, /<script(?! type="application\/ld\+json")/);
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
    const total = Number(first.match(/公开资料匹配<\/p><strong>(\d+)<\/strong>/)?.[1]);
    assert.ok(total > 0);
    const pages = Math.ceil(total / 40);
    const names = [];
    for (let page = 1; page <= pages; page += 1) {
      const file = page === 1 ? path.join(root, slug, "index.html") : path.join(root, slug, "page", String(page), "index.html");
      const html = await readFile(file, "utf8");
      const rows = rankingRows(html);
      assert.ok(rows.length > 0 && rows.length <= 40);
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
  assert.ok(methodology.includes("贝叶斯先验"));
  assert.ok(methodology.includes("每页最多 40 条"));
  assert.ok(methodology.includes("最终分 = 50"));
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(locations).size, locations.length);
  assert.ok(locations.includes(`${origin}/page/13/`));
  assert.ok(locations.some((url) => /-zhongzhuanzhan\/page\/2\/$/.test(url)));
  const css = await readFile(path.join(root, "assets", "styles.css"), "utf8");
  assert.match(css, /\.ranking-table-wrap[\s\S]*overflow-x: auto/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.doesNotMatch(css, /\.station-card|\.station-list|\.rank-badge/);
  for (const asset of ["favicon.svg", "og-image.svg", "styles.css", "styles.min.css"]) await access(path.join(root, "assets", asset));
  const pageDirs = (await readdir(path.join(root, "page"), { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));
  assert.equal(pageDirs.length, totalPages - 1);
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
