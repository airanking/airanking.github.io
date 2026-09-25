# Search Vocabulary Research

Updated: 2026-09-25

This is a directional keyword list for the directory, not a claim of exact search volume. Search suggestions and related queries vary by country, language, personalization, and date.

## Observed Terms

### Google Trends

The Google Trends Explore page for `AI API gateway` showed these rising related queries in the visible results:

- `Kimi API`
- `Bifrost AI gateway`
- `Bifrost`
- `Helicone`

The same page identified `AI API gateway` as the comparison topic. A direct Explore query for `AI 中转站` did not expose enough volume for a reliable related-query list, so Chinese terms below are corroborated with ordinary Google and Bing result pages instead of being presented as Google Trends volume data.

Source: <https://trends.google.com/trends/explore?q=AI%20API%20gateway>

### Google and Bing result pages

The visible result titles, snippets, related searches, and “People also search for” blocks repeatedly used these concepts:

- English: `AI API gateway`, `AI gateway`, `LLM gateway`, `AI API proxy`, `AI API aggregator`, `multi-model API`, `OpenAI-compatible API`, `AI model router`, `open source AI gateway`.
- Spanish: `pasarela API de IA`, `gateway de IA`, `proxy de API de IA`, `agregador de API de IA`, `API unificada de IA`, `API multimodelo`.
- Chinese: `AI 中转站`, `API 中转站`, `AI 中转站排行榜`, `AI 中转站评测`, `AI 中转站推荐`, `中转站价格对比`, `AI 中转站靠谱吗`, `AI 中转站搭建`, `国外 API 中转站`, `大模型 API 集成平台`, `大模型 API 聚合平台`, `AI API 网关`, `AI 接口代理`.

Sources used for the snapshot:

- <https://www.google.com/search?q=AI+%E4%B8%AD%E8%BD%AC%E7%AB%99>
- <https://www.google.com/search?q=proxy+API+IA>
- <https://www.bing.com/search?q=AI+API+gateway>
- <https://www.bing.com/search?q=AI+%E4%B8%AD%E8%BD%AC%E7%AB%99>
- <https://www.bing.com/search?q=pasarela+API+IA>

## How The Site Uses Them

The terms are stored in `scripts/build-localized.mjs` by locale. They are rendered on dedicated `/search-vocabulary/` pages linked from the footer, rather than being appended to ranking pages. The site does not rely on the obsolete `meta keywords` tag. The terms are deliberately kept separate from model-topic matching, so generic search language cannot incorrectly claim that every listed provider supports every model.
