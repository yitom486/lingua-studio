import * as React from 'react';
import { Slider as BaseSlider } from '@base-ui-components/react/slider';
import { cn } from '../../lib/utils.js';

export const Slider = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSlider.Root>
>(({ className, ...props }, ref) => (
  <BaseSlider.Root
    ref={ref}
    className={cn(
      'relative flex w-full touch-none select-none items-center cursor-pointer',
      className
    )}
    {...props}
  >
    <BaseSlider.Control className="relative flex h-2 w-full items-center rounded-full bg-stone-200 dark:bg-stone-800">
      <BaseSlider.Track className="relative h-full w-full rounded-full">
        <BaseSlider.Indicator className="absolute h-full rounded-full bg-amber-500 dark:bg-amber-600" />
        <BaseSlider.Thumb className="block h-4 w-4 rounded-full border-2 border-amber-600 bg-white shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" />
      </BaseSlider.Track>
    </BaseSlider.Control>
  </BaseSlider.Root>
));
Slider.displayName = 'Slider';
