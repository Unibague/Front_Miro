"use client";
import { SessionProvider } from "next-auth/react";
import axios from "axios";

// Bypass ngrok browser interstitial in local dev when API is tunneled
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_API_URL?.includes("ngrok")) {
  axios.defaults.headers.common["ngrok-skip-browser-warning"] = "true";
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
