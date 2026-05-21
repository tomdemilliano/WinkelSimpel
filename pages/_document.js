/**
 * pages/_document.js — Winkel Simpel
 *
 * Custom Document — voegt PWA meta tags toe aan elke pagina.
 * Zonder deze tags herkent de browser de app niet als installeerbare PWA.
 */

import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="nl">
      <Head>
        {/* Favicon */}
        <link rel="icon" href="/icons/icon-192.png" type="image/png" />

        {/* PWA manifest — verplicht voor installatie */}
        <link rel="manifest" href="/manifest.json" />

        {/* Theme color — Android Chrome adresbalk + splash screen */}
        <meta name="theme-color" content="#5B9BD5" />

        {/* Nunito font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />

        {/* iOS Safari PWA ondersteuning */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Winkel Simpel" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

        {/* Voorkom automatisch zoomen op input focus (mobiel) */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
