#!/usr/bin/env node
/* =========================================================================
 * build.js — static site generator for jonathanchien.com
 *
 * Zero dependencies. Node 18+. Run: node build.js
 *
 * Reads:  site.config.json, templates/shell.html, pages/*.html, posts/*.md,
 *         assets/**
 * Writes: dist/  (deployable as-is to any static host)
 * ========================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SHELL = fs.readFileSync(path.join(ROOT, 'templates', 'shell.html'), 'utf8');

/* ---------------------------------------------------------------- helpers */

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Parse "YYYY-MM-DD" as a fixed UTC instant so output never shifts by timezone. */
function parseDate(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});
const formatDate = (d) => (d ? DATE_FMT.format(d) : '');

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(relPath, contents) {
  const full = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true });
}

/* --------------------------------------------------------- front matter */

/**
 * Minimal YAML-ish front matter. Supports `key: value`, quoted strings,
 * inline arrays `[a, b]`, comma lists, and booleans. That covers what a
 * blog post needs without pulling in a YAML parser.
 */
function parseFrontMatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;

    let [, key, value] = kv;
    value = value.trim();

    if (/^\[.*\]$/.test(value)) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }
    value = value.replace(/^["']|["']$/g, '');
    if (value === 'true' || value === 'false') data[key] = value === 'true';
    else if (key === 'tags') data[key] = value.split(',').map((v) => v.trim()).filter(Boolean);
    else data[key] = value;
  }
  return { data, body: raw.slice(match[0].length) };
}

/* ------------------------------------------------------ markdown → html */

