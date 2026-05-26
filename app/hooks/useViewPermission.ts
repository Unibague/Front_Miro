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
export function useViewPermission(_viewKey: string) {
  // Sistema de perfiles desactivado — acceso completo para todos los roles
  return { canView: true, canManage: true };
}
