import { type Components, defineRegistry } from 'ngx-json-render';
import { materialCatalog } from './catalog';
import {
  JrmCallout,
  JrmProgressBar,
  JrmSpinner,
} from './feedback.components';
import {
  JrmButton,
  JrmCheckbox,
  JrmIconButton,
  JrmInput,
  JrmRadioGroup,
  JrmSelect,
  JrmSlideToggle,
  JrmSlider,
  JrmTextarea,
} from './form.components';
import {
  JrmCard,
  JrmDivider,
  JrmExpansionPanel,
  JrmGrid,
  JrmStack,
  JrmTab,
  JrmTabs,
  JrmToolbar,
} from './layout.components';
import {
  JrmChip,
  JrmHeading,
  JrmIcon,
  JrmList,
  JrmListItem,
  JrmMetric,
  JrmTable,
  JrmText,
} from './content.components';

/**
 * Catalog name → Angular Material component.
 *
 * Exported on its own so an app can swap individual entries — pass a modified
 * copy to `defineRegistry` to override, say, `Card` with its own branded one
 * while keeping the rest of the catalog.
 */
export const materialComponents: Components<typeof materialCatalog> = {
  // layout
  Stack: JrmStack,
  Grid: JrmGrid,
  Card: JrmCard,
  Toolbar: JrmToolbar,
  ExpansionPanel: JrmExpansionPanel,
  Tabs: JrmTabs,
  Tab: JrmTab,
  Divider: JrmDivider,
  // typography
  Heading: JrmHeading,
  Text: JrmText,
  Icon: JrmIcon,
  // data display
  Metric: JrmMetric,
  Chip: JrmChip,
  List: JrmList,
  ListItem: JrmListItem,
  Table: JrmTable,
  // forms
  Button: JrmButton,
  IconButton: JrmIconButton,
  Input: JrmInput,
  Textarea: JrmTextarea,
  Select: JrmSelect,
  Checkbox: JrmCheckbox,
  RadioGroup: JrmRadioGroup,
  SlideToggle: JrmSlideToggle,
  Slider: JrmSlider,
  // feedback
  ProgressBar: JrmProgressBar,
  Spinner: JrmSpinner,
  Callout: JrmCallout,
};

/**
 * Ready-made registry for `<json-render [registry]="materialRegistry">`.
 *
 * The catalog declares no custom actions — only the built-in `setState`,
 * `pushState`, `removeState` and `validateForm` — so nothing else has to be
 * wired up to render a spec.
 */
export const { registry: materialRegistry } = defineRegistry(materialCatalog, {
  components: materialComponents,
});
