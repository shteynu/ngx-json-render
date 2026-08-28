import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
} from '@angular/core';
import { REPEAT_SCOPE } from './tokens';
import type { RepeatScope } from './types';

/**
 * Provides the repeat scope (item, index, absolute base path) to the elements
 * rendered inside a `repeat` block.
 *
 * @internal Used by `<jr-children>`; not intended for direct use.
 */
@Component({
  selector: 'jr-repeat-scope',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: REPEAT_SCOPE, useExisting: forwardRef(() => JrRepeatScope) },
  ],
  styles: `:host { display: contents; }`,
  template: '<ng-content />',
})
export class JrRepeatScope implements RepeatScope {
  readonly item = input.required<unknown>();
  readonly index = input.required<number>();
  readonly basePath = input.required<string>();
}
