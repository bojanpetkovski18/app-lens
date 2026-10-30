import type { ManifestInput } from './schema';

export function starterManifest(name: string): ManifestInput {
  const seed = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-') || 'app-lens';
  return {
    $schema: './app-lens.schema.json',
    manifestVersion: 1,
    app: {
      name,
      tagline: 'One sentence about what your app does',
      description: 'Describe your app here: what it does, who it helps and why it matters.',
      category: 'Productivity',
      version: '1.0',
      theme: { primary: '#4f46e5', accent: '#0ea5e9', mode: 'auto' },
    },
    personas: [
      { id: 'admin', label: 'Admin', description: 'Sets things up and keeps them running.', goals: ['Stay in control'] },
      { id: 'member', label: 'Member', description: 'Uses the app day to day.', goals: ['Get work done quickly'] },
    ],
    entities: {
      Customer: {
        count: 8,
        display: 'company',
        description: 'People and businesses you serve.',
        fields: { company: 'company', contact: 'fullName', email: 'email', city: 'city' },
      },
      Order: {
        count: 12,
        display: 'number',
        description: 'Work you fulfil for customers.',
        fields: { number: 'seq:ORD-####', customer: 'ref:Customer', total: 'money:20..900', placed: 'date:-30..0', status: 'enum:new,processing,shipped,delivered' },
      },
    },
    features: [
      { id: 'orders', title: 'Order tracking', description: 'Follow every order from new to delivered.', category: 'Operations', personas: ['admin', 'member'], entities: ['Order'], highlights: ['Live status', 'Search and filters'] },
      { id: 'customers', title: 'Customer directory', description: 'Everything about your customers in one place.', category: 'Operations', personas: ['admin'], entities: ['Customer'], highlights: ['Contact details', 'Order history'] },
    ],
    scenarios: [
      {
        id: 'fulfil-order',
        title: 'Fulfil an order',
        persona: 'member',
        entity: 'Order',
        steps: [
          { action: 'create', narration: 'A new order comes in.', values: { status: 'new', placed: '$today' } },
          { action: 'update', narration: 'The team starts working on it.', set: { status: 'processing' } },
          { action: 'update', narration: 'The order is on its way.', set: { status: 'shipped' } },
        ],
      },
    ],
    integrations: [{ name: 'Email', category: 'Messaging', description: 'Sends order updates.' }],
    mock: { seed },
  };
}
