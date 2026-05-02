// Pages-router fallback document. App Router handles all real routes; this
// only exists so Next's auto-generated /_error /404 /500 prerender doesn't
// crash on bundled <Html> from Next's default _document. Remove when Next
// stops emitting pages-router fallbacks alongside App Router.
import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
