"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  Loader,
  MultiSelect,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconEdit,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useRole } from "@/app/context/RoleContext";

interface PositionPermission {
  position: string;
  usersCount: number;
  users?: PositionUser[];
  permissions: Record<string, string[]>;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

interface PositionUser {
  _id: string;
  identification: number;
  full_name: string;
  email: string;
  dep_code?: string;
  dependencyName?: string;
  isActive: boolean;
}

interface AccessProfile {
  _id: string;
  name: string;
  positions: string[];
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const HIDDEN_POSITION_NAMES = new Set(["N/A", "NADA", "PELAO"]);

const isVisiblePosition = (position: string) =>
  !HIDDEN_POSITION_NAMES.has(position.trim().toUpperCase());

const formatUpdatedAt = (value?: string | null) => {
  if (!value) return "Sin guardar";

  return new Date(value).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const apiMessage = error.response?.data?.error || error.response?.data?.message;
    return apiMessage || fallback;
  }

  return fallback;
};

export default function ProfilesManagementPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { userRole } = useRole();
  const [positions, setPositions] = useState<PositionPermission[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [accessProfiles, setAccessProfiles] = useState<AccessProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profilePositions, setProfilePositions] = useState<string[]>([]);
  const [positionSearchValue, setPositionSearchValue] = useState("");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const isAdmin = userRole === "Administrador";

  const visiblePositions = useMemo(
    () => positions.filter((position) => isVisiblePosition(position.position)),
    [positions]
  );

  const positionOptions = useMemo(
    () => visiblePositions.map((position) => ({ value: position.position, label: position.position })),
    [visiblePositions]
  );

