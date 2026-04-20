"use client";

import { useEffect } from "react";

/** Sin Mantine: si el proveedor o estilos fallan, este boundary sigue mostrando algo legible. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error en la aplicación:", error);
  }, [error]);

  const msg = error.message || "Error inesperado. Puedes reintentar o volver al inicio.";
  const isDevNoise =
    msg.includes("missing required error") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Loading chunk");

  return (
    <div
      style={{
        minHeight: "40vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: "1.15rem", marginBottom: 12 }}>Algo salió mal</h1>
      <p style={{ color: "#495057", fontSize: "0.9rem", textAlign: "center", maxWidth: 440 }}>
        {isDevNoise
          ? "La aplicación tuvo un fallo al cargar. Prueba «Reintentar» o recarga la página (a veces pasa al guardar archivos con el servidor en marcha)."
          : msg}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          borderRadius: 8,
          border: "none",
          background: "#228be6",
          color: "#fff",
          cursor: "pointer",
          fontSize: "0.9rem",
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
