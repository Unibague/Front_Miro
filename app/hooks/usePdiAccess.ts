import { useRole } from "@/app/context/RoleContext";

// Roles con los que la asignación en el PDI abre "Mis proyectos PDI". El rol
// Usuario nunca ve el PDI, aunque la persona tenga proyectos asignados.
export const PDI_ASIGNACION_ROLES = ["Responsable", "Productor"];

// true si la asignación en el PDI da acceso con este rol activo.
export const asignacionPdiAplica = (pdiAsignado: boolean, userRole: string) =>
  pdiAsignado && PDI_ASIGNACION_ROLES.includes(userRole);

// Vistas del módulo PDI que puede otorgar un perfil de acceso.
export const PDI_VIEW_KEYS = [
  "pdi", "pdiResponsable", "pdiMineResponsable",
  "pdiDashboard", "pdiDashboardResponsable", "pdiForms", "pdiFormsResponsable",
  "pdiCharts", "pdiChartsResponsable",
];

/**
 * Acceso al módulo PDI.
 * - accesoPorRol: el rol (Administrador/Responsable) y el perfil le dan el
 *   módulo, como siempre.
 * - pdiAsignado: es líder/responsable de algo en el PDI (lo calcula el backend
 *   en /users/roles) y su rol activo es Responsable o Productor.
 * - soloMisProyectos: entra ÚNICAMENTE por estar asignado: puede ver y
 *   gestionar sus propios proyectos ("Mis proyectos PDI"), pero nada más del
 *   módulo (tablero, historial, presupuesto...).
 */
export function usePdiAccess() {
  const { userRole, viewPermissions, hasProfile, pdiAsignado: asignadoEnPdi } = useRole();
  const pdiAsignado = asignacionPdiAplica(asignadoEnPdi, userRole);
  const perfilDaPdi = PDI_VIEW_KEYS.some(
    (key) => Array.isArray(viewPermissions[key]) && viewPermissions[key].length > 0
  );

  const accesoPorRol =
    (userRole === "Administrador" || userRole === "Responsable") && (!hasProfile || perfilDaPdi);

  return {
    accesoPorRol,
    pdiAsignado,
    soloMisProyectos: !accesoPorRol && pdiAsignado,
    puedeEntrar: accesoPorRol || pdiAsignado,
  };
}
