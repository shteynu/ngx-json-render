import type { Spec } from 'ngx-json-render';

/**
 * Interactive demo spec: state bindings, repeat, two-way binding, visibility,
 * watch, built-in and custom actions, confirm dialogs, slots.
 *
 * This is the JSON an LLM would produce for the demo catalog.
 */
export const dashboardSpec: Spec = {
  root: 'root',
  state: {
    user: { name: 'Ada' },
    count: 0,
    newTodo: '',
    todoCount: 3,
    todos: [
      { id: 't1', title: 'Read the json-render spec format', done: true },
      { id: 't2', title: 'Wire up ngx-json-render', done: false },
      { id: 't3', title: 'Stream a UI from an LLM', done: false },
    ],
  },
  elements: {
    root: {
      type: 'Stack',
      props: { gap: 16 },
      children: ['greeting-card', 'counter-card', 'todos-card'],
    },

    // --- Greeting: $template + $bindState ------------------------------------
    'greeting-card': {
      type: 'Card',
      props: { title: 'Hello', subtitle: '$template + $bindState' },
      children: ['greeting-text', 'name-input'],
      slots: { actions: ['greeting-badge'] },
    },
    'greeting-badge': {
      type: 'Badge',
      props: { label: { $template: '${/user/name}' }, color: 'blue' },
    },
    'greeting-text': {
      type: 'Text',
      props: {
        content: { $template: 'Welcome back, ${/user/name}!' },
        tone: 'strong',
      },
    },
    'name-input': {
      type: 'Input',
      props: {
        value: { $bindState: '/user/name' },
        placeholder: 'Type your name…',
      },
    },

    // --- Counter: custom actions + visibility --------------------------------
    'counter-card': {
      type: 'Card',
      props: { title: 'Counter', subtitle: 'Custom actions + visibility' },
      children: ['counter-row', 'counter-hot'],
    },
    'counter-row': {
      type: 'Stack',
      props: { direction: 'horizontal', gap: 10, align: 'center' },
      children: ['dec-btn', 'count-metric', 'inc-btn'],
    },
    'dec-btn': {
      type: 'Button',
      props: { label: '−1' },
      on: {
        press: {
          action: 'decrement',
          params: { statePath: '/count', min: 0 },
        },
      },
    },
    'count-metric': {
      type: 'Metric',
      props: { label: 'count', value: { $state: '/count' } },
    },
    'inc-btn': {
      type: 'Button',
      props: { label: '+1', variant: 'primary' },
      on: { press: { action: 'increment', params: { statePath: '/count' } } },
    },
    'counter-hot': {
      type: 'Badge',
      props: { label: '🔥 On a roll — five or more!', color: 'orange' },
      visible: { $state: '/count', gte: 5 },
    },

    // --- Todos: repeat + $bindItem + built-in actions + confirm + watch ------
    'todos-card': {
      type: 'Card',
      props: {
        title: 'Todos',
        subtitle: 'repeat + $bindItem + pushState/removeState',
      },
      children: ['todo-list', 'todos-empty', 'todos-divider', 'add-row'],
      slots: { actions: ['clear-btn'] },
      // Keep /todoCount in sync so visibility conditions can use it.
      watch: { '/todos': { action: 'syncTodoCount' } },
    },
    'todo-list': {
      type: 'Stack',
      props: { gap: 8 },
      repeat: { statePath: '/todos', key: 'id' },
      children: ['todo-row'],
    },
    'todo-row': {
      type: 'Stack',
      props: {
        direction: 'horizontal',
        gap: 10,
        align: 'center',
        justify: 'between',
      },
      children: ['todo-check', 'todo-remove'],
    },
    'todo-check': {
      type: 'Checkbox',
      props: {
        label: { $template: '${title}' },
        checked: { $bindItem: 'done' },
      },
    },
    'todo-remove': {
      type: 'Button',
      props: { label: 'Remove', variant: 'danger' },
      on: {
        press: {
          action: 'removeState',
          params: { statePath: '/todos', index: { $index: true } },
        },
      },
    },
    'todos-empty': {
      type: 'Text',
      props: { content: 'All clear — add your first todo below.', tone: 'muted' },
      visible: { $state: '/todoCount', eq: 0 },
    },
    'todos-divider': { type: 'Divider', props: {} },
    'add-row': {
      type: 'Stack',
      props: { direction: 'horizontal', gap: 10 },
      children: ['add-input', 'add-btn'],
    },
    'add-input': {
      type: 'Input',
      props: {
        value: { $bindState: '/newTodo' },
        placeholder: 'What needs doing?',
      },
      on: {
        submit: {
          action: 'pushState',
          params: {
            statePath: '/todos',
            value: { id: '$id', title: { $state: '/newTodo' }, done: false },
            clearStatePath: '/newTodo',
          },
        },
      },
    },
    'add-btn': {
      type: 'Button',
      props: { label: 'Add', variant: 'primary' },
      on: {
        press: {
          action: 'pushState',
          params: {
            statePath: '/todos',
            value: { id: '$id', title: { $state: '/newTodo' }, done: false },
            clearStatePath: '/newTodo',
          },
        },
      },
    },
    'clear-btn': {
      type: 'Button',
      props: { label: 'Clear all', variant: 'danger' },
      visible: { $state: '/todoCount', gte: 1 },
      on: {
        press: {
          action: 'clearTodos',
          confirm: {
            title: 'Clear all todos?',
            message: 'This removes all ${/todoCount} todos from the list.',
            confirmLabel: 'Clear all',
            variant: 'danger',
          },
        },
      },
    },
  },
};