function renderInline(text) {
  const codeSpans = [];

  let out = escapeHtml(text);

  // Pull code spans out first so nothing else rewrites their contents.
  out = out.replace(/(`+)([\s\S]*?)\1/g, (_, _ticks, code) => {
    codeSpans.push(code.replace(/^ | $/g, ''));
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });

  // Images before links — the syntaxes overlap.
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_, alt, src, title) =>
      `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy" decoding="async">`);

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, label, href, title) => {
    const external = /^https?:\/\//i.test(href) && !href.includes(config.site.url);
    const attrs = [
      `href="${href}"`,
      title ? `title="${title}"` : '',
      external ? 'rel="noopener noreferrer"' : '',
    ].filter(Boolean).join(' ');
    return `<a ${attrs}>${label}</a>`;
  });

  out = out
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])__([^_]+)__/g, '$1<strong>$2</strong>')
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(\S)\s*--\s*(\S)/g, '$1 — $2');

  // Restore code spans.
  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code>${codeSpans[+i]}</code>`);
  return out;
}

const indentOf = (line) => (line.match(/^\s*/) || [''])[0].replace(/\t/g, '  ').length;
const UL_RE = /^(\s*)[-*+]\s+(.*)$/;
const OL_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;

function renderList(lines, ordered) {
  const base = indentOf(lines[0]);
  const items = [];

  for (const line of lines) {
    const m = ordered ? OL_RE.exec(line) : UL_RE.exec(line);
    if (m && indentOf(line) === base) {
      items.push([ordered ? m[3] : m[2]]);
    } else if (items.length) {
      items[items.length - 1].push(line.slice(Math.min(base + 2, indentOf(line))));
    }
  }

  const body = items
    .map((chunk) => {
      const html = renderBlocks(chunk.join('\n'));
      // A single paragraph inside <li> reads better unwrapped.
      const only = /^<p>([\s\S]*)<\/p>$/.exec(html.trim());
      return `<li>${only && !/<p>/.test(only[1]) ? only[1] : html}</li>`;
    })
    .join('\n');

  const tag = ordered ? 'ol' : 'ul';
  const start = ordered ? (OL_RE.exec(lines[0]) || [])[2] : null;
  const startAttr = start && start !== '1' ? ` start="${start}"` : '';
  return `<${tag}${startAttr}>\n${body}\n</${tag}>`;
}

function renderTable(rows) {
  const cells = (row) => row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const aligns = cells(rows[1]).map((spec) => {
    const left = spec.startsWith(':');
    const right = spec.endsWith(':');
    if (left && right) return ' style="text-align:center"';
    if (right) return ' style="text-align:right"';
    return '';
  });
  const body = rows.slice(2).map(cells);

  const thead = `<thead><tr>${head
    .map((c, i) => `<th${aligns[i] || ''}>${renderInline(c)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((r) => `<tr>${r.map((c, i) => `<td${aligns[i] || ''}>${renderInline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

/** Block-level markdown. Handles the subset a text-first blog actually uses. */
function renderBlocks(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Fenced code block
    const fence = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const closer = new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`);
      const buf = [];
      i++;
      while (i < lines.length && !closer.test(lines[i])) buf.push(lines[i++]);
      i++; // consume closing fence
      const lang = fence[2] ? ` class="language-${fence[2]}"` : '';
      out.push(`<pre><code${lang}>${escapeHtml(buf.join('\n'))}\n</code></pre>`);
      continue;
    }

    // Raw HTML block — passed through untouched
    if (/^\s*<(\/)?[a-zA-Z][\w-]*/.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim()) buf.push(lines[i++]);
      out.push(buf.join('\n'));
      continue;
    }

    // Thematic break
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // ATX heading
    const heading = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const id = slugify(heading[2]);
      out.push(`<h${level} id="${id}">${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && (/^\s*>/.test(lines[i]) || (buf.length && lines[i].trim()))) {
        buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      }
      out.push(`<blockquote>\n${renderBlocks(buf.join('\n'))}\n</blockquote>`);
      continue;
    }

    // Table
    if (line.includes('|') && /^\s*\|?[\s:.-]*-[-\s:|]*\|/.test(lines[i + 1] || '')) {
      const buf = [];
      while (i < lines.length && lines[i].includes('|')) buf.push(lines[i++]);
      out.push(renderTable(buf));
      continue;
    }

    // Lists
    const ordered = OL_RE.test(line);
    if (ordered || UL_RE.test(line)) {
      const buf = [];
      const base = indentOf(line);
      while (i < lines.length) {
        const l = lines[i];
        const isItem = ordered ? OL_RE.test(l) : UL_RE.test(l);
        const isContinuation = l.trim() && indentOf(l) > base;
        if (isItem || isContinuation) { buf.push(lines[i++]); continue; }
        // A single blank line inside a list is allowed if an item follows.
        if (!l.trim()) {
          const next = lines[i + 1] || '';
          const nextIsItem = ordered ? OL_RE.test(next) : UL_RE.test(next);
          if (nextIsItem || (next.trim() && indentOf(next) > base)) { buf.push(lines[i++]); continue; }
        }
        break;
      }
      out.push(renderList(buf, ordered));
      continue;
    }

    // Paragraph
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(#{1,6}\s|>|`{3,}|~{3,}|-{3,}\s*$|\*{3,}\s*$)/.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    // Two trailing spaces = hard line break, same as every other renderer.
    out.push(`<p>${renderInline(buf.join('\n')).replace(/ {2,}\n/g, '<br>\n')}</p>`);
  }

  return out.join('\n');
}

const markdown = (src) => renderBlocks(src);

/** Plain-text excerpt for meta descriptions and the RSS feed. */
function excerpt(md, limit = 180) {
  const text = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  return text.slice(0, text.lastIndexOf(' ', limit) || limit).trim() + '…';
}

/* ------------------------------------------------------------- rendering */

function renderNav(base, currentHref) {
  return config.nav
    .map((item) => {
      const current = item.href === currentHref ? ' aria-current="page"' : '';
      return `        <li><a href="${base}${item.href}"${current}>${escapeHtml(item.label)}</a></li>`;
    })
    .join('\n');
}

function renderSocial(base) {
  return config.social
    .map((item) => {
      const href = /^(https?:|mailto:)/.test(item.href) ? item.href : base + item.href;
      const external = /^https?:/.test(item.href);
      return `      <li><a href="${href}"${external ? ' rel="me noopener"' : ''}>${escapeHtml(item.label)}</a></li>`;
    })
    .join('\n');
}

