"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import { showNotification } from "@mantine/notifications";
import LoadingScreen from "@/app/components/LoadingScreen";

const ProtectedRoutes = ({ children }: { children: React.ReactNode }) => {
  const { userRole } = useRole();
  const router = useRouter();
  const pathname = usePathname();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    if (!userRole) {
      return;
    }

    const adminRoutes = /^\/admin/;
    const responsibleRoutes = /^\/responsible/;
    const producerRoutes = /^\/producer/;
    const templateRoutes = /^\/templates/;
    const reportRoutes = /^\/reports/;
    const templatesWithFiltersRoute = /^\/templates-with-filters/;

    if (
      (adminRoutes.test(pathname) && userRole !== "Administrador") ||
      (responsibleRoutes.test(pathname) && userRole !== "Responsable") ||
      (producerRoutes.test(pathname) && userRole !== "Productor") ||
      (templateRoutes.test(pathname) && !templatesWithFiltersRoute.test(pathname) && !["Administrador", "Responsable"].includes(userRole)) ||
      (reportRoutes.test(pathname) && !["Administrador", "Responsable"].includes(userRole))
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
  }, [userRole, pathname, router]);

  if (isVerifying || !userRole) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
};

export default ProtectedRoutes;
