import { Marked, type Tokens } from 'marked';

/**
 * Turns a port's Markdown docs into HTML for the Hall. Docs are written for
 * GitHub, so relative links point at files in the repo; this maps them onto
 * what the Hall can actually show and quietly defuses the rest.
 */
export interface DocContext {
  /** Repo path of the document, e.g. "ports/skyline-showdown/docs/ABOUT.md". */
  docPath: string;
  /** Hash of the page showing the document, for in-page anchor links. */
  selfHref: string;
  /** Published URL of an image at a repo path, or null if it was not bundled. */
  imageUrl(repoPath: string): string | null;
  /** Hall link for another document at a repo path, or null if the Hall does not show it. */
  docHref(repoPath: string): string | null;
}

// Docs may use a little inline HTML, like <kbd>Space</kbd>; anything else is shown as text.
const ALLOWED_TAGS = new Set([
  'kbd',
  'br',
  'sup',
  'sub',
  'b',
  'i',
  'em',
  'strong',
  'details',
  'summary',
]);

export function renderMarkdown(source: string, context: DocContext): string {
  const usedIds = new Map<string, number>();
  const uniqueId = (text: string) => {
    const base = slugify(text) || 'section';
    const count = usedIds.get(base) ?? 0;
    usedIds.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading) {
        const id = uniqueId(plainText(text));
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      code({ text, lang }: Tokens.Code) {
        const language = (lang ?? '').trim().split(/\s+/)[0] ?? '';
        if (language === 'mermaid') {
          return `<div class="doc-diagram" data-mermaid>${escapeHtml(text)}</div>\n`;
        }
        const languageClass = language ? ` class="language-${escapeHtml(language)}"` : '';
        return `<pre class="doc-code"><code${languageClass}>${escapeHtml(text)}</code></pre>\n`;
      },
      link({ href, title, tokens }: Tokens.Link) {
        const label = this.parser.parseInline(tokens);
        const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';

        if (href.startsWith('#')) {
          const anchor = slugify(decodeURIComponent(href.slice(1)));
          return `<a href="${escapeHtml(context.selfHref)}" data-anchor="${escapeHtml(anchor)}"${titleAttribute}>${label}</a>`;
        }
        if (/^(https?:|mailto:)/i.test(href)) {
          return `<a href="${escapeHtml(href)}"${titleAttribute} target="_blank" rel="noopener noreferrer">${label}</a>`;
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return label;

        const [path = ''] = href.split('#');
        const target = context.docHref(resolveRepoPath(context.docPath, path));
        return target ? `<a href="${escapeHtml(target)}"${titleAttribute}>${label}</a>` : label;
      },
      image({ href, title, text }: Tokens.Image) {
        const url = /^[a-z][a-z0-9+.-]*:/i.test(href)
          ? null
          : context.imageUrl(resolveRepoPath(context.docPath, href));
        const alt = escapeHtml(text);
        if (!url) return `<span class="doc-image doc-image--missing">${alt}</span>`;
        const caption = title ? `<span class="doc-image__caption">${escapeHtml(title)}</span>` : '';
        return `<span class="doc-image"><img src="${escapeHtml(url)}" alt="${alt}" loading="lazy" decoding="async">${caption}</span>`;
      },
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return sanitiseHtml(text);
      },
    },
  });

  return marked.parse(source, { async: false });
}

/** Resolves a relative link inside a document to a path from the repo root. */
export function resolveRepoPath(fromDocument: string, relative: string): string {
  const parts = fromDocument.split('/').slice(0, -1);
  for (const part of decodeURI(relative).split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

function sanitiseHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi, (tag, name: string) => {
      const bare = /^<\/?[a-z]+\s*\/?>$/i.test(tag);
      return bare && ALLOWED_TAGS.has(name.toLowerCase()) ? tag.toLowerCase() : escapeHtml(tag);
    });
}

function plainText(markdown: string): string {
  return markdown.replace(/[`*_~]|<[^>]+>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
