"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import { showNotification } from "@mantine/notifications";
import LoadingScreen from "@/app/components/LoadingScreen";
import { asignacionPdiAplica } from "@/app/hooks/usePdiAccess";

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
  { key: "dateReviewResponsible",      pattern: /^\/processes-MEN\/responsible/ },
  { key: "dateReviewTasks",            pattern: /^\/processes-MEN\/tasks/ },
  { key: "dateReview",                 pattern: /^\/processes-MEN/ },
];

// Algunas llaves de permiso están separadas por rol aunque compartan la misma
// ruta (p. ej. "pdi" para Administrador y "pdiResponsable" para Responsable):
// este mapa resuelve, para cada llave "base" de VIEW_PERMISSION_ROUTES, cuál
// es la llave real que le corresponde revisar a cada rol distinto del dueño
// original de la llave.
const ROLE_KEY_VARIANTS: Record<string, Partial<Record<string, string>>> = {
  publishedTemplates:        { Responsable: "publishedTemplatesResponsable" },
  templatesWithFilters:      { Productor: "templatesWithFiltersProductor" },
  producerReportsManagement: { Responsable: "producerReportsManagementResponsable" },
  snies:                     { Productor: "sniesProductor" },
  cna:                       { Productor: "cnaProductor" },
  pdi:                       { Responsable: "pdiResponsable" },
  pdiMine:                   { Responsable: "pdiMineResponsable" },
  pdiDashboard:              { Responsable: "pdiDashboardResponsable" },
  pdiForms:                  { Responsable: "pdiFormsResponsable" },
  pdiCharts:                 { Responsable: "pdiChartsResponsable" },
};

/** Rutas que un Administrador siempre puede abrir, aunque su perfil no las incluya. */
const ADMIN_RECOVERY_KEYS = ["configuration", "profiles"];

const FREE_ROUTES = /^\/(|dashboard|logs|traceability|operations|historico-docentes)(\/|$)/;

/** Rutas accesibles por rol sin necesitar permiso de cargo explícito */
const ROLE_ROUTES: Array<{ roles: string[]; pattern: RegExp }> = [];

/** Rutas exclusivas de un rol: cualquier otro rol queda bloqueado aunque su perfil tenga la vista. */
const ROLE_ONLY_ROUTES: Array<{ roles: string[]; pattern: RegExp }> = [
  // Procesos de calidad MEN: solo Administrador (oculto para Responsable y Productor).
  { roles: ["Administrador"], pattern: /^\/processes-MEN/ },
];

const ProtectedRoutes = ({ children }: { children: React.ReactNode }) => {
  const { userRole, viewPermissions, permissionsLoaded, pdiAsignado, hasProfile } = useRole();
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

    const roleOnlyRoute = ROLE_ONLY_ROUTES.find(({ pattern }) => pattern.test(pathname));
    if (roleOnlyRoute && !roleOnlyRoute.roles.includes(role)) {
      showNotification({
        title: "Acceso denegado",
        message: "No tienes permiso para acceder a esta página",
        color: "red",
      });
      router.replace("/dashboard");
      return;
    }

    // Rutas accesibles por rol sin permiso de cargo
    const roleRoute = ROLE_ROUTES.find(({ pattern }) => pattern.test(pathname));
    if (roleRoute) {
      if (roleRoute.roles.includes(role)) {
        setIsVerifying(false);
        return;
      }
    }

    // Buscar la clave más específica que haga match con la ruta actual
    const matched = VIEW_PERMISSION_ROUTES.find(({ pattern }) => pattern.test(pathname));

    if (matched) {
      // Administrador sin perfil pasa en todas las rutas. Con perfil, su perfil
      // también lo limita, salvo Configuración y Gestionar perfiles: nunca se
      // bloquean para un Administrador, para que un perfil mal armado siempre
      // se pueda corregir (mismo resguardo que ADMIN_RECOVERY_KEYS del inicio).
      if (role === "Administrador" && (!hasProfile || ADMIN_RECOVERY_KEYS.includes(matched.key))) {
        setIsVerifying(false);
        return;
      }

      // Líder/responsable de algo en el PDI: entra a SUS proyectos (y sus
      // subpáginas de evidencias/evaluación) con cualquier rol y perfil.
      if (matched.key === "pdiMine" && asignacionPdiAplica(pdiAsignado, role)) {
        setIsVerifying(false);
        return;
      }

      // Sin perfil asignado → acceso completo basado en el rol
      if (!hasProfile) {
        setIsVerifying(false);
        return;
      }

      const levels: string[] = Array.isArray(viewPermissions[matched.key])
        ? viewPermissions[matched.key]
        : [];
      const altKey = ROLE_KEY_VARIANTS[matched.key]?.[role];
      const altLevels: string[] = altKey && Array.isArray(viewPermissions[altKey])
        ? viewPermissions[altKey]
        : [];
      if (levels.length > 0 || altLevels.length > 0) {
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
  }, [role, viewPermissions, permissionsLoaded, pdiAsignado, hasProfile, pathname, router]);

  if (!permissionsLoaded || isVerifying) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
};

export default ProtectedRoutes;
