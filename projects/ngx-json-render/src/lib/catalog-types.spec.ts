import { z } from 'zod';
import type {
  InferActionParams,
  InferCatalogComponents,
  InferComponentProps,
  RenderContext,
} from '../public-api';
import { schema } from 'ngx-json-render/schema';

// Types only: these checks run when the spec compiles, not when it runs.
const catalog = schema.createCatalog({
  components: {
    Card: {
      props: z.object({ title: z.string().optional() }),
      slots: ['default'],
      description: 'A card',
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(['filled', 'text']).optional(),
        size: z.enum(['small', 'large']).default('small'),
      }),
      slots: [],
      description: 'A button',
    },
  },
  actions: {
    open: { params: z.object({ id: z.string() }), description: 'Open it' },
  },
});

describe('catalog type bridge', () => {
  it('derives a component props type from its Zod schema', () => {
    type ButtonProps = InferComponentProps<typeof catalog, 'Button'>;

    // `size` has a Zod default, so the inferred type calls it required even
    // though the renderer applies no defaults: the README says so.
    expectTypeOf<ButtonProps>().toEqualTypeOf<{
      label: string;
      variant?: 'filled' | 'text' | undefined;
      size: 'small' | 'large';
    }>();
    expectTypeOf<RenderContext<ButtonProps>['props']>().returns.toHaveProperty(
      'label',
    );
  });

  it('lists the catalog components and types action params', () => {
    expectTypeOf<keyof InferCatalogComponents<typeof catalog>>().toEqualTypeOf<
      'Card' | 'Button'
    >();
    expectTypeOf<InferActionParams<typeof catalog, 'open'>>().toEqualTypeOf<{
      id: string;
    }>();
  });

  it('rejects a component name the catalog does not have', () => {
    // @ts-expect-error — 'Chart' is not in the catalog
    type Missing = InferComponentProps<typeof catalog, 'Chart'>;
    expectTypeOf<Missing>().toBeNever();
  });
});
