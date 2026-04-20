import type { NextPageContext } from "next";

interface ErrorPageProps {
  statusCode?: number;
}

/**
 * Página de error del router Pages. Next la usa como respaldo cuando falla el render
 * y evita el mensaje técnico "missing required error components" en desarrollo.
 */
function ErrorPage({ statusCode }: ErrorPageProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        padding: 24,
        background: "#f8f9fa",
      }}
    >
      <h1 style={{ fontSize: "1.25rem", marginBottom: 8 }}>Algo salió mal</h1>
      <p style={{ color: "#495057", fontSize: "0.95rem", textAlign: "center", maxWidth: 420 }}>
        {statusCode
          ? `No se pudo cargar correctamente esta vista (código ${statusCode}). Puedes recargar o volver atrás.`
          : "Hubo un error al mostrar esta página. Prueba a recargar."}
      </p>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") window.location.reload();
        }}
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
        Recargar página
      </button>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err && "statusCode" in err ? Number(err.statusCode) : 404;
  return { statusCode };
};

export default ErrorPage;
