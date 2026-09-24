# AI 中转站数据榜

面向 GitHub Pages 的原生静态数据索引。搜索引擎无需执行 JavaScript 即可抓取语义化排名表、模型专题、评分方法和字段说明。

## 本地使用

需要 Node.js 22 或更新版本，无第三方运行依赖。

```bash
npm run build   # 使用仓库中的数据快照重新生成
npm run sync    # 获取最新公开数据并重新生成
npm run translate # 使用 AI_API_* 环境变量更新英文/西语翻译缓存
npm run build:localized # 仅根据数据和翻译缓存生成多语言页面
npm test        # 检查数据评分、表格语义、分页、SEO 与静态产物
```

## 站点结构

- `index.html`：首页、前 40 条数据榜与评分阅读说明
- `page/*/index.html`：每页最多 40 条的主榜静态分页，最多展示 500 条
- `*-zhongzhuanzhan/index.html`：GPT、Claude、Codex、Gemini、DeepSeek、GLM、Qwen、Kimi 专题首页
- `*-zhongzhuanzhan/page/*/index.html`：专题结果超过 40 条时生成的静态分页
- `methodology/index.html`：评分权重、归一化、缺失值、覆盖度和平局规则
- `sitemap.xml`、`robots.txt`、`404.html`：搜索引擎与错误页支持
- `data.json`：构建使用的最多 500 条公开数据快照
- `translations/en.json`、`translations/es.json`：按站点 URL slug 和源文本哈希保存的翻译缓存；不使用排名作为键
- `/`、`/page/*`：默认英文页面；`/en/*` 为英文明确入口；`/es/*` 为西班牙语；`/cn/*` 为中文
- `/en/sites/*`、`/es/sites/*`、`/sites/*`：英文、西班牙语、中文站点详情页

## 排名方法

榜单不再按来源名次直接展示或做周期轮换。构建器综合在线率、延迟、用户评价、模型广度、运营时间、支付方式、退款、发票和低权重来源顺序先验，计算 0–100 数据分。

缺失字段不按零分处理，而从可用权重中剔除；系统再按字段覆盖度把结果向中性 50 分收缩，避免少量有利字段产生极端名次。评分、说明模板和排序均为确定性，同一份 `data.json` 重复构建会得到相同结果。完整公式见方法页。

站点说明由结构化字段生成，不直接输出 `data.json` 中的来源宣传描述；“明确不支持”和“未记录”会分开表达。模型专题的关键词匹配仅用于建立候选集合，不代表相关模型当前可用。

## 页面与样式

榜单使用原生 HTML `table`、caption、列头和行头，每个站点严格占据一个 `<tbody>` 数据行。移动端保留九列表格语义，并在独立区域内横向滚动查看全部指标。请修改 `scripts/build.mjs` 和 `assets/styles.css`，然后运行 `npm run build`；不要直接维护生成的 HTML 或 `assets/styles.min.css`。

## GitHub Pages

1. 将代码推送到 `main` 分支。
2. 打开仓库 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**。
4. 选择 `main` 分支和 `/ (root)` 目录。

`.github/workflows/update-site.yml` 每天 UTC 03:23 同步一次，验证成功后仅在内容变化时提交生成产物。也可以在 Actions 页面手动运行。

## 多语言翻译

GitHub Actions 不把 API Key 写入仓库。工作流从 GitHub Actions Secrets 读取 `AI_API_KEY`、`AI_BASE_URL` 和 `AI_MODEL`，调用 OpenAI-compatible 的 `/chat/completions` 接口，批量翻译 `data.json` 中新增或发生变化的站点描述，然后提交翻译缓存和三种语言的静态页面。

翻译脚本是缓存优先的：接口超时、返回错误或结果缺少站点时，会保留上一版英文/西班牙语翻译；没有历史翻译的记录使用结构化回退文本，构建不会因为翻译服务暂时不可用而失败。API Key 只存在于 Actions 运行环境，不能放进 HTML、`data.json` 或提交记录。

在仓库中配置：`Settings → Secrets and variables → Actions → New repository secret`。

```text
AI_API_KEY   你的 AI 服务密钥
AI_BASE_URL  例如 https://api.example.com/v1
AI_MODEL     你的模型名称
```