function renderPage(opts) {
  const { title, description, content, base = '', currentHref = '', bareTitle = false,
          noindex = false, canonicalPath = '', ogType = 'website' } = opts;

  const site = config.site;
  const pageTitle = bareTitle ? title : `${title} · ${site.title}`;

  return SHELL
    .replace(/\{\{lang\}\}/g, site.lang || 'en')
    .replace(/\{\{pageTitle\}\}/g, escapeHtml(pageTitle))
    .replace(/\{\{title\}\}/g, escapeHtml(title))
    .replace(/\{\{description\}\}/g, escapeHtml(description || site.description))
    .replace(/\{\{robots\}\}/g, noindex ? '<meta name="robots" content="noindex">\n' : '')
    .replace(/\{\{canonical\}\}/g, escapeHtml(site.url.replace(/\/$/, '') + '/' + canonicalPath))
    .replace(/\{\{ogType\}\}/g, ogType)
    .replace(/\{\{siteTitle\}\}/g, escapeHtml(site.title))
    .replace(/\{\{author\}\}/g, escapeHtml(site.author))
    .replace(/\{\{year\}\}/g, String(new Date().getUTCFullYear()))
    .replace(/\{\{nav\}\}/g, renderNav(base, currentHref))
    .replace(/\{\{social\}\}/g, renderSocial(base))
    .replace(/\{\{content\}\}/g, content)
    .replace(/\{\{base\}\}/g, base);
}

/* ------------------------------------------------------------------ posts */

function loadPosts() {
  const dir = path.join(ROOT, 'posts');
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const { data, body } = parseFrontMatter(raw);
      const slug = data.slug || slugify(file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
      const date = parseDate(data.date) || parseDate(file);
      return {
        file,
        slug,
        title: data.title || slug,
        date,
        dateISO: date ? date.toISOString() : '',
        dateDisplay: formatDate(date),
        tags: Array.isArray(data.tags) ? data.tags : [],
        draft: data.draft === true,
        summary: data.summary || data.description || excerpt(body),
        readingTime: Math.max(1, Math.round(body.split(/\s+/).length / 220)),
        body,
        url: `blog/${slug}.html`,
      };
    })
    .filter((post) => !post.draft || process.env.DRAFTS === '1')
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
}

function postMeta(post) {
  const bits = [];
  if (post.dateDisplay) bits.push(`<time datetime="${post.dateISO}">${post.dateDisplay}</time>`);
  bits.push(`${post.readingTime} min read`);
  return bits.join('<span class="dot" aria-hidden="true">·</span>');
}

function buildPost(post, prev, next) {
  const tags = post.tags.length
    ? `<ul class="tags">${post.tags.map((t) => `<li class="tag">${escapeHtml(t)}</li>`).join('')}</ul>`
    : '';

  const navLinks = [
    next ? `<a href="${next.slug}.html">← ${escapeHtml(next.title)}</a>` : '<span></span>',
    prev ? `<a href="${prev.slug}.html">${escapeHtml(prev.title)} →</a>` : '<span></span>',
  ].join('\n    ');

  const content = `<article>
  <header class="post-header">
    <p class="label"><a href="../blog.html" style="text-decoration:none">Writing</a></p>
    <h1>${escapeHtml(post.title)}</h1>
    <div class="post-meta">${postMeta(post)}</div>
    ${tags}
  </header>

  <div class="prose">
${markdown(post.body)}
  </div>
</article>

<nav class="post-nav" aria-label="More posts">
    ${navLinks}
</nav>`;

  writeFile(post.url, renderPage({
    title: post.title,
    description: post.summary,
    content,
    base: '../',
    currentHref: 'blog.html',
    canonicalPath: post.url,
    ogType: 'article',
  }));
}

