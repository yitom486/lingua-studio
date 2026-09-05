import * as React from 'react';
import { cn } from '../../lib/utils.js';

interface CollapsibleContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

export function Collapsible({
  open,
  onOpenChange,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange }}>
      <div data-state={open ? 'open' : 'closed'} className={className}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

export const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, onClick, children, ...props }, ref) => {
  const ctx = React.useContext(CollapsibleContext);
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={ctx?.open ?? false}
      className={cn('cursor-pointer', className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) ctx?.onOpenChange(!ctx.open);
      }}
      {...props}
    >
      {children}
    </button>
  );
});
CollapsibleTrigger.displayName = 'CollapsibleTrigger';

export function CollapsibleContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx?.open) return null;
  return <div className={className}>{children}</div>;
}
