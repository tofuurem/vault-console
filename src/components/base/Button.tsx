import type { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  loading?: boolean;
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  children,
  loading,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium whitespace-nowrap rounded-md cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-primary-500 text-background-50 hover:bg-primary-600 focus-visible:ring-primary-400',
    secondary: 'bg-background-100 text-foreground-800 hover:bg-background-200 border border-background-300 focus-visible:ring-primary-400',
    danger: 'bg-danger-600 text-on-danger hover:bg-danger-700 focus-visible:ring-danger-400',
    ghost: 'text-foreground-600 hover:bg-background-100 hover:text-foreground-900 focus-visible:ring-primary-400',
  };

  const sizes = {
    sm: 'h-11 px-3 text-xs gap-1.5 sm:h-7 sm:px-2.5',
    md: 'h-11 px-3 text-sm gap-1.5 sm:h-8',
    lg: 'h-11 px-4 text-sm gap-2 sm:h-9',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <i className="ri-loader-4-line animate-spin" />}
      {children}
    </button>
  );
}
