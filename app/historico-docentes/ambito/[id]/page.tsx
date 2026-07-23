"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ActionIcon, Box, Container, Title, Text, ThemeIcon, Group, Button } from "@mantine/core";
import { IconArrowLeft, IconFolders, IconTemplate, IconReportAnalytics } from "@tabler/icons-react";
import axios from "axios";
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

  const [tab, setTab] = useState<Tab>((searchParams?.get("tab") as Tab) || "plantillas");
  const [dimensionName, setDimensionName] = useState("");

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

          {dimensionId && (
            <FileLibraryPanel
              key={tab}
              category={tab}
              dimensionId={dimensionId}
              tabs={
                <Group gap="xs">
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
              }
            />
          )}
        </Container>
      </Box>
    </Box>
  );
}
