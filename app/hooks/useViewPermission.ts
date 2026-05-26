import { useRole } from "@/app/context/RoleContext";

/**
 * Retorna { canView, canManage } para una vista específica.
 * - canView: tiene al menos "Ver", "Gestionar" o "Administrar"
 * - canManage: tiene "Gestionar" o "Administrar"
 *
 * Solo el rol "Administrador" tiene acceso total sin restricciones.
 * Todos los demás roles (incluidos Responsable y Productor) respetan
 * los viewPermissions configurados en su perfil de cargo.
 * Si el cargo no tiene viewPermissions configurados, se usa el rol como fallback.
 */
export function useViewPermission(viewKey: string) {
  const { userRole, viewPermissions } = useRole();

  // Administrador siempre tiene todo
  if (userRole === "Administrador") {
    return { canView: true, canManage: true };
  }

  const levels: string[] = Array.isArray(viewPermissions[viewKey])
    ? viewPermissions[viewKey]
    : [];

  // Si tiene permisos configurados por cargo, usarlos
  if (levels.length > 0) {
    const canView = true;
    const canManage = levels.includes("Gestionar") || levels.includes("Administrar");
    return { canView, canManage };
  }

  // Sin permisos por cargo configurados: fallback por rol
  // Responsable y Productor pueden ver y gestionar sus propias vistas
  const roleCanManage = ["Responsable", "Productor"].includes(userRole);
  return { canView: roleCanManage, canManage: roleCanManage };
}
