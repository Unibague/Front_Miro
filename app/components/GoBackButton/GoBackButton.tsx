"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { isProcessesMenOrLegacyPath } from "@/app/processes-MEN/config/routes";

const GoBackButton = () => {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/dashboard") return null;
  /* En processes-MEN el botón vive en el Navbar */
  if (isProcessesMenOrLegacyPath(pathname)) return null;
  if (pathname?.startsWith("/date-review")) return null;
  if (pathname?.startsWith("/pdi")) return null;

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
          onClick={() => router.back()}
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
