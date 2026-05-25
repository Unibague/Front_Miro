"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import { showNotification } from "@mantine/notifications";
import LoadingScreen from "@/app/components/LoadingScreen";

// Orden importa: las más específicas primero
const VIEW_PERMISSION_ROUTES: Array<{ key: string; pattern: RegExp }> = [
  { key: "publishedReports",          pattern: /^\/admin\/reports\/uploaded/ },
  { key: "producerReportsConfig",     pattern: /^\/admin\/reports\/producers/ },
  { key: "adminReports",              pattern: /^\/admin\/reports/ },
  { key: "adminTemplates",            pattern: /^\/admin\/templates/ },
  { key: "periods",                   pattern: /^\/admin\/periods/ },
  { key: "dimensions",                pattern: /^\/admin\/dimensions/ },
  { key: "dependencies",              pattern: /^\/admin\/dependencies/ },
  { key: "validations",               pattern: /^\/admin\/validations/ },
  { key: "users",                     pattern: /^\/admin\/users/ },
  { key: "profiles",                  pattern: /^\/configuracion\/perfiles/ },
  { key: "configuration",             pattern: /^\/configuracion/ },
  { key: "publishedTemplates",        pattern: /^\/templates\/published/ },
  { key: "producerTemplates",         pattern: /^\/producer\/templates/ },
  { key: "producerReports",           pattern: /^\/producer\/reports/ },
  { key: "responsibleReports",        pattern: /^\/responsible\/reports/ },
  { key: "producerReportsManagement", pattern: /^\/reportproducers$/ },
  { key: "templatesWithFilters",      pattern: /^\/templates-with-filters/ },
  { key: "supportTemplates",          pattern: /^\/apoyos-plantillas/ },
  { key: "snies",                     pattern: /^\/snies/ },
  { key: "cna",                       pattern: /^\/cna/ },
  { key: "pdiDashboard",              pattern: /^\/pdi\/dashboard/ },
  { key: "pdiForms",                  pattern: /^\/pdi\/formularios/ },
  { key: "pdiCharts",                 pattern: /^\/pdi\/graficas/ },
  { key: "pdiMine",                   pattern: /^\/pdi\/mis-indicadores/ },
  { key: "pdi",                       pattern: /^\/pdi$/ },
  { key: "dateReviewProgram",          pattern: /^\/processes-MEN\/program/ },
  { key: "dateReviewAdmin",            pattern: /^\/processes-MEN\/admin/ },
  { key: "dateReview",                 pattern: /^\/processes-MEN/ },
];

const FREE_ROUTES = /^\/(|dashboard|logs|traceability|operations|historico-docentes)(\/|$)/;

const ProtectedRoutes = ({ children }: { children: React.ReactNode }) => {
  const { userRole, viewPermissions, permissionsLoaded } = useRole();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isVerifying, setIsVerifying] = useState(true);

  const role = userRole?.trim() ? userRole : "Usuario";

  useEffect(() => {
    if (!permissionsLoaded) return;

    if (pathname.startsWith("/public")) {
      setIsVerifying(false);
      return;
    }

    // Rutas libres para todos
    if (FREE_ROUTES.test(pathname)) {
      setIsVerifying(false);
      return;
    }

    // Buscar la clave más específica que haga match con la ruta actual
    const matched = VIEW_PERMISSION_ROUTES.find(({ pattern }) => pattern.test(pathname));

    if (matched) {
      // Administrador pasa en todas las rutas EXCEPTO perfiles (requiere permiso explícito)
      if (role === "Administrador" && matched.key !== "profiles") {
        setIsVerifying(false);
        return;
      }

      const levels: string[] = Array.isArray(viewPermissions[matched.key])
        ? viewPermissions[matched.key]
        : [];
      if (levels.length > 0) {
        setIsVerifying(false);
        return;
      }
    } else {
      // Ruta no mapeada: Administrador siempre pasa, otros también (rutas internas)
      if (role === "Administrador") {
        setIsVerifying(false);
        return;
      }
      setIsVerifying(false);
      return;
    }

    showNotification({
      title: "Acceso denegado",
      message: "No tienes permiso para acceder a esta página",
      color: "red",
    });
    router.replace("/dashboard");
  }, [role, viewPermissions, permissionsLoaded, pathname, router]);

  if (!permissionsLoaded || isVerifying) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
};

export default ProtectedRoutes;
