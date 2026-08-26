import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const contentRoot = path.join(projectRoot, 'content');
const outputRoot = path.join(projectRoot, 'outputs');
const siteConfigPath = path.join(projectRoot, 'site.config.json');
const failures = [];

function fail(message) {
  failures.push(message);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const files = [];
  if (!(await exists(directory))) return files;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function parseFrontMatter(source, filePath) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    fail(`${filePath}: missing front matter`);
    return {};
  }
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    fields[line.slice(0, separator).trim()] = value;
  }
  return fields;
}

async function readContentData() {
  const filePath = path.join(outputRoot, 'content', 'content-data.js');
  if (!(await exists(filePath))) {
    fail('outputs/content/content-data.js is missing');
    return [];
  }
  const source = await readFile(filePath, 'utf8');
  const match = source.match(/window\.siteContent\s*=\s*([\s\S]*);\s*$/);
  if (!match) {
    fail('outputs/content/content-data.js has invalid data format');
    return [];
  }
  try {
    const items = JSON.parse(match[1]);
    if (!Array.isArray(items)) throw new Error('not an array');
    return items;
  } catch {
    fail('outputs/content/content-data.js is not valid JSON data');
    return [];
  }
}

async function readSiteUrl() {
  const config = JSON.parse(await readFile(siteConfigPath, 'utf8'));
  const rawSiteUrl = String(config.siteUrl ?? '').trim();
  if (!rawSiteUrl) return '';
  try {
    const siteUrl = new URL(rawSiteUrl);
    if (!['http:', 'https:'].includes(siteUrl.protocol)) throw new Error('invalid protocol');
    return siteUrl.href.replace(/\/$/, '');
  } catch {
    fail('site.config.json: siteUrl must be a valid http or https URL');
    return '';
  }
}

function localTarget(reference, relativeFile) {
  const url = new URL(reference, `http://local/${relativeFile}`);
  let target = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!target || target.endsWith('/')) target += 'index.html';
  return target;
}

