import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-xs font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-amber-500 text-stone-950 font-bold shadow-xs hover:bg-amber-600',
        destructive:
          'bg-rose-500 text-white shadow-xs hover:bg-rose-600',
        outline:
          'border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-[#1f1d1b] hover:bg-stone-100 dark:hover:bg-stone-800 hover:border-amber-500/40 text-stone-700 dark:text-stone-300',
        secondary:
          'bg-stone-200/80 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-300/80 dark:hover:bg-stone-700',
        ghost:
          'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300',
        link:
          'text-amber-700 dark:text-amber-400 underline-offset-4 hover:underline',
        amber:
          'bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-300 hover:bg-amber-500/25',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-2xl px-6 text-sm',
        icon: 'h-9 w-9 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
