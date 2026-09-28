import { shade } from './colour';

let diagramCount = 0;

/**
 * Renders the Mermaid blocks left by renderMarkdown. Mermaid is large, so it
 * is only downloaded the first time a document actually contains a diagram.
 */
export async function renderDiagrams(
  container: HTMLElement,
  accent: string,
  theme: 'light' | 'dark',
): Promise<void> {
  const blocks = [...container.querySelectorAll<HTMLElement>('[data-mermaid]')];
  if (blocks.length === 0) return;

  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    themeVariables: theme === 'light' ? lightDiagrams(accent) : darkDiagrams(accent),
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

function darkDiagrams(accent: string) {
  return {
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
  };
}

function lightDiagrams(accent: string) {
  return {
    darkMode: false,
    background: '#ffffff',
    primaryColor: '#f3effc',
    primaryTextColor: '#1c1631',
    primaryBorderColor: shade(accent, -0.25),
    secondaryColor: '#ece6f8',
    tertiaryColor: '#f7f4fc',
    lineColor: '#6a6384',
    textColor: '#2a2342',
    mainBkg: '#f3effc',
    nodeBorder: shade(accent, -0.25),
    clusterBkg: '#f7f4fc',
    clusterBorder: shade(accent, -0.1),
    edgeLabelBackground: '#ffffff',
    actorBkg: '#f3effc',
    actorBorder: shade(accent, -0.25),
    actorTextColor: '#1c1631',
    signalColor: '#2a2342',
    signalTextColor: '#2a2342',
    noteBkgColor: '#fff6dc',
    noteTextColor: '#1c1631',
    noteBorderColor: shade(accent, -0.25),
  };
}
