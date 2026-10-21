import assert from "node:assert/strict";
import test from "node:test";
import { BRAND, ORIGIN, LOCALES, LOCALE_IDS, localeConfig, pagePath, alternates, outboundUrl, siteSlug } from "../scripts/locales.mjs";
import { TEXT, TOPICS } from "../scripts/content.mjs";
import { EDITORIAL } from "../scripts/editorial.mjs";

const localeIds = ["en", "es", "ru", "zh"];

test("locale registry defines the four public languages and exact brand", () => {
  assert.equal(BRAND, "AI Ranking");
  assert.equal(ORIGIN, "https://airanking.github.io");
  assert.deepEqual(LOCALE_IDS, localeIds);
  for (const [locale, lang, base, og] of [
    ["en", "en", "/en", "en_US"], ["es", "es", "/es", "es_ES"],
    ["ru", "ru", "/ru", "ru_RU"], ["zh", "zh-CN", "/cn", "zh_CN"],
  ]) {
    assert.equal(localeConfig(locale), LOCALES[locale]);
    assert.equal(LOCALES[locale].lang, lang);
    assert.equal(LOCALES[locale].base, base);
    assert.equal(LOCALES[locale].og, og);
    assert.ok(LOCALES[locale].label.trim());
    assert.doesNotThrow(() => new Intl.NumberFormat(LOCALES[locale].intl));
  }
  for (const invalid of ["fr", "cn", "toString", "__proto__", ""]) {
    assert.throws(() => localeConfig(invalid), /Unknown locale/);
    assert.throws(() => pagePath(invalid), /Unknown locale/);
    assert.throws(() => outboundUrl("https://example.com/", invalid), /Unknown locale/);
  }
});

test("page identities preserve English aliases and legacy Chinese detail routes", () => {
  const cases = [
    [{ kind: "home" }, "/"],
    [{ kind: "home", page: 1 }, "/"],
    [{ kind: "home", page: 13 }, "/page/13/"],
    [{ kind: "topic", slug: "gpt-zhongzhuanzhan" }, "/gpt-zhongzhuanzhan/"],
    [{ kind: "topic", slug: "gpt-zhongzhuanzhan", page: 2 }, "/gpt-zhongzhuanzhan/page/2/"],
    [{ kind: "guides" }, "/guides/"],
    [{ kind: "guide", slug: "choosing-a-provider" }, "/guides/choosing-a-provider/"],
    [{ kind: "methodology" }, "/methodology/"],
    [{ kind: "vocabulary" }, "/search-vocabulary/"],
  ];
  for (const [identity, suffix] of cases) {
    for (const locale of localeIds) {
      const base = locale === "zh" ? "/cn" : `/${locale}`;
      assert.equal(pagePath(locale, identity), `${base}${suffix}`);
      assert.equal(pagePath(locale, identity, true), `${locale === "en" ? "" : base}${suffix}`);
    }
    assert.deepEqual(alternates(identity), [
      { locale: "en", lang: "en", url: `${ORIGIN}${suffix}` },
      { locale: "es", lang: "es", url: `${ORIGIN}/es${suffix}` },
      { locale: "ru", lang: "ru", url: `${ORIGIN}/ru${suffix}` },
      { locale: "zh", lang: "zh-CN", url: `${ORIGIN}/cn${suffix}` },
    ]);
  }
  for (const slug of ["yundulol", "provider with spaces", "测试", "a/b?#"]) {
    const identity = { kind: "site", slug };
    for (const locale of localeIds) {
      const expected = `${locale === "zh" ? "" : `/${locale}`}/sites/${encodeURIComponent(slug)}/`;
      assert.equal(pagePath(locale, identity), expected);
      assert.equal(pagePath(locale, identity, true), expected);
    }
  }
  assert.deepEqual(alternates({ kind: "site", slug: "yundulol" }).map(({ url }) => url), [
    `${ORIGIN}/en/sites/yundulol/`, `${ORIGIN}/es/sites/yundulol/`,
    `${ORIGIN}/ru/sites/yundulol/`, `${ORIGIN}/sites/yundulol/`,
  ]);
  assert.equal(siteSlug({ url: "https://www.hvoyai.com/en/sites/yundulol/?ref=x#details" }), "yundulol");
  assert.throws(() => pagePath("en", { kind: "unknown" }), /Unknown page kind/);
});

test("hvoyai destinations use precisely one locale prefix and preserve query and fragment", () => {
  for (const host of ["hvoyai.com", "www.hvoyai.com", "WWW.HVOYAI.COM"]) {
    for (const prefix of ["", "/en", "/es", "/ru", "/cn", "/zh", "/zh-CN", "/EN"]) {
      for (const locale of localeIds) {
        const input = `http://${host}:8080${prefix}/sites/a%20b/?q=a%2Fb&ref=one+two#reviews`;
        const expected = `https://www.hvoyai.com${locale === "zh" ? "" : `/${locale}`}/sites/a%20b/?q=a%2Fb&ref=one+two#reviews`;
        assert.equal(outboundUrl(input, locale), expected, `${input} -> ${locale}`);
        assert.equal(outboundUrl(expected, locale), expected, "rewriting is idempotent");
      }
    }
  }
  assert.equal(outboundUrl("https://hvoyai.com/sites/demo/"), "https://www.hvoyai.com/en/sites/demo/");
  for (const locale of localeIds) {
    const prefix = locale === "zh" ? "" : `/${locale}`;
    for (const ending of ["", "/", "/en", "/es/", "/zh-CN"]) {
      assert.equal(outboundUrl(`https://hvoyai.com${ending}?x=1#top`, locale), `https://www.hvoyai.com${prefix}/?x=1#top`);
    }
    assert.equal(outboundUrl("https://user:secret@hvoyai.com:8443/es/sites/demo/", locale), `https://www.hvoyai.com${prefix}/sites/demo/`);
    assert.equal(outboundUrl("https://hvoyai.com/english/sites/demo/", locale), `https://www.hvoyai.com${prefix}/english/sites/demo/`, "prefix replacement respects a path-segment boundary");
  }
});

