import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "https://airanking.github.io";
const data = JSON.parse(await readFile(path.join(root, "data.json"), "utf8"));
const source = [...data.sites]
  .sort((a, b) => Number(a.rank) - Number(b.rank))
  .filter((site, index, items) => items.findIndex((candidate) =>
    String(candidate.name).trim().toLowerCase() === String(site.name).trim().toLowerCase()
    || new URL(candidate.url).href === new URL(site.url).href) === index)
  .slice(0, 500);
const totalPages = Math.ceil(source.length / 50);
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

function cardNames(html) {
  return [...html.matchAll(/<article class="station-card"[^>]*>[\s\S]*?<h2[^>]*><a[^>]*>([^<]+)<\/a>/g)]
    .map((match) => match[1].replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#039;", "'"));
}

test("snapshot and generated ranking never exceed 500 unique sites", async () => {
  assert.ok(data.sites.length <= 500);
  assert.ok(source.length > 0 && source.length <= 500);
  const rendered = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await pageHtml(page);
    const names = cardNames(html);
    assert.ok(names.length > 0 && names.length <= 50);
    rendered.push(...names);
  }
  assert.equal(rendered.length, source.length);
  assert.equal(new Set(rendered.map((name) => name.toLowerCase())).size, source.length);
});

test("bounded shuffle stays inside each five-site source group", async () => {
  const sourcePositions = new Map(source.map((site, index) => [site.name, index + 1]));
  const rendered = [];
  for (let page = 1; page <= totalPages; page += 1) rendered.push(...cardNames(await pageHtml(page)));
  rendered.forEach((name, index) => {
    const displayRank = index + 1;
    const sourceRank = sourcePositions.get(name);
    assert.ok(sourceRank, `source rank for ${name}`);
    assert.ok(Math.abs(displayRank - sourceRank) <= 4, `${name} moved at most four places`);
    assert.equal(Math.floor((displayRank - 1) / 5), Math.floor((sourceRank - 1) / 5));
  });
});

test("all generated ranking pages are static, coherent and indexable", async () => {
  const titles = new Set();
  const descriptions = new Set();
  const canonicals = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const html = await pageHtml(page);
    const canonical = page === 1 ? `${origin}/` : `${origin}/page/${page}/`;
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`));
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
    assert.doesNotMatch(html, /<script(?! type="application\/ld\+json")/);
    assert.doesNotMatch(html, /\/page\/1\//);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(title?.includes("AI 中转站推荐"));
    assert.ok(description);
    titles.add(title);
    descriptions.add(description);
    canonicals.push(canonical);
    assert.doesNotThrow(() => jsonLd(html));
    const previous = [...html.matchAll(/<link rel="prev" href="([^"]+)"/g)].map((match) => match[1]);
    const next = [...html.matchAll(/<link rel="next" href="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(previous.length, page > 1 ? 1 : 0);
    assert.equal(next.length, page < totalPages ? 1 : 0);
  }
  assert.equal(titles.size, totalPages);
  assert.equal(descriptions.size, totalPages);
  assert.equal(new Set(canonicals).size, totalPages);
});

test("topic and methodology pages contain unique SEO and useful content", async () => {
  const titles = new Set();
  for (const slug of topicSlugs) {
    const html = await readFile(path.join(root, slug, "index.html"), "utf8");
    assert.ok(cardNames(html).length > 0);
    assert.ok(html.includes(`<link rel="canonical" href="${origin}/${slug}/"`));
    assert.ok(html.includes('class="topic-focus-grid"'));
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
    assert.doesNotThrow(() => jsonLd(html));
    titles.add(html.match(/<title>([^<]+)<\/title>/)?.[1]);
  }
  assert.equal(titles.size, topicSlugs.length);
  const methodology = await readFile(path.join(root, "methodology", "index.html"), "utf8");
  assert.ok(methodology.includes("最多保留来源排序靠前的 500 条"));
  assert.ok(methodology.includes("相对来源位置最多移动 4 位"));
  assert.ok(methodology.includes(`<link rel="canonical" href="${origin}/methodology/"`));
  assert.doesNotThrow(() => jsonLd(methodology));
});

test("sitemap, robots, resources and 404 match deployed origin", async () => {
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expected = [
    ...Array.from({ length: totalPages }, (_, index) => index === 0 ? `${origin}/` : `${origin}/page/${index + 1}/`),
    ...topicSlugs.map((slug) => `${origin}/${slug}/`),
    `${origin}/methodology/`,
  ];
  assert.deepEqual(locations, expected);
  assert.ok(locations.every((url) => url.startsWith(origin) && !url.includes("/page/1/")));
  const robots = await readFile(path.join(root, "robots.txt"), "utf8");
  assert.ok(robots.includes(`${origin}/sitemap.xml`));
  const notFound = await readFile(path.join(root, "404.html"), "utf8");
  assert.match(notFound, /name="robots" content="noindex, follow"/);
  for (const asset of ["favicon.svg", "og-image.svg", "styles.css", "styles.min.css"]) {
    await access(path.join(root, "assets", asset));
  }
  const pageDirs = (await readdir(path.join(root, "page"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));
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
