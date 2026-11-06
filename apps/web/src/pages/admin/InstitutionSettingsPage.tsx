import { zodResolver } from '@hookform/resolvers/zod';
import { institutionSettingsBody, type InstitutionSettingsBody } from '@shikshya/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

/** Reads an image so it can be sent as text. Rejects anything over the API's limit. */
export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 500 * 1024) {
      reject(new Error('Please use an image under 500 KB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read this file'));
    reader.readAsDataURL(file);
  });
}

export function InstitutionSettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['settings', 'institution'],
    queryFn: () => api.get<InstitutionSettingsBody>('/settings/institution'),
  });
  const [logo, setLogo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InstitutionSettingsBody>({
    // The installed resolver types do not model fields with defaults.
    resolver: zodResolver(institutionSettingsBody) as unknown as Resolver<InstitutionSettingsBody>,
  });

  useEffect(() => {
    if (query.data) {
      reset(query.data);
      setLogo(query.data.logoDataUrl ?? null);
    }
  }, [query.data, reset]);

  const chooseLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    readImageFile(file)
      .then(setLogo)
      .catch((error: Error) => toast.error(error.message));
  };

  const submit = handleSubmit(async (values) => {
    try {
      await api.put('/settings/institution', { ...values, logoDataUrl: logo });
      toast.success('Saved. New PDFs will use these details.');
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    }
  });

  if (query.isPending) return <LoadingRows />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  return (
    <>
      <PageHeader
        title="Institution settings"
        description="These appear on marksheets, receipts and ID cards."
      />
      <Card className="max-w-lg">
        <CardContent className="pt-5">
          <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
            <FormField label="Name" error={errors.name?.message}>
              <Input {...register('name')} />
            </FormField>
            <FormField label="Address" error={errors.address?.message}>
              <Input {...register('address')} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Phone" error={errors.phone?.message}>
                <Input type="tel" {...register('phone')} />
              </FormField>
              <FormField label="Email" error={errors.email?.message}>
                <Input type="email" {...register('email')} />
              </FormField>
            </div>
            <FormField label="Principal's name" error={errors.principalName?.message}>
              <Input {...register('principalName')} />
            </FormField>
            <FormField label="Logo" hint="PNG or JPG, under 500 KB.">
              <Input
                type="file"
                accept="image/png,image/jpeg"
                className="pt-2"
                onChange={chooseLogo}
              />
            </FormField>
            {logo && (
              <div className="flex items-center gap-3">
                <img
                  src={logo}
                  alt="Current logo"
                  className="size-16 rounded-md border object-contain"
                />
                <Button variant="outline" size="sm" onClick={() => setLogo(null)}>
                  Remove logo
                </Button>
              </div>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
