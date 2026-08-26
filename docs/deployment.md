# 部署说明

本项目是纯静态网站。内容源稿保存在 `content/`，页面模板和样式保存在 `site/`，构建脚本保存在 `scripts/`，最终发布目录为 `outputs/`。

## 构建

在项目根目录执行：

```bash
npm run build
npm run check
```

`npm run build` 会先清理 `outputs/`，再从 `content/`、`site/`、`scripts/` 和 `site.config.json` 重新生成完整网站。`npm run check` 会检查已发布内容、静态页面、资源引用、文章图片、外部链接和站点地址规则。

## 发布目录

构建完成后，将整个 `outputs/` 目录作为静态托管平台的发布目录。不要将 `site/`、`content/` 或 `node_modules/` 直接作为发布目录。

发布前可以在本地预览：

```bash
npm start
```

然后访问本地预览地址。`npm start` 只用于本地检查，不会成为网站正式地址。

## 临时托管测试

选择任意支持静态文件上传的临时托管服务，将构建后的 `outputs/` 目录上传，使用服务提供的临时预览地址检查页面和资源。

临时预览时可以保持 `site.config.json` 中的 `siteUrl` 为空。这样不会生成 canonical、`og:url` 或 sitemap 绝对地址，也不会把临时域名写进分享信息。如果需要专门测试正式域名元信息，应在临时副本中测试，不要把临时托管地址提交到正式配置。

## 绑定根域名

确定托管平台后，在平台控制台添加自己的根域名，例如 `example.com`，并按照平台显示的域名验证和 DNS 配置要求完成绑定。不同平台需要的验证方式和 DNS 记录可能不同，本项目不预设或写死任何平台记录。

`www` 是否跳转到根域名由 DNS 或托管平台配置决定，项目代码不会擅自假设该跳转。

## 配置正式域名

正式根域名确认后，修改项目根目录的 `site.config.json`：

```json
{
  "siteUrl": "https://example.com"
}
```

`siteUrl` 末尾不要添加 `/`，并且只填写正式主域名。根域名作为主地址时，使用根域名本身，不要填写托管平台的临时地址或项目子域名。

修改 `siteUrl` 后重新执行：

```bash
npm run build
npm run check
```

构建成功后再上传新的 `outputs/`。配置有效的 HTTP/HTTPS 地址时，构建器会为已发布文章、已发布手记和主要页面生成正式绝对地址，并生成 `sitemap.xml`；draft 内容不会进入 sitemap。

## 发布检查

部署后至少检查以下地址和内容：

- 首页：`/` 或 `/index.html`
- 文章列表：`/articles.html`
- 手记列表：`/notes.html`
- 系列页：`/before-shanghai.html`
- 文章静态页：`/articles/<slug>/index.html`
- 手记静态页：`/notes/<slug>/index.html`
- 404 页面：`/404.html`，并用托管平台支持的方式检查不存在的地址
- robots：`/robots.txt`
- sitemap：配置正式 `siteUrl` 后检查 `/sitemap.xml`

同时确认：

1. 首页、文章页、手记页的 title 和 description 正确。
2. 文章页的 canonical、`og:url` 使用正式根域名。
3. 手记页不显示微信公众号来源和原文按钮。
4. 两篇公众号文章的原文链接仍指向已确认的微信公众号地址，并在新标签页打开。
5. 12 张文章配图、CSS、JavaScript、favicon 和返回链接均能正常加载。
6. 手机宽度下没有横向滚动、标题截断或图片溢出。
