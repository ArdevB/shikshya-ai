import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/auth/AuthContext';
import { roleLabel } from '@/auth/roles';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function ProfilePage() {
  const user = useCurrentUser();
  const rows = [
    ['Name', `${user.firstName} ${user.lastName}`],
    ['Email', user.email],
    ['Phone', user.phone ?? 'Not set'],
    ['Role', roleLabel(user.role)],
  ] as const;

  return (
    <>
      <PageHeader title="Profile" />
      <Card className="max-w-lg">
        <CardContent className="pt-5">
          <dl className="divide-y text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-all text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/change-password">Change password</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
