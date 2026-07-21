import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: string;
  monospace?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, monospace, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && <label className="text-xs font-medium text-foreground-700">{label}</label>}
        <div className="relative">
          {icon && (
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-400">
              <i className={`${icon} text-sm`} />
            </div>
          )}
          <input
            ref={ref}
            className={`w-full h-8 px-2.5 text-sm rounded-md border border-background-300 bg-background-50
              text-foreground-900 placeholder:text-foreground-400
              focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400/30
              disabled:opacity-50 disabled:cursor-not-allowed
              ${monospace ? 'font-mono' : ''}
              ${icon ? 'pl-8' : ''}
              ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-400/30' : ''}
              ${className}`}
            {...props}
          />
        </div>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  monospace?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, monospace, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && <label className="text-xs font-medium text-foreground-700">{label}</label>}
        <textarea
          ref={ref}
          className={`w-full px-2.5 py-1.5 text-sm rounded-md border border-background-300 bg-background-50
            text-foreground-900 placeholder:text-foreground-400 resize-vertical
            focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400/30
            disabled:opacity-50 disabled:cursor-not-allowed
            ${monospace ? 'font-mono' : ''}
            ${error ? 'border-red-400 focus:border-red-400' : ''}
            ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';