# 内容源稿

网站的长期内容源稿保存在 `content/articles/` 和 `content/notes/`，每篇内容使用一个 Markdown 文件。页面不直接读取手写的 JavaScript 数据；运行构建命令后，脚本会生成 `outputs/content/content-data.js`，现有静态页面继续从这个文件读取内容。

已发布的文章会生成独立静态页面：`outputs/articles/<slug>/index.html`；已发布的手记会生成：`outputs/notes/<slug>/index.html`。首页和内容列表优先链接到对应静态地址；原来的 `content.html?slug=<slug>` 保留为兼容跳转入口。

## Front matter

每篇内容至少包含：

```yaml
---
type: article
title: "文章标题"
slug: "unique-slug"
date: "YYYY-MM-DD"
summary: "列表页使用的简短摘要"
category: "分类"
tags: ["标签一", "标签二"]
cover: ""
sourceUrl: ""
status: draft
series: "可选系列名称"
seriesOrder: 1
---
```

`type` 使用 `article` 或 `note`；`status: draft` 的内容不会进入公开页面，改为 `published` 后才会在网站显示。日期暂时不确定时可以留空，不需要编造日期。`series` 和 `seriesOrder` 都是可选字段；只有已发布且填写了 `series` 的内容才会出现在对应系列页，系列内按 `seriesOrder` 从小到大排列。

## 站点地址

项目根目录的 `site.config.json` 包含 `siteUrl`。尚未配置真实域名时保持为空；配置真实 HTTP/HTTPS 地址后，构建器才会为静态文章生成 canonical 和 `og:url`。

```json
{
  "siteUrl": ""
}
```

`cover` 为空时不会生成 `og:image`。如需使用本地封面，将图片放在 `content/` 内并在 front matter 中填写相对 Markdown 文件的路径；构建器会复制该图片并生成对应的分享元数据。

## 图片

文章图片放在 `content/images/articles/<slug>/`，在 Markdown 正文中按顺序引用：

```markdown
![公众号贴图 01](../images/articles/my-article/01.jpg)
```

构建时图片会复制到 `outputs/public/`，页面会按引用顺序连续展示，使用响应式宽度和懒加载。

## 命令

```bash
npm run build
npm start
```

`npm start` 使用 Node.js 内置服务器预览 `outputs/`，默认地址为 `http://127.0.0.1:4173`。

从可访问的微信公众号链接导入一篇内容时，可以使用：

```bash
node scripts/import-wechat.mjs --url "https://mp.weixin.qq.com/s/..." --slug "my-article" --category "分类" --tags "标签一,标签二"
```

导入器只在页面可访问时读取文章 HTML 和图片；如果公众号页面要求验证，会明确报错且不写入不完整文件。导入后运行 `npm run build`。
