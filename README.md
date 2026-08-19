# jonathanchien.com

A personal site: portfolio, work history, about, and a Markdown blog.
Plain HTML, CSS, and JavaScript with a small build script. **No dependencies** —
if you have Node 18 or newer, you have everything you need.

---

## Quick start

```bash
node build.js      # build the site into dist/
node serve.js      # preview at http://localhost:4000
node build.js --watch   # rebuild automatically as you edit
```

`dist/` is the finished site. Upload it anywhere that serves static files.
You can also just double-click `dist/index.html` — every path is relative, so it
works straight off the filesystem.

## How it fits together

```
site.config.json      Name, nav, social links, page titles. Edit this first.
pages/                Page content, as HTML fragments (no <head>, no nav)
posts/                Blog posts, as Markdown
templates/shell.html  The one page shell everything is poured into
assets/               CSS, JS, images — copied to dist/ as-is
build.js              Turns the above into dist/
serve.js              Local preview server
dist/                 Build output. Never edit by hand; it gets wiped each build.
```

The important idea: **the nav, header, and footer exist in exactly one place**
(`templates/shell.html`, driven by `site.config.json`). Add a nav item once and
every page gets it.

## Adding a blog post

Create `posts/2026-09-01-my-post-title.md`:

```markdown
---
title: My post title
date: 2026-09-01
tags: [writing, notes]
summary: One or two sentences. Used on the blog index and in the RSS feed.
---

Your post here. Regular Markdown.
```

Run `node build.js`. The post appears on `blog.html`, gets its own page, lands in
`feed.xml` and `sitemap.xml`, and picks up previous/next links automatically.

- The filename date is a fallback; the `date` field wins.
- Set `draft: true` to keep a post out of the build. `npm run drafts` includes drafts.
- `summary` is optional — the first ~180 characters are used if you omit it.

Supported Markdown: headings, **bold**, *italic*, `code`, fenced code blocks with
language labels, links, images, blockquotes, ordered and unordered lists
(including nesting), tables with alignment, horizontal rules, strikethrough, and
raw HTML passthrough. Footnotes and definition lists are not supported.

## Adding or editing a page

1. Create `pages/thing.html` containing **just the content** — start at your first
   `<section>` or `<h1>`, no `<html>`, `<head>`, or nav.
2. Add an entry to `pages` in `site.config.json`:

   ```json
   "thing": { "title": "Thing", "description": "What this page is about." }
   ```

3. Add it to `nav` in the same file if it belongs in the header.

## Making it yours

Everything currently on the site is **placeholder content** — a plausible person
with a plausible career, so you can see the layout doing its job. Replace:

- `site.config.json` — your name, tagline, email, social links, and real domain.
- `pages/*.html` — your projects, roles, and bio.
- `posts/*.md` — delete the three samples and write your own.
- `assets/img/favicon.svg` — your initials or mark.
- `pages/work.html` links to `assets/jonathan-chien-resume.pdf`; drop your PDF in
  `assets/` and update the link, or remove that sentence.

### Design tokens

All colors, fonts, and spacing live at the top of `assets/css/style.css` under
`:root`. Light and dark values sit side by side via `light-dark()`, so changing
the accent color is a one-line edit that updates both themes. The theme toggle
in the header cycles auto → light → dark and remembers the choice.

Type is serif for headings, system sans for body. Swap `--font-serif` if you want
a different voice; nothing else needs to change.

## Deploying

Deploys are automatic. `.github/workflows/deploy.yml` runs `node build.js` on
every push to `main` and publishes `dist/` to GitHub Pages. There is no install
step because there are no dependencies.

`dist/` is deliberately **not** committed — CI rebuilds it. Build locally
whenever you want to preview.

One-time repo setup: **Settings → Pages → Source: GitHub Actions**. Without that
the workflow runs but has nowhere to publish.

Other hosts, if you ever move: Netlify, Vercel, and Cloudflare Pages all want
build command `node build.js` and publish directory `dist`. Any plain web host
works too — copy the contents of `dist/` up, that is the whole deploy.

Before going live, set `site.url` in `site.config.json` to your real domain —
canonical tags, the RSS feed, and the sitemap all derive from it.

For a custom domain, set it under **Settings → Pages → Custom domain**, and point
your DNS at GitHub (four `A` records for the apex, plus a `CNAME` on `www`
pointing at `USERNAME.github.io`). No `CNAME` file is needed in the repo — when
publishing from a GitHub Actions workflow, GitHub neither creates nor reads one;
the domain lives in the Pages settings. Note that `assets/` is copied to
`dist/assets/`, not to the site root, so a file placed there would not be served
at the root regardless.

## Working on this from a phone

The repo is the sync point. Claude works in a cloud sandbox that clones and
pushes directly to GitHub, so your desktop does not need to be on. Ask for a
change, and the push triggers the workflow above — refresh the live URL a minute
later to see it.

If you also edit locally, `git pull` before you start so you do not diverge from
what was pushed from your phone.

## Accessibility and performance notes

Already handled: skip-to-content link, visible focus rings, `aria-current` on the
active nav item, semantic landmarks, `prefers-reduced-motion` support, and a
print stylesheet. No web fonts, no tracking, no JavaScript required to read
anything — the page renders fully with JS disabled. Total page weight is roughly
15KB.

Worth adding later: a real Open Graph image, and `alt` text discipline if you
start using images in posts.
