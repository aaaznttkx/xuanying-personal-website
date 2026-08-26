const requestedType = document.body.dataset.contentType;
const items = window.siteContent.filter((item) => item.type === requestedType);
const list = document.querySelector('#content-list');
const emptyState = document.querySelector('#content-empty');

function formatDate(value) {
  return String(value || '—').replace(/-/g, '.');
}

function contentHref(item) {
  const slug = encodeURIComponent(item.slug);
  return item.type === 'article' ? `articles/${slug}/index.html` : `notes/${slug}/index.html`;
}

function createContentRow(item, index) {
  if (!item || typeof item.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) return null;
  const link = document.createElement('a');
  link.className = 'content-row';
  link.href = contentHref(item);

  const number = document.createElement('div');
  number.className = 'content-number';
  number.textContent = String(index + 1).padStart(2, '0');

  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = String(item.title || '');
  const summary = document.createElement('p');
  summary.className = 'content-summary';
  summary.textContent = String(item.summary || '');
  copy.append(title, summary);

  const meta = document.createElement('div');
  meta.className = 'content-meta';
  const type = document.createElement('span');
  type.className = 'content-type';
  type.textContent = requestedType === 'article' ? '文章' : '手记';
  const category = document.createElement('span');
  category.className = 'content-category';
  category.textContent = String(item.category || '');
  const tags = document.createElement('span');
  tags.className = 'content-tags';
  tags.textContent = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag)).join(' / ') : '';
  const date = document.createElement('span');
  date.textContent = formatDate(item.date);
  meta.append(type, category, tags, date);

  link.append(number, copy, meta);
  return link;
}

list.replaceChildren(...items.map(createContentRow).filter(Boolean));

if (items.length === 0) emptyState.hidden = false;
