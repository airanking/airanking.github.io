import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "data.json");
const PAGE_ROOT = path.join(ROOT, "page");
const STYLES_PATH = path.join(ROOT, "assets", "styles.css");
const MINIFIED_STYLES_PATH = path.join(ROOT, "assets", "styles.min.css");
const SOURCE_URL = process.env.DATA_SOURCE_URL
  || "https://raw.githubusercontent.com/hvoyai/awesome-ai-api/main/data.json";
const ORIGIN = "https://airanking.github.io";
const SITE_NAME = "AI 中转站推荐";
const MAX_SITES = 500;
const PAGE_SIZE = 40;
const SHOULD_SYNC = process.argv.includes("--sync");
const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const SCORE_WEIGHTS = Object.freeze({
  source: 10,
  uptime: 25,
  latency: 20,
  rating: 15,
  models: 10,
  tenure: 5,
  payments: 5,
  refund: 5,
  invoice: 5,
});

const FAQ = [
  {
    question: "AI 中转站到底中转了什么？",
    answer: [
      "中转站通常不训练模型，而是位于客户端和模型服务之间，负责 API Key 鉴权、余额结算、限流、渠道调度、日志以及接口格式转换。用户把请求发给中转站后，后台选择一条可用上游，再把模型结果返回。",
      "因此一次调用可能经过站点和它接入的二级渠道。链路越长，稳定性、隐私和故障定位越依赖运营方。",
    ],
  },
  {
    question: "中转站与官方 API 有什么区别？",
    answer: [
      "官方 API 的请求和账单直接进入模型厂商；中转站则多了一层第三方网关，通常更容易使用人民币付款，也能用一个密钥接入多个厂商。",
      "代价是模型来源、参数支持、日志保留、服务连续性和余额安全不再只由模型厂商决定。商业或敏感任务应优先选择能说明数据处理方式和上游类型的服务。",
    ],
  },
  {
    question: "0.1 倍率是否等于官方价格的一折？",
    answer: [
      "不一定。实际扣款通常约等于官方标价折算用量 × 平台币换算系数 × 用户或分组倍率，还可能分别计算输入、输出、缓存写入、缓存命中、图片等项目。",
      "如果 1 美元标价额度记作 1 元余额，5 美元用量按 0.1 倍扣 0.5 元；如果 1 美元额度要用 7 元人民币购买，同样 0.1 倍会扣 3.5 元。比较价格必须同时看充值换算和完整账单。",
    ],
  },
  {
    question: "面板里的“美元额度”是真美元吗？",
    answer: [
      "不一定。很多面板中的美元符号只是按照官方 API 标价记录的计费单位，不代表平台持有等额官方余额，也不代表可以提现。",
      "尤其是订阅池渠道，站点可能把订阅实际跑出的请求换算成“如果走官方 API 值多少美元”，再按倍率扣除站内余额。充值前应先确认 1 元人民币能买多少单位以及余额的退款规则。",
    ],
  },
  {
    question: "为什么有些中转站能做到很低倍率？",
    answer: [
      "批量采购、区域价格、公开促销、较高资源利用率和订阅池都可能降低成本，低价本身不能直接证明有问题。",
      "但长期远低于正常成本且不说明来源时，应把短期优惠、账号池波动、第三方产品适配甚至来源异常纳入风险判断。价格模型算不通，通常意味着稳定性、数据或余额风险被转移给了用户。",
    ],
  },
  {
    question: "官方 API、订阅池和第三方适配渠道怎么区分？",
    answer: [
      "只看前端面板无法可靠判断。可以查看站点是否明确标注渠道类型，并测试上下文上限、缓存、工具调用、图片输入、流式输出和参数兼容性。",
      "订阅池更容易在额度耗尽或切换账号时波动；第三方适配可能带有额外系统提示、上下文压缩或功能缺失。即使使用同一套开源面板，不同站点的上游和调度质量也可能完全不同。",
    ],
  },
  {
    question: "怎么判断模型是否被替换或“降智”？",
    answer: [
      "不要依赖模型自报身份，因为回答可能只是复述系统上下文。更可靠的方法是准备固定测试集，长期比较代码能力、上下文上限、工具调用、结构化输出、视觉能力和响应特征。",
      "如果复杂任务持续明显偏离官方表现，应保留请求 ID 和账单记录，换时间、换通道复测，再向站点确认是否存在模型映射、参数改写或上下文压缩。",
    ],
  },
  {
    question: "为什么网页和 ping 很快，模型回复仍然很慢？",
    answer: [
      "域名可能使用 CDN，ping 到的是离你较近的边缘节点，并不是中转程序或模型上游。完整延迟还包括网关处理、排队、上游网络、模型推理和流式传输。",
      "应分别记录首字时间、完整响应时间、失败率和晚高峰波动，而不是只看网页打开速度或一次 ping。",
    ],
  },
  {
    question: "使用中转站时如何保护隐私？",
    answer: [
      "默认按“站点可能接触请求和响应内容”来评估风险。不要提交账号密码、私钥、客户资料、未公开代码和其他不必要的敏感数据；可先脱敏，并为不同项目使用独立 Key 和额度上限。",
      "企业场景还应核对日志保留、数据用途、删除机制、运营主体和合同责任。无法确认链路时，敏感业务更适合官方 API 或可审计的合规服务。",
    ],
  },
  {
    question: "选择中转站最有效的测试方法是什么？",
    answer: [
      "先确定必需模型、协议和预算，再以最低金额充值。使用自己的真实任务，在白天和晚高峰各连续测试，核对成功率、首字延迟、长上下文、缓存、工具调用和单次账单。",
      "不要只问一句“你好”。短对话无法暴露账号池切换、上下文截断、缓存失效和复杂参数不兼容等问题。",
    ],
  },
  {
    question: "为什么不建议一次充值很多？",
    answer: [
      "中转服务会受到上游政策、账号风控、线路、经营状况和价格调整影响，站内余额通常也不具备与银行存款相同的保障。",
      "更稳妥的做法是按近期用量充值，为关键业务准备不同上游的备用接口，并提前确认退款、迁移和故障公告规则。",
    ],
  },
  {
    question: "榜单排名靠前就一定适合我吗？",
    answer: [
      "不一定。榜单用于缩小范围，不能替代具体场景验收。编程工具更关注长任务、缓存和工具调用；图片、音视频或长文档任务还要测试文件限制、多模态能力和超时策略。",
      "先写清自己的硬性需求和不能接受的风险，再结合榜单指标选择候选站点，最后用同一组真实任务横向比较。",
    ],
  },
];

