import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(projectRoot, 'site');
const contentRoot = path.join(projectRoot, 'content');
const contentRoots = [path.join(contentRoot, 'articles'), path.join(contentRoot, 'notes')];
const outputRoot = path.join(projectRoot, 'outputs');
const dataOutput = path.join(outputRoot, 'content', 'content-data.js');
const siteConfigOutput = path.join(outputRoot, 'content', 'site-config.js');
const siteConfigPath = path.join(projectRoot, 'site.config.json');
const contentPageSource = path.join(siteRoot, 'content.html');
const articleStylesOutput = path.join(outputRoot, 'content', 'article.css');
const robotsOutput = path.join(outputRoot, 'robots.txt');
const sitemapOutput = path.join(outputRoot, 'sitemap.xml');

const requiredFields = ['type', 'title', 'slug', 'date', 'summary', 'category', 'tags', 'cover', 'sourceUrl', 'status'];

async function prepareOutput() {
  const relativeOutput = path.relative(projectRoot, outputRoot);
  if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
    throw new Error(`Unsafe output directory: ${outputRoot}`);
  }
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await cp(siteRoot, outputRoot, { recursive: true });
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    }
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/\\([\\"'])/g, '$1');
  }
  return trimmed;
}

function parseExternalUrl(value, filePath) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${filePath}: sourceUrl must be a valid http or https URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${filePath}: sourceUrl must be a valid http or https URL`);
  }
  return url.href;
}

async function readSiteConfig() {
  const config = JSON.parse(await readFile(siteConfigPath, 'utf8'));
  const rawSiteUrl = String(config.siteUrl ?? '').trim();
  const contactEmail = String(config.contactEmail ?? '').trim();
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new Error(siteConfigPath + ': contactEmail must be a valid email address or be empty');
  }
  if (!rawSiteUrl) return { siteUrl: '', contactEmail };
  let siteUrl;
  try {
    siteUrl = new URL(rawSiteUrl);
  } catch {
    throw new Error(`${siteConfigPath}: siteUrl must be a valid http or https URL`);
  }
  if (!['http:', 'https:'].includes(siteUrl.protocol)) {
    throw new Error(`${siteConfigPath}: siteUrl must be a valid http or https URL`);
  }
  return { siteUrl: siteUrl.href.replace(/\/$/, ''), contactEmail };
}

async function writeSiteConfig(contactEmail) {
  await mkdir(path.dirname(siteConfigOutput), { recursive: true });
  await writeFile(siteConfigOutput, 'window.siteConfig = ' + JSON.stringify({ contactEmail }, null, 2) + ';\n', 'utf8');
}

async function normalizeCover(value, filePath) {
  const coverReference = String(value ?? '').trim();
  if (!coverReference) return '';
  if (/^https?:\/\//i.test(coverReference)) return parseExternalUrl(coverReference, filePath);

  const sourceCover = path.resolve(path.dirname(filePath), coverReference);
  const relativeCover = path.relative(contentRoot, sourceCover).replaceAll(path.sep, '/');
  if (relativeCover.startsWith('../') || relativeCover === '..') throw new Error(`${filePath}: cover must stay inside content/: ${coverReference}`);
  const outputCover = path.join(outputRoot, 'public', relativeCover);
  await mkdir(path.dirname(outputCover), { recursive: true });
  await copyFile(sourceCover, outputCover);
  return `public/${relativeCover}`;
}

async function parseMarkdownFile(source, filePath) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`${filePath}: missing front matter`);

  const frontMatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`${filePath}: invalid front matter line: ${line}`);
    frontMatter[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1));
  }

  for (const field of requiredFields) {
    if (!(field in frontMatter)) throw new Error(`${filePath}: missing front matter field: ${field}`);
  }
  if (!['article', 'note'].includes(frontMatter.type)) throw new Error(`${filePath}: type must be article or note`);
  if (!['draft', 'published'].includes(frontMatter.status)) throw new Error(`${filePath}: status must be draft or published`);
  if (!Array.isArray(frontMatter.tags)) throw new Error(`${filePath}: tags must be an array`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontMatter.slug)) throw new Error(`${filePath}: slug must use lowercase letters, numbers, and hyphens`);
  if (frontMatter.date && !/^\d{4}-\d{2}-\d{2}$/.test(frontMatter.date)) throw new Error(`${filePath}: date must use YYYY-MM-DD or be empty`);
  if ('seriesOrder' in frontMatter && frontMatter.seriesOrder !== '' && (!Number.isInteger(frontMatter.seriesOrder) || frontMatter.seriesOrder < 1)) throw new Error(`${filePath}: seriesOrder must be a positive integer or be empty`);

  const bodyMarkdown = match[2].trim();
  const gallery = [];
  const normalizedBody = await normalizeMarkdownImages(bodyMarkdown, filePath, gallery);
  const cover = await normalizeCover(frontMatter.cover, filePath);
  return {
    type: frontMatter.type,
    slug: frontMatter.slug,
    title: frontMatter.title,
    date: frontMatter.date,
    category: frontMatter.category,
    series: frontMatter.series || '',
    seriesOrder: frontMatter.seriesOrder === '' || frontMatter.seriesOrder == null ? null : frontMatter.seriesOrder,
    tags: frontMatter.tags,
    summary: frontMatter.summary,
    cover,
    sourceUrl: parseExternalUrl(frontMatter.sourceUrl, filePath),
    status: frontMatter.status,
    bodyMarkdown: normalizedBody,
    gallery
  };
}

async function normalizeMarkdownImages(markdown, filePath, gallery) {
  const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let normalized = '';
  let cursor = 0;
  let match;
  while ((match = imagePattern.exec(markdown))) {
    normalized += markdown.slice(cursor, match.index);
    const [, alt, imageReference] = match;
    if (/^(?:https?:)?\/\//i.test(imageReference)) {
      gallery.push(imageReference);
      normalized += `![${alt}](${imageReference})`;
    } else {
      const sourceImage = path.resolve(path.dirname(filePath), imageReference);
      const relativeImage = path.relative(contentRoot, sourceImage).replaceAll(path.sep, '/');
      if (relativeImage.startsWith('../') || relativeImage === '..') throw new Error(`${filePath}: image must stay inside content/: ${imageReference}`);
      const outputImage = path.join(outputRoot, 'public', relativeImage);
      await mkdir(path.dirname(outputImage), { recursive: true });
      await copyFile(sourceImage, outputImage);
      const outputReference = `public/${relativeImage}`;
      gallery.push(outputReference);
      normalized += `![${alt}](${outputReference})`;
    }
    cursor = imagePattern.lastIndex;
  }
  normalized += markdown.slice(cursor);
  return normalized.replace(/\n{3,}/g, '\n\n').trim();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function staticAssetUrl(value) {
  const asset = String(value ?? '').trim();
  if (/^https?:\/\//i.test(asset)) return asset;
  if (/^\/\//.test(asset)) return `https:${asset}`;
  if (asset.startsWith('/')) return `../..${asset}`;
  return `../../${asset.replace(/^\.\//, '')}`;
}

function renderInline(value) {
  let result = escapeHtml(value);
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return result;
}

function renderMarkdown(markdown, item) {
  const lines = String(markdown ?? '').split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let imageIndex = 0;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${paragraph.map((line) => renderInline(line)).join('<br>')}</p>`);
    paragraph = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (imageMatch) {
      flushParagraph();
      const source = staticAssetUrl(imageMatch[2]);
      imageIndex += 1;
      blocks.push(`<a class="article-markdown-image" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer" aria-label="查看第 ${imageIndex} 张原图"><img src="${escapeHtml(source)}" alt="${escapeHtml(imageMatch[1] || item.title)}" loading="lazy" decoding="async"></a>`);
      continue;
    }
    const headingMatch = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const tag = `h${headingMatch[1].length}`;
      blocks.push(`<${tag}>${renderInline(headingMatch[2])}</${tag}>`);
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      blocks.push(`<blockquote>${renderInline(trimmed.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    paragraph.push(trimmed.replace(/^[-*]\s+/, '• '));
  }
  flushParagraph();
  return blocks.join('');
}

function renderGallery(item) {
  if (!Array.isArray(item.gallery) || item.gallery.length === 0) return '';
  const images = item.gallery.map((source, index) => {
    const assetUrl = staticAssetUrl(source);
    return `<a class="article-gallery-item" href="${escapeHtml(assetUrl)}" target="_blank" rel="noopener noreferrer" aria-label="查看第 ${index + 1} 张原图"><img src="${escapeHtml(assetUrl)}" alt="${escapeHtml(item.title)}｜第 ${index + 1} 张图片" loading="lazy" decoding="async"></a>`;
  }).join('');
  return `<section class="article-gallery" aria-label="${escapeHtml(item.title)}连续贴图">${images}</section>`;
}

function contentPublicUrl(siteUrl, item) {
  if (!siteUrl) return '';
  const directory = item.type === 'article' ? 'articles' : 'notes';
  return `${siteUrl}/${directory}/${item.slug}/index.html`;
}

function coverMetaUrl(cover, siteUrl) {
  if (!cover) return '';
  if (/^https?:\/\//i.test(cover)) return cover;
  if (siteUrl) return new URL(cover.replace(/^\/+/, ''), `${siteUrl}/`).href;
  return staticAssetUrl(cover);
}

function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[character]));
}

async function writeRobots(siteUrl) {
  const sitemapLine = siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml` : '';
  await writeFile(robotsOutput, `User-agent: *\nAllow: /${sitemapLine}\n`, 'utf8');
}

async function writeSitePageMetadata(siteUrl) {
  if (!siteUrl) return;
  const pages = [
    ['index.html', `${siteUrl}/`],
    ['articles.html', `${siteUrl}/articles.html`],
    ['notes.html', `${siteUrl}/notes.html`],
    ['before-shanghai.html', `${siteUrl}/before-shanghai.html`]
  ];
  for (const [relativePath, pageUrl] of pages) {
    const filePath = path.join(outputRoot, relativePath);
    const html = await readFile(filePath, 'utf8');
    const metadata = `  <link rel="canonical" href="${escapeHtml(pageUrl)}" />\n  <meta property="og:url" content="${escapeHtml(pageUrl)}" />\n`;
    if (!html.includes('</head>')) throw new Error(`${filePath}: missing closing head tag`);
    await writeFile(filePath, html.replace('</head>', `${metadata}</head>`), 'utf8');
  }
}

async function writeSitemap(siteUrl, publicItems) {
  if (!siteUrl) return false;
  const staticPages = [
    `${siteUrl}/`,
    `${siteUrl}/articles.html`,
    `${siteUrl}/notes.html`,
    `${siteUrl}/before-shanghai.html`
  ];
  const contentPages = publicItems.map((item) => `${siteUrl}/${item.type === 'article' ? 'articles' : 'notes'}/${item.slug}/index.html`);
  const urls = [...staticPages, ...contentPages]
    .map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`)
    .join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  await writeFile(sitemapOutput, sitemap, 'utf8');
  return true;
}

async function writeArticleStyles() {
  const source = await readFile(contentPageSource, 'utf8');
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  if (!styleMatch) throw new Error(`${contentPageSource}: missing article styles`);
  await mkdir(path.dirname(articleStylesOutput), { recursive: true });
  await writeFile(articleStylesOutput, `${styleMatch[1].trim()}\n`, 'utf8');
}

async function writeStaticArticle(item, siteUrl) {
  const outputDirectory = path.join(outputRoot, 'articles', item.slug);
  const outputFile = path.join(outputDirectory, 'index.html');
  const pageUrl = contentPublicUrl(siteUrl, item);
  const ogImage = coverMetaUrl(item.cover, siteUrl);
  const canonicalMeta = pageUrl ? `\n  <link rel="canonical" href="${escapeHtml(pageUrl)}" />` : '';
  const ogUrlMeta = pageUrl ? `\n  <meta property="og:url" content="${escapeHtml(pageUrl)}" />` : '';
  const ogImageMeta = ogImage ? `\n  <meta property="og:image" content="${escapeHtml(ogImage)}" />` : '';
  const sourceButton = item.sourceUrl ? `<a class="source-link source-button" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看公众号原文 ↗</a>` : '';
  const sourceFooter = item.sourceUrl
    ? `<p>本文整理自微信公众号「玄英札记」。<br>如需查看完整原文，请访问<a class="source-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">微信公众号原文 ↗</a>。</p>`
    : '<p>本文整理自微信公众号「玄英札记」。</p>';
  const articleContent = item.bodyMarkdown
    ? `<div class="article-markdown">${renderMarkdown(item.bodyMarkdown, item)}</div>`
    : renderGallery(item);
  const tags = item.tags.map((tag) => escapeHtml(tag)).join(' / ');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#F6F8F1" />
  <link rel="icon" href="../../favicon.svg" type="image/svg+xml" />
  <title>${escapeHtml(item.title)}｜玄英</title>
  <meta name="description" content="${escapeHtml(item.summary)}" />${canonicalMeta}
  <meta property="og:title" content="${escapeHtml(item.title)}" />
  <meta property="og:description" content="${escapeHtml(item.summary)}" />
  <meta property="og:type" content="article" />${ogUrlMeta}${ogImageMeta}
  <link rel="stylesheet" href="../../content/article.css" />
</head>
<body>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="reading-progress" id="reading-progress" aria-hidden="true"></div>
  <header class="site-header">
    <div class="container nav-wrap">
      <a class="brand" href="../../index.html" aria-label="返回玄英首页">
        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="19" stroke="currentColor" stroke-width="1"/><rect x="14" y="14" width="20" height="20" stroke="currentColor" stroke-width="1" transform="rotate(45 24 24)"/><path d="M9 24H39M24 9V39" stroke="currentColor" stroke-width="1" opacity=".55"/></svg></span>
        <span class="brand-copy">玄英 <span>/ XUAN YING</span></span>
      </a>
      <a class="back-link" href="../../articles.html">← 返回文章列表</a>
    </div>
  </header>
  <main id="main-content" tabindex="-1">
    <header class="article-header">
      <div class="article-header-inner">
        <p class="article-kicker">${escapeHtml(item.category)}</p>
        <h1 class="article-title">${escapeHtml(item.title)}</h1>
        <div class="article-meta"><span>${escapeHtml(item.date || '—')}</span><span>${escapeHtml(item.category)}</span></div>
        <p class="article-tags">${tags}</p>
        <p class="article-lede">${escapeHtml(item.summary)}</p>
        ${sourceButton}
      </div>
    </header>
    <article class="article-body" aria-label="正文">
      ${articleContent}
      <div class="article-source">${sourceFooter}</div>
    </article>
  </main>
  <script>
    const progress = document.querySelector('#reading-progress');
    function updateReadingProgress() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0) + '%';
    }
    window.addEventListener('scroll', updateReadingProgress, { passive: true });
    window.addEventListener('resize', updateReadingProgress);
    updateReadingProgress();
  </script>
</body>
</html>
`;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, html, 'utf8');
  return path.relative(outputRoot, outputFile).replaceAll(path.sep, '/');
}

