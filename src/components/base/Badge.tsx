interface BadgeProps {
  children: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

export default function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  const variants = {
    default: 'bg-background-200 text-foreground-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-primary-100 text-primary-700',
  };

  const sizes = {
    sm: 'px-1.5 py-0 text-[11px]',
    md: 'px-2 py-0.5 text-xs',
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-md whitespace-nowrap ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
}