const TOPICS = [
  {
    slug: "gpt-zhongzhuanzhan",
    label: "GPT 中转站",
    short: "GPT / OpenAI",
    terms: ["gpt", "openai", "chatgpt"],
    intro: "GPT 中转站通常提供 OpenAI 兼容接口，适合对话、代码、结构化输出、工具调用和多模态任务。除了模型名称，还要核对 Responses API、Chat Completions、上下文长度、缓存和具体版本映射。",
    focus: ["确认 GPT 具体版本与上下文长度", "测试 Responses API 和工具调用", "验证图片、文件与结构化输出", "分别复算输入、输出和缓存费用"],
  },
  {
    slug: "claude-zhongzhuanzhan",
    label: "Claude 中转站",
    short: "Claude / Anthropic",
    terms: ["claude", "anthropic"],
    intro: "Claude 中转站常用于长文本、代码和 Agent 任务。选择时应确认 Anthropic 原生协议或兼容层差异，并重点测试 Prompt Caching、工具调用、长输出稳定性以及 Sonnet、Opus 等版本映射。",
    focus: ["核对 Claude 版本和模型映射", "测试长输出与工具调用断流", "检查缓存写入和读取明细", "确认 Anthropic 原生协议兼容性"],
  },
  {
    slug: "codex-zhongzhuanzhan",
    label: "Codex 中转站",
    short: "Codex",
    terms: ["codex"],
    intro: "Codex 中转站面向代码生成、仓库分析和编程 Agent。普通聊天可用不代表长任务稳定，应使用真实代码仓库测试工具调用、上下文缓存、并发、错误恢复以及 Codex 客户端所需的接口能力。",
    focus: ["验证 Codex 客户端接入方式", "用多文件任务测试完整成功率", "检查长上下文、缓存和并发", "准备可快速切换的备用接口"],
  },
  {
    slug: "gemini-zhongzhuanzhan",
    label: "Gemini 中转站",
    short: "Gemini / Google",
    terms: ["gemini"],
    intro: "Gemini 中转站常用于多模态、长上下文、代码和文档处理。需要区分 Gemini 原生接口与 OpenAI 兼容接口，并分别测试图片、文件、工具调用、安全过滤和具体模型版本。",
    focus: ["确认原生 Gemini 或兼容协议", "测试图片、文件和多模态输入", "核对安全过滤与错误返回", "检查模型版本和上下文限制"],
  },
  {
    slug: "deepseek-zhongzhuanzhan",
    label: "DeepSeek 中转站",
    short: "DeepSeek",
    terms: ["deepseek", "深度求索"],
    intro: "DeepSeek 中转站适合中文推理、代码和通用对话任务。选择时应核对具体模型版本、思考内容输出、上下文长度、并发限制和缓存计费，并用固定任务测试高峰期稳定性。",
    focus: ["核对 DeepSeek 具体版本", "测试推理与代码长任务", "检查高峰期并发和限流", "复算输入输出与缓存费用"],
  },
  {
    slug: "glm-zhongzhuanzhan",
    label: "GLM 中转站",
    short: "GLM / 智谱",
    terms: ["glm", "智谱"],
    intro: "GLM 中转站主要提供智谱 GLM 系列模型的统一 API 接入。应确认具体型号、工具调用、结构化输出、视觉能力和上下文限制，并检查兼容接口是否完整保留智谱原生能力。",
    focus: ["核对 GLM 具体型号", "测试工具调用、JSON 和视觉能力", "确认上下文、并发与限流", "检查原生能力在兼容层的差异"],
  },
  {
    slug: "qwen-zhongzhuanzhan",
    label: "Qwen 中转站",
    short: "Qwen / 通义千问",
    terms: ["qwen", "通义", "千问"],
    intro: "Qwen 中转站覆盖通义千问文本、代码和多模态模型。选择时要区分不同尺寸与用途，确认上下文、视觉或音频能力、工具调用、兼容协议和实际调用价格。",
    focus: ["区分 Qwen 不同尺寸和用途", "测试文本、代码与多模态能力", "确认原生协议和兼容层差异", "核对上下文、限流和调用价格"],
  },
  {
    slug: "kimi-zhongzhuanzhan",
    label: "Kimi 中转站",
    short: "Kimi / 月之暗面",
    terms: ["kimi", "moonshot", "月之暗面"],
    intro: "Kimi 中转站常用于中文长文本、文件处理和对话场景。应核对 Moonshot 或 Kimi 具体模型、上下文长度、文件能力、工具调用和费用，避免直接用网页会员体验推断 API 能力。",
    focus: ["确认 Kimi 与 Moonshot 模型映射", "测试中文长文本和文件处理", "检查上下文长度与超限行为", "区分网页会员能力和 API 计费"],
  },
];

const TOPIC_TERMS = new Map(TOPICS.map((topic) => [topic.slug, topic.terms.map((term) => term.toLowerCase())]));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value) {
  return value === true ? true : value === false ? false : null;
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text ? "" : text;
}

function normalizeSite(site, index) {
  const models = Array.isArray(site.models) ? site.models.map(String).map((item) => item.trim()).filter(Boolean) : [];
  const payments = Array.isArray(site.paymentMethods)
    ? site.paymentMethods.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
  return {
    rank: Math.max(1, Math.round(finite(site.rank) || index + 1)),
    name: String(site.name || "未命名站点").trim(),
    url: safeUrl(site.url),
    description: String(site.description || "").trim(),
    establishedDate: normalizeDate(site.establishedDate),
    modelCount: Math.max(0, Math.round(finite(site.modelCount) || models.length)),
    models: [...new Set(models)],
    uptime: finite(site.uptime),
    latencyMs: finite(site.latencyMs),
    userRating: finite(site.userRating),
    ratingCount: Math.max(0, Math.round(finite(site.ratingCount) || 0)),
    paymentMethods: [...new Set(payments)],
    supportsRefund: normalizeBoolean(site.supportsRefund),
    supportsInvoice: normalizeBoolean(site.supportsInvoice),
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.sites) || !payload.sites.length) {
    throw new Error("data.json 缺少非空 sites 数组");
  }
  payload.sites.forEach((site, index) => {
    if (!site || typeof site !== "object" || !String(site.name || "").trim()) {
      throw new Error(`第 ${index + 1} 条站点缺少名称`);
    }
    if (!safeUrl(site.url)) throw new Error(`第 ${index + 1} 条站点链接无效`);
  });
}

async function atomicWrite(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, target);
}

