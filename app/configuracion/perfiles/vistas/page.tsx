"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Container,
  Group,
  Loader,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBriefcase,
  IconDeviceFloppy,
  IconId,
  IconShield,
  IconTrash,
  IconUserPlus,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useRole } from "@/app/context/RoleContext";

interface ViewOption {
  key: string;
  label: string;
  path: string;
  group: string;
}

interface PositionUser {
  _id: string;
  identification: number;
  full_name: string;
  email: string;
  position?: string;
  dep_code?: string;
  dependencyName?: string;
  isActive: boolean;
}

interface PositionPermission {
  position: string;
  usersCount: number;
  users?: PositionUser[];
  permissions: Record<string, string[]>;
  updatedBy?: string | null;
  updatedAt?: string | null;
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

const DEFAULT_PROFILES = ["Ver", "Administrar", "Gestionar"];

const countPermissionChecks = (permissions: Record<string, string[]>) =>
  Object.values(permissions || {}).reduce((total, profiles) => total + profiles.length, 0);

const mergePositionPermissions = (positions: PositionPermission[]) => {
  return positions.reduce<Record<string, string[]>>((mergedPermissions, position) => {
    Object.entries(position.permissions || {}).forEach(([viewKey, levels]) => {
      const currentLevels = mergedPermissions[viewKey] || [];
      const cleanLevels = Array.isArray(levels) ? levels : [];
      mergedPermissions[viewKey] = Array.from(new Set([...currentLevels, ...cleanLevels]));
    });

    return mergedPermissions;
  }, {});
};

const serializePermissions = (permissions: Record<string, string[]>) => {
  const entries = Object.entries(permissions || {})
    .map(([viewKey, levels]) => [viewKey, [...(levels || [])].sort()])
    .sort(([firstKey], [secondKey]) => String(firstKey).localeCompare(String(secondKey)));

  return JSON.stringify(entries);
};

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

export default function PositionViewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { userRole } = useRole();

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const isAdmin = userRole === "Administrador";
  const profileId = searchParams?.get("perfil")?.trim() || "";
  const position = searchParams?.get("cargo")?.trim() || "";
  const isProfileMode = Boolean(profileId);

