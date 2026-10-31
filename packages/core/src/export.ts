import { getEntityFields } from './generator';
import type { Manifest } from './schema';

export type OnePagerBlock =
  | { type: 'title'; text: string; subtitle?: string }
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'bullets'; items: string[] };

function persona(manifest: Manifest, id: string): string {
  return manifest.personas.find((item) => item.id === id)?.label ?? id;
}

/** The same facts as the overview, as blocks that each output format renders its own way. */
export function buildOnePager(manifest: Manifest): OnePagerBlock[] {
  const { app, personas, features, scenarios, integrations, entities, attribution } = manifest;
  const blocks: OnePagerBlock[] = [{ type: 'title', text: app.name, subtitle: app.tagline }];
  const facts = [app.category, app.version ? `Version ${app.version}` : undefined, app.website].filter(Boolean).join(' · ');
  if (facts) blocks.push({ type: 'text', text: facts });
  if (app.description) blocks.push({ type: 'text', text: app.description });

  if (personas.length > 0) {
    blocks.push({ type: 'heading', text: "Who it's for" });
    blocks.push({ type: 'bullets', items: personas.map((p) => (p.description ? `${p.label}: ${p.description}` : p.label)) });
  }
  if (features.length > 0) {
    blocks.push({ type: 'heading', text: 'Features' });
    blocks.push({
      type: 'bullets',
      items: features.map((feature) => {
        const tier = feature.tier ? ` [${feature.tier}]` : '';
        const audience = feature.personas.length > 0 ? ` (${feature.personas.map((id) => persona(manifest, id)).join(', ')})` : '';
        return `${feature.title}${tier}${feature.description ? `: ${feature.description}` : ''}${audience}`;
      }),
    });
  }
  const entityNames = Object.entries(entities);
  if (entityNames.length > 0) {
    blocks.push({ type: 'heading', text: 'What it manages' });
    blocks.push({
      type: 'bullets',
      items: entityNames.map(([name, entity]) => {
        const label = entity.label ?? name;
        return entity.description ? `${label}: ${entity.description}` : label;
      }),
    });
  }
  if (scenarios.length > 0) {
    blocks.push({ type: 'heading', text: 'Walkthroughs' });
    blocks.push({ type: 'bullets', items: scenarios.map((s) => (s.description ? `${s.title}: ${s.description}` : s.title)) });
  }
  if (integrations.length > 0) {
    blocks.push({ type: 'heading', text: 'Works with' });
    blocks.push({ type: 'text', text: integrations.map((integration) => integration.name).join(', ') });
  }
  if (attribution) blocks.push({ type: 'text', text: attribution.text });
  return blocks;
}

/** Relationships as a Mermaid diagram, which GitHub and many editors render. */
export function entityDiagram(manifest: Manifest): string | null {
  const lines = Object.entries(manifest.entities).flatMap(([name, entity]) =>
    getEntityFields(entity).flatMap(([field, spec]) => (spec.kind === 'ref' && spec.target ? [`  ${spec.target} ||--o{ ${name} : ${field}`] : [])),
  );
  return lines.length > 0 ? ['erDiagram', ...lines].join('\n') : null;
}

/** Manifest text stays inline: a line break or a leading "#" must not start a new block. */
function escapeMarkdown(text: string): string {
  return text
    .replace(/\s*\n\s*/g, ' ')
    .replace(/([\\`*_[\]<>])/g, '\\$1')
    .replace(/^(#|[-+]\s|\d+[.)]\s)/, '\\$1');
}

export function renderMarkdown(manifest: Manifest): string {
  const out: string[] = [];
  for (const block of buildOnePager(manifest)) {
    switch (block.type) {
      case 'title':
        out.push(`# ${escapeMarkdown(block.text)}`);
        if (block.subtitle) out.push(`*${escapeMarkdown(block.subtitle)}*`);
        break;
      case 'heading':
        out.push(`## ${escapeMarkdown(block.text)}`);
        break;
      case 'text':
        out.push(escapeMarkdown(block.text));
        break;
      case 'bullets':
        out.push(block.items.map((item) => `- ${escapeMarkdown(item)}`).join('\n'));
        break;
    }
  }
  const diagram = entityDiagram(manifest);
  if (diagram) out.push('## Data model', `\`\`\`mermaid\n${diagram}\n\`\`\``);
  return `${out.join('\n\n')}\n`;
}

const HELVETICA_WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function textWidth(text: string, size: number): number {
  let total = 0;
  for (const char of text) total += HELVETICA_WIDTHS[char.charCodeAt(0) - 32] ?? 556;
  return (total * size) / 1000;
}

/** A long URL has no spaces to wrap at, so it is cut to the line width. */
function splitWord(word: string, size: number, width: number): string[] {
  if (textWidth(word, size) <= width) return [word];
  const parts: string[] = [];
  let part = '';
  for (const char of word) {
    if (part && textWidth(part + char, size) > width) {
      parts.push(part);
      part = char;
    } else {
      part += char;
    }
  }
  return [...parts, part];
}

function wrap(text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean).flatMap((item) => splitWord(item, size, width))) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const TYPOGRAPHY: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', '·': '-', '•': '-', ' ': ' ' };