async function syncData() {
  const response = await fetch(SOURCE_URL, {
    headers: { "user-agent": "airanking-static-builder/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`同步失败：HTTP ${response.status}`);
  const text = await response.text();
  const incoming = JSON.parse(text);
  validatePayload(incoming);
  try {
    const current = JSON.parse(await readFile(DATA_PATH, "utf8"));
    if (current.updatedDate && incoming.updatedDate && incoming.updatedDate < current.updatedDate) {
      throw new Error(`拒绝使用旧快照：${incoming.updatedDate} < ${current.updatedDate}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const limited = { ...incoming, sites: incoming.sites
    .map((site, index) => ({ ...site, __sourceIndex: index }))
    .sort((a, b) => (finite(a.rank) ?? a.__sourceIndex + 1) - (finite(b.rank) ?? b.__sourceIndex + 1))
    .filter((site, index, items) => items.findIndex((candidate) =>
      String(candidate.name).trim().toLowerCase() === String(site.name).trim().toLowerCase()
      || safeUrl(candidate.url) === safeUrl(site.url)) === index)
    .slice(0, MAX_SITES)
    .map(({ __sourceIndex, ...site }) => site) };
  await atomicWrite(DATA_PATH, `${JSON.stringify(limited, null, 2)}\n`);
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function snapshotAgeScore(establishedDate, updatedDate) {
  if (!establishedDate) return null;
  const established = new Date(`${establishedDate}T00:00:00Z`);
  const snapshot = new Date(`${updatedDate}T00:00:00Z`);
  const ageDays = (snapshot - established) / 86_400_000;
  return ageDays < 0 ? null : clamp(ageDays / 730) * 100;
}

export function scoreSite(site, sourcePosition, totalSites, updatedDate) {
  const components = {
    source: totalSites <= 1 ? 50 : 60 - 20 * sourcePosition / (totalSites - 1),
    uptime: site.uptime !== null && site.uptime >= 0 && site.uptime <= 100
      ? clamp((site.uptime - 80) / 20) * 100 : null,
    latency: site.latencyMs !== null && site.latencyMs > 0
      ? (1 - clamp((Math.log(site.latencyMs) - Math.log(1000)) / (Math.log(15000) - Math.log(1000)))) * 100 : null,
    rating: site.userRating !== null && site.userRating >= 1 && site.userRating <= 5 && site.ratingCount > 0
      ? clamp((((site.ratingCount * site.userRating + 35) / (site.ratingCount + 10)) - 1) / 4) * 100 : null,
    models: site.modelCount > 0 ? Math.log1p(Math.min(site.modelCount, 40)) / Math.log(41) * 100 : null,
    tenure: snapshotAgeScore(site.establishedDate, updatedDate),
    payments: site.paymentMethods.length ? Math.min(site.paymentMethods.length / 3, 1) * 100 : null,
    refund: site.supportsRefund === null ? null : Number(site.supportsRefund) * 100,
    invoice: site.supportsInvoice === null ? null : Number(site.supportsInvoice) * 100,
  };
  let weightedTotal = 0;
  let availableWeight = 0;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    if (components[key] === null) continue;
    weightedTotal += components[key] * weight;
    availableWeight += weight;
  }
  const rawScore = availableWeight ? weightedTotal / availableWeight : 50;
  const coverage = availableWeight / 100;
  const confidence = 0.35 + 0.65 * coverage;
  return {
    score: 50 + (rawScore - 50) * confidence,
    scoreCoverage: coverage,
    scoreComponents: components,
  };
}

export function rankSites(sites, updatedDate) {
  const scored = sites.map((site, sourcePosition) => ({
    ...site,
    sourceRank: sourcePosition + 1,
    ...scoreSite(site, sourcePosition, sites.length, updatedDate),
  }));
  scored.sort((a, b) => b.score - a.score
    || b.scoreCoverage - a.scoreCoverage
    || a.sourceRank - b.sourceRank
    || a.name.localeCompare(b.name, "zh-CN")
    || a.url.localeCompare(b.url));
  return scored.map((site, index) => {
    const { scoreComponents, ...rankedSite } = site;
    const ranked = { ...rankedSite, rank: index + 1 };
    return { ...ranked, copy: buildSiteCopy(ranked) };
  });
}

function formatDate(value) {
  if (!value) return "暂未收录";
  const [year, month, day] = value.split("-").map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

function formatUptime(value) {
  return value === null ? "暂无" : `${number.format(value)}%`;
}

function formatLatency(value) {
  if (value === null) return "暂无";
  return value >= 1000 ? `${number.format(value / 1000)} 秒` : `${Math.round(value)} 毫秒`;
}

function status(value) {
  return value === true ? "支持" : value === false ? "不支持" : "待确认";
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pageStats(sites) {
  const uptimes = [];
  const latencies = [];
  const modelCounts = [];
  const ratings = [];
  const summary = {
    total: sites.length,
    refund: { yes: 0, known: 0 },
    invoice: { yes: 0, known: 0 },
    descriptions: 0,
    established: 0,
    modelDetails: 0,
    paymentDetails: 0,
  };

  for (const site of sites) {
    if (site.uptime !== null) uptimes.push(site.uptime);
    if (site.latencyMs !== null) latencies.push(site.latencyMs);
    if (site.modelCount !== null) modelCounts.push(site.modelCount);
    if (site.userRating !== null && site.ratingCount > 0) ratings.push(site.userRating);
    if (site.supportsRefund !== null) {
      summary.refund.known += 1;
      if (site.supportsRefund) summary.refund.yes += 1;
    }
    if (site.supportsInvoice !== null) {
      summary.invoice.known += 1;
      if (site.supportsInvoice) summary.invoice.yes += 1;
    }
    if (site.description) summary.descriptions += 1;
    if (site.establishedDate) summary.established += 1;
    if (site.models.length) summary.modelDetails += 1;
    if (site.paymentMethods.length) summary.paymentDetails += 1;
  }

  return {
    ...summary,
    uptime: { value: median(uptimes), sample: uptimes.length },
    latency: { value: median(latencies), sample: latencies.length },
    modelCount: { value: median(modelCounts), sample: modelCounts.length },
    rating: { value: median(ratings), sample: ratings.length },
  };
}

function formatStat(value, formatter) {
  return value === null ? "暂无可计算值" : formatter(value);
}

function policyFact(label, value) {
  if (value === true) return `数据明确标记支持${label}`;
  if (value === false) return `数据明确标记不支持${label}`;
  return `${label}政策未记录，付款前需确认`;
}

function siteFacts(site) {
  const performance = [];
  if (site.uptime !== null) performance.push(`在线率 ${formatUptime(site.uptime)}`);
  if (site.latencyMs !== null) performance.push(`延迟 ${formatLatency(site.latencyMs)}`);
  const rating = site.userRating !== null && site.ratingCount > 0
    ? `用户评分 ${number.format(site.userRating)}/5（${site.ratingCount} 条）`
    : "用户评价样本未记录";
  const model = site.modelCount > 0 ? `收录模型数量 ${site.modelCount} 个` : "模型数量未记录";
  const date = site.establishedDate ? `成立日期记录为 ${formatDate(site.establishedDate)}` : "成立日期未记录";
  return {
    scoreValue: `${number.format(site.score)}，评分字段覆盖 ${Math.round(site.scoreCoverage * 100)}%`,
    score: `当前公开数据综合分 ${number.format(site.score)}，评分字段覆盖 ${Math.round(site.scoreCoverage * 100)}%`,
    performance: performance.length ? performance.join("、") : "在线率与延迟均未记录",
    rating,
    model,
    date,
    policies: `${policyFact("退款", site.supportsRefund)}；${policyFact("发票", site.supportsInvoice)}`,
  };
}

const DESCRIPTION_TEMPLATES = [
  (site, facts) => `${site.name} 的${facts.score}。当前快照显示${facts.performance}，${facts.model}。`,
  (site, facts) => `按已收录字段计算，${site.name} 获得 ${facts.scoreValue}。性能资料为${facts.performance}；${facts.rating}。`,
  (site, facts) => `${site.name} 当前以数据完整度和公开指标参与排序：${facts.score}。${facts.date}，${facts.performance}。`,
  (site, facts) => `本页不复述 ${site.name} 的宣传简介，而以结构化快照说明：${facts.score}；${facts.model}；${facts.rating}。`,
  (site, facts) => `${site.name} 的名次来自可复算指标。${facts.score}，已记录表现为${facts.performance}，${facts.date}。`,
  (site, facts) => `当前快照对 ${site.name} 的记录为：${facts.model}，${facts.performance}。综合计算结果是数据分 ${facts.scoreValue}。`,
  (site, facts) => `${site.name} 以公开字段而非站点宣传参与比较。${facts.score}；${facts.rating}；${facts.date}。`,
  (site, facts) => `从数据覆盖看，${site.name} 的${facts.score}。现有证据包括${facts.performance}和${facts.model}。`,
];

function buildSiteCopy(site) {
  const facts = siteFacts(site);
  const template = DESCRIPTION_TEMPLATES[hashText(`${site.name}|${site.url}`) % DESCRIPTION_TEMPLATES.length];
  const sparse = site.scoreCoverage < 0.3 ? " 当前快照可用于评分的字段有限，分数已向中性值收缩。" : "";
  const models = site.models.length ? `已列模型或厂商：${site.models.join("、")}` : "模型明细未记录";
  const payments = site.paymentMethods.length ? `已列支付方式：${site.paymentMethods.join("、")}` : "支付方式未记录";
  return {
    description: `${template(site, facts)}${sparse}`,
    detail: `${facts.date}；${models}；${payments}；${facts.policies}。这些内容描述当前数据快照，不构成实时可用或服务表现承诺。`,
  };
}

function objectiveSiteSummary(site) {
  return `综合排名第 ${site.rank}；${site.copy.description} ${site.copy.detail}`;
}

function formatRating(site) {
  return site.userRating === null || site.ratingCount === 0
    ? "暂无"
    : `${number.format(site.userRating)} / 5 (${site.ratingCount})`;
}

function dataState(value) {
  return value === null ? "data-unknown" : value ? "data-known" : "data-negative";
}

function renderSiteRow(site) {
  const url = escapeHtml(site.url);
  const rowId = `station-${site.rank}`;
  return `              <tr class="ranking-row" id="rank-${site.rank}" data-rank="${site.rank}" data-score="${site.score.toFixed(6)}">
                <td class="rank-cell numeric"><strong>${site.rank}</strong></td>
                <th class="site-cell" scope="row" id="${rowId}"><a href="${url}" target="_blank" rel="nofollow noopener" referrerpolicy="origin">${escapeHtml(site.name)}</a><p>${escapeHtml(site.copy.description)}</p></th>
                <td class="score-cell numeric"><strong>${number.format(site.score)}</strong><small>覆盖 ${Math.round(site.scoreCoverage * 100)}%</small></td>
                <td class="numeric">${formatUptime(site.uptime)}</td>
                <td class="numeric">${formatLatency(site.latencyMs)}</td>
                <td class="numeric">${site.modelCount > 0 ? `${site.modelCount} 个` : "暂无"}</td>
                <td class="numeric">${escapeHtml(formatRating(site))}</td>
                <td class="policy-cell"><span class="${dataState(site.supportsRefund)}">退：${status(site.supportsRefund)}</span><span class="${dataState(site.supportsInvoice)}">票：${status(site.supportsInvoice)}</span></td>
                <td><a class="table-link" href="${url}" target="_blank" rel="nofollow noopener" referrerpolicy="origin" aria-label="访问 ${escapeHtml(site.name)}">访问 ↗</a></td>
              </tr>`;
}

function renderRankingTable(sites, caption) {
  return `<div class="ranking-table-wrap" role="region" aria-label="中转站数据排名表，可横向滚动查看全部指标" tabindex="0"><table class="ranking-table"><caption>${escapeHtml(caption)}</caption><colgroup><col class="col-rank" /><col class="col-site" /><col class="col-score" /><col class="col-uptime" /><col class="col-latency" /><col class="col-models" /><col class="col-rating" /><col class="col-policy" /><col class="col-action" /></colgroup><thead><tr><th scope="col">排名</th><th scope="col">站点与数据说明</th><th scope="col">数据评分</th><th scope="col">在线率</th><th scope="col">延迟</th><th scope="col">模型</th><th scope="col">评价</th><th scope="col">服务信息</th><th scope="col">访问</th></tr></thead><tbody>\n${sites.map(renderSiteRow).join("\n")}\n            </tbody></table></div>`;
}

function pagePath(page) {
  return page === 1 ? "/" : `/page/${page}/`;
}

function relativeRoot(page) {
  return page === 1 ? "." : "../..";
}

function pageRelations(page, totalPages, pathForPage = pagePath) {
  return {
    previous: page > 1 ? `${ORIGIN}${pathForPage(page - 1)}` : "",
    next: page < totalPages ? `${ORIGIN}${pathForPage(page + 1)}` : "",
  };
}

function renderBreadcrumbs(page, root) {
  if (page === 1) {
    return '<nav class="breadcrumbs" aria-label="面包屑"><span aria-current="page">AI 中转站推荐</span></nav>';
  }
  return `<nav class="breadcrumbs" aria-label="面包屑"><a href="${root}/">AI 中转站推荐</a><span aria-hidden="true">/</span><span aria-current="page">第 ${page} 页</span></nav>`;
}

function renderPagination(current, total, pathForPage = pagePath, label = "榜单分页") {
  if (total <= 1) return "";
  const pages = new Set([1, total]);
  for (let page = Math.max(1, current - 2); page <= Math.min(total, current + 2); page += 1) pages.add(page);
  const sorted = [...pages].sort((a, b) => a - b);
  const links = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) links.push('<span class="page-gap" aria-hidden="true">…</span>');
    links.push(page === current
      ? `<span class="page-number is-current" aria-current="page">${page}</span>`
      : `<a class="page-number" href="${pathForPage(page)}" aria-label="前往第 ${page} 页">${page}</a>`);
    previous = page;
  }
  return `<nav class="pagination" aria-label="${escapeHtml(label)}">
            ${current > 1 ? `<a class="page-step" href="${pathForPage(current - 1)}">← 上一页</a>` : '<span class="page-step is-disabled">← 上一页</span>'}
            <div class="page-numbers">${links.join("")}</div>
            ${current < total ? `<a class="page-step" href="${pathForPage(current + 1)}">下一页 →</a>` : '<span class="page-step is-disabled">下一页 →</span>'}
          </nav>`;
}

function topicMatches(site, topic) {
  const searchable = site.searchableText || [site.name, site.description, ...site.models].join(" ").toLowerCase();
  return TOPIC_TERMS.get(topic.slug).some((term) => searchable.includes(term));
}

function topicFaq(topic) {
  return [
    [`${topic.label}应该怎么选择？`, `先确认候选站明确支持所需模型和接口，再用自己的真实任务测试流式输出、工具调用、上下文、成功率和账单。重点完成：${topic.focus.join("；")}。不要只依据首页价格或一次短对话决定长期使用。`],
    [`${topic.label}的价格应该怎样比较？`, "统一换算人民币充值比例、输入价格、输出价格、缓存读写、模型倍率和用户分组倍率，再复算一条实际请求。面板显示为美元不代表等同官方美元，低倍率也不代表所有模型和渠道采用相同价格。"],
    [`${topic.label}适合直接用于生产环境吗？`, "个人学习和能够随时迁移的任务可以先小额测试。生产环境还要评估数据隐私、运营主体、日志政策、限流、故障公告和备用供应商；涉及敏感数据或强 SLA 时，应优先考虑官方 API 或可签约的企业服务。"],
    [`如何验证 ${topic.label} 宣传的模型和能力？`, `使用固定测试集核对模型标识、上下文、流式响应、工具调用和账单模型名，并完成专项验证：${topic.focus.join("；")}。模型自报身份不能作为证据，关键能力缺失或账单无法复算时应暂停继续充值。`],
  ];
}

function topicStats(sites) {
  const stats = pageStats(sites);
  const modelCounts = sites.map((site) => site.modelCount).filter((value) => value > 0);
  return { ...stats, modelCount: { value: median(modelCounts), sample: modelCounts.length } };
}

function renderTopicDirectory(topicPages, currentSlug = "") {
  const cards = topicPages.map(({ topic, matches }) => {
    const link = currentSlug === topic.slug
      ? `<span class="topic-directory__current" aria-current="page">当前专题</span>`
      : `<a href="/${topic.slug}/">查看 ${escapeHtml(topic.label)} →</a>`;
    return `          <article><span>${escapeHtml(topic.short)}</span><h3>${escapeHtml(topic.label)}</h3><p>${escapeHtml(topic.intro)}</p><div><strong>${matches.length}</strong><small>家公开资料匹配</small>${link}</div></article>`;
  }).join("\n");
  return `      <section class="topic-directory" id="topics" aria-labelledby="topics-title">
        <div class="topic-directory__head"><div><p class="section-kicker">模型专题</p><h2 id="topics-title">按模型查找中转站</h2></div><p>每个专题都提供独立候选列表、数据概览、接入检查项和常见问题。公开资料匹配只用于建立候选范围，实际模型与价格仍需进入站点核对并小额测试。</p></div>
        <div class="topic-directory__grid">
${cards}
        </div>
      </section>`;
}

function renderTopicStructuredData({ topic, canonical, title, description, sites, totalMatches, updatedDate }) {
  const faq = topicFaq(topic);
  const graph = [{
    "@type": "WebSite", "@id": `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: "AI 中转站推荐", inLanguage: "zh-CN",
  }, {
    "@type": "CollectionPage", "@id": `${canonical}#webpage`, url: canonical, name: title, description,
    dateModified: updatedDate, inLanguage: "zh-CN", isPartOf: { "@id": `${ORIGIN}/#website` },
    breadcrumb: { "@id": `${canonical}#breadcrumb` }, mainEntity: { "@id": `${canonical}#ranking` },
  }, {
    "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, itemListElement: [
      { "@type": "ListItem", position: 1, name: "AI 中转站推荐", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: topic.label, item: canonical },
    ],
  }, {
    "@type": "ItemList", "@id": `${canonical}#ranking`, name: `${topic.label}候选列表`, numberOfItems: totalMatches,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: sites.map((site, index) => ({
      "@type": "ListItem", position: index + 1,
      item: { "@type": "Service", name: site.name, url: site.url, description: objectiveSiteSummary(site) },
    })),
  }, {
    "@type": "FAQPage", "@id": `${canonical}#faq`, mainEntity: faq.map(([question, answer]) => ({
      "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  }];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c");
}

function topicPagePath(topic, page) {
  return page === 1 ? `/${topic.slug}/` : `/${topic.slug}/page/${page}/`;
}

function renderTopicPage({ topic, page, totalPages, sites, allMatches, topicPages, updatedDate, stats }) {
  const canonical = `${ORIGIN}${topicPagePath(topic, page)}`;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = first + sites.length - 1;
  const title = page === 1
    ? `${topic.label}数据索引｜${allMatches.length} 家公开资料候选站`
    : `${topic.label}数据索引第 ${page} 页｜候选 ${first}–${last}`;
  const description = page === 1
    ? `${topic.label}数据索引按统一评分展示 ${allMatches.length} 家公开资料候选站，列出评分覆盖度、在线率、延迟、模型与服务政策，便于复核数据而非照搬宣传简介。`
    : `${topic.label}数据索引第 ${page} 页，展示候选范围 ${first} 至 ${last} 的综合分、字段覆盖度与公开指标。`;
  const faq = topicFaq(topic);
  const jsonLd = renderTopicStructuredData({ topic, canonical, title, description, sites, totalMatches: allMatches.length, updatedDate });
  const root = page === 1 ? ".." : "../../..";
  const topicPath = (target) => topicPagePath(topic, target);
  const relations = pageRelations(page, totalPages, topicPath);
  const firstPageOnly = page === 1;
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta name="theme-color" content="#f4f0e8" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="AI 中转站推荐" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:image" content="${ORIGIN}/assets/og-image.svg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${ORIGIN}/assets/og-image.svg" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="zh-CN" href="${canonical}" />
    ${relations.previous ? `<link rel="prev" href="${relations.previous}" />` : ""}
    ${relations.next ? `<link rel="next" href="${relations.next}" />` : ""}
    <link rel="icon" href="${root}/assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${root}/assets/styles.min.css" />
    <script type="application/ld+json">${jsonLd}</script>
  </head>
  <body>
    <a class="skip-link" href="#main">跳到主要内容</a>
    <header class="topbar">
      <a class="wordmark" href="${root}/" aria-label="AI 中转站推荐首页"><span>中转站</span><strong>数据榜</strong></a>
      <nav aria-label="主要导航"><a href="${root}/#ranking">数据榜</a><a href="${root}/#topics">模型索引</a><a href="${root}/methodology/">评分方法</a></nav>
    </header>
    <main id="main">
      <nav class="breadcrumbs" aria-label="面包屑"><a href="${root}/">AI 中转站推荐</a><span aria-hidden="true">/</span><a href="${root}/${topic.slug}/">${escapeHtml(topic.label)}</a>${page > 1 ? `<span aria-hidden="true">/</span><span aria-current="page">第 ${page} 页</span>` : ""}</nav>
      <section class="hero topic-hero">
        <div class="hero__copy"><p class="eyebrow">MODEL DIRECTORY · ${updatedDate.replaceAll("-", ".")}</p><h1>${escapeHtml(topic.label)}<br /><em>推荐与对比</em></h1><p class="hero-copy">${escapeHtml(topic.intro)}</p><div class="hero-actions"><a href="#topic-ranking">查看候选站</a><a href="#topic-guide">阅读专项指南</a></div></div>
        <aside class="hero__panel" aria-label="专题概览"><p>公开资料匹配</p><strong>${allMatches.length}</strong><span>家 ${escapeHtml(topic.label)}</span><dl><div><dt>专题页</dt><dd>${page} / ${totalPages}</dd></div><div><dt>本页范围</dt><dd>${first}–${last}</dd></div><div><dt>更新时间</dt><dd>${updatedDate}</dd></div></dl></aside>
      </section>

      ${firstPageOnly ? `<section class="topic-overview" aria-labelledby="topic-overview-title">
        <div><p class="section-kicker">证据概览</p><h2 id="topic-overview-title">先看数据覆盖，再看名次</h2><p>专题匹配只说明名称、模型字段或来源文字提及相关关键词。统计与评分用于检查公开证据的数量和一致性，不等同于确认模型当前可调用。</p></div>
        <dl class="topic-stat-grid"><div><dt>公开匹配</dt><dd>${stats.total} 家</dd><small>完整静态分页</small></div><div><dt>在线率中位数</dt><dd>${formatStat(stats.uptime.value, formatUptime)}</dd><small>样本 ${stats.uptime.sample}/${stats.total}</small></div><div><dt>延迟中位数</dt><dd>${formatStat(stats.latency.value, formatLatency)}</dd><small>样本 ${stats.latency.sample}/${stats.total}</small></div><div><dt>模型数量中位数</dt><dd>${formatStat(stats.modelCount.value, (value) => `${number.format(value)} 个`)}</dd><small>样本 ${stats.modelCount.sample}/${stats.total}</small></div></dl>
      </section>

      ${renderTopicDirectory(topicPages, topic.slug)}

      <section class="topic-guide" id="topic-guide" aria-labelledby="topic-guide-title"><div><p class="section-kicker">复核路径</p><h2 id="topic-guide-title">怎样验证 ${escapeHtml(topic.label)} 数据</h2><p>先记录榜单中的字段覆盖度，再进入站点核对模型标识、协议和价格。使用固定请求保存时间、响应模型、错误码、Token 与扣费，才能把来源文字变成可复核证据。</p></div><div class="topic-focus-grid">${topic.focus.map((item, index) => `<article><span>0${index + 1}</span><h3>${escapeHtml(item)}</h3><p>将页面记录视为待验证线索；用同一输入复测并保留请求级结果。</p></article>`).join("")}</div></section>` : `<section class="page-continue"><p>${escapeHtml(topic.label)} · 第 ${page} 页</p><h2>继续查看按统一方法计算的数据结果</h2><a href="${root}/${topic.slug}/#topic-guide">返回专题方法说明 →</a></section>`}

      <section class="ranking topic-ranking" id="topic-ranking" aria-labelledby="topic-ranking-title"><div class="ranking-head"><div><p>MODEL DATA / ${escapeHtml(topic.short)}</p><h2 id="topic-ranking-title">${escapeHtml(topic.label)}数据表</h2></div></div>${renderRankingTable(sites, `${topic.label}公开资料候选 ${first}–${last}，按全站综合分排序`)}${renderPagination(page, totalPages, topicPath, `${topic.label}分页`)}</section>

      ${firstPageOnly ? `<section class="faq-section topic-faq" id="faq" aria-labelledby="topic-faq-title"><div class="section-kicker">数据问答</div><h2 id="topic-faq-title">如何解读 ${escapeHtml(topic.label)} 索引</h2><div class="faq-list">${faq.map(([question, answer]) => `<details class="faq-item"><summary>${escapeHtml(question)}</summary><div class="faq-answer"><p>${escapeHtml(answer)}</p></div></details>`).join("")}</div></section>` : ""}
    </main>
    <footer class="footer"><a class="wordmark" href="${root}/"><span>中转站</span><strong>数据榜</strong></a><p>公开字段用于建立核验清单，不代表实时可用或质量担保。</p><a href="#main">返回顶部 ↑</a></footer>
  </body>
</html>`;
}

function homeGuide() {
  return `      <section class="decision-guide" id="guide" aria-labelledby="guide-title">
        <div class="section-kicker">评分阅读法</div>
        <h2 id="guide-title">名次之外，先检查证据覆盖</h2>
        <p class="section-lead">本站把来源顺序、运行指标、评价、模型广度、运营时间和服务政策放进同一公式。资料缺失不会被当成失败，但会降低覆盖度，并把分数向 50 分收缩。</p>
        <div class="guide-grid">
          <article><span>01</span><h3>先看综合分和覆盖度</h3><p>同样的分数，如果一个覆盖 90% 字段、另一个只覆盖 20%，证据强度并不相同。覆盖度越低，越需要进入站点逐项核对。</p></article>
          <article><span>02</span><h3>把性能值当作历史样本</h3><p>在线率与延迟受采样地点、时段和上游影响。它们适合建立候选范围，不代表你的网络、模型和并发条件下会得到相同结果。</p></article>
          <article><span>03</span><h3>评价先经过样本修正</h3><p>评分使用贝叶斯平滑，少量五星不会直接获得满分。页面同时保留原始评价和数量，便于判断样本规模。</p></article>
          <article><span>04</span><h3>区分“不支持”和“未记录”</h3><p>明确的否定是数据证据，空字段只是来源没有提供。退款、发票、支付方式和模型明细都按这一区别展示。</p></article>
          <article><span>05</span><h3>用固定任务复核</h3><p>对候选站发送相同的长上下文、流式与工具调用请求，记录时间、响应模型、错误码、Token 和扣费，再比较可重复结果。</p></article>
          <article><span>06</span><h3>保留独立退出路径</h3><p>即使数据排名靠前，也应控制预存金额、隔离密钥和额度，并为关键调用准备不同上游的备用接口。</p></article>
        </div>
        <aside class="warning-box"><strong>分数不是认证</strong><p>综合分只说明当前快照如何按公开字段计算。模型、价格、线路和政策可能随时变化，付款与生产接入前仍需自行验证。</p></aside>
      </section>

      <section class="cost-section" aria-labelledby="coverage-title">
        <div class="cost-intro"><div class="section-kicker">缺失值策略</div><h2 id="coverage-title">没有数据，不等于表现为零</h2><p>如果某项没有记录，该分项会从分母中剔除；系统再按可用权重计算覆盖度，将结果向中性值收缩。这样既不奖励信息缺失，也不把“未知”误判成明确失败。</p></div>
        <div class="formula-card"><span>最终数据分</span><code>50 + (可用项加权分 − 50) × 覆盖置信系数</code><small>完整权重和归一化边界见排名方法页。</small></div>
        <p class="cost-note"><strong>阅读顺序：</strong>综合分 → 覆盖度 → 有效样本数量 → 具体字段 → 自己的复测结果。不要只截取单个名次或指标传播结论。</p>
      </section>

      <section class="test-section" id="checklist" aria-labelledby="test-title">
        <div><div class="section-kicker">复核记录</div><h2 id="test-title">把一次体验变成可比较数据</h2><p class="test-lead">使用相同模型、相同请求和相近时段，至少记录以下项目，才能判断公开数据是否适合你的场景。</p></div>
        <ol class="test-list"><li><strong>字段更新时间</strong><span>确认页面快照和站内公告是否仍有效。</span></li><li><strong>模型与协议</strong><span>记录真实响应模型、接口格式和功能缺口。</span></li><li><strong>首字与总耗时</strong><span>分开记录排队、首字和完整返回时间。</span></li><li><strong>连续成功率</strong><span>多时段重复请求，不用一次成功替代稳定性。</span></li><li><strong>请求级账单</strong><span>保存 Token、缓存、倍率和最终扣费。</span></li><li><strong>政策证据</strong><span>保存退款、发票、日志与客服规则的当前页面。</span></li></ol>
      </section>`;
}

function renderStructuredData({ page, canonical, title, description, sites, totalSites, updatedDate }) {
  const graph = [];
  const breadcrumbId = `${canonical}#breadcrumb`;
  const breadcrumbItems = [
    { "@type": "ListItem", position: 1, name: "AI 中转站推荐", item: `${ORIGIN}/` },
  ];
  if (page > 1) {
    breadcrumbItems.push({ "@type": "ListItem", position: 2, name: `第 ${page} 页`, item: canonical });
  }
  if (page === 1) {
    graph.push({
      "@type": "WebSite",
      "@id": `${ORIGIN}/#website`,
      url: `${ORIGIN}/`,
      name: "AI 中转站推荐",
      description: "AI API 中转站排名、服务指标与选择指南。",
      inLanguage: "zh-CN",
    });
  }
  graph.push({
    "@type": "CollectionPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: "zh-CN",
    dateModified: updatedDate,
    isPartOf: { "@id": `${ORIGIN}/#website` },
    breadcrumb: { "@id": breadcrumbId },
    mainEntity: { "@id": `${canonical}#ranking` },
    ...(page === 1 ? { hasPart: TOPICS.map((topic) => ({ "@id": `${ORIGIN}/${topic.slug}/#webpage` })) } : {}),
  });
  graph.push({
    "@type": "BreadcrumbList",
    "@id": breadcrumbId,
    itemListElement: breadcrumbItems,
  });
  graph.push({
    "@type": "ItemList",
    "@id": `${canonical}#ranking`,
    name: page === 1 ? "AI 中转站推荐" : `AI 中转站推荐第 ${page} 页`,
    numberOfItems: totalSites,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: sites.map((site) => ({
      "@type": "ListItem",
      position: site.rank,
      item: {
        "@type": "Service",
        name: site.name,
        url: site.url,
        description: objectiveSiteSummary(site),
      },
    })),
  });
  if (page === 1) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${ORIGIN}/#faq`,
      mainEntity: FAQ.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer.join("\n\n") },
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c");
}

function renderPage({ page, totalPages, sites, allSites, topicPages, updatedDate }) {
  const root = relativeRoot(page);
  const canonical = `${ORIGIN}${pagePath(page)}`;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = first + sites.length - 1;
  const title = page === 1
    ? `AI 中转站数据榜｜${allSites.length} 家公开资料评分索引`
    : `AI 中转站数据榜第 ${page} 页｜排名 ${first}–${last}`;
  const description = page === 1
    ? `AI 中转站数据榜以统一公式重排 ${allSites.length} 家公开资料站点，展示综合分、评分覆盖度、在线率、延迟、模型数量与服务政策，并公开缺失值处理方法。`
    : `AI 中转站数据榜第 ${page} 页，查看排名 ${first} 至 ${last} 的综合分、字段覆盖度及结构化公开指标。`;
  const relations = pageRelations(page, totalPages);
  const jsonLd = renderStructuredData({ page, canonical, title, description, sites, totalSites: allSites.length, updatedDate });
  const hero = page === 1
    ? `<p class="eyebrow">OPEN DATA RANKING · ${updatedDate.replaceAll("-", ".")}</p>
          <h1>AI 中转站<br /><em>数据榜</em></h1>
          <p class="hero-copy">同一套公式处理所有站点：缺失字段不记零分，证据越少，分数越向中性值收缩。每条说明由结构化事实生成，不照搬来源宣传文字。</p>
          <div class="hero-actions"><a href="#ranking">查看数据表</a><a href="./methodology/">核对评分公式</a></div>`
    : `<p class="eyebrow">RANKING PAGE ${String(page).padStart(2, "0")} · ${updatedDate.replaceAll("-", ".")}</p>
          <h1>AI 中转站推荐<br /><em>第 ${page} 页</em></h1>
          <p class="hero-copy">本页展示综合排名 ${first}–${last}。需要先了解选择方法？<a href="${root}/#guide">返回首页阅读完整指南</a>。</p>`;
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta name="theme-color" content="#f4f0e8" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="AI 中转站推荐" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:image" content="${ORIGIN}/assets/og-image.svg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${ORIGIN}/assets/og-image.svg" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="zh-CN" href="${canonical}" />
    ${relations.previous ? `<link rel="prev" href="${relations.previous}" />` : ""}
    ${relations.next ? `<link rel="next" href="${relations.next}" />` : ""}
    <link rel="icon" href="${root}/assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${root}/assets/styles.min.css" />
    <script type="application/ld+json">${jsonLd}</script>
  </head>
  <body>
    <a class="skip-link" href="#main">跳到主要内容</a>
    <header class="topbar">
      <a class="wordmark" href="${root}/" aria-label="AI 中转站数据榜首页"><span>中转站</span><strong>数据榜</strong></a>
      <nav aria-label="主要导航"><a href="${root}/#ranking">数据榜</a><a href="${root}/#topics">模型索引</a><a href="${root}/methodology/">评分方法</a></nav>
    </header>
    <main id="main">
      ${renderBreadcrumbs(page, root)}
      <section class="hero">
        <div class="hero__copy">
          ${hero}
        </div>
        <aside class="hero__panel" aria-label="榜单概览">
          <p>本期收录</p><strong>${allSites.length}</strong><span>家 AI API 中转站</span>
          <dl><div><dt>当前页</dt><dd>${page} / ${totalPages}</dd></div><div><dt>本页范围</dt><dd>${first}–${last}</dd></div><div><dt>每页数量</dt><dd>${PAGE_SIZE}</dd></div></dl>
        </aside>
      </section>

      <section class="ranking" id="ranking" aria-labelledby="ranking-title">
        <div class="ranking-head">
          <div><p>DATA TABLE / ${String(page).padStart(2, "0")}</p><h2 id="ranking-title">公开指标排名表</h2></div>
        </div>
        ${renderRankingTable(sites, `AI 中转站公开数据排名 ${first}–${last}，共 ${allSites.length} 家`)}
        ${renderPagination(page, totalPages)}
      </section>

${page === 1 ? `${renderTopicDirectory(topicPages)}\n\n${homeGuide()}` : `      <section class="page-continue"><p>已经看完第 ${page} 页？</p><h2>回到选择指南，建立自己的测试标准</h2><a href="${root}/#guide">阅读中转站选择方法 →</a></section>`}
    </main>
    <footer class="footer">
      <a class="wordmark" href="${root}/"><span>中转站</span><strong>推荐榜</strong></a>
      <p>先比较，后测试；少量充值，为关键调用保留备用方案。</p>
      <a href="#main">返回顶部 ↑</a>
    </footer>
  </body>
</html>
`;
}

function renderMethodology({ sites, updatedDate }) {
  const canonical = `${ORIGIN}/methodology/`;
  const title = `数据评分方法与字段说明｜${SITE_NAME}`;
  const description = `公开 AI 中转站数据榜的评分权重、归一化边界、缺失值处理、覆盖度收缩、确定性排序和每页 40 条规则。`;
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@graph": [
    { "@type": "WebSite", "@id": `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: SITE_NAME, inLanguage: "zh-CN" },
    { "@type": "WebPage", "@id": `${canonical}#webpage`, url: canonical, name: title, description, dateModified: updatedDate, inLanguage: "zh-CN", isPartOf: { "@id": `${ORIGIN}/#website` } },
  ] }).replaceAll("<", "\u003c");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}" /><meta name="robots" content="index, follow" /><meta name="theme-color" content="#173d3c" /><link rel="canonical" href="${canonical}" /><link rel="icon" href="../assets/favicon.svg" type="image/svg+xml" /><link rel="stylesheet" href="../assets/styles.min.css" /><script type="application/ld+json">${jsonLd}</script></head><body><a class="skip-link" href="#main">跳到主要内容</a><header class="topbar"><a class="wordmark" href="../"><span>中转站</span><strong>数据榜</strong></a><nav aria-label="主要导航"><a href="../#ranking">数据榜</a><a href="../#topics">模型索引</a><a href="./" aria-current="page">评分方法</a></nav></header><main id="main"><nav class="breadcrumbs" aria-label="面包屑"><a href="../">${SITE_NAME}</a><span>/</span><span aria-current="page">评分方法</span></nav><article class="methodology"><p class="eyebrow">METHODOLOGY · ${updatedDate.replaceAll("-", ".")}</p><h1>数据评分方法</h1><p class="methodology__lead">本站把 ${sites.length} 家公开资料站点放入同一套确定性公式。分数用于整理证据，不是质量认证、购买建议或实时可用性保证。</p><section><h2>入选与分页</h2><p>先按来源顺序去重并保留最多 500 条，再计算分数。主榜和模型专题均使用静态分页，每页最多 40 条；同一份快照重复构建会得到相同排序。</p></section><section><h2>分项与权重</h2><div class="method-grid"><article><h3>运行表现 · 45%</h3><p>在线率 25%：80% 到 100% 线性映射；延迟 20%：1,000 到 15,000 毫秒按对数反向映射。区间外截断，无效值不计。</p></article><article><h3>评价与模型 · 25%</h3><p>评价 15%：使用 10 条、3.5/5 的贝叶斯先验；模型广度 10%：对 1–40 个模型做对数映射，避免数量无限放大。</p></article><article><h3>运营与服务 · 20%</h3><p>运营时间 5%、支付方式 5%、退款 5%、发票 5%。明确不支持按 0 分，未知字段不计；两年运营时间和三种支付方式分别封顶。</p></article><article><h3>来源连续性 · 10%</h3><p>入选后的来源位置线性递减，仅作为弱先验和稳定性参考，不再直接决定展示名次。</p></article></div></section><section><h2>缺失字段如何处理</h2><p>缺失值不会按 0 分惩罚，而是从可用权重分母中剔除：原始分 = 可用分项加权和 ÷ 可用权重。覆盖度等于可用权重占全部权重的比例，置信系数为 0.35 + 0.65 × 覆盖度；最终分 = 50 +（原始分 − 50）× 置信系数。资料越少，结果越接近中性 50 分。</p></section><section><h2>排序和平局</h2><p>排序使用未四舍五入的最终分，页面显示一位小数。分数相同时依次比较覆盖度、来源位置、标准化名称和 URL，再重新编号为连续名次。</p></section><section><h2>页面说明如何生成</h2><p>站点说明不直接输出 data.json 的宣传描述，而是从评分、覆盖度、日期、性能、评价、模型、支付和政策字段生成。多套句式由名称与 URL 的稳定哈希选择；“未记录”与“明确不支持”始终分开表达。</p></section><section><h2>指标局限</h2><p>在线率与延迟受采样时段、地区和上游影响；评价可能存在样本偏差；模型数量不证明型号、参数和上下文当前可用；退款、发票和支付政策可能变化。专题关键词匹配也只代表公开文字提及。</p></section><aside class="warning-box"><strong>使用边界</strong><p>请用自己的网络、模型和真实请求复测，保存响应模型、错误码、Token、扣费与政策页面。涉及敏感数据或强 SLA 时，应优先选择官方或可审计、可签约服务。</p></aside></article></main><footer class="footer"><a class="wordmark" href="../"><span>中转站</span><strong>数据榜</strong></a><p>公式公开，结果可复核；数据分不等于背书。</p><a href="#main">返回顶部 ↑</a></footer></body></html>`;
}

function minifyHtml(html) {
  return html
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("")
    .replace(/>\s+</g, "><")
    .concat("\n");
}

function minifyCss(css) {
  const strings = [];
  const protectedCss = css.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, (match) => {
    const token = `___CSS_STRING_${strings.length}___`;
    strings.push(match);
    return token;
  });
  let minified = protectedCss
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
  strings.forEach((value, index) => {
    minified = minified.replace(`___CSS_STRING_${index}___`, value);
  });
  return `${minified}\n`;
}