  const fetchPositionPermissions = async () => {
    if (!apiUrl) return;

    setPositionsLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/users/position-view-permissions`);
      setPositions(response.data?.positions || []);
    } catch (error) {
      console.error("Error fetching position permissions:", error);
      showNotification({
        title: "Error",
        message: "No fue posible cargar los cargos disponibles.",
        color: "red",
      });
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  };

  const fetchAccessProfiles = async () => {
    if (!apiUrl) return;

    setProfilesLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/users/position-profiles`);
      setAccessProfiles(response.data?.profiles || []);
    } catch (error) {
      console.error("Error fetching profiles:", error);
      showNotification({
        title: "Error",
        message: "No fue posible cargar los perfiles creados.",
        color: "red",
      });
      setAccessProfiles([]);
    } finally {
      setProfilesLoading(false);
    }
  };

  useEffect(() => {
    fetchPositionPermissions();
    fetchAccessProfiles();
  }, [apiUrl]);

  const navigateToProfileViews = (profileId: string) => {
    router.push(`/configuracion/perfiles/vistas?perfil=${encodeURIComponent(profileId)}`);
  };

  const resetProfileForm = () => {
    setEditingProfileId(null);
    setProfileName("");
    setProfilePositions([]);
    setPositionSearchValue("");
  };

  const startProfileEdit = (profile: AccessProfile) => {
    setEditingProfileId(profile._id);
    setProfileName(profile.name);
    setProfilePositions(profile.positions || []);
    setPositionSearchValue("");
  };

  const handleSaveProfile = async () => {
    if (!apiUrl || !session?.user?.email) return;

    const normalizedName = profileName.trim();

    if (!normalizedName) {
      showNotification({
        title: "Nombre requerido",
        message: "Escribe un nombre para el perfil.",
        color: "yellow",
      });
      return;
    }

    if (profilePositions.length === 0) {
      showNotification({
        title: "Cargos requeridos",
        message: "Selecciona al menos un cargo para crear el perfil.",
        color: "yellow",
      });
      return;
    }

    setSavingProfile(true);
    try {
      const payload = {
        name: normalizedName,
        positions: profilePositions,
        adminEmail: session.user.email,
      };
      const config = {
        headers: { "user-email": session.user.email },
      };

      if (editingProfileId) {
        await axios.put(`${apiUrl}/users/position-profiles/${editingProfileId}`, payload, config);
      } else {
        await axios.post(`${apiUrl}/users/position-profiles`, payload, config);
      }

      await fetchAccessProfiles();
      resetProfileForm();
      showNotification({
        title: editingProfileId ? "Perfil actualizado" : "Perfil creado",
        message: "El perfil se guardó correctamente.",
        color: "teal",
      });
    } catch (error) {
      console.error("Error saving profile:", error);
      showNotification({
        title: "Error",
        message: getErrorMessage(error, "No fue posible guardar el perfil."),
        color: "red",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteProfile = async (profile: AccessProfile) => {
    if (!apiUrl || !session?.user?.email) return;

    const shouldDelete = window.confirm(`¿Eliminar el perfil ${profile.name}?`);
    if (!shouldDelete) return;

    setDeletingProfileId(profile._id);
    try {
      await axios.delete(`${apiUrl}/users/position-profiles/${profile._id}`, {
        data: { adminEmail: session.user.email },
        headers: { "user-email": session.user.email },
      });

      if (editingProfileId === profile._id) {
        resetProfileForm();
      }

      await fetchAccessProfiles();
      showNotification({
        title: "Perfil eliminado",
        message: "El perfil fue eliminado correctamente.",
        color: "teal",
      });
    } catch (error) {
      console.error("Error deleting profile:", error);
      showNotification({
        title: "Error",
        message: getErrorMessage(error, "No fue posible eliminar el perfil."),
        color: "red",
      });
    } finally {
      setDeletingProfileId(null);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Gestionar perfiles</Title>
            <Text c="dimmed" size="sm">
              Asigna por cargo que vistas puede ver, gestionar o administrar cada grupo de usuarios.
            </Text>
          </div>
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push("/configuracion")}>
            Volver
          </Button>
        </Group>

        {!isAdmin && (
          <Alert color="yellow" icon={<IconAlertCircle size={18} />}>
            Solo los administradores pueden guardar cambios de perfiles.
          </Alert>
        )}

        <Card withBorder radius="md" p="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={4}>{editingProfileId ? "Editar perfil" : "Crear perfil"}</Title>
                <Text size="sm" c="dimmed">
                  Nombra el perfil y selecciona los cargos que harán parte de ese grupo.
                </Text>
              </div>
              {editingProfileId && (
                <Button variant="subtle" leftSection={<IconX size={16} />} onClick={resetProfileForm}>
                  Cancelar edición
                </Button>
              )}
            </Group>

            <SimpleGrid cols={{ base: 1, md: 3 }}>
              <TextInput
                label="Nombre del perfil"
                placeholder="Ej: Comité académico"
                value={profileName}
                onChange={(event) => setProfileName(event.currentTarget.value)}
                disabled={!isAdmin}
              />
              <MultiSelect
                label="Cargos del perfil"
                placeholder="Selecciona cargos"
                data={positionOptions}
                value={profilePositions}
                searchValue={positionSearchValue}
                onSearchChange={setPositionSearchValue}
                onChange={(value) => {
                  const currentSearch = positionSearchValue;
                  setProfilePositions(value);
                  window.setTimeout(() => setPositionSearchValue(currentSearch), 0);
                }}
                searchable
                clearable
                disabled={!isAdmin}
              />
              <Group align="flex-end">
                <Button
                  fullWidth
                  leftSection={<IconPlus size={16} />}
                  onClick={handleSaveProfile}
                  loading={savingProfile}
                  disabled={!isAdmin}
                >
                  {editingProfileId ? "Guardar perfil" : "Crear perfil"}
                </Button>
              </Group>
            </SimpleGrid>
          </Stack>
        </Card>

        <Card withBorder radius="md" p="md">
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Title order={4}>Perfiles creados</Title>
                <Text size="sm" c="dimmed">
                  Cada perfil puede agrupar uno o varios cargos.
                </Text>
              </div>
              <Badge variant="light" color="blue">{accessProfiles.length}</Badge>
            </Group>

            <ScrollArea>
              <Table striped withTableBorder verticalSpacing="sm" style={{ minWidth: 760 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Perfil</Table.Th>
                    <Table.Th>Cargos</Table.Th>
                    <Table.Th>Última actualización</Table.Th>
                    <Table.Th>
                      <Center>Acciones</Center>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {profilesLoading ? (
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        <Center py="md">
                          <Loader size="sm" />
                        </Center>
                      </Table.Td>
                    </Table.Tr>
                  ) : accessProfiles.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        <Center py="md">
                          <Text c="dimmed">Aún no hay perfiles creados.</Text>
                        </Center>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    accessProfiles.map((profile) => (
                      <Table.Tr key={profile._id}>
                        <Table.Td>
                          <Text fw={700}>{profile.name}</Text>
                          {profile.createdBy && <Text size="xs" c="dimmed">Creado por {profile.createdBy}</Text>}
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4}>
                            {(profile.positions || []).map((position) => (
                              <Badge
                                key={`${profile._id}-${position}`}
                                variant="light"
                                color="gray"
                              >
                                {position}
                              </Badge>
                            ))}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{formatUpdatedAt(profile.updatedAt)}</Text>
                          {profile.updatedBy && <Text size="xs" c="dimmed">{profile.updatedBy}</Text>}
                        </Table.Td>
                        <Table.Td>
                          <Center>
                            <Group gap="xs">
                              <Button
                                size="xs"
                                variant="light"
                                leftSection={<IconEdit size={14} />}
                                onClick={() => navigateToProfileViews(profile._id)}
                                disabled={!isAdmin || (profile.positions || []).length === 0}
                              >
                                Gestionar vistas
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                leftSection={<IconEdit size={14} />}
                                onClick={() => startProfileEdit(profile)}
                                disabled={!isAdmin}
                              >
                                Editar
                              </Button>
                              <ActionIcon
                                variant="light"
                                color="red"
                                aria-label={`Eliminar perfil ${profile.name}`}
                                onClick={() => handleDeleteProfile(profile)}
                                loading={deletingProfileId === profile._id}
                                disabled={!isAdmin}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Group>
                          </Center>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Card>

      </Stack>

    </Container>
  );
}