/** The built-in PDF fonts only cover Latin text, so everything else is transliterated. */
function latin(text: string): string {
  const mapped = text.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return Array.from(mapped, (char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code < 127 ? char : (TYPOGRAPHY[char] ?? '?');
  }).join('');
}

function pdfString(text: string): string {
  return `(${text.replace(/([\\()])/g, '\\$1')})`;
}

function hexToRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const match = hex ? /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex) : null;
  if (!match?.[1]) return fallback;
  const full = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  const number = Number.parseInt(full, 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255].map((value) => value / 255) as [number, number, number];
}

const fixed = (value: number): string => value.toFixed(3).replace(/\.?0+$/, '');

/** Writes a PDF with the 14 standard fonts, so export needs no browser and no font files. */
export function renderPdf(manifest: Manifest): Uint8Array {
  const primary = hexToRgb(manifest.app.theme?.primary, [0.31, 0.27, 0.9]);
  const pages: string[] = [];
  let page = '';
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    if (page) pages.push(page);
    page = '';
    y = PAGE_HEIGHT - MARGIN;
  };
  const room = (needed: number) => {
    if (y - needed < MARGIN) newPage();
  };
  const draw = (text: string, x: number, size: number, font: 'F1' | 'F2', color: readonly number[]) => {
    page += `BT /${font} ${size} Tf ${color.map(fixed).join(' ')} rg ${fixed(x)} ${fixed(y)} Td ${pdfString(text)} Tj ET\n`;
  };

  const ink = [0.11, 0.13, 0.19];
  const muted = [0.38, 0.42, 0.5];
  for (const block of buildOnePager(manifest)) {
    switch (block.type) {
      case 'title':
        page += `${primary.map(fixed).join(' ')} rg ${MARGIN} ${PAGE_HEIGHT - MARGIN + 12} ${CONTENT_WIDTH} 4 re f\n`;
        for (const line of wrap(latin(block.text), 26, CONTENT_WIDTH)) {
          y -= 28;
          draw(line, MARGIN, 26, 'F2', ink);
        }
        if (block.subtitle) {
          for (const line of wrap(latin(block.subtitle), 12, CONTENT_WIDTH)) {
            y -= 17;
            draw(line, MARGIN, 12, 'F1', muted);
          }
        }
        y -= 14;
        break;
      case 'heading':
        room(50);
        y -= 12;
        draw(latin(block.text), MARGIN, 13.5, 'F2', primary);
        y -= 20;
        break;
      case 'text':
        for (const line of wrap(latin(block.text), 10.5, CONTENT_WIDTH)) {
          room(15);
          draw(line, MARGIN, 10.5, 'F1', ink);
          y -= 14.5;
        }
        y -= 5;
        break;
      case 'bullets':
        for (const item of block.items) {
          wrap(latin(item), 10.5, CONTENT_WIDTH - 14).forEach((line, index) => {
            room(15);
            if (index === 0) draw('-', MARGIN + 2, 10.5, 'F1', primary);
            draw(line, MARGIN + 14, 10.5, 'F1', ink);
            y -= 14.5;
          });
          y -= 2;
        }
        break;
    }
  }
  pages.push(page);

  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((content, index) => {
    const id = pageIds[index] as number;
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objects[id + 1] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  });

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(body, (char) => char.charCodeAt(0));
}
