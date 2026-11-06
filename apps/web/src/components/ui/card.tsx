import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border bg-card text-card-foreground', className)} {...props} />
);

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />
);

export const CardTitle = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('text-lg font-semibold', className)} {...props}>
    {children}
  </h2>
);

export const CardDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-muted-foreground', className)} {...props} />
);

export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-5 pt-0', className)} {...props} />
);