test("outbound mapping leaves all other hosts byte-for-byte unchanged", () => {
  for (const input of [
    "http://example.com:8080/en/sites/demo/?a=1&b=two#reviews",
    "https://hvoyai.com.evil.example/es/sites/demo/?q=1#top",
    "https://www.hvoyai.com.evil.example/", "https://sub.hvoyai.com/en/",
    "https://not-hvoyai.com/ru/", "https://hvoyai.com@evil.example/en/",
    "HTTPS://EXAMPLE.COM:443/a%2fb?x=%20#Fragment",
  ]) {
    for (const locale of localeIds) assert.equal(outboundUrl(input, locale), input);
  }
  for (const input of ["javascript:alert(1)", "data:text/html,test", "ftp://hvoyai.com/sites/demo/", "/sites/demo/", "not a URL"]) {
    assert.throws(() => outboundUrl(input, "en"));
  }
});

function shape(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => JSON.stringify(shape(item))))].sort().map((item) => JSON.parse(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]));
  return typeof value;
}

function assertContent(value, label) {
  if (typeof value === "string") {
    assert.ok(value.trim(), `${label} must not be empty`);
    assert.doesNotMatch(value, /(?<![\p{L}\p{N}_])(?:TODO|FIXME|undefined|lorem ipsum)(?![\p{L}\p{N}_])/iu, label);
  } else if (typeof value === "function") {
    const result = value({ score: "72.4", coverage: 80, uptime: "99%", latency: "120 ms" });
    assert.equal(typeof result, "string", label);
    assertContent(result, label);
  } else {
    for (const [key, item] of Object.entries(value)) assertContent(item, `${label}.${key}`);
  }
}

test("UI and editorial content are structurally complete in every locale", () => {
  assert.deepEqual(Object.keys(TEXT).sort(), [...localeIds].sort());
  assert.deepEqual(Object.keys(EDITORIAL).sort(), [...localeIds].sort());
  assert.deepEqual(TOPICS.map(({ id }) => id), ["gpt", "claude", "codex", "gemini", "deepseek", "glm", "qwen", "kimi"]);
  const guideSlugs = EDITORIAL.en.guides.map(({ slug }) => slug);
  assert.ok(guideSlugs.length >= 3);
  assert.equal(new Set(guideSlugs).size, guideSlugs.length);
  for (const locale of localeIds) {
    const editorial = EDITORIAL[locale];
    assert.deepEqual(shape(TEXT[locale]), shape(TEXT.en), `${locale}: UI schema`);
    assert.deepEqual(shape(editorial), shape(EDITORIAL.en), `${locale}: editorial schema`);
    assertContent(TEXT[locale], `TEXT.${locale}`);
    assertContent(editorial, `EDITORIAL.${locale}`);
    assert.deepEqual(editorial.guides.map(({ slug }) => slug), guideSlugs, "guide identities align for hreflang");
    assert.deepEqual(Object.keys(editorial.topicChecks).sort(), TOPICS.map(({ id }) => id).sort());
    assert.ok(editorial.scenarios.length >= 3);
    assert.ok(editorial.faq.length >= 4);
    assert.ok(editorial.detailChecks.length >= 3);
    assert.ok(editorial.methodologySections.length >= 6);
    assert.ok(editorial.vocabularyTerms.length >= 8);
    for (const topic of Object.values(editorial.topicChecks)) assert.ok(topic.checks.length >= 3);
    for (const guide of editorial.guides) {
      assert.match(guide.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(guide.sections.length >= 3);
      for (const section of guide.sections) assert.ok((section.paragraphs?.length || 0) + (section.bullets?.length || 0) > 0);
    }
    for (const section of editorial.methodologySections) assert.ok((section.paragraphs?.length || 0) + (section.bullets?.length || 0) > 0);
    if (locale !== "en") {
      for (const key of ["lead", "evidence", "methodLead", "detailLead", "footer"]) assert.notEqual(TEXT[locale][key], TEXT.en[key], `${locale}.${key} must be localized`);
      for (const key of ["introText", "guidesLead", "vocabularyLead"]) assert.notEqual(editorial[key], EDITORIAL.en[key], `${locale}.${key} must be localized`);
      editorial.guides.forEach((guide, index) => assert.notEqual(guide.summary, EDITORIAL.en.guides[index].summary));
      editorial.faq.forEach((faq, index) => assert.notEqual(faq.answer, EDITORIAL.en.faq[index].answer));
    }
  }
});
