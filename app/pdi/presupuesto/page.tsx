"use client";

import { useState, useEffect } from "react";
import {
  Container, Text, Paper, Group, Badge,
} from "@mantine/core";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/context/RoleContext";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import PdiPresupuesto from "../components/PdiPresupuesto";

const isAdmin = (role: string) => role === "Administrador";

export default function PresupuestoPage() {
  const { userRole } = useRole();
  const admin = isAdmin(userRole);
  const { data: session } = useSession();
  const [userMacroInfo, setUserMacroInfo] = useState<{ codes: string[]; isLider: boolean } | null>(null);

  useEffect(() => {
    if (admin || !session?.user?.email) return;
    axios.get<{ codes: string[]; isLider: boolean }>(PDI_ROUTES.presupuestoUserMacros(session.user.email))
      .then((res) => setUserMacroInfo({ codes: res.data.codes, isLider: res.data.isLider }))
      .catch(() => setUserMacroInfo({ codes: [], isLider: false }));
  }, [admin, session?.user?.email]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="xl" py="xl">

          <Group gap={10} mb="xl" align="center">
            <Text fw={900} size="2rem" lh={1}>Presupuesto PDI</Text>
            <Badge color="violet" variant="filled" radius="sm" size="xl" style={{ fontSize: 18, padding: "4px 14px" }}>
              {new Date().getFullYear()}
            </Badge>
          </Group>
          <Paper withBorder radius="lg" p="md"
            style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.05), rgba(255,255,255,0.98) 58%)" }}>
            <PdiPresupuesto
              defaultMacroCodes={
                !admin && userMacroInfo?.isLider
                  ? userMacroInfo.codes
                  : undefined
              }
              restrictToCodes={
                !admin && userMacroInfo !== null && !userMacroInfo.isLider
                  ? userMacroInfo.codes
                  : undefined
              }
            />
          </Paper>

        </Container>
      </div>
    </div>
  );
}
