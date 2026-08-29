import { type Signal, computed } from '@angular/core';
import type { ValidationConfig } from '@json-render/core';
import { type RenderContext, injectFieldValidation } from 'ngx-json-render';

/** Props every validatable catalog component shares. */
export interface ValidatableProps {
  validation?: ValidationConfig;
}

/**
 * A catalog field's validation state and the two write paths that drive it.
 *
 * @internal Shared by the form components; not part of the public API.
 */
export interface JrmField {
  /** Messages to display. Empty until the field has actually been validated. */
  errors: Signal<string[]>;
  /** Whether the control should render in its error state. */
  invalid: Signal<boolean>;
  /** Whether validation declares this field required (drives the asterisk). */
  required: Signal<boolean>;
  /** Write a value back to state, validating when `validateOn` is `change`. */
  set: (value: unknown) => void;
  /** Mark the field touched, validating when `validateOn` is `blur`. */
  blur: () => void;
}

/**
 * Wire a catalog component's bound prop to the renderer's validation service.
 *
 * The field's state path is the one the prop is already two-way bound to, so
 * `validation` needs no path of its own: a component bound with
 * `{"$bindState":"/email"}` validates `/email`. Without a binding there is
 * nothing to validate and the field stays inert.
 *
 * `validateForm` validates every registered field regardless of `validateOn`,
 * which is what makes `validateOn: "submit"` mean "only on submit".
 *
 * @param ctx the component's render context
 * @param prop the bound prop carrying the value (`value` or `checked`)
 * @param defaultValidateOn used when the spec's config omits `validateOn`:
 *   `blur` for typed text, `change` for discrete choices
 */
export function injectJrmField(
  ctx: RenderContext<ValidatableProps>,
  prop: string,
  defaultValidateOn: 'change' | 'blur' | 'submit',
): JrmField {
  const path = () => ctx.bindings()?.[prop] ?? '';
  const config = () => ctx.props().validation;
  const field = injectFieldValidation(path, config);

  // A config without a binding cannot be validated: registerField needs a
  // state path to key on, and validateForm reports per path.
  const registered = () => Boolean(path() && config());
  const validateOn = () => config()?.validateOn ?? defaultValidateOn;

  return {
    errors: computed(() => (field.state().validated ? field.errors() : [])),
    invalid: computed(() => field.state().validated && !field.isValid()),
    required: computed(() =>
      Boolean(config()?.checks?.some((check) => check.type === 'required')),
    ),
    set: (value) => {
      ctx.setBound(prop, value);
      if (registered() && validateOn() === 'change') {
        field.validate();
      }
    },
    blur: () => {
      if (!registered()) return;
      field.touch();
      if (validateOn() === 'blur') {
        field.validate();
      }
    },
  };
}
