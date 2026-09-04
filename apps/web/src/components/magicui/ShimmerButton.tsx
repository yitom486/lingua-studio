import React from 'react';

interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
}

export function ShimmerButton({
  shimmerColor = '#ffffff',
  className = '',
  children,
  disabled,
  ...props
}: ShimmerButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`group relative overflow-hidden rounded-xl bg-indigo-600 px-6 py-2.5 font-medium text-sm text-white shadow-sm transition-all duration-300 hover:bg-indigo-700 hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 cursor-pointer ${className}`}
      {...props}
    >
      <div
        className="absolute -inset-full top-0 block h-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent to-white/25 opacity-0 group-hover:animate-shine"
        style={{
          animationDuration: '1.5s',
        }}
      />
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
    </button>
  );
}
