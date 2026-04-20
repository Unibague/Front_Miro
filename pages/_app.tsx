import type { AppProps } from "next/app";

/**
 * Entrada mínima del router Pages (junto con pages/_error.tsx).
 * Evita estados rotos de Next en dev cuando solo existía _error sin _app.
 */
export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
