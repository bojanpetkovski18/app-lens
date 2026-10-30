import { describe, expect, it } from 'vitest';
import { draftManifest, parseManifest, shouldReadPath, signalsFromFiles, signalsFromPages, type PageSummary } from '../src';

const files = [
  { path: 'package.json', text: JSON.stringify({ name: '@acme/shop-app', description: 'Sell things', version: '3.1.0', dependencies: { stripe: '1', '@slack/web-api': '1', react: '18' } }) },
  { path: 'README.md', text: '# Shop App\n\nA shop.\n\n## Features\n\n- **Checkout**: Pay fast.\n' },
  { path: 'prisma/schema.prisma', text: 'enum Role { ADMIN\n CUSTOMER }\nmodel Order {\n id Int @id\n total Decimal\n status OrderStatus\n}\nenum OrderStatus { NEW\n PAID }\n' },
  { path: 'src/pages/dashboard.tsx', text: '' },
  { path: 'src/pages/login.tsx', text: '' },
  { path: 'app/reports/page.tsx', text: '' },
  { path: 'src/components/ContactForm.tsx', text: '<form><input name="fullName" /><input name="email" type="email" /><input name="pw" type="password" /></form>' },
  { path: 'tailwind.config.js', text: "colors: { primary: '#123456', accent: '#abcdef' }" },
];

describe('signalsFromFiles', () => {
  const signals = signalsFromFiles(files);

  it('reads package metadata, integrations and colours', () => {
    expect(signals).toMatchObject({ tagline: 'Sell things', version: '3.1.0', integrations: ['Stripe', 'Slack'], theme: { primary: '#123456', accent: '#abcdef' } });
  });

  it('turns routes, roles and forms into draft items', () => {
    const titles = signals.features.map((feature) => feature.title);
    expect(titles).toEqual(expect.arrayContaining(['Checkout', 'Dashboard', 'Reports']));
    expect(titles).not.toContain('Login');
    expect(signals.personas.map((persona) => persona.label)).toEqual(['Admin', 'Customer']);
    expect(signals.entities.find((entity) => entity.name === 'Contact')?.fields).toEqual({ fullName: 'fullName', email: 'email' });
  });

  it('produces a valid draft with evidence for every item', () => {
    const { manifest, report } = draftManifest(signals);
    expect(parseManifest(manifest).ok).toBe(true);
    for (const item of report.items) expect(item.evidence.length).toBeGreaterThan(0);
  });

  it('notes a YAML spec it cannot parse and survives broken JSON', () => {
    const result = signalsFromFiles([{ path: 'openapi.yaml', text: 'x: 1' }, { path: 'package.json', text: '{' }]);
    expect(result.notes.join()).toContain('YAML is not available');
    expect(result.notes.join()).toContain('not valid JSON');
  });

  it('uses an injected YAML parser', () => {
    const result = signalsFromFiles([{ path: 'api/openapi.yaml', text: 'ignored' }], {
      parseYaml: () => ({ openapi: '3.0.0', components: { schemas: { Thing: { properties: { name: { type: 'string' } } } } } }),
    });
    expect(result.entities[0]?.name).toBe('Thing');
  });
});

describe('shouldReadPath', () => {
  it.each(['.env', '.env.local', 'config/.env.production', 'server.pem', 'keys/id_rsa', 'tls.key', 'cert.crt', 'node_modules/a/index.js', 'dist/app.js', '.git/config', 'secrets.json', 'aws-credentials.json', '.npmrc', 'logo.png'])('skips %s', (path) => {
    expect(shouldReadPath(path)).toBe(false);
  });
  it.each(['package.json', 'src/app.tsx', 'README.md', 'prisma/schema.prisma', 'openapi.yaml'])('reads %s', (path) => {
    expect(shouldReadPath(path)).toBe(true);
  });
});

describe('signalsFromPages', () => {
  const home: PageSummary = {
    url: 'https://www.example.com/',
    title: 'Example Forum - Talk about anything',
    description: 'Communities for everything.',
    themeColor: '#ff4500',
    h1: 'Top post by jane.doe@mail.example',
    navLinks: [
      { text: 'Communities', href: 'https://www.example.com/communities' },
      { text: 'Log in', href: 'https://www.example.com/login' },
      { text: 'Privacy', href: 'https://www.example.com/privacy' },
      { text: 'u/some_real_user', href: 'https://www.example.com/user/some_real_user' },
      { text: 'jane.doe@mail.example', href: 'https://www.example.com/x' },
      { text: 'Jane Doe', href: 'https://www.example.com/user/jane' },
      { text: 'A very long headline somebody wrote about their day at work', href: 'https://www.example.com/p/1' },
    ],
    forms: [
      { fields: [{ name: 'q', type: 'search' }] },
      { fields: [{ name: 'username', type: 'text' }, { name: 'password', type: 'password' }] },
      { name: 'Newsletter', fields: [{ name: 'email', type: 'email' }, { name: 'city', type: 'text' }] },
    ],
  };

  it('keeps structure only, never personal content', () => {
    const signals = signalsFromPages([home]);
    expect(signals.features.map((feature) => feature.title)).toEqual(['Communities']);
    const text = JSON.stringify(signals);
    for (const leak of ['jane.doe', 'some_real_user', 'Jane Doe', 'headline', 'Top post']) expect(text).not.toContain(leak);
  });

  it('skips login forms and reads the rest', () => {
    expect(signalsFromPages([home]).entities.map((entity) => entity.name)).toEqual(['Newsletter']);
  });

  it('prefers the web manifest and ignores an invalid colour', () => {
    const signals = signalsFromPages([{ ...home, themeColor: 'red' }], { name: 'Forum', description: 'From manifest' });
    expect(signals.appName).toBe('Forum');
    expect(signals.theme).toBeUndefined();
  });

  it('drafts a valid manifest', () => {
    expect(parseManifest(draftManifest(signalsFromPages([home])).manifest).ok).toBe(true);
    expect(signalsFromPages([]).features).toEqual([]);
  });
});
