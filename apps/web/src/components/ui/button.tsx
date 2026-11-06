import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[transform,background-color,border-color,box-shadow,color] duration-200 ease-spring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary-strong text-primary-foreground shadow-glow-primary hover:-translate-y-px hover:bg-primary-dark',
        accent:
          'bg-accent-strong text-accent-foreground shadow-glow-accent hover:-translate-y-px hover:bg-accent-dark',
        outline:
          'border bg-card text-foreground shadow-sm hover:border-primary/50 hover:bg-primary-soft',
        ghost: 'text-foreground hover:bg-primary-soft',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:-translate-y-px hover:bg-destructive/90',
        link: 'text-primary-dark underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        default: 'h-11 px-4',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={ref}
        // Default to "button" so a stray button inside a form does not submit it.
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
