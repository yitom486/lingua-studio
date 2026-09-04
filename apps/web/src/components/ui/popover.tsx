import * as React from 'react';
import { Popover as BasePopover } from '@base-ui-components/react/popover';
import { cn } from '../../lib/utils.js';

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverPortal = BasePopover.Portal;
export const PopoverClose = BasePopover.Close;

export const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Popup> & {
    sideOffset?: number;
    align?: 'start' | 'center' | 'end';
  }
>(({ className, sideOffset = 6, align = 'center', children, ...props }, ref) => (
  <BasePopover.Portal>
    <BasePopover.Positioner sideOffset={sideOffset} align={align} className="z-50 outline-none">
      <BasePopover.Popup
        ref={ref}
        className={cn(
          'z-50 w-72 rounded-2xl border border-amber-900/15 dark:border-amber-500/20 bg-[#faf9f6] dark:bg-[#1a1816] p-4 text-stone-900 dark:text-stone-100 shadow-xl outline-none transition-all',
          className
        )}
        {...props}
      >
        {children}
      </BasePopover.Popup>
    </BasePopover.Positioner>
  </BasePopover.Portal>
));
PopoverContent.displayName = 'PopoverContent';
