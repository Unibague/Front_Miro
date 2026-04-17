"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { Button } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";

const GoBackButton = () => {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/dashboard") return null;
  /* En date-review el botón vive en el Navbar */
  if (pathname?.startsWith("/date-review")) return null;

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
        backdropFilter: "blur(10px)",
      }}
    >
      <Button
        onClick={handleVolver}
        variant="light"
        color="blue"
        size="sm"
        leftSection={<IconArrowLeft size={16}/>}
      >
        Volver
      </Button>
    </div>
  );
};

export default GoBackButton;