async function checkLocalReferences(files) {
  for (const filePath of files) {
    const relativeFile = path.relative(outputRoot, filePath).replaceAll(path.sep, '/');
    const source = await readFile(filePath, 'utf8');
    for (const match of source.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const reference = match[1];
      if (/^(?:https?:|#|data:|mailto:|javascript:)/i.test(reference)) continue;
      if (reference.includes('${') || reference === '$2') continue;
      let target;
      try {
        target = localTarget(reference, relativeFile);
      } catch {
        fail(`${relativeFile}: invalid local reference ${reference}`);
        continue;
      }
      if (!(await exists(path.join(outputRoot, target)))) fail(`${relativeFile}: missing local reference ${reference}`);
    }
  }
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

async function checkHtmlMetadata(files) {
  for (const filePath of files) {
    const relativeFile = path.relative(outputRoot, filePath).replaceAll(path.sep, '/');
    const source = await readFile(filePath, 'utf8');
    if (!/<title>[^<]+<\/title>/i.test(source)) fail(`${relativeFile}: missing title`);
    if (!/<meta\s+name="description"\s+content="[^"]*"\s*\/>/i.test(source)) fail(`${relativeFile}: missing meta description`);
    if (!/<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/i.test(source)) fail(`${relativeFile}: missing og:title`);
    if (!/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/i.test(source)) fail(`${relativeFile}: missing og:description`);
    if (!/<meta\s+property="og:type"\s+content="[^"]+"\s*\/>/i.test(source)) fail(`${relativeFile}: missing og:type`);
    if (relativeFile !== 'content.html' && countMatches(source, /<h1\b/gi) !== 1) fail(`${relativeFile}: expected exactly one h1`);
  }
}

async function checkPublishedContent(items, sourceItems, siteUrl) {
  const sourceBySlug = new Map(sourceItems.map((item) => [item.slug, item]));
  const seenSlugs = new Set();
  for (const item of items) {
    if (seenSlugs.has(item.slug)) fail(`duplicate published slug: ${item.slug}`);
    seenSlugs.add(item.slug);
    if (!['article', 'note'].includes(item.type)) fail(`${item.slug}: invalid type`);
    const sourceItem = sourceBySlug.get(item.slug);
    if (!sourceItem || sourceItem.status !== 'published') fail(`${item.slug}: public data has no published Markdown source`);
    const directory = item.type === 'article' ? 'articles' : 'notes';
    const staticFile = path.join(outputRoot, directory, item.slug, 'index.html');
    if (!(await exists(staticFile))) fail(`${item.slug}: missing static page`);
    const page = await readFile(staticFile, 'utf8');
    const sourceUrl = String(item.sourceUrl ?? '').trim();
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
      } catch {
        fail(`${item.slug}: sourceUrl is not a valid http or https URL`);
      }
      if (!page.includes(`href="${sourceUrl}"`) || !page.includes('target="_blank" rel="noopener noreferrer"')) fail(`${item.slug}: sourceUrl link is missing target or rel attributes`);
    } else if (page.includes('source-button') || page.includes('微信公众号')) {
      fail(`${item.slug}: empty sourceUrl still exposes a public source link`);
    }
    if (item.type === 'note' && (page.includes('本文整理自微信公众号') || page.includes('查看公众号原文') || page.includes('去上海之前'))) fail(`${item.slug}: note page contains article-only content`);
    if (!siteUrl && (page.includes('rel="canonical"') || page.includes('property="og:url"'))) fail(`${item.slug}: empty siteUrl generated canonical or og:url`);
    if (siteUrl) {
      const expectedUrl = `${siteUrl}/${directory}/${item.slug}/index.html`;
      if (!page.includes(`href="${expectedUrl}"`) || !page.includes(`content="${expectedUrl}"`)) fail(`${item.slug}: siteUrl metadata is incorrect`);
    }
  }
  for (const item of sourceItems) {
    if (item.status !== 'published' && items.some((publicItem) => publicItem.slug === item.slug)) fail(`${item.slug}: draft content is publicly exposed`);
  }
}

async function checkRequiredPages() {
  for (const file of ['index.html', 'articles.html', 'notes.html', 'before-shanghai.html', '404.html', 'favicon.svg', 'robots.txt']) {
    if (!(await exists(path.join(outputRoot, file)))) fail(`missing generated file: outputs/${file}`);
  }
}

async function checkArticleImages() {
  const expectedImages = [
    ...Array.from({ length: 6 }, (_, index) => `public/images/articles/choice-shanghai/${String(index + 1).padStart(2, '0')}.jpg`),
    ...Array.from({ length: 6 }, (_, index) => `public/images/articles/imagine-shanghai/${String(index + 1).padStart(2, '0')}.jpg`)
  ];
  for (const image of expectedImages) if (!(await exists(path.join(outputRoot, image)))) fail(`missing article image: outputs/${image}`);
}

async function checkSiteRules(siteUrl, htmlFiles) {
  const robots = await readFile(path.join(outputRoot, 'robots.txt'), 'utf8');
  const allHtml = await Promise.all(htmlFiles.map((filePath) => readFile(filePath, 'utf8')));
  const publicText = allHtml.join('\n');
  for (const phrase of ['待补充', '测试内容', '之后会在这里放上联系入口']) if (publicText.includes(phrase)) fail(`public output contains forbidden placeholder: ${phrase}`);
  const sitemapFile = path.join(outputRoot, 'sitemap.xml');
  if (!siteUrl) {
    if (await exists(sitemapFile)) fail('sitemap.xml exists while siteUrl is empty');
    if (/^Sitemap:/mi.test(robots)) fail('robots.txt contains an absolute sitemap while siteUrl is empty');
    if (/<(?:link[^>]+canonical|meta[^>]+og:url)/i.test(publicText)) fail('public output contains canonical or og:url while siteUrl is empty');
    return;
  }
  if (!(await exists(sitemapFile))) {
    fail('sitemap.xml is missing while siteUrl is configured');
    return;
  }
  const pageUrls = [
    ['index.html', `${siteUrl}/`],
    ['articles.html', `${siteUrl}/articles.html`],
    ['notes.html', `${siteUrl}/notes.html`],
    ['before-shanghai.html', `${siteUrl}/before-shanghai.html`]
  ];
  for (const [relativePath, pageUrl] of pageUrls) {
    const page = await readFile(path.join(outputRoot, relativePath), 'utf8');
    if (!page.includes(`href="${pageUrl}"`) || !page.includes(`content="${pageUrl}"`)) fail(`${relativePath}: configured siteUrl metadata is incorrect`);
  }
  const sitemap = await readFile(sitemapFile, 'utf8');
  if (!sitemap.includes('<urlset')) fail('sitemap.xml has invalid structure');
  for (const loc of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) if (!loc[1].startsWith(`${siteUrl}/`) && loc[1] !== siteUrl) fail(`sitemap contains an incorrect URL: ${loc[1]}`);
  if (!robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`)) fail('robots.txt does not reference the configured sitemap');
}

const contentFiles = (await Promise.all(['articles', 'notes'].map((directory) => walk(path.join(contentRoot, directory))))).flat().filter((filePath) => filePath.endsWith('.md'));
const sourceItems = [];
for (const filePath of contentFiles) {
  const frontMatter = parseFrontMatter(await readFile(filePath, 'utf8'), filePath);
  sourceItems.push({ slug: frontMatter.slug || '', status: frontMatter.status || '', type: frontMatter.type || '' });
}
const publicItems = await readContentData();
const siteUrl = await readSiteUrl();
await checkRequiredPages();
await checkPublishedContent(publicItems, sourceItems, siteUrl);
await checkArticleImages();
const generatedFiles = await walk(outputRoot);
const htmlFiles = generatedFiles.filter((filePath) => filePath.endsWith('.html'));
await checkLocalReferences(htmlFiles);
await checkHtmlMetadata(htmlFiles);
await checkSiteRules(siteUrl, htmlFiles);

if (failures.length) {
  console.error(`Check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Check passed: ${publicItems.length} published item(s), ${htmlFiles.length} HTML page(s), 12 article image(s).`);
}
