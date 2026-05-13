'use client';

import { Button } from '@mybizone/ui/button';
import { useState } from 'react';
import { downloadGstr3bPdfAction } from '../actions';

interface Props {
  fromDate: string;
  toDate: string;
}

function triggerDownload(base64: string, filename: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Gstr3bDownloadButton({ fromDate, toDate }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const result = await downloadGstr3bPdfAction({ fromDate, toDate });
      if ('error' in result) {
        setError(result.error);
      } else {
        triggerDownload(result.data, result.filename, result.mimeType);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={handleDownload} disabled={loading}>
        {loading ? 'Generating PDF...' : 'Download PDF'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
