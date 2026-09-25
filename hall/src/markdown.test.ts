import { describe, expect, it } from 'vitest';
import { renderMarkdown, resolveRepoPath, slugify, type DocContext } from './markdown';

const context: DocContext = {
  docPath: 'ports/skyline/docs/ABOUT.md',
  selfHref: '#/games/skyline/about',
  imageUrl: (path) => (path === 'ports/skyline/media/title.png' ? '/assets/title-abc.png' : null),
  docHref: (path) =>
    path === 'ports/skyline/docs/HOW-TO-PLAY.md' ? '#/games/skyline/how-to-play' : null,
};

const render = (markdown: string) => renderMarkdown(markdown, context);

describe('resolveRepoPath', () => {
  it('resolves relative paths against the document folder', () => {
    expect(resolveRepoPath('ports/a/docs/ABOUT.md', '../media/x.png')).toBe('ports/a/media/x.png');
    expect(resolveRepoPath('ports/a/docs/ABOUT.md', './HOW-TO-PLAY.md')).toBe(
      'ports/a/docs/HOW-TO-PLAY.md',
    );
    expect(resolveRepoPath('ports/a/docs/ABOUT.md', 'my%20shot.png')).toBe(
      'ports/a/docs/my shot.png',
    );
  });
});

describe('slugify', () => {
  it('makes GitHub-style heading ids', () => {
    expect(slugify('Tips & Tricks')).toBe('tips-tricks');
    expect(slugify('Über Café')).toBe('uber-cafe');
  });
});

describe('renderMarkdown', () => {
  it('renders the usual Markdown, tables included', () => {
    const html = render(
      '# Title\n\nSome **bold** text.\n\n| Key | Action |\n|---|---|\n| Space | Throw |',
    );
    expect(html).toContain('<h1 id="title">Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>Throw</td>');
  });

  it('gives repeated headings distinct ids', () => {
    const html = render('## Tips\n\n## Tips');
    expect(html).toContain('id="tips"');
    expect(html).toContain('id="tips-1"');
  });

  it('leaves Mermaid diagrams for the diagram renderer', () => {
    const html = render('```mermaid\ngraph TD\n  A --> B\n```');
    expect(html).toContain('<div class="doc-diagram" data-mermaid>graph TD\n  A --&gt; B</div>');
  });

  it('escapes code blocks', () => {
    expect(render('```ts\nif (a < b) {}\n```')).toContain(
      '<code class="language-ts">if (a &lt; b) {}</code>',
    );
  });

  it('points images at their published URLs', () => {
    const html = render('![The title screen](../media/title.png "Dusk over the city")');
    expect(html).toContain('<img src="/assets/title-abc.png" alt="The title screen"');
    expect(html).toContain('<span class="doc-image__caption">Dusk over the city</span>');
  });

  it('shows the alt text for images that were not published or are remote', () => {
    expect(render('![Missing](../media/nope.png)')).toContain('doc-image--missing');
    expect(render('![Remote](https://example.com/x.png)')).not.toContain('<img');
  });

  it('turns links between docs into Hall routes', () => {
    expect(render('[Learn to play](HOW-TO-PLAY.md#controls)')).toContain(
      '<a href="#/games/skyline/how-to-play">Learn to play</a>',
    );
  });

  it('keeps in-page anchors from fighting the hash router', () => {
    expect(render('[Jump](#Tips-and-tricks)')).toContain(
      '<a href="#/games/skyline/about" data-anchor="tips-and-tricks">Jump</a>',
    );
  });

  it('opens external links in a new tab and drops links to files the Hall cannot show', () => {
    expect(render('[Site](https://example.com)')).toContain(
      'target="_blank" rel="noopener noreferrer"',
    );
    const html = render('[Engine](../src/engine.ts) and [Bad](javascript:alert(1))');
    expect(html).toContain('Engine and Bad');
    expect(html).not.toContain('<a');
  });

  it('allows a little inline HTML and shows the rest as text', () => {
    expect(render('Press <kbd>Space</kbd>.')).toContain('<kbd>Space</kbd>');
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
});
