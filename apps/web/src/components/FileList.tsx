import type { StoredFile } from '@shikshya/shared';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/lib/api';

const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Downloads go through the API with the user's token, so access rules apply to every file. */
export function FileList({ files, basePath }: { files: StoredFile[]; basePath: string }) {
  if (files.length === 0) return null;
  return (
    <ul className="space-y-1">
      {files.map((file) => (
        <li key={file.id}>
          <Button
            variant="link"
            size="sm"
            className="h-auto min-h-9 max-w-full justify-start whitespace-normal px-0 text-left"
            onClick={() =>
              downloadFile(`${basePath}/files/${file.id}`, file.name).catch((error: Error) =>
                toast.error(error.message),
              )
            }
          >
            <Download />
            <span className="break-all">
              {file.name} <span className="font-normal">({sizeLabel(file.size)})</span>
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
