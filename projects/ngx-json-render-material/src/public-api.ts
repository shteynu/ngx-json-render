/*
 * Public API Surface of ngx-json-render-material
 */

// Catalog — the vocabulary an LLM generates against.
export { materialCatalog, type MaterialCatalog } from './lib/catalog';

// Registry — drop straight into <json-render [registry]="...">.
export { materialComponents, materialRegistry } from './lib/registry';

// Individual components, so single entries can be overridden.
export {
  JrmCard,
  JrmDivider,
  JrmExpansionPanel,
  JrmGrid,
  JrmStack,
  JrmTab,
  JrmTabRegistry,
  JrmTabs,
  JrmToolbar,
  type RegisteredTab,
} from './lib/layout.components';
export {
  JrmChip,
  JrmHeading,
  JrmIcon,
  JrmList,
  JrmListItem,
  JrmMetric,
  JrmTable,
  JrmText,
} from './lib/content.components';
export {
  JrmButton,
  JrmCheckbox,
  JrmIconButton,
  JrmInput,
  JrmRadioGroup,
  JrmSelect,
  JrmSlideToggle,
  JrmSlider,
  JrmTextarea,
} from './lib/form.components';
export {
  JrmCallout,
  JrmProgressBar,
  JrmSpinner,
} from './lib/feedback.components';

export type { ThemeColor } from './lib/theme';
