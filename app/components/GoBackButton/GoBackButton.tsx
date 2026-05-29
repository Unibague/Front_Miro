"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { isProcessesMenOrLegacyPath } from "@/app/processes-MEN/config/routes";
import { useUnsavedChanges } from "@/app/context/UnsavedChangesContext";

const GoBackButton = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { confirmNavigation } = useUnsavedChanges();

  if (pathname === "/" || pathname === "/dashboard") return null;
  /* En processes-MEN el botón vive en el Navbar */
  if (isProcessesMenOrLegacyPath(pathname)) return null;
  if (pathname?.startsWith("/date-review")) return null;
  if (pathname?.startsWith("/pdi")) return null;
  if (pathname?.startsWith("/historico-docentes")) return null;

  const handleVolver = () => {
    confirmNavigation(() => router.back());
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 63,
        left: 16,
        zIndex: 1000,
      }}
    >
      <Tooltip label="Volver" withArrow position="right">
        <ActionIcon
          onClick={handleVolver}
          variant="light"
          color="blue"
          size="lg"
        >
          <IconArrowLeft size={18} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
};

export default GoBackButton;
