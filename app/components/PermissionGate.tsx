"use client";

import { useViewPermission } from "@/app/hooks/useViewPermission";

interface PermissionGateProps {
  viewKey: string;
  require?: "canView" | "canManage";
  /** Si true, renderiza los children pero deshabilitados (pasa disabled=true). Si false, no renderiza nada */
  disableInstead?: boolean;
  children: React.ReactNode;
}

/**
 * Envuelve contenido que requiere un nivel de permiso específico.
 * - require="canView" (default): muestra si tiene cualquier permiso
 * - require="canManage": muestra solo si tiene Gestionar o Administrar
 * - disableInstead=true: en vez de ocultar, pasa disabled=true al hijo
 */
export default function PermissionGate({
  viewKey,
  require = "canManage",
  disableInstead = false,
  children,
}: PermissionGateProps) {
  const { canView, canManage } = useViewPermission(viewKey);
  const hasPermission = require === "canManage" ? canManage : canView;

  if (hasPermission) return <>{children}</>;

  if (disableInstead) {
    return (
      <span style={{ pointerEvents: "none", opacity: 0.4 }}>
        {children}
      </span>
    );
  }

  return null;
}