function buildBlogIndex(posts) {
  const items = posts.length
    ? posts.map((post) => `    <li>
      <article class="entry">
        <div class="entry-meta"><time datetime="${post.dateISO}">${post.dateDisplay}</time></div>
        <div>
          <h2 class="entry-title"><a href="${post.url}">${escapeHtml(post.title)}</a></h2>
          <div class="entry-body"><p>${escapeHtml(post.summary)}</p></div>
          ${post.tags.length ? `<ul class="tags">${post.tags.map((t) => `<li class="tag">${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
        </div>
      </article>
    </li>`).join('\n')
    : '    <li><p class="muted" style="padding-block:var(--space-m)">No posts yet. Add a Markdown file to <code>posts/</code> and rebuild.</p></li>';

  const content = `<div class="page-intro">
  <h1 class="page-title">${escapeHtml(config.blog.title)}</h1>
  <p class="muted">${escapeHtml(config.blog.description)}</p>
</div>

<ul class="entries">
${items}
</ul>

<p class="mt-l small faint">Subscribe via <a href="feed.xml">RSS</a>.</p>`;

  writeFile('blog.html', renderPage({
    title: config.blog.title,
    description: config.blog.description,
    content,
    currentHref: 'blog.html',
    canonicalPath: 'blog.html',
  }));
}

/* ------------------------------------------------------------------ pages */

function buildPages(posts) {
  const dir = path.join(ROOT, 'pages');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')) : [];

  for (const file of files) {
    const name = file.replace(/\.html$/, '');
    const meta = config.pages[name] || { title: name };
    let content = fs.readFileSync(path.join(dir, file), 'utf8');

    // Let index.html show the three most recent posts without duplicating markup.
    content = content.replace('<!--RECENT_POSTS-->', recentPostsMarkup(posts, 3));

    writeFile(file, renderPage({
      title: meta.title,
      description: meta.description,
      content,
      currentHref: file,
      bareTitle: meta.bareTitle === true,
      noindex: meta.noindex === true,
      canonicalPath: name === 'index' ? '' : file,
    }));
  }
}

function recentPostsMarkup(posts, limit) {
  if (!posts.length) return '<p class="muted">No posts yet.</p>';
  return `<ul class="entries">
${posts.slice(0, limit).map((post) => `      <li>
        <article class="entry">
          <div class="entry-meta"><time datetime="${post.dateISO}">${post.dateDisplay}</time></div>
          <div>
            <h3 class="entry-title"><a href="${post.url}">${escapeHtml(post.title)}</a></h3>
            <div class="entry-body"><p>${escapeHtml(post.summary)}</p></div>
          </div>
        </article>
      </li>`).join('\n')}
    </ul>`;
}

/* ------------------------------------------------------- feeds & sitemap */

function buildFeed(posts) {
  const site = config.site;
  const base = site.url.replace(/\/$/, '');
  const items = posts.slice(0, 20).map((post) => `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${base}/${post.url}</link>
      <guid isPermaLink="true">${base}/${post.url}</guid>
      <pubDate>${post.date ? post.date.toUTCString() : ''}</pubDate>
      <description>${escapeHtml(post.summary)}</description>
    </item>`).join('\n');

  writeFile('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(site.title)}</title>
    <link>${base}/</link>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${escapeHtml(config.blog.description)}</description>
    <language>${site.lang || 'en'}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`);
}

function buildSitemap(posts) {
  const base = config.site.url.replace(/\/$/, '');
  const urls = [
    '',
    ...Object.keys(config.pages)
      .filter((n) => n !== 'index' && !config.pages[n].noindex)
      .map((n) => `${n}.html`),
    'blog.html',
    ...posts.map((p) => p.url),
  ];

  writeFile('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${base}/${u}</loc></url>`).join('\n')}
</urlset>
`);

  writeFile('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
}

/* ------------------------------------------------------------------ main */

function build() {
  const started = Date.now();

  rmrf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  const posts = loadPosts();

  copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  buildPages(posts);
  buildBlogIndex(posts);
  posts.forEach((post, idx) => buildPost(post, posts[idx + 1], posts[idx - 1]));
  buildFeed(posts);
  buildSitemap(posts);

  const pages = Object.keys(config.pages).length + 1 + posts.length;
  console.log(`Built ${pages} pages (${posts.length} posts) in ${Date.now() - started}ms -> dist/`);
}

build();

/* --watch: rebuild whenever a source file changes. */
if (process.argv.includes('--watch')) {
  const watched = ['pages', 'posts', 'assets', 'templates'].map((d) => path.join(ROOT, d));
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { build(); } catch (err) { console.error('Build failed:', err.message); }
    }, 60);
  };
  watched.forEach((dir) => {
    if (fs.existsSync(dir)) fs.watch(dir, { recursive: true }, rebuild);
  });
  fs.watchFile(path.join(ROOT, 'site.config.json'), rebuild);
  console.log('Watching for changes. Ctrl+C to stop.');
}
