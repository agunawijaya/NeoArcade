import { shade } from './colour';

let diagramCount = 0;

/**
 * Renders the Mermaid blocks left by renderMarkdown. Mermaid is large, so it
 * is only downloaded the first time a document actually contains a diagram.
 */
export async function renderDiagrams(container: HTMLElement, accent: string): Promise<void> {
  const blocks = [...container.querySelectorAll<HTMLElement>('[data-mermaid]')];
  if (blocks.length === 0) return;

  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    themeVariables: {
      darkMode: true,
      background: '#0d0b1a',
      primaryColor: '#1b1636',
      primaryTextColor: '#eef0ff',
      primaryBorderColor: accent,
      secondaryColor: '#15122b',
      tertiaryColor: '#100d22',
      lineColor: '#9c9fd6',
      textColor: '#dfe1ff',
      mainBkg: '#1b1636',
      nodeBorder: accent,
      clusterBkg: '#120f26',
      clusterBorder: shade(accent, -0.4),
      edgeLabelBackground: '#0d0b1a',
      actorBkg: '#1b1636',
      actorBorder: accent,
      actorTextColor: '#eef0ff',
      signalColor: '#dfe1ff',
      signalTextColor: '#dfe1ff',
      noteBkgColor: '#2a2150',
      noteTextColor: '#eef0ff',
      noteBorderColor: accent,
    },
  });

  for (const block of blocks) {
    const source = block.textContent ?? '';
    try {
      const { svg } = await mermaid.render(`doc-diagram-${++diagramCount}`, source);
      block.innerHTML = svg;
      block.classList.add('doc-diagram--ready');
    } catch {
      // Show the diagram's source rather than nothing; it is still readable.
      block.classList.add('doc-diagram--failed');
      block.replaceChildren(Object.assign(document.createElement('pre'), { textContent: source }));
    }
  }
}
