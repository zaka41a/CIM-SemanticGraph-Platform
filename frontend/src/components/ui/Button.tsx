import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ElementType } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * The single button of the platform.
 *
 * Variants map to the semantic palette and nothing else:
 * amber for the one primary action of a view, navy for everything neutral,
 * red only for destructive intent. Never introduce a new colour here.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ElementType;
  iconRight?: ElementType;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-500 text-primary-950 font-semibold hover:bg-accent-400 ' +
    'border border-accent-500 hover:border-accent-400',
  secondary:
    'bg-primary-800 text-neutral-200 hover:bg-primary-700 hover:text-white ' +
    'border border-primary-600/50 hover:border-primary-500',
  ghost:
    'bg-transparent text-neutral-400 hover:text-white hover:bg-white/5 ' +
    'border border-transparent',
  danger:
    'bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200 ' +
    'border border-red-500/30 hover:border-red-500/50',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2 text-sm gap-2 rounded-lg',
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 13, md: 15 };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    fullWidth = false,
    disabled,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const iconPx = ICON_SIZE[size];

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-medium whitespace-nowrap',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary-900',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconPx} className="animate-spin" />
      ) : (
        Icon && <Icon size={iconPx} />
      )}
      {children}
      {IconRight && !loading && <IconRight size={iconPx} className="opacity-60" />}
    </button>
  );
});

export default Button;
