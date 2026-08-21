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

  // Si el usuario no tiene ningún perfil asignado (viewPermissions vacío),
  // usar acceso completo basado en el rol para no bloquear el sistema
  const hasProfile = Object.keys(viewPermissions).length > 0;
  if (!hasProfile) {
    return { canView: true, canManage: true };
  }

  const levels: string[] = Array.isArray(viewPermissions[viewKey])
    ? viewPermissions[viewKey]
    : [];

  // Si tiene permisos configurados por cargo para esta vista, usarlos
  if (levels.length > 0) {
    const canManage = levels.includes("Gestionar") || levels.includes("Administrar");
    return { canView: true, canManage };
  }

  // Tiene perfil pero sin permiso para esta vista específica → sin acceso
  return { canView: false, canManage: false };
}