  const [permissionLevels, setPermissionLevels] = useState<string[]>(DEFAULT_PROFILES);
  const [views, setViews] = useState<ViewOption[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<AccessProfile | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<PositionPermission[]>([]);
  const [selectedPositionPermissions, setSelectedPositionPermissions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [removingIdentification, setRemovingIdentification] = useState<number | null>(null);
  const [identification, setIdentification] = useState("");

  const groupedViews = useMemo(() => {
    return views.reduce<Record<string, ViewOption[]>>((result, view) => {
      const group = view.group || "General";
      result[group] = [...(result[group] || []), view];
      return result;
    }, {});
  }, [views]);

  const managedPositionNames = useMemo(
    () => selectedPositions.map((positionItem) => positionItem.position).filter(Boolean),
    [selectedPositions]
  );

  const activeUsers = useMemo(
    () =>
      selectedPositions.flatMap((positionItem) =>
        (positionItem.users || [])
          .filter((user) => user.isActive)
          .map((user) => ({ ...user, position: positionItem.position }))
      ),
    [selectedPositions]
  );

  const latestUpdatedAt = useMemo(
    () =>
      selectedPositions.reduce<string | null>((latestDate, positionItem) => {
        if (!positionItem.updatedAt) return latestDate;
        if (!latestDate) return positionItem.updatedAt;

        return new Date(positionItem.updatedAt).getTime() > new Date(latestDate).getTime()
          ? positionItem.updatedAt
          : latestDate;
      }, null),
    [selectedPositions]
  );

  const hasMixedPermissions = useMemo(() => {
    if (selectedPositions.length <= 1) return false;

    const permissionSnapshots = new Set(
      selectedPositions.map((positionItem) => serializePermissions(positionItem.permissions || {}))
    );

    return permissionSnapshots.size > 1;
  }, [selectedPositions]);

  const managementTitle = isProfileMode
    ? selectedProfile?.name || "Perfil"
    : selectedPositions[0]?.position || position;

  const fetchPositionPermissions = useCallback(async () => {
    if (!apiUrl || (!profileId && !position)) return;

    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/users/position-view-permissions`, {
        params: profileId ? { profileId } : { position },
      });
      const loadedPositions = (response.data?.positions || []).map((positionItem: PositionPermission) => ({
        ...positionItem,
        users: positionItem.users || [],
        permissions: positionItem.permissions || {},
      }));
      const fallbackPositions =
        loadedPositions.length > 0 || profileId
          ? loadedPositions
          : [
              {
                position,
                usersCount: 0,
                users: [],
                permissions: {},
              },
            ];

      setPermissionLevels(response.data?.levels || DEFAULT_PROFILES);
      setViews(response.data?.views || []);
      setSelectedProfile(response.data?.profile || null);
      setSelectedPositions(fallbackPositions);
      setSelectedPositionPermissions(mergePositionPermissions(fallbackPositions));
    } catch (error) {
      console.error("Error fetching position permissions:", error);
      showNotification({
        title: "Error",
        message: isProfileMode
          ? "No fue posible cargar el perfil seleccionado."
          : "No fue posible cargar el cargo seleccionado.",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, [apiUrl, isProfileMode, position, profileId]);

  useEffect(() => {
    fetchPositionPermissions();
  }, [fetchPositionPermissions]);

  const toggleViewPermission = (viewKey: string, profile: string) => {
    setSelectedPositionPermissions((current) => {
      const currentProfiles = current[viewKey] || [];
      const nextProfiles = currentProfiles.includes(profile)
        ? currentProfiles.filter((item) => item !== profile)
        : [...currentProfiles, profile];
      const nextPermissions = { ...current };

      if (nextProfiles.length === 0) {
        delete nextPermissions[viewKey];
      } else {
        nextPermissions[viewKey] = nextProfiles;
      }

      return nextPermissions;
    });
  };

  const setLevelForAllViews = (profile: string, checked: boolean) => {
    setSelectedPositionPermissions((current) => {
      const nextPermissions = { ...current };

      views.forEach((view) => {
        const currentProfiles = nextPermissions[view.key] || [];
        const nextProfiles = checked
          ? Array.from(new Set([...currentProfiles, profile]))
          : currentProfiles.filter((item) => item !== profile);

        if (nextProfiles.length === 0) {
          delete nextPermissions[view.key];
        } else {
          nextPermissions[view.key] = nextProfiles;
        }
      });

      return nextPermissions;
    });
  };

  const handleSavePermissions = async () => {
    if (managedPositionNames.length === 0 || !session?.user?.email || !apiUrl) return;

    setSaving(true);
    try {
      const response = await axios.put(
        `${apiUrl}/users/position-view-permissions`,
        {
          ...(isProfileMode ? { profileId } : { position: managedPositionNames[0] }),
          permissions: selectedPositionPermissions,
          adminEmail: session.user.email,
        },
        {
          headers: { "user-email": session.user.email },
        }
      );

      const updatedPositions: PositionPermission[] = response.data?.positions || [];
      setSelectedPositions((currentPositions) =>
        currentPositions.map((currentPosition) => {
          const updatedPosition = updatedPositions.find(
            (positionItem) => positionItem.position === currentPosition.position
          );

          return {
            ...currentPosition,
            permissions: response.data?.permissions || selectedPositionPermissions,
            updatedBy: updatedPosition?.updatedBy || response.data?.updatedBy || currentPosition.updatedBy,
            updatedAt: updatedPosition?.updatedAt || response.data?.updatedAt || currentPosition.updatedAt,
          };
        })
      );
      showNotification({
        title: "Permisos actualizados",
        message: isProfileMode
          ? "Los permisos se aplicaron a todos los cargos del perfil."
          : "Los permisos del cargo se guardaron correctamente.",
        color: "teal",
      });
    } catch (error) {
      console.error("Error updating position permissions:", error);
      showNotification({
        title: "Error",
        message: getErrorMessage(
          error,
          isProfileMode
            ? "No fue posible actualizar los permisos del perfil."
            : "No fue posible actualizar los permisos del cargo."
        ),
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddUser = async () => {
    const cedula = identification.trim();
    if ((!isProfileMode && !managedPositionNames[0]) || !session?.user?.email || !apiUrl || !cedula) return;

    setAddingUser(true);
    try {
      await axios.post(
        `${apiUrl}/users/position-members`,
        {
          ...(isProfileMode ? { profileId } : { position: managedPositionNames[0] }),
          identification: cedula,
          adminEmail: session.user.email,
        },
        {
          headers: { "user-email": session.user.email },
        }
      );

      setIdentification("");
      await fetchPositionPermissions();
      showNotification({
        title: "Usuario agregado",
        message: isProfileMode
          ? "La persona fue asociada al perfil usando su cargo actual."
          : "La persona activa fue asociada al cargo seleccionado.",
        color: "teal",
      });
    } catch (error) {
      console.error("Error adding user to position:", error);
      showNotification({
        title: "Error",
        message: getErrorMessage(
          error,
          isProfileMode
            ? "No fue posible agregar la persona al perfil."
            : "No fue posible agregar la persona al cargo."
        ),
        color: "red",
      });
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveUser = async (user: PositionUser) => {
    const userPosition = user.position || (!isProfileMode ? managedPositionNames[0] : "");
    if (!userPosition || !session?.user?.email || !apiUrl) return;

    const shouldRemove = window.confirm(
      isProfileMode
        ? `¿Quitar el cargo ${userPosition} del perfil ${managementTitle}?`
        : `¿Quitar a ${user.full_name} del cargo ${userPosition}?`
    );
    if (!shouldRemove) return;

    setRemovingIdentification(user.identification);
    try {
      await axios.delete(`${apiUrl}/users/position-members`, {
        data: {
          ...(isProfileMode ? { profileId } : { position: userPosition }),
          identification: user.identification,
          adminEmail: session.user.email,
        },
        headers: { "user-email": session.user.email },
      });

      await fetchPositionPermissions();
      showNotification({
        title: "Usuario removido",
        message: isProfileMode
          ? "El cargo actual de la persona fue retirado del perfil."
          : "La persona fue retirada del cargo correctamente.",
        color: "teal",
      });
    } catch (error) {
      console.error("Error removing user from position:", error);
      showNotification({
        title: "Error",
        message: getErrorMessage(
          error,
          isProfileMode
            ? "No fue posible retirar la persona del perfil."
            : "No fue posible retirar la persona del cargo."
        ),
        color: "red",
      });
    } finally {
      setRemovingIdentification(null);
    }
  };

  if (!profileId && !position) {
    return (
      <Container size="xl" py="xl">
        <Stack gap="md">
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push("/configuracion/perfiles")}>
            Volver a perfiles
          </Button>
          <Alert color="yellow" icon={<IconAlertCircle size={18} />}>
            Selecciona un perfil desde Gestionar perfiles para administrar sus vistas.
          </Alert>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Gestionar vistas</Title>
            <Text c="dimmed" size="sm">
              {isProfileMode
                ? `Permisos y personas activas del perfil ${managementTitle}.`
                : `Permisos y personas activas del cargo ${managementTitle}.`}
            </Text>
            {isProfileMode && managedPositionNames.length > 0 && (
              <Group gap={4} mt={6}>
                {managedPositionNames.map((positionName) => (
                  <Badge key={positionName} variant="light" color="gray">
                    {positionName}
                  </Badge>
                ))}
              </Group>
            )}
          </div>
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push("/configuracion/perfiles")}>
            Volver
          </Button>
        </Group>

        {!isAdmin && (
          <Alert color="yellow" icon={<IconAlertCircle size={18} />}>
            Solo los administradores pueden guardar permisos o cambiar personas.
          </Alert>
        )}

        {loading && selectedPositions.length === 0 ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Card withBorder radius="md" p="md">
                <Group justify="space-between">
                  <div>
                    <Text size="sm" c="dimmed">{isProfileMode ? "Perfil" : "Cargo"}</Text>
                    <Title order={4}>{managementTitle}</Title>
                    {isProfileMode && (
                      <Text size="xs" c="dimmed">{managedPositionNames.length} cargos vinculados</Text>
                    )}
                  </div>
                  <IconBriefcase size={34} />
                </Group>
              </Card>
              <Card withBorder radius="md" p="md">
                <Group justify="space-between">
                  <div>
                    <Text size="sm" c="dimmed">Personas activas</Text>
                    <Title order={3}>{activeUsers.length}</Title>
                  </div>
                  <IconUsersGroup size={34} />
                </Group>
              </Card>
              <Card withBorder radius="md" p="md">
                <Group justify="space-between">
                  <div>
                    <Text size="sm" c="dimmed">Checks activos</Text>
                    <Title order={3}>{countPermissionChecks(selectedPositionPermissions)}</Title>
                    <Text size="xs" c="dimmed">{formatUpdatedAt(latestUpdatedAt)}</Text>
                  </div>
                  <IconShield size={34} />
                </Group>
              </Card>
            </SimpleGrid>

            <Card withBorder radius="md" p="md">
              <Stack gap="md">
                <Group justify="space-between" align="flex-end">
                  <div>
                    <Title order={4}>{isProfileMode ? "Personas activas del perfil" : "Personas activas del cargo"}</Title>
                    <Text size="sm" c="dimmed">
                      {isProfileMode
                        ? "Incluye todas las personas activas que pertenecen a los cargos del perfil."
                        : "Agrega una persona activa al cargo usando su cédula."}
                    </Text>
                  </div>
                  <Group align="flex-end">
                    <TextInput
                      label="Cédula"
                      placeholder="Número de cédula"
                      leftSection={<IconId size={16} />}
                      value={identification}
                      onChange={(event) => setIdentification(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleAddUser();
                        }
                      }}
                      inputMode="numeric"
                      disabled={!isAdmin}
                    />
                    <Button
                      leftSection={<IconUserPlus size={16} />}
                      onClick={handleAddUser}
                      loading={addingUser}
                      disabled={!isAdmin || !identification.trim()}
                    >
                      Agregar
                    </Button>
                  </Group>
                </Group>

                <ScrollArea>
                  <Table striped withTableBorder verticalSpacing="sm" style={{ minWidth: 760 }}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Cédula</Table.Th>
                        <Table.Th>Persona</Table.Th>
                        {isProfileMode && <Table.Th>Cargo</Table.Th>}
                        <Table.Th>Dependencia</Table.Th>
                        <Table.Th>Estado</Table.Th>
                        <Table.Th>
                          <Center>Acción</Center>
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {activeUsers.length === 0 ? (
                        <Table.Tr>
                          <Table.Td colSpan={isProfileMode ? 6 : 5}>
                            <Center py="md">
                              <Text c="dimmed">
                                {isProfileMode
                                  ? "No hay personas activas asociadas a los cargos de este perfil."
                                  : "No hay personas activas asociadas a este cargo."}
                              </Text>
                            </Center>
                          </Table.Td>
                        </Table.Tr>
                      ) : (
                        activeUsers.map((user) => (
                          <Table.Tr key={`${user._id}-${user.position || ""}`}>
                            <Table.Td>{user.identification}</Table.Td>
                            <Table.Td>
                              <Text fw={600}>{user.full_name}</Text>
                              <Text size="xs" c="dimmed">{user.email}</Text>
                            </Table.Td>
                            {isProfileMode && (
                              <Table.Td>
                                <Badge variant="light" color="gray">{user.position}</Badge>
                              </Table.Td>
                            )}
                            <Table.Td>
                              <Text size="sm">{user.dependencyName || user.dep_code || "Sin dependencia"}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge color="teal" variant="light">Activo</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Center>
                                <Tooltip label={isProfileMode ? "Quitar cargo del perfil" : "Quitar del cargo"}>
                                  <ActionIcon
                                    variant="light"
                                    color="red"
                                    aria-label={`Quitar a ${user.full_name}`}
                                    onClick={() => handleRemoveUser(user)}
                                    loading={removingIdentification === user.identification}
                                    disabled={!isAdmin}
                                  >
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                </Tooltip>
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

            <Card withBorder radius="md" p="md">
              <Stack gap="md">
                <Group justify="space-between">
                  <div>
                    <Title order={4}>Permisos de vistas</Title>
                    <Text size="sm" c="dimmed">
                      Ver permite consultar, Gestionar permite operar procesos y Administrar permite configurar.
                    </Text>
                  </div>
                  <Badge variant="light" color="blue">
                    {countPermissionChecks(selectedPositionPermissions)} checks activos
                  </Badge>
                </Group>

                <Alert color="blue" icon={<IconAlertCircle size={18} />}>
                  {isProfileMode
                    ? "Marca las acciones permitidas para este perfil. Al guardar, se aplican a todos sus cargos."
                    : "Marca las acciones permitidas para este cargo y guarda los cambios al finalizar."}
                </Alert>

                {isProfileMode && hasMixedPermissions && (
                  <Alert color="yellow" icon={<IconAlertCircle size={18} />}>
                    Algunos cargos del perfil tienen permisos distintos. Al guardar, todos quedaran con la seleccion actual.
                  </Alert>
                )}

                <Group justify="space-between">
                  <Group gap="xs">
                    {permissionLevels.map((profile) => {
                      const checkedViews = views.filter((view) => selectedPositionPermissions[view.key]?.includes(profile)).length;
                      const allChecked = views.length > 0 && checkedViews === views.length;

                      return (
                        <Checkbox
                          key={`all-${profile}`}
                          label={`Todo ${profile}`}
                          checked={allChecked}
                          indeterminate={checkedViews > 0 && !allChecked}
                          onChange={(event) => setLevelForAllViews(profile, event.currentTarget.checked)}
                          disabled={!isAdmin}
                        />
                      );
                    })}
                  </Group>
                  <Button
                    variant="light"
                    color="red"
                    leftSection={<IconTrash size={16} />}
                    onClick={() => setSelectedPositionPermissions({})}
                    disabled={!isAdmin}
                  >
                    Limpiar
                  </Button>
                </Group>

                <ScrollArea h="60vh" offsetScrollbars>
                  <Table withTableBorder verticalSpacing="sm" style={{ minWidth: 760 }}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Vista</Table.Th>
                        {permissionLevels.map((profile) => (
                          <Table.Th key={profile}>
                            <Center>{profile}</Center>
                          </Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {Object.entries(groupedViews).map(([group, groupViews]) => (
                        <Fragment key={group}>
                          <Table.Tr key={`${group}-header`}>
                            <Table.Td colSpan={permissionLevels.length + 1} bg="var(--mantine-color-gray-light)">
                              <Text size="sm" fw={700}>{group}</Text>
                            </Table.Td>
                          </Table.Tr>
                          {groupViews.map((view) => (
                            <Table.Tr key={view.key}>
                              <Table.Td>
                                <Text fw={600}>{view.label}</Text>
                              </Table.Td>
                              {permissionLevels.map((profile) => (
                                <Table.Td key={`${view.key}-${profile}`}>
                                  <Center>
                                    <Checkbox
                                      aria-label={`${profile} ${view.label}`}
                                      checked={selectedPositionPermissions[view.key]?.includes(profile) || false}
                                      onChange={() => toggleViewPermission(view.key, profile)}
                                      disabled={!isAdmin}
                                    />
                                  </Center>
                                </Table.Td>
                              ))}
                            </Table.Tr>
                          ))}
                        </Fragment>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>

                <Group justify="flex-end">
                  <Button
                    leftSection={<IconDeviceFloppy size={16} />}
                    onClick={handleSavePermissions}
                    loading={saving}
                    disabled={!isAdmin || managedPositionNames.length === 0}
                  >
                    Guardar permisos
                  </Button>
                </Group>
              </Stack>
            </Card>
          </>
        )}
      </Stack>
    </Container>
  );
}
