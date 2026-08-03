# AI 中转站数据榜

面向 GitHub Pages 的原生静态数据索引。搜索引擎无需执行 JavaScript 即可抓取语义化排名表、模型专题、评分方法和字段说明。

## 本地使用

需要 Node.js 22 或更新版本，无第三方运行依赖。

```bash
npm run build   # 使用仓库中的数据快照重新生成
npm run sync    # 获取最新公开数据并重新生成
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

`.github/workflows/update-site.yml` 每天 UTC 02:17 和 14:17 同步两次，验证成功后仅在内容变化时提交生成产物。也可以在 Actions 页面手动运行。
