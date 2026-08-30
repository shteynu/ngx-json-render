import type { Spec } from 'ngx-json-render';

/**
 * The playground's starting point for the Angular Material catalog.
 *
 * Deliberately small enough to read in one screen and edit by hand: a metric
 * grid, a table bound to state, and a form field bound two-way — the three
 * shapes a generated spec uses most.
 */
export const materialStarterSpec: Spec = {
  root: 'root',
  state: {
    name: 'Ada',
    releases: [
      { version: '0.1.4', date: '2026-08-28', status: 'published' },
      { version: '0.1.3', date: '2026-08-21', status: 'published' },
      { version: '0.1.2', date: '2026-08-14', status: 'published' },
    ],
  },
  elements: {
    root: {
      type: 'Stack',
      props: { gap: 16 },
      children: ['title', 'metrics', 'table-card', 'form-card'],
    },
    title: {
      type: 'Heading',
      props: { content: 'Release dashboard', level: 1 },
      children: [],
    },
    metrics: {
      type: 'Grid',
      props: { columns: 3, gap: 12 },
      children: ['m-downloads', 'm-components', 'm-size'],
    },
    'm-downloads': {
      type: 'Metric',
      props: { label: 'Downloads', value: '1,284', delta: '+12%', trend: 'up' },
      children: [],
    },
    'm-components': {
      type: 'Metric',
      props: { label: 'Components', value: 28, delta: '+9', trend: 'up' },
      children: [],
    },
    'm-size': {
      type: 'Metric',
      props: { label: 'Bundle', value: '14 kB', delta: '-2 kB', trend: 'down' },
      children: [],
    },
    'table-card': {
      type: 'Card',
      props: { title: 'Recent releases', appearance: 'outlined' },
      children: ['releases-table'],
    },
    'releases-table': {
      type: 'Table',
      props: {
        columns: [
          { field: 'version', header: 'Version' },
          { field: 'date', header: 'Date' },
          { field: 'status', header: 'Status' },
        ],
        rows: { $state: '/releases' },
      },
      children: [],
    },
    'form-card': {
      type: 'Card',
      props: { title: 'Say hello', appearance: 'outlined' },
      children: ['name-input', 'greeting'],
    },
    'name-input': {
      type: 'Input',
      props: {
        label: 'Your name',
        value: { $bindState: '/name' },
        hint: 'Type here — the text below is bound to the same state path.',
      },
      children: [],
    },
    greeting: {
      type: 'Text',
      props: {
        content: { $template: 'Hello, ${/name}! This UI came from JSON.' },
        tone: 'muted',
      },
      children: [],
    },
  },
};
