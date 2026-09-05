# modules/curriculum — 课程领域

公共课程、假名、内容模板、阅读篇目与配题、新闻采集和内容生成。不直接拥有用户长期学习进度。

| 路径 | 内容 |
|---|---|
| `persistence/` | curriculum-content（课程/篇目读写；成绩回写在 learning-progress） |
| `infrastructure/` | news-rss、news-article-fetch（模块专属外部 IO） |
| `application/` | generate-news-passage、news-reading |
| `tools/` | learning-curriculum |
| `http/` | 假名/阅读/发音路由 |
