import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "data.json");
const TRANSLATION_ROOT = path.join(ROOT, "translations");
const LOCALES = ["en", "es"];
const BATCH_SIZE = 20;
const REQUEST_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 45_000);
const MAX_ATTEMPTS = 2;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function siteSlug(site) {
  try {
    const pathname = new URL(site.url).pathname.replace(/^\/|\/$/g, "");
    return pathname.split("/").pop() || hash(site.url).slice(0, 16);
  } catch {
    return hash(site.url).slice(0, 16);
  }
}

function cleanJson(text) {
  const value = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI 返回内容不是 JSON 对象");
  return JSON.parse(value.slice(start, end + 1));
}

function endpoint(baseUrl) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

async function callTranslator(locale, items) {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  if (!apiKey || !baseUrl || !model) {
    throw new Error("缺少 AI_API_KEY、AI_BASE_URL 或 AI_MODEL；请在 GitHub Actions Secrets 中配置");
  }
  const language = locale === "en" ? "English" : "Spanish (neutral international Spanish)";
  const response = await fetch(endpoint(baseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: [
            `Translate Chinese AI API directory content into ${language}.`,
            "Return JSON only in the exact shape {items:[{id,name,description,paymentMethods}]}.",
            "Keep ids, URLs, brand names, model names, product names, numbers and dates unchanged unless a natural established translation exists.",
            "Do not invent facts, marketing claims, availability, prices or capabilities.",
            "The name may be a brand; preserve it when it is already a proper name.",
          ].join(" "),
        },
        { role: "user", content: JSON.stringify({ items }) },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI 翻译接口失败：HTTP ${response.status}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  const parsed = cleanJson(content);
  if (!Array.isArray(parsed.items)) throw new Error("AI 翻译结果缺少 items 数组");
  return parsed.items;
}

function fallbackSite(site) {
  return {
    name: site.name,
    description: site.description,
    paymentMethods: site.paymentMethods || [],
  };
}

async function loadCache(locale) {
  try {
    return JSON.parse(await readFile(path.join(TRANSLATION_ROOT, `${locale}.json`), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { locale, sourceHash: "", note: "", sites: {} };
    throw error;
  }
}

async function translateLocale(locale, payload) {
  const cache = await loadCache(locale);
  const sites = {};
  const pending = [];
  for (const site of payload.sites) {
    const id = siteSlug(site);
    const source = {
      name: String(site.name || "").trim(),
      description: String(site.description || "").trim(),
      paymentMethods: Array.isArray(site.paymentMethods) ? site.paymentMethods.map(String) : [],
    };
    const sourceHash = hash(source);
    const previous = cache.sites?.[id];
    if (previous?.sourceHash === sourceHash && previous.translated !== false && previous.name && previous.description !== undefined) {
      sites[id] = previous;
    } else {
      pending.push({ id, ...source, sourceHash });
    }
  }

  if (pending.length && process.env.AI_API_KEY && process.env.AI_BASE_URL && process.env.AI_MODEL) {
    for (let index = 0; index < pending.length; index += BATCH_SIZE) {
      const batch = pending.slice(index, index + BATCH_SIZE);
      let translated;
      let lastError;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          translated = await callTranslator(locale, batch.map(({ sourceHash, ...item }) => item));
          break;
        } catch (error) {
          lastError = error;
          if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        }
      }
      if (!translated) {
        process.stderr.write(`翻译 ${locale} 批次失败，使用已有缓存或回退文本：${lastError?.message || "unknown error"}\n`);
        for (const item of batch) {
          const previous = cache.sites?.[item.id];
          sites[item.id] = previous?.sourceHash === item.sourceHash
            ? previous
            : previous?.description
              ? { ...previous, sourceHash: item.sourceHash, translated: false }
              : { sourceHash: item.sourceHash, translated: false, ...fallbackSite(item) };
        }
        continue;
      }
      const byId = new Map(translated.map((item) => [String(item.id), item]));
      for (const item of batch) {
        const result = byId.get(item.id);
        if (!result || typeof result.description !== "string") {
          const previous = cache.sites?.[item.id];
          sites[item.id] = previous?.description
            ? { ...previous, sourceHash: item.sourceHash, translated: false }
            : { sourceHash: item.sourceHash, translated: false, ...fallbackSite(item) };
          process.stderr.write(`AI 翻译结果缺少站点 ${item.id}，使用回退文本\n`);
          continue;
        }
        sites[item.id] = {
          sourceHash: item.sourceHash,
          translated: true,
          name: String(result.name || item.name),
          description: result.description,
          paymentMethods: Array.isArray(result.paymentMethods) ? result.paymentMethods.map(String) : item.paymentMethods,
        };
      }
      process.stdout.write(`已翻译 ${locale}: ${Math.min(index + BATCH_SIZE, pending.length)}/${pending.length}\n`);
    }
  } else {
    if (pending.length && process.env.TRANSLATION_REQUIRED === "true") {
      throw new Error(`locale=${locale} 有 ${pending.length} 条新内容，但未配置可用 AI 接口`);
    }
    for (const item of pending) sites[item.id] = { sourceHash: item.sourceHash, translated: false, ...fallbackSite(item) };
  }

  const noteSource = String(payload.note || "").trim();
  const noteHash = hash(noteSource);
  let note = cache.noteHash === noteHash && cache.note && cache.noteTranslated !== false ? cache.note : noteSource;
  let noteTranslated = cache.noteHash === noteHash && cache.note && cache.noteTranslated !== false;
  if (note !== cache.note && process.env.AI_API_KEY && process.env.AI_BASE_URL && process.env.AI_MODEL) {
    try {
      note = (await callTranslator(locale, [{ id: "__note__", name: "", description: noteSource, paymentMethods: [] }]))[0]?.description || note;
      noteTranslated = true;
    } catch (error) {
      process.stderr.write(`翻译 ${locale} note 失败，保留已有内容：${error.message}\n`);
      note = cache.note || noteSource;
    }
  }
  await mkdir(TRANSLATION_ROOT, { recursive: true });
  await writeFile(path.join(TRANSLATION_ROOT, `${locale}.json`), `${JSON.stringify({
    locale,
    sourceHash: hash(payload),
    noteHash,
    note,
    noteTranslated,
    sites,
  }, null, 2)}\n`);
}

const payload = JSON.parse(await readFile(DATA_PATH, "utf8"));
for (const locale of LOCALES) await translateLocale(locale, payload);
process.stdout.write("翻译缓存已更新\n");
