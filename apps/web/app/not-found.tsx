import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold">Not found</h1>
      <p className="text-muted-foreground">That page doesn't exist.</p>
      <Link href="/" className="underline">
        Go home
      </Link>
    </main>
  );
}
