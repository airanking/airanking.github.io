# AI Ranking

面向 GitHub Pages 的四语 AI API 服务资料索引：**English / Español / Русский / 简体中文**。默认英文，完整静态 HTML，无浏览器语言重定向、无前端框架、无需 JavaScript 即可阅读和切换语言。

## 本地构建

需要 Node.js 22 或更新版本，无第三方运行依赖。

```bash
npm run build             # 使用本地快照，重建全部页面和 CSS
npm run build:localized   # 单独重建四语页面和 CSS
npm run sync              # 从公开来源更新数据，再构建全站
npm test                  # 评分、路由、内容、全站内链与 SEO 回归
python3 -m http.server 8000 # 本地预览 http://localhost:8000/
```

正常构建不需要 API Key 或翻译服务。`npm run translate` 及旧 `translations/` 缓存保留为可选的历史工具，不参与现在的页面正文生成，自动更新工作流也不再调用翻译接口。

## 语言与 URL

- `/`、`/page/*/`、`/*-zhongzhuanzhan/`、`/methodology/`、`/guides/`：规范英文页面。
- `/en/` 及其对应页面：保留英文兼容入口，canonical 指向对应英文根路径。
- `/es/`、`/ru/`、`/cn/`：西班牙语、俄语、中文的首页、分页、专题、方法和指南。
- `/en/sites/*/`、`/es/sites/*/`、`/ru/sites/*/`：英文、西语、俄语详情。
- `/sites/*/`：保留历史中文详情地址，不重新解释为英文。
- 每个页面的语言切换定位到对应内容（保留专题、页码或站点 slug）；URL 决定语言，不用浏览器偏好覆盖。
- sitemap 只包含 canonical 页面，英文兼容入口仍可直接访问。

所有 hvoyai 站点链接在构建时转换到当前语言：

```text
English  https://www.hvoyai.com/en/sites/9527codes/
Español  https://www.hvoyai.com/es/sites/9527codes/
Русский  https://www.hvoyai.com/ru/sites/9527codes/
中文     https://www.hvoyai.com/sites/9527codes/
```

仅精确匹配 `hvoyai.com` 和 `www.hvoyai.com`；替换已有语言前缀，保留 query/hash。其他主机不改，`data.json` 的来源 URL 不改。

## 维护入口

不要逐页修改生成 HTML 或 `assets/styles.min.css`。修改源码后运行构建。

| 文件 | 用途 |
| --- | --- |
| `scripts/locales.mjs` | 品牌、语言配置、站内路由、canonical/hreflang、站外 URL |
| `scripts/content.mjs` | 四语界面、字段标签、模型分类 |
| `scripts/editorial.mjs` | 原创四语选型场景、三篇指南、FAQ、专题核验与评分解释 |
| `scripts/build-localized.mjs` | 最终四语静态页面、SEO、404、sitemap、生成文件清理 |
| `scripts/build.mjs` | 来源同步、字段归一化、评分、CSS 压缩及兼容构建阶段 |
| `assets/styles.css` | 响应式视觉与语义表格样式 |
| `data.json` | 最多 500 条公开数据快照 |
| `test/` | Node 原生测试 |

`build` 的第一阶段通过 `--prepare` 只验证数据和准备资源（`sync` 还同步数据），跳过旧版页面生成及递归目录清理；第二阶段负责最终页面。不要修改第一阶段的旧页面模板。清理逻辑只移除限定生成目录中带有已识别标记的过期 `index.html`，不递归删除用户文件。

## 内容与证据边界

- 指南覆盖选型、小额试用、真实账单核验和生产前检查，四语言均为维护的完整静态正文。
- 服务商详情从结构化字段重新组织，不复制来源宣传，也不展示 `translated: false` 的伪翻译；服务商专名保留原名。
- 在线率、延迟、评价及服务政策来自公开快照，不是本站的独立监测或实时认证。测量窗口、地区和样本量未提供。
- 模型专题是关键词匹配的研究清单，不证明某模型当前可用。
- 缺失与明确不支持分别表达。账单示例属于假设，不是某家服务商的实时报价。

## 评分契约

保留确定性评分：来源位置 10%、在线率 25%、延迟 20%、评价 15%、模型数量 10%，运营时间、支付方式、退款、发票各 5%。缺失项从可用权重中剔除，再按覆盖度向 50 分收缩。相同数据重复构建产生相同排名。

主榜与模型专题每页最多 40 条；评分公式、贝叶斯评价修正、归一化和排序规则见各语言 `/methodology/` 页面。覆盖度不是成功率或置信概率。

## GitHub Pages

使用 `main` 分支、仓库根目录部署。`.github/workflows/update-site.yml` 每天 UTC 03:23 同步公开数据、构建、测试并提交变化，也支持手动触发。生成清单覆盖俄语、指南、搜索词汇、404、robots 和压缩 CSS。

保留 `.nojekyll` 和 `BingSiteAuth.xml` 等站点运行文件。开发修改不等于已发布；需要按项目正常流程提交并推送。
