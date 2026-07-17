"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ActionIcon, Box, Container, Title, Text, ThemeIcon, Group, Button } from "@mantine/core";
import { IconArrowLeft, IconFolders, IconTemplate, IconReportAnalytics, IconUsersGroup } from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { showNotification } from "@mantine/notifications";
import { useRole } from "@/app/context/RoleContext";
import { usePeriod } from "@/app/context/PeriodContext";
import { paramId } from "@/app/utils/routeParams";
import ConsultaInfoSidebar from "../../components/ConsultaInfoSidebar";
import FileLibraryPanel from "../../components/FileLibraryPanel";

type Tab = "plantillas" | "informes";

// Carpeta de un ámbito: permite subir/consultar Plantillas (Excel) e Informes
// (Excel o PDF, con anexos), igual que la biblioteca general de "Consulta de
// Información", pero cada archivo queda etiquetado con este ámbito.
export default function AmbitoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const dimensionId = paramId(params) || "";
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { userRole } = useRole();
  const isAdmin = userRole === "Administrador";
  const { selectedPeriodId } = usePeriod();

  const [tab, setTab] = useState<Tab>((searchParams?.get("tab") as Tab) || "plantillas");
  const [dimensionName, setDimensionName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [addingSnies, setAddingSnies] = useState(false);
  // Si el Histórico SNIES ya se agregó antes a este ámbito, el botón se
  // oculta (no solo tras hacer clic: también al recargar la página).
  const [sniesAlreadyAdded, setSniesAlreadyAdded] = useState(false);
  const [checkingSniesAdded, setCheckingSniesAdded] = useState(true);

  const checkSniesAlreadyAdded = async () => {
    if (!session?.user?.email || !dimensionId) return;
    setCheckingSniesAdded(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/historico-docentes/list`, {
        params: { email: session.user.email, category: "plantillas", dimensionId },
      });
      const files = res.data?.files || [];
      setSniesAlreadyAdded(files.some((f: any) => !!f.cloned_from));
    } catch {
      setSniesAlreadyAdded(false);
    } finally {
      setCheckingSniesAdded(false);
    }
  };

  useEffect(() => {
    checkSniesAlreadyAdded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email, dimensionId]);

  const handleAddSniesAsTemplate = async () => {
    if (!session?.user?.email) return;
    setAddingSnies(true);
    try {
      const listRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/historico-docentes/list`, {
        params: { email: session.user.email, category: "snies" },
      });
      const sniesFile = (listRes.data?.files || [])[0];
      if (!sniesFile) {
        showNotification({ title: "Sin datos", message: "No hay un Histórico Docentes (SNIES) cargado todavía.", color: "yellow" });
        return;
      }
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/historico-docentes/${sniesFile._id}/clone-to-dimension`, {
        dimensionId,
        category: "plantillas",
        email: session.user.email,
        periodId: selectedPeriodId,
      });
      showNotification({ title: "Agregado", message: "El Histórico Docentes (SNIES) se agregó a este ámbito como plantilla.", color: "teal" });
      setTab("plantillas");
      setSniesAlreadyAdded(true);
      setRefreshKey((k) => k + 1);
    } catch {
      showNotification({ title: "Error", message: "No se pudo agregar el Histórico Docentes (SNIES) a este ámbito.", color: "red" });
    } finally {
      setAddingSnies(false);
    }
  };

  useEffect(() => {
    if (!dimensionId) return;
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/${dimensionId}`)
      .then((res) => setDimensionName(res.data?.name || ""))
      .catch(() => setDimensionName(""));
  }, [dimensionId]);

  useEffect(() => {
    const urlParams = new URLSearchParams(searchParams?.toString() ?? "");
    urlParams.set("tab", tab);
    window.history.replaceState(null, "", `?${urlParams.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <Box style={{ display: "flex", minHeight: "100vh" }}>
      <ConsultaInfoSidebar />
      <Box style={{ flex: 1, padding: 20 }}>
        <Container size="xl">
          <Group gap={10} mb="lg">
            <ActionIcon variant="subtle" onClick={() => router.push("/historico-docentes/ambitos")}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <ThemeIcon size={40} radius="xl" color="grape" variant="light">
              <IconFolders size={22} />
            </ThemeIcon>
            <div>
              <Title order={3}>Consulta de Información</Title>
              <Text size="xs" c="dimmed">{dimensionName || "Ámbito"} — sube y consulta sus Plantillas o Informes</Text>
            </div>
          </Group>

          <Group mb="lg" justify="space-between">
            <Group>
              <Button
                variant={tab === "plantillas" ? "filled" : "outline"}
                color="teal"
                leftSection={<IconTemplate size={16} />}
                onClick={() => setTab("plantillas")}
              >
                Plantillas
              </Button>
              <Button
                variant={tab === "informes" ? "filled" : "outline"}
                color="orange"
                leftSection={<IconReportAnalytics size={16} />}
                onClick={() => setTab("informes")}
              >
                Informes
              </Button>
            </Group>
            {isAdmin && tab === "plantillas" && !checkingSniesAdded && !sniesAlreadyAdded && (
              <Button
                variant="outline"
                color="violet"
                leftSection={<IconUsersGroup size={16} />}
                onClick={handleAddSniesAsTemplate}
                loading={addingSnies}
              >
                Agregar Histórico Docentes (SNIES)
              </Button>
            )}
          </Group>

          {dimensionId && <FileLibraryPanel key={`${tab}-${refreshKey}`} category={tab} dimensionId={dimensionId} />}
        </Container>
      </Box>
    </Box>
  );
}
