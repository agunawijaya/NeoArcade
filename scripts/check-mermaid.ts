import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { chromium } from '@playwright/test';
import { projectRoot } from './vite-shared';

/**
 * Renders every ```mermaid block in the repo's docs with mermaid-cli, so a
 * diagram that would break on GitHub fails here first.
 *
 *   npm run docs:check                 all docs
 *   npm run docs:check -- some/file.md only these files
 */
interface Diagram {
  file: string;
  line: number;
  source: string;
}

function markdownFiles(): string[] {
  const inFolder = (folder: string) =>
    existsSync(folder)
      ? readdirSync(folder, { recursive: true, encoding: 'utf8' })
          .filter((name) => name.endsWith('.md'))
          .map((name) => join(folder, name))
      : [];
  const portsDir = join(projectRoot, 'ports');
  const portDocs = existsSync(portsDir)
    ? readdirSync(portsDir).flatMap((slug) => inFolder(join(portsDir, slug, 'docs')))
    : [];
  return [join(projectRoot, 'README.md'), ...inFolder(join(projectRoot, 'docs')), ...portDocs];
}

function diagramsIn(file: string): Diagram[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const diagrams: Diagram[] = [];
  let start = -1;
  lines.forEach((text, index) => {
    if (start === -1 && text.trim() === '```mermaid') start = index;
    else if (start !== -1 && text.trim() === '```') {
      diagrams.push({ file, line: start + 1, source: lines.slice(start + 1, index).join('\n') });
      start = -1;
    }
  });
  return diagrams;
}

const files = process.argv.length > 2 ? process.argv.slice(2) : markdownFiles();
const diagrams = files.flatMap(diagramsIn);
const workDir = mkdtempSync(join(tmpdir(), 'neoarcade-mermaid-'));
const puppeteerConfig = join(workDir, 'puppeteer.json');
writeFileSync(puppeteerConfig, JSON.stringify({ executablePath: chromium.executablePath() }));
// The package only exports its API, so find the CLI next to it.
const cli = join(
  dirname(createRequire(import.meta.url).resolve('@mermaid-js/mermaid-cli')),
  'cli.js',
);

let failures = 0;
diagrams.forEach((diagram, index) => {
  const input = join(workDir, `${index}.mmd`);
  writeFileSync(input, diagram.source);
  const where = `${relative(projectRoot, diagram.file)}:${diagram.line}`;
  try {
    execFileSync(
      process.execPath,
      [cli, '-q', '-i', input, '-o', join(workDir, `${index}.svg`), '-p', puppeteerConfig],
      {
        stdio: 'pipe',
      },
    );
    console.log(`ok    ${where}`);
  } catch (error) {
    failures++;
    const output = (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
    console.error(`FAIL  ${where}\n${output.split('\n').slice(0, 6).join('\n')}`);
  }
});

rmSync(workDir, { recursive: true, force: true });
console.log(`${diagrams.length - failures}/${diagrams.length} diagrams render.`);
if (failures > 0) process.exit(1);
