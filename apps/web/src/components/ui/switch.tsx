import * as React from 'react';
import { Switch as BaseSwitch } from '@base-ui-components/react/switch';
import { cn } from '../../lib/utils.js';

export const Switch = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseSwitch.Root>
>(({ className, ...props }, ref) => (
  <BaseSwitch.Root
    ref={ref}
    className={cn(
      'relative inline-flex h-[1.125rem] w-8 shrink-0 items-center rounded-full border border-transparent transition-colors cursor-pointer',
      'data-[checked]:bg-amber-500 data-[checked]:border-amber-600/40',
      'data-[unchecked]:bg-stone-300 dark:data-[unchecked]:bg-stone-700',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    <BaseSwitch.Thumb className="pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out data-[checked]:translate-x-[15px] data-[unchecked]:translate-x-[2px]" />
  </BaseSwitch.Root>
));
Switch.displayName = 'Switch';
