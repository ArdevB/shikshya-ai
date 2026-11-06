import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export interface Credential {
  email: string;
  temporaryPassword: string;
}

/**
 * New accounts get a temporary password that is shown here once and cannot be seen again.
 * Phase 3 adds email, which will send these directly to the person.
 */
export function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: Credential[];
  onClose: () => void;
}) {
  const copy = async () => {
    const text = credentials.map((c) => `${c.email}\t${c.temporaryPassword}`).join('\n');
    await navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Temporary {credentials.length === 1 ? 'password' : 'passwords'}</DialogTitle>
          <DialogDescription>
            Share {credentials.length === 1 ? 'this' : 'these'} securely. They will not be shown
            again, and a new password must be chosen at first login.
          </DialogDescription>
        </div>
        <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border text-sm">
          {credentials.map((credential) => (
            <li key={credential.email} className="p-3">
              <p className="break-all text-muted-foreground">{credential.email}</p>
              <code className="break-all font-mono font-semibold">
                {credential.temporaryPassword}
              </code>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => void copy()}>
            <Copy /> Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
