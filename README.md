# AI 中转站推荐

面向 GitHub Pages 的原生静态 HTML 排名站点。搜索引擎无需执行 JavaScript 即可抓取榜单、模型专题、排名方法和选择指南。

## 本地使用

需要 Node.js 22 或更新版本，无第三方运行依赖。

```bash
npm run build   # 使用仓库中的数据快照重新生成
npm run sync    # 获取最新公开数据并重新生成
npm test        # 检查数据、排名、SEO 与静态产物
```

## 站点结构

- `index.html`：首页、前 50 条榜单与完整选择指南
- `page/*/index.html`：每页 50 条的静态分页，最多展示 500 条
- `*-zhongzhuanzhan/index.html`：GPT、Claude、Codex、Gemini、DeepSeek、GLM、Qwen、Kimi 专题
- `methodology/index.html`：数据字段、截断和轻量排序规则
- `sitemap.xml`、`robots.txt`、`404.html`：搜索引擎与错误页支持
- `data.json`：构建使用的最多 500 条数据快照

榜单以来源顺序确定入选范围，再在相邻 5 条内按周做确定性轮换；重复构建不会随机抖动，单条最多移动 4 位。具体说明见排名方法页。

## GitHub Pages

1. 将代码推送到 `main` 分支。
2. 打开仓库 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**。
4. 选择 `main` 分支和 `/ (root)` 目录。

`.github/workflows/update-site.yml` 每天 UTC 02:17 和 14:17 同步两次，验证成功后仅在内容变化时提交生成产物。也可以在 Actions 页面手动运行。