async function writeStaticNote(item, siteUrl) {
  const outputDirectory = path.join(outputRoot, 'notes', item.slug);
  const outputFile = path.join(outputDirectory, 'index.html');
  const pageUrl = contentPublicUrl(siteUrl, item);
  const ogImage = coverMetaUrl(item.cover, siteUrl);
  const canonicalMeta = pageUrl ? `\n  <link rel="canonical" href="${escapeHtml(pageUrl)}" />` : '';
  const ogUrlMeta = pageUrl ? `\n  <meta property="og:url" content="${escapeHtml(pageUrl)}" />` : '';
  const ogImageMeta = ogImage ? `\n  <meta property="og:image" content="${escapeHtml(ogImage)}" />` : '';
  const noteContent = item.bodyMarkdown
    ? `<div class="article-markdown">${renderMarkdown(item.bodyMarkdown, item)}</div>`
    : renderGallery(item);
  const tags = item.tags.map((tag) => escapeHtml(tag)).join(' / ');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#F6F8F1" />
  <link rel="icon" href="../../favicon.svg" type="image/svg+xml" />
  <title>${escapeHtml(item.title)}｜玄英</title>
  <meta name="description" content="${escapeHtml(item.summary)}" />${canonicalMeta}
  <meta property="og:title" content="${escapeHtml(item.title)}" />
  <meta property="og:description" content="${escapeHtml(item.summary)}" />
  <meta property="og:type" content="article" />${ogUrlMeta}${ogImageMeta}
  <link rel="stylesheet" href="../../content/article.css" />
</head>
<body>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="reading-progress" id="reading-progress" aria-hidden="true"></div>
  <header class="site-header">
    <div class="container nav-wrap">
      <a class="brand" href="../../index.html" aria-label="返回玄英首页">
        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="19" stroke="currentColor" stroke-width="1"/><rect x="14" y="14" width="20" height="20" stroke="currentColor" stroke-width="1" transform="rotate(45 24 24)"/><path d="M9 24H39M24 9V39" stroke="currentColor" stroke-width="1" opacity=".55"/></svg></span>
        <span class="brand-copy">玄英 <span>/ XUAN YING</span></span>
      </a>
      <a class="back-link" href="../../notes.html">← 返回手记列表</a>
    </div>
  </header>
  <main id="main-content" tabindex="-1">
    <header class="article-header">
      <div class="article-header-inner">
        <p class="article-kicker">手记 / ${escapeHtml(item.category)}</p>
        <h1 class="article-title">${escapeHtml(item.title)}</h1>
        <div class="article-meta"><span>${escapeHtml(item.date || '—')}</span><span>${escapeHtml(item.category)}</span></div>
        <p class="article-tags">${tags}</p>
        <p class="article-lede">${escapeHtml(item.summary)}</p>
      </div>
    </header>
    <article class="article-body" aria-label="正文">
      ${noteContent}
    </article>
  </main>
  <script>
    const progress = document.querySelector('#reading-progress');
    function updateReadingProgress() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0) + '%';
    }
    window.addEventListener('scroll', updateReadingProgress, { passive: true });
    window.addEventListener('resize', updateReadingProgress);
    updateReadingProgress();
  </script>
