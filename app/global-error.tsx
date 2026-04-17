"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 480, margin: "48px auto" }}>
        <h1 style={{ fontSize: 20 }}>Error en la aplicación</h1>
        <p style={{ color: "#666", fontSize: 14 }}>{error.message || "Algo falló al cargar la página."}</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: 16,
            padding: "8px 16px",
            cursor: "pointer",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#228be6",
            color: "#fff",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
