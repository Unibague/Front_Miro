"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon,
  Box,
  Container,
  Title,
  Text,
  SimpleGrid,
  Paper,
  Group,
  ThemeIcon,
  Loader,
  Center,
  TextInput,
  Badge,
} from "@mantine/core";
import { IconFolder, IconFolders, IconSearch, IconArrowLeft } from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ConsultaInfoSidebar from "../components/ConsultaInfoSidebar";

interface DimensionOption {
  _id: string;
  name: string;
}

// Landing de "Información enviada por Ámbitos": muestra TODOS los ámbitos
// como carpetas en el centro. Al entrar a uno se elige la pestaña de
// Plantillas o Informes (ver app/historico-docentes/ambito/[id]/page.tsx).
export default function AmbitosCarpetasPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [dimensions, setDimensions] = useState<DimensionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!session?.user?.email) return;
    let active = true;
    setLoading(true);
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/user/${encodeURIComponent(session.user.email)}`)
      .then((res) => {
        if (!active) return;
        const data: DimensionOption[] = Array.isArray(res.data) ? res.data : [];
        setDimensions([...data].sort((a, b) => a.name.localeCompare(b.name, "es")));
      })
      .catch(() => {
        if (active) setDimensions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.email]);

  const filteredDimensions = dimensions.filter((dimension) =>
    dimension.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <Box style={{ display: "flex", minHeight: "100vh" }}>
      <ConsultaInfoSidebar />
      <Box style={{ flex: 1, padding: 20 }}>
        <Container size="xl">
          <Group gap={10} mb="lg">
            <ActionIcon variant="subtle" onClick={() => router.push("/dashboard?view=gestion")}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <ThemeIcon size={40} radius="xl" color="grape" variant="light">
              <IconFolders size={22} />
            </ThemeIcon>
            <div>
              <Title order={3}>Consulta de Información</Title>
              <Text size="xs" c="dimmed">Información enviada por Ámbitos — selecciona uno para ver sus Plantillas o Informes</Text>
            </div>
          </Group>

          <TextInput
            placeholder="Buscar ámbito..."
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            mb="lg"
            style={{ maxWidth: 360 }}
          />

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : filteredDimensions.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {dimensions.length === 0 ? "No tienes ámbitos asignados." : "No se encontraron ámbitos con ese nombre."}
            </Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              {filteredDimensions.map((dimension) => (
                <Paper
                  key={dimension._id}
                  withBorder
                  radius="md"
                  p="md"
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/historico-docentes/ambito/${dimension._id}?tab=plantillas`)}
                >
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon size={44} radius="md" color="violet" variant="light">
                      <IconFolder size={22} />
                    </ThemeIcon>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={700} lineClamp={2}>{dimension.name}</Text>
                      <Badge size="xs" variant="light" color="grape" mt={4}>Ámbito</Badge>
                    </Box>
                  </Group>
                </Paper>
              ))}
            </SimpleGrid>
          )}
        </Container>
      </Box>
    </Box>
  );
}
