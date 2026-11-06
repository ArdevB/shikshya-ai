import { useId, type ReactElement, type ReactNode } from 'react';
import { cloneElement } from 'react';

/** A label, its control and any error message, wired together for screen readers. */
export function FormField({
  label,
  error,
  hint,
  children,
}: {
  label: ReactNode;
  error?: string;
  hint?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': message ? messageId : undefined,
      })}
      {message && (
        <p
          id={messageId}
          className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {message}
        </p>
      )}
    </div>
  );
}
