import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

@Component({
  selector: 'app-root',
  imports: [CopilotChat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main><copilot-chat /></main>`,
  styles: `
    main {
      height: 100vh;
      max-width: 880px;
      margin: 0 auto;
    }
  `,
})
export class App {}
