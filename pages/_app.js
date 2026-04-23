/**
 * pages/_app.js — Winkel Simpel
 */

import { useEffect } from 'react';
import '../styles/globals.css';
import InstallPrompt from '../components/InstallPrompt';
import { registerServiceWorker } from '../lib/register-sw';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <>
      <Component {...pageProps} />
      <InstallPrompt />
    </>
  );
}
