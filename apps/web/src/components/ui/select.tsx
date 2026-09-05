import * as React from 'react';
import { Select as BaseSelect } from '@base-ui-components/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils.js';

const Select = BaseSelect.Root;
const SelectGroup = BaseSelect.Group;

const SelectValue = React.forwardRef<
  React.ComponentRef<typeof BaseSelect.Value>,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Value> & { placeholder?: string }
>(({ placeholder, children, ...props }, ref) => (
  <BaseSelect.Value ref={ref} {...props}>
    {(value) => (value ? (children || value) : placeholder || '')}
  </BaseSelect.Value>
));
SelectValue.displayName = 'SelectValue';

const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof BaseSelect.Trigger>,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Trigger>
>(({ className, children, ...props }, ref) => (
  <BaseSelect.Trigger
    ref={ref}
    className={cn(
      'flex h-9 w-full items-center justify-between rounded-xl border border-amber-900/20 dark:border-amber-500/20 bg-white dark:bg-[#211f1d] px-3 py-2 text-xs font-medium text-stone-900 dark:text-stone-100 shadow-xs ring-offset-background placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-all hover:border-amber-500/50',
      className
    )}
    {...props}
  >
    {children}
    <BaseSelect.Icon>
      <ChevronDown className="h-4 w-4 opacity-50 ml-1.5 shrink-0" />
    </BaseSelect.Icon>
  </BaseSelect.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Popup>
>(({ className, children, ...props }, ref) => (
  <BaseSelect.Portal>
    <BaseSelect.Positioner sideOffset={6} className="z-50 outline-none">
      <BaseSelect.Popup
        ref={ref}
        className={cn(
          'relative z-50 max-h-96 min-w-[10rem] overflow-hidden rounded-xl border border-amber-900/15 dark:border-amber-500/20 bg-[#faf9f6] dark:bg-[#1c1a17] p-1 text-stone-900 dark:text-stone-100 shadow-xl transition-all',
          className
        )}
        {...props}
      >
        <BaseSelect.List className="outline-none">
          {children}
        </BaseSelect.List>
      </BaseSelect.Popup>
    </BaseSelect.Positioner>
  </BaseSelect.Portal>
));
SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof BaseSelect.Item>,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Item>
>(({ className, children, ...props }, ref) => (
  <BaseSelect.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-xs outline-none transition-colors',
      // Base UI 用 data-highlighted；避免 amber-950 在深色弹出层上糊成一团
      'data-[highlighted]:bg-amber-100 data-[highlighted]:text-stone-900',
      'dark:data-[highlighted]:bg-stone-700 dark:data-[highlighted]:text-stone-50',
      'focus:bg-amber-100 focus:text-stone-900',
      'dark:focus:bg-stone-700 dark:focus:text-stone-50',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <BaseSelect.ItemIndicator className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center text-amber-600 dark:text-amber-400">
      <Check className="h-3.5 w-3.5" />
    </BaseSelect.ItemIndicator>
    <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
  </BaseSelect.Item>
));
SelectItem.displayName = 'SelectItem';

export {
  Select,
  SelectValue,
  SelectGroup,
  SelectTrigger,
  SelectContent,
  SelectItem,
};
