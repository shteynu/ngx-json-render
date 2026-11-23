/**
 * Answers recorded in the shape the model writes, for the suggested prompts.
 * A browser without WebGPU replays them through the same streaming path, so
 * the page still shows what the renderer does with a model's output.
 */
export interface Recorded {
  prompt: string;
  json: string;
}

const answer = (prompt: string, value: object): Recorded => ({
  prompt,
  json: JSON.stringify(value),
});

export const RECORDED: readonly Recorded[] = [
  answer('Weather card for Lisbon', {
    say: 'Sunny in Lisbon today, with a breeze in the afternoon.',
    ui: {
      type: 'Card',
      props: { title: 'Lisbon', subtitle: 'Today · updated 10 min ago' },
      children: [
        {
          type: 'Stack',
          props: { direction: 'horizontal', gap: 12, align: 'center' },
          children: [
            { type: 'Icon', props: { name: 'sunny', color: 'accent' } },
            { type: 'Heading', props: { content: '24 °C', level: 1 } },
            { type: 'Chip', props: { label: 'Clear sky', icon: 'wb_sunny' } },
          ],
        },
        {
          type: 'Grid',
          props: { columns: 3, gap: 12 },
          children: [
            { type: 'Metric', props: { label: 'Wind', value: '18 km/h' } },
            { type: 'Metric', props: { label: 'Humidity', value: '52%' } },
            {
              type: 'Metric',
              props: { label: 'UV index', value: 7, trend: 'up' },
            },
          ],
        },
        {
          type: 'Callout',
          props: {
            severity: 'info',
            content: 'High UV after noon — bring sunscreen.',
          },
        },
      ],
    },
  }),
  answer('Sign-up form with a plan picker', {
    say: 'Here is a sign-up form with a plan choice.',
    ui: {
      type: 'Card',
      props: { title: 'Create your account', subtitle: 'Free for 14 days' },
      children: [
        {
          type: 'Text',
          props: { content: 'No card needed. Cancel any time.', tone: 'muted' },
        },
        {
          type: 'Stack',
          props: { gap: 8 },
          children: [
            {
              type: 'Input',
              props: { label: 'Full name', placeholder: 'Ada Lovelace' },
            },
            {
              type: 'Input',
              props: {
                label: 'Email',
                type: 'email',
                placeholder: 'ada@example.com',
              },
            },
            {
              type: 'Select',
              props: {
                label: 'Plan',
                value: 'pro',
                options: [
                  { value: 'free', label: 'Free' },
                  { value: 'pro', label: 'Pro · $12/month' },
                  { value: 'team', label: 'Team · $49/month' },
                ],
              },
            },
            { type: 'Checkbox', props: { label: 'I agree to the terms' } },
            {
              type: 'Button',
              props: {
                label: 'Start free trial',
                variant: 'filled',
                icon: 'rocket_launch',
              },
            },
          ],
        },
      ],
    },
  }),
  answer('Sales dashboard for this week', {
    say: 'Sales are up 12% on last week.',
    ui: {
      type: 'Stack',
      props: { gap: 16 },
      children: [
        { type: 'Heading', props: { content: 'This week', level: 2 } },
        {
          type: 'Grid',
          props: { columns: 3, gap: 12 },
          children: [
            {
              type: 'Metric',
              props: {
                label: 'Revenue',
                value: '$48,200',
                delta: '+12%',
                trend: 'up',
              },
            },
            {
              type: 'Metric',
              props: {
                label: 'Orders',
                value: 1284,
                delta: '+5%',
                trend: 'up',
              },
            },
            {
              type: 'Metric',
              props: {
                label: 'Refunds',
                value: 31,
                delta: '-8%',
                trend: 'down',
              },
            },
          ],
        },
        {
          type: 'Table',
          props: {
            columns: [
              { field: 'product', header: 'Product' },
              { field: 'units', header: 'Units', align: 'end' },
              { field: 'revenue', header: 'Revenue', align: 'end' },
            ],
            rows: [
              { product: 'Desk lamp', units: 420, revenue: '$12,600' },
              { product: 'Standing desk', units: 61, revenue: '$24,400' },
              { product: 'Monitor arm', units: 188, revenue: '$11,200' },
            ],
          },
        },
      ],
    },
  }),
  answer('Server status overview', {
    say: 'Two services are healthy; the queue is running hot.',
    ui: {
      type: 'Card',
      props: { title: 'Production', subtitle: 'eu-west · 3 services' },
      children: [
        {
          type: 'List',
          props: {},
          children: [
            {
              type: 'ListItem',
              props: {
                title: 'API',
                description: '99.98% uptime · 120 ms p95',
                icon: 'check_circle',
              },
            },
            {
              type: 'ListItem',
              props: {
                title: 'Database',
                description: '42% CPU · 1.2k connections',
                icon: 'database',
              },
            },
            {
              type: 'ListItem',
              props: {
                title: 'Queue',
                description: '18k jobs waiting',
                icon: 'warning',
              },
            },
          ],
        },
        { type: 'ProgressBar', props: { value: 87, color: 'warn' } },
        {
          type: 'Callout',
          props: {
            severity: 'warning',
            title: 'Queue backlog',
            content: 'Workers are at 87% capacity. Add one more to drain it.',
          },
        },
        {
          type: 'Button',
          props: { label: 'Scale workers', variant: 'tonal', icon: 'add' },
        },
      ],
    },
  }),
];