function renderSitemap(totalPages, topicPages, updatedDate) {
  const urls = [
    ...Array.from({ length: totalPages }, (_, index) => `${ORIGIN}${pagePath(index + 1)}`),
    ...topicPages.flatMap(({ topic, totalPages: pages }) => Array.from({ length: pages }, (_, index) => `${ORIGIN}${topicPagePath(topic, index + 1)}`)),
    `${ORIGIN}/methodology/`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url, index) => `  <url>
    <loc>${url}</loc>
    <lastmod>${updatedDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${index === 0 ? "1.0" : index < totalPages ? "0.8" : "0.9"}</priority>
  </url>`).join("\n")}
</urlset>
`;
}

async function cleanNumericPageDirectories(pageRoot, totalPages) {
  let entries = [];
  try { entries = await readdir(pageRoot, { withFileTypes: true }); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name) && Number(entry.name) > totalPages)
    .map((entry) => rm(path.join(pageRoot, entry.name), { recursive: true, force: true })));
}

async function build() {
  if (SHOULD_SYNC) await syncData();
  const payload = JSON.parse(await readFile(DATA_PATH, "utf8"));
  validatePayload(payload);
  const updatedDate = normalizeDate(payload.updatedDate) || new Date().toISOString().slice(0, 10);
  const normalized = payload.sites.map(normalizeSite).sort((a, b) => a.rank - b.rank)
    .filter((site, index, items) => items.findIndex((candidate) =>
      candidate.name.toLowerCase() === site.name.toLowerCase() || candidate.url === site.url) === index)
    .slice(0, MAX_SITES);
  const sites = rankSites(normalized, updatedDate).map((site) => ({
    ...site,
    searchableText: [site.name, site.description, ...site.models].join(" ").toLowerCase(),
  }));
  const totalPages = Math.ceil(sites.length / PAGE_SIZE);
  const topicPages = TOPICS.map((topic) => {
    const matches = sites.filter((site) => topicMatches(site, topic));
    return { topic, matches, stats: topicStats(matches), totalPages: Math.ceil(matches.length / PAGE_SIZE) };
  });
  await Promise.all([
    cleanNumericPageDirectories(PAGE_ROOT, totalPages),
    ...topicPages.map(({ topic, totalPages: pages }) => cleanNumericPageDirectories(path.join(ROOT, topic.slug, "page"), pages)),
    atomicWrite(MINIFIED_STYLES_PATH, minifyCss(await readFile(STYLES_PATH, "utf8"))),
  ]);

  for (let page = 1; page <= totalPages; page += 1) {
    const pageSites = sites.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const target = page === 1 ? path.join(ROOT, "index.html") : path.join(PAGE_ROOT, String(page), "index.html");
    await atomicWrite(target, minifyHtml(renderPage({ page, totalPages, sites: pageSites, allSites: sites, topicPages, updatedDate })));
  }
  for (const { topic, matches, stats, totalPages: pages } of topicPages) {
    for (let page = 1; page <= pages; page += 1) {
      const pageSites = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const target = page === 1
        ? path.join(ROOT, topic.slug, "index.html")
        : path.join(ROOT, topic.slug, "page", String(page), "index.html");
      await atomicWrite(target, minifyHtml(renderTopicPage({ topic, page, totalPages: pages, sites: pageSites, allMatches: matches, topicPages, updatedDate, stats })));
    }
  }
  await atomicWrite(path.join(ROOT, "methodology", "index.html"), minifyHtml(renderMethodology({ sites, updatedDate })));
  await atomicWrite(path.join(ROOT, "sitemap.xml"), renderSitemap(totalPages, topicPages, updatedDate));
  process.stdout.write(`已生成 ${totalPages} 个榜单分页、${topicPages.reduce((sum, item) => sum + item.totalPages, 0)} 个专题分页，共 ${sites.length} 个站点；数据日期 ${updatedDate}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
}
