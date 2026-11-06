import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordBody, type LoginResponse } from '@shikshya/shared';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { homePathFor } from '@/auth/roles';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

const formSchema = changePasswordBody
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'The passwords do not match',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof formSchema>;

export function ChangePasswordPage() {
  const user = useCurrentUser();
  const { adoptSession } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      // Changing the password ends every session, this one included, so start a new one.
      const session = await api.post<LoginResponse>(
        '/auth/login',
        { email: user.email, password: newPassword },
        { skipRefresh: true },
      );
      adoptSession(session);
      toast.success('Your password has been changed');
      navigate(homePathFor(user.role), { replace: true });
    } catch (error) {
      setError('currentPassword', {
        message: error instanceof Error ? error.message : 'Could not change your password',
      });
    }
  });

  return (
    <>
      <PageHeader
        title="Change password"
        description={
          user.mustChangePassword
            ? 'You are using a temporary password. Choose your own to continue.'
            : undefined
        }
      />
      <Card className="max-w-lg">
        <CardContent className="pt-5">
          <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
            <FormField label="Current password" error={errors.currentPassword?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                {...register('currentPassword')}
              />
            </FormField>
            <FormField
              label="New password"
              error={errors.newPassword?.message}
              hint="At least 8 characters, with a letter and a number."
            >
              <Input type="password" autoComplete="new-password" {...register('newPassword')} />
            </FormField>
            <FormField label="Confirm new password" error={errors.confirmPassword?.message}>
              <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
            </FormField>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
