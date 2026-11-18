"use client";
import { SessionProvider, getSession } from "next-auth/react";
import axios from "axios";

// Bypass ngrok browser interstitial in local dev when API is tunneled
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_API_URL?.includes("ngrok")) {
  axios.defaults.headers.common["ngrok-skip-browser-warning"] = "true";
}

// Toda llamada a la API de Miró lleva el correo de la sesión en el encabezado
// "user-email": el backend lo usa para saber quién consulta (ver
// Back_Miro/middleware/auth.js). La sesión se guarda un minuto para no pedirla
// en cada petición.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const SESSION_CACHE_MS = 60 * 1000;
let sessionEmail: { value: Promise<string | null>; at: number } | null = null;

const getSessionEmail = () => {
  if (!sessionEmail || Date.now() - sessionEmail.at > SESSION_CACHE_MS) {
    sessionEmail = {
      value: getSession().then((session) => session?.user?.email ?? null).catch(() => null),
      at: Date.now(),
    };
  }
  return sessionEmail.value;
};

const isApiRequest = (url = "") =>
  Boolean(API_URL) && (url.startsWith(API_URL) || (API_URL.startsWith("/") && url.startsWith("/api/backend")));

if (typeof window !== "undefined") {
  axios.interceptors.request.use(async (config) => {
    if (isApiRequest(config.url) && !config.headers["user-email"]) {
      const email = await getSessionEmail();
      if (email) config.headers["user-email"] = email;
    }
    return config;
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
