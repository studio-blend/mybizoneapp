import { Button } from '@mybizone/ui/button';
import Link from 'next/link';
import { SegmentBuilder } from './_components/segment-builder';

export const dynamic = 'force-dynamic';

export default function CmsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">CMS</h1>
          <p className="text-sm text-muted-foreground">
            Segment customers and launch WhatsApp campaigns.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/cms/campaigns">Campaign history</Link>
        </Button>
      </div>

      <SegmentBuilder />
    </div>
  );
}
