"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import { showNotification } from "@mantine/notifications";
import LoadingScreen from "@/app/components/LoadingScreen";

const ProtectedRoutes = ({ children }: { children: React.ReactNode }) => {
  const { userRole } = useRole();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isVerifying, setIsVerifying] = useState(true);

  /* Rol efectivo: evita quedarse en “cargando” si en algún flujo userRole llega vacío */
  const role = userRole?.trim() ? userRole : "Usuario";

  useEffect(() => {
    const adminRoutes = /^\/admin/;
    const responsibleRoutes = /^\/responsible/;
    const producerRoutes = /^\/producer/;
    const templateRoutes = /^\/templates/;
    const reportRoutes = /^\/reports/;
    const managementProducerReportsRoute = /^\/reportproducers$/;
    const templatesWithFiltersRoute = /^\/templates-with-filters/;
    const templateDetailRoute = /^\/templates\/uploaded\/[^/]+$/;

    if (
      (adminRoutes.test(pathname) && role !== "Administrador") ||
      (responsibleRoutes.test(pathname) && role !== "Responsable") ||
      (producerRoutes.test(pathname) && role !== "Productor") ||
      (templateRoutes.test(pathname) &&
        !templatesWithFiltersRoute.test(pathname) &&
        !templateDetailRoute.test(pathname) &&
        !["Administrador", "Responsable"].includes(role)) ||
      ((reportRoutes.test(pathname) || managementProducerReportsRoute.test(pathname)) &&
        !["Administrador", "Responsable", "Productor"].includes(role))
    ) {
      showNotification({
        title: "Acceso denegado",
        message: "No tienes permiso para acceder a esta página",
        color: "red",
      });
      router.replace("/dashboard");
    } else {
      setIsVerifying(false);
    }
  }, [role, pathname, router]);

  if (isVerifying) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
};

export default ProtectedRoutes;
