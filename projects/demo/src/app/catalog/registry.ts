import { type Components, defineRegistry } from 'ngx-json-render';
import { catalog } from './catalog';
import {
  BadgeComponent,
  ButtonComponent,
  CardComponent,
  CheckboxComponent,
  DividerComponent,
  HeadingComponent,
  InputComponent,
  MetricComponent,
  ProgressComponent,
  StackComponent,
  TextComponent,
} from './components';

const components: Components<typeof catalog> = {
  Stack: StackComponent,
  Card: CardComponent,
  Heading: HeadingComponent,
  Text: TextComponent,
  Button: ButtonComponent,
  Badge: BadgeComponent,
  Input: InputComponent,
  Checkbox: CheckboxComponent,
  Metric: MetricComponent,
  Progress: ProgressComponent,
  Divider: DividerComponent,
};

export const { registry } = defineRegistry(catalog, {
  components,
  actions: {
    increment: async () => {},
    decrement: async () => {},
    syncTodoCount: async () => {},
    clearTodos: async () => {},
  },
});
