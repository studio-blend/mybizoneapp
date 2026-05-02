// Pages-router fallback error page. App Router's error.tsx + global-error.tsx
// own real error UI. This stub exists only to satisfy Next's pages-router
// /_error generation in monorepo + transpilePackages setups.
function ErrorPage({ statusCode }: { statusCode: number }) {
  return (
    <div style={{ padding: '4rem 1rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <h1>{statusCode || 'Error'}</h1>
      <p>Something went wrong.</p>
    </div>
  );
}

ErrorPage.getInitialProps = ({
  res,
  err,
}: { res?: { statusCode: number }; err?: { statusCode: number } }) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return { statusCode };
};

export default ErrorPage;
