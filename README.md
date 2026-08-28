# 玄英的个人成长记录网站

这是玄英的个人成长记录网站，用来持续发布文章和手记，记录阅读、AI 学习、英语练习，以及准备去上海读大学之前的选择与想象。

## 本地运行

先生成静态发布文件：

```bash
npm run build
```

构建完成后，使用项目自带的静态服务器预览：

```bash
npm start
```

也可以直接将 `outputs/` 作为静态网站的发布目录。

## 检查

```bash
npm run check
```

检查脚本会验证生成页面、内容数据、静态详情页、文章图片、站内链接和站点元信息。

## 内容维护

- 文章源文件放在 `content/articles/`。
- 手记源文件放在 `content/notes/`。
- 内容使用 Markdown front matter 管理，只有 `status: published` 的内容会生成公开页面。
- 图片等内容资源放在 `content/` 下，由构建脚本复制到 `outputs/`。
- `site/` 保存页面模板，`scripts/build-content.mjs` 负责构建，`outputs/` 不作为手动维护源文件。

## 配置

公开站点配置保存在 `site.config.json`。当前 `siteUrl` 保持为空；正式域名确定后再按 `docs/deployment.md` 的说明填写并重新构建。
