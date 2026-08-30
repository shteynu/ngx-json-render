import type { Spec } from 'ngx-json-render';

/**
 * The playground's starting point for the demo's own hand-rolled catalog —
 * the same spec grammar against a different, much smaller vocabulary, which
 * is the point of switching catalogs here.
 */
export const demoStarterSpec: Spec = {
  root: 'root',
  state: {
    name: 'Ada',
  },
  elements: {
    root: {
      type: 'Stack',
      props: { gap: 16 },
      children: ['title', 'metrics', 'form-card'],
    },
    title: {
      type: 'Heading',
      props: { content: 'Release dashboard', level: 1 },
      children: [],
    },
    metrics: {
      type: 'Stack',
      props: { direction: 'horizontal', gap: 10 },
      children: ['m-downloads', 'm-components'],
    },
    'm-downloads': {
      type: 'Metric',
      props: { label: 'Downloads', value: '1,284', delta: '+12%' },
      children: [],
    },
    'm-components': {
      type: 'Metric',
      props: { label: 'Components', value: 11, delta: '+2' },
      children: [],
    },
    'form-card': {
      type: 'Card',
      props: { title: 'Say hello' },
      children: ['name-input', 'greeting', 'progress'],
    },
    'name-input': {
      type: 'Input',
      props: {
        placeholder: 'Your name',
        value: { $bindState: '/name' },
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
    progress: {
      type: 'Progress',
      props: { label: 'Catalog coverage', value: 40 },
      children: [],
    },
  },
};
