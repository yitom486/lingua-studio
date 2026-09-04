import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-amber-600 text-white shadow-xs hover:bg-amber-700',
        secondary:
          'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 hover:bg-stone-200',
        destructive:
          'border-transparent bg-rose-500 text-white shadow-xs hover:bg-rose-600',
        outline:
          'text-stone-900 dark:text-stone-100 border-stone-200 dark:border-stone-800',
        amber:
          'border-amber-500/30 bg-amber-500/15 text-amber-900 dark:text-amber-300 font-bold',
        emerald:
          'border-emerald-500/30 bg-emerald-500/15 text-emerald-900 dark:text-emerald-300 font-bold',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
