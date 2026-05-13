'use client';

import { Button } from '@mybizone/ui/button';
import { useState } from 'react';
import { downloadGstr1ExcelAction, downloadGstr1JsonAction } from '../actions';

interface Props {
  financialYear: string;
  fromDate: string;
  toDate: string;
  businessGstin: string;
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

export function Gstr1DownloadButtons({ financialYear, fromDate, toDate, businessGstin }: Props) {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [loadingJson, setLoadingJson] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = { financialYear, fromDate, toDate, businessGstin };

  async function handleExcel() {
    setLoadingExcel(true);
    setError(null);
    try {
      const result = await downloadGstr1ExcelAction(params);
      if ('error' in result) {
        setError(result.error);
      } else {
        triggerDownload(result.data, result.filename, result.mimeType);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setLoadingExcel(false);
    }
  }

  async function handleJson() {
    setLoadingJson(true);
    setError(null);
    try {
      const result = await downloadGstr1JsonAction(params);
      if ('error' in result) {
        setError(result.error);
      } else {
        triggerDownload(result.data, result.filename, result.mimeType);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setLoadingJson(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={handleExcel} disabled={loadingExcel}>
        {loadingExcel ? 'Generating...' : 'Download Excel'}
      </Button>
      <Button onClick={handleJson} disabled={loadingJson} variant="outline">
        {loadingJson ? 'Generating...' : 'Download JSON (GSTN format)'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
