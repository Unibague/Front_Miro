"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon, Container, Text, Paper, Group, Badge, ThemeIcon, Title,
} from "@mantine/core";
import { IconArrowLeft, IconCurrencyDollar } from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/context/RoleContext";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import PdiPresupuesto from "../components/PdiPresupuesto";

const isAdmin = (role: string) => role === "Administrador";

export default function PresupuestoPage() {
  const router = useRouter();
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
        <Container fluid px="xl" py="xl">

          <Group justify="space-between" mb="lg">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon size={42} radius="xl" color="violet" variant="light">
                <IconCurrencyDollar size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Presupuesto PDI</Title>
                <Text size="sm" c="dimmed">Ejecución presupuestal del Plan de Desarrollo Institucional</Text>
              </div>
            </Group>
            <Badge color="violet" variant="filled" radius="sm" size="lg">
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
