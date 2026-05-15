"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";

const GoBackButton = () => {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/dashboard") return null;
  if (pathname?.startsWith("/date-review")) return null;
  if (pathname?.startsWith("/pdi")) return null;
  if (pathname?.startsWith("/historico-docentes")) return null;

  const handleVolver = () => {
    router.back();
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
