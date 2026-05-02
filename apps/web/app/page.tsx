import { Button } from '@mybizone/ui/button';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">MyBizOne</h1>
        <p className="text-lg text-muted-foreground">
          Inventory + POS for Indian shops. Free to start. Works on your phone.
        </p>
      </div>
      <div className="flex gap-4">
        <Button asChild size="lg">
          <Link href="/signup">Get started</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </main>
  );
}
