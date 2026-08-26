import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = path.join(projectRoot, 'content');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const key = argument.slice(2);
    options[key] = argv[index + 1]?.startsWith('--') ? '' : (argv[index + 1] || '');
    if (options[key]) index += 1;
  }
  return options;
}

function decodeHtml(value) {
  return value.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const code = entity[0].toLowerCase() === 'x' ? parseInt(entity.slice(1), 16) : parseInt(entity.slice(1), 10);
    return Number.isNaN(code) ? _ : String.fromCodePoint(code);
  });
}

function stripTags(value) {
  return decodeHtml(String(value ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? decodeHtml(match[1]) : '';
}

function normalizeUrl(value) {
  if (/^\/\//.test(value)) return `https:${value}`;
  return value;
}

function metadata(html, name) {
  const patterns = [
    new RegExp(`(?:var\\s+)?${name}\\s*=\\s*["']([\\s\\S]*?)["']`, 'i'),
    new RegExp(`<meta[^>]+(?:name|property)=["'][^"']*${name}[^"']*["'][^>]+content=["']([^"']*)["']`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return stripTags(match[1]);
  }
  return '';
}

function extractContentDiv(html) {
  const start = html.search(/<div[^>]+id=["']js_content["'][^>]*>/i);
  if (start < 0) return '';
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = start;
  let depth = 0;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(html))) {
    const tag = tagMatch[0];
    if (/^<div\b/i.test(tag) && !/\/\s*>$/.test(tag)) depth += 1;
    if (/^<\/div/i.test(tag)) depth -= 1;
    if (depth === 0) return html.slice(start, tagPattern.lastIndex);
  }
  return html.slice(start);
}

function htmlToMarkdown(html, imageUrls) {
  let imageIndex = 0;
  let markdown = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const imageUrl = normalizeUrl(attribute(tag, 'data-src') || attribute(tag, 'src'));
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return '';
    imageUrls.push(imageUrl);
    imageIndex += 1;
    return `\n![公众号贴图 ${String(imageIndex).padStart(2, '0')}](__LOCAL_IMAGE_${imageIndex}__)\n`;
  });
  markdown = markdown
    .replace(/<br\s*\/?>(?=\s*)/gi, '\n')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => `${'#'.repeat(Number(level))} ${stripTags(text)}\n\n`)
    .replace(/<\/p>|<\/div>|<\/section>|<\/h[1-6]>/gi, '\n\n')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${stripTags(text)}](${href})`)
    .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>|<b\b[^>]*>([\s\S]*?)<\/b>/gi, (_, strong, bold) => `**${stripTags(strong || bold)}**`)
    .replace(/<em\b[^>]*>([\s\S]*?)<\/em>|<i\b[^>]*>([\s\S]*?)<\/i>/gi, (_, emphasis, italic) => `*${stripTags(emphasis || italic)}*`)
    .replace(/<[^>]+>/g, '')
    .split(/\r?\n/)
    .map((line) => decodeHtml(line).replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return markdown;
}

function yamlString(value) {
  return JSON.stringify(value ?? '');
}

function slugIsSafe(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

const options = parseArgs(process.argv.slice(2));
if (!options.url || !options.slug || !slugIsSafe(options.slug)) {
  console.error('Usage: npm run import:wechat -- --url <url> --slug <slug> [--title <title>] [--date YYYY-MM-DD] [--category <category>] [--tags tag1,tag2] [--status draft|published]');
  process.exit(1);
}

const response = await fetch(options.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XuanYingContentImporter/1.0)' } });
const html = await response.text();
if (!response.ok) throw new Error(`WeChat request failed: ${response.status}`);
if (/当前环境异常|完成验证后即可继续访问|captcha\.gtimg\.com/i.test(html)) throw new Error('The WeChat page requires environment verification; no files were written. Open the article in a normal browser and retry after access is available.');
if (!/<div[^>]+id=["']js_content["'][^>]*>/i.test(html)) throw new Error('The WeChat page did not expose an article body; no files were written. It may require browser verification or a signed-in session.');

const title = options.title || metadata(html, 'msg_title') || metadata(html, 'og:title');
const summary = options.summary || metadata(html, 'msg_desc') || metadata(html, 'description');
if (!title) throw new Error('Could not determine the article title; provide --title.');

const bodyHtml = extractContentDiv(html);
const imageUrls = [];
const markdownBody = htmlToMarkdown(bodyHtml, imageUrls);
const imageDir = path.join(contentRoot, 'images', 'articles', options.slug);
await mkdir(imageDir, { recursive: true });

const imageExtensions = [];
for (let index = 0; index < imageUrls.length; index += 1) {
  const imageResponse = await fetch(imageUrls[index], { headers: { 'User-Agent': 'Mozilla/5.0', Referer: options.url } });
  if (!imageResponse.ok) throw new Error(`Could not download image ${index + 1}: ${imageResponse.status}`);
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  const contentType = imageResponse.headers.get('content-type') || '';
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'jpg';
  imageExtensions.push(extension);
  const filename = `${String(index + 1).padStart(2, '0')}.${extension}`;
  await writeFile(path.join(imageDir, filename), bytes);
}

const localBody = markdownBody.replace(/__LOCAL_IMAGE_(\d+)__/g, (_, number) => {
  const imageNumber = Number(number);
  return `../images/articles/${options.slug}/${String(imageNumber).padStart(2, '0')}.${imageExtensions[imageNumber - 1] || 'jpg'}`;
});
const tags = (options.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
const article = `---\ntype: article\ntitle: ${yamlString(title)}\nslug: ${yamlString(options.slug)}\ndate: ${yamlString(options.date || '')}\nsummary: ${yamlString(summary)}\ncategory: ${yamlString(options.category || '')}\ntags: ${JSON.stringify(tags)}\ncover: ""\nsourceUrl: ${yamlString(options.url)}\nstatus: ${yamlString(options.status || 'draft')}\n---\n\n${localBody}\n`;
await mkdir(path.join(contentRoot, 'articles'), { recursive: true });
await writeFile(path.join(contentRoot, 'articles', `${options.slug}.md`), article, 'utf8');
console.log(`Imported ${options.slug}: ${imageUrls.length} image(s). Run npm run build to publish it to outputs/.`);