</body>
</html>
`;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, html, 'utf8');
  return path.relative(outputRoot, outputFile).replaceAll(path.sep, '/');
}

async function getMarkdownFiles() {
  const files = [];
  for (const contentDirectory of contentRoots) {
    let entries;
    try {
      entries = await readdir(contentDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    files.push(...entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(contentDirectory, entry.name)));
  }
  return files.sort();
}

const { siteUrl, contactEmail } = await readSiteConfig();
await prepareOutput();
await writeRobots(siteUrl);
await writeSitePageMetadata(siteUrl);
await writeSiteConfig(contactEmail);
const files = await getMarkdownFiles();
const allItems = [];
const slugs = new Set();
for (const filePath of files) {
  const item = await parseMarkdownFile(await readFile(filePath, 'utf8'), filePath);
  if (slugs.has(item.slug)) throw new Error(`duplicate slug: ${item.slug}`);
  slugs.add(item.slug);
  allItems.push(item);
}

const publicItems = allItems
  .filter((item) => item.status === 'published')
  .sort((left, right) => {
    if (!left.date && !right.date) return left.slug.localeCompare(right.slug);
    if (!left.date) return 1;
    if (!right.date) return -1;
    return right.date.localeCompare(left.date);
  });
await mkdir(path.dirname(dataOutput), { recursive: true });
await writeFile(dataOutput, `window.siteContent = ${JSON.stringify(publicItems, null, 2)};\n`, 'utf8');
await writeArticleStyles();
const staticArticlePaths = [];
for (const item of publicItems.filter((entry) => entry.type === 'article')) {
  staticArticlePaths.push(await writeStaticArticle(item, siteUrl));
}
const staticNotePaths = [];
for (const item of publicItems.filter((entry) => entry.type === 'note')) {
  staticNotePaths.push(await writeStaticNote(item, siteUrl));
}
const sitemapWritten = await writeSitemap(siteUrl, publicItems);

console.log(`Built ${publicItems.length} published item(s) from ${files.length} Markdown file(s).`);
for (const item of allItems) console.log(`- ${item.status}: ${item.slug} (${item.gallery.length} image(s))`);
for (const staticPath of staticArticlePaths) console.log(`- static: ${staticPath}`);
for (const staticPath of staticNotePaths) console.log(`- static: ${staticPath}`);
console.log(`- sitemap: ${sitemapWritten ? 'written' : 'skipped (siteUrl is empty)'}`);
