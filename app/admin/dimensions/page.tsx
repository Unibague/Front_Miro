"use client";

import { useEffect, useState } from "react";
import { Container, Table, Button, Modal, TextInput, Group, Pagination, Center, Select, MultiSelect, Text, Badge, Stack, Loader, ScrollArea, Tooltip } from "@mantine/core";
import { IconSettings, IconTrash, IconCirclePlus, IconDeviceFloppy, IconCancel, IconArrowBigUpFilled, IconArrowBigDownFilled, IconArrowsTransferDown, IconChevronDown, IconChevronUp, IconTemplate } from "@tabler/icons-react";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { useSort } from "../../hooks/useSort";
import { useSession } from "next-auth/react";
import { useViewPermission } from "@/app/hooks/useViewPermission";
import { useRouter } from "next/navigation";
import { usePeriod } from "@/app/context/PeriodContext";

interface Dimension {
  _id: string;
  name: string;
  responsible: Dependency;
  producers: Dependency[];
}

interface Dependency {
  _id: string;
  dep_code: string;
  name: string;
  responsible: string;
  visualizers?: string[]
}

interface TemplateInfo {
  _id: string;
  name: string;
  producers: { _id: string; dep_code: string; name: string }[];
  responsible_producers: { _id: string; dep_code: string; name: string }[];
  fecha_final?: string | null;
  loaded_dep_codes?: string[];
  loaded_data?: { dependency: string; send_by?: { full_name: string }; loaded_date?: string }[];
}

const AdminDimensionsPage = () => {
  const { data: session } = useSession();
  const { canManage } = useViewPermission("dimensions");
  const router = useRouter();
  const { selectedPeriodId, availablePeriods } = usePeriod();
  const [modalPeriodId, setModalPeriodId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [opened, setOpened] = useState(false);
  const [confirmDeleteModalOpened, setConfirmDeleteModalOpened] = useState(false);
  const [selectedDimension, setSelectedDimension] = useState<Dimension | null>(null);
  const [dimensionToDelete, setDimensionToDelete] = useState<Dimension | null>(null);
  const [allDependencies, setAllDependencies] = useState<Dependency[]>([]);
  const [name, setName] = useState("");
  const [responsible, setResponsible] = useState<Dependency | null>(null);
  const [selectedProducers, setSelectedProducers] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [templatesModalOpened, setTemplatesModalOpened] = useState(false);
  const [templatesModalDimension, setTemplatesModalDimension] = useState<Dimension | null>(null);
  const [dimensionTemplates, setDimensionTemplates] = useState<TemplateInfo[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedDependencyFilter, setSelectedDependencyFilter] = useState<string | null>(null);
  const { sortedItems: sortedDimensions, handleSort, sortConfig } = useSort<Dimension>(dimensions, { key: null, direction: "asc" });

  const fetchDimensions = async (page: number, search: string, dependencyFilter?: string) => {
    try {
      const params: any = { page, limit: 10, search, _t: Date.now() };
      if (dependencyFilter) {
        const selectedDep = allDependencies.find(dep => dep._id === dependencyFilter);
        if (selectedDep?.visualizers && selectedDep.visualizers.length > 0) {
          params.email = selectedDep.visualizers[0];
        } else {
          params.email = session?.user?.email;
        }
      } else {
        params.email = session?.user?.email;
      }
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/all`, {
        params,
      });
      if (response.data) {
        const dimensions = response.data.dimensions || [];
        setDimensions([...dimensions]);
        setTotalPages(response.data.pages || 1);
      }
    } catch (error) {
      console.error("Error fetching dimensions:", error);
      setDimensions([]);
    }
  };

  const fetchDependencies = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all/${session?.user?.email}`)
      setAllDependencies(response.data);
    } catch (error) {
      console.error("Error fetching dependencies:", error);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchDependencies();
    }
  }, [session]);

  useEffect(() => {
    if (session?.user?.email) {
      fetchDimensions(page, search, selectedDependencyFilter || undefined);
    }
  }, [page, session]);

  useEffect(() => {
    if (session?.user?.email) {
      setPage(1);
      fetchDimensions(1, search, selectedDependencyFilter || undefined);
    }
  }, [selectedDependencyFilter, session]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (session?.user?.email) {
        setPage(1);
        fetchDimensions(1, search, selectedDependencyFilter || undefined);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [search, session]);

  const handleCreateOrEdit = async () => {
    if (!name || !responsible) {
      showNotification({
        title: "Error",
        message: "El nombre y el responsable son requeridos",
        color: "red",
      });
      return;
    }

    try {
      const dimensionData = {
        name,
        responsible: responsible._id,
        producers: selectedProducers,
      };

      const headers = {
        'user-email': session?.user?.email || ''
      };

      if (selectedDimension) {
        await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/${selectedDimension._id}`, dimensionData, { headers });
        showNotification({
          title: "Actualizado",
          message: "Ámbito actualizado exitosamente",
          color: "teal",
        });
      } else {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/create`, dimensionData, { headers });
        showNotification({
          title: "Creado",
          message: "Ámbito creado exitosamente",
          color: "teal",
        });
      }

      handleModalClose();
      fetchDimensions(page, search, selectedDependencyFilter || undefined);
    } catch (error) {
      console.error("Error creando o actualizando ámbito:", error);

      if (axios.isAxiosError(error) && error.response && error.response.status === 400) {
        showNotification({
          title: "Error",
          message: "El nombre del ámbito ya existe",
          color: "red",
        });
      } else {
        showNotification({
          title: "Error",
          message: "Hubo un error al crear o actualizar el ámbito",
          color: "red",
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!dimensionToDelete) return;
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/${id}?email=${encodeURIComponent(session?.user?.email || '')}`, {
        headers: {
          'user-email': session?.user?.email || ''
        }
      });
      showNotification({
        title: "Eliminado",
        message: "Ámbito eliminado exitosamente",
        color: "teal",
      });
      fetchDimensions(page, search, selectedDependencyFilter || undefined);
      setConfirmDeleteModalOpened(false);
    } catch (error) {
      console.error("Error eliminando ámbito:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al eliminar el ámbito",
        color: "red",
      });
    }
  };

  const openConfirmDeleteModal = (dimension: Dimension) => {
    setDimensionToDelete(dimension);
    setConfirmDeleteModalOpened(true);
  };

  const handleModalClose = () => {
    setOpened(false);
    setName("");
    setResponsible(null);
    setSelectedProducers([]);
    setSelectedDimension(null);
  };

  const handleConfigureDimension = (dimension: Dimension) => {
    setSelectedDimension(dimension);
    setResponsible(dimension.responsible);
    setName(dimension.name);
    setSelectedProducers((dimension.producers || []).map(p => p._id));
    setOpened(true);
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleOpenTemplatesModal = async (dimension: Dimension, periodId?: string | null) => {
    setTemplatesModalDimension(dimension);
    setTemplatesModalOpened(true);
    setLoadingTemplates(true);
    const usePeriodId = periodId !== undefined ? periodId : (modalPeriodId ?? selectedPeriodId);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/all`, {
        params: { limit: 1000 },
      });
      const all = res.data.templates || [];
      const filtered = all.filter((t: any) =>
        (t.dimensions || []).some((d: any) =>
          (typeof d === "string" ? d : d._id) === dimension._id
        )
      );

      const depsRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`, { params: { limit: 100000 } });
      const allDeps: any[] = depsRes.data.dependencies || [];
      const depsById = new Map(allDeps.map((d: any) => [String(d._id), d]));
      const depsByCode = new Map(allDeps.map((d: any) => [String(d.dep_code), d]));

      const populated = filtered.map((t: any) => ({
        ...t,
        producers: (t.producers || []).map((id: any) => depsById.get(String(id)) || depsByCode.get(String(id))).filter(Boolean),
        responsible_producers: (t.responsible_producers || []).map((id: any) => depsById.get(String(id)) || depsByCode.get(String(id))).filter(Boolean),
      }));

      const withStatus = await Promise.all(
        populated.map(async (t: any) => {
          try {
            const pubRes = await axios.get(
              `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/by-template/${t._id}`,
              { params: usePeriodId ? { periodId: usePeriodId } : {} }
            );
            const loadedData = pubRes.data?.loaded_data || [];
            const loadedDepCodes: string[] = loadedData.map((ld: any) => ld.dependency);
            return { ...t, loaded_dep_codes: loadedDepCodes, loaded_data: loadedData };
          } catch {
            return { ...t, loaded_dep_codes: [], loaded_data: [] };
          }
        })
      );
      setDimensionTemplates(withStatus);
    } catch (error) {
      showNotification({ title: "Error", message: "No se pudieron cargar las plantillas", color: "red" });
      setDimensionTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const rows = sortedDimensions.flatMap((dimension: Dimension) => {
    const isExpanded = expandedRows.has(dimension._id);
    const producerCount = (dimension.producers || []).length;

    return [
      <Table.Tr key={dimension._id}>
        <Table.Td>{dimension.name}</Table.Td>
        <Table.Td>{dimension.responsible?.name ?? "Sin dependencia asignada"}</Table.Td>
        <Table.Td>
          {dimension.responsible?.visualizers && dimension.responsible.visualizers.length > 0 ? (
            <Group gap={5}>
              {dimension.responsible.visualizers.slice(0, 1).map((v, index) => (
                <Text key={index}>{v}</Text>
              ))}
              {dimension.responsible.visualizers.length > 1 && (
                <Badge variant="outline">+{dimension.responsible.visualizers.length - 1} más</Badge>
              )}
            </Group>
          ) : (
            <Text>No definido</Text>
          )}
        </Table.Td>
        <Table.Td>
          <Center>
            <Group gap={5}>
              <Button
                variant="subtle"
                size="xs"
                onClick={() => toggleRow(dimension._id)}
                rightSection={isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              >
                {producerCount} dep.
              </Button>
              <Tooltip label="Ver plantillas del ámbito" withArrow>
                <Button
                  variant="subtle"
                  color="teal"
                  size="xs"
                  onClick={() => router.push(`/admin/dimensions/${dimension._id}/templates`)}
                  leftSection={<IconTemplate size={14} />}
                >
                  Plantillas
                </Button>
              </Tooltip>
              <Button variant="outline" onClick={() => handleConfigureDimension(dimension)} disabled={!canManage}>
                <IconSettings size={16} />
              </Button>
              <Button color="red" variant="outline" onClick={() => openConfirmDeleteModal(dimension)} disabled={!canManage}>
                <IconTrash size={16} />
              </Button>
            </Group>
          </Center>
        </Table.Td>
      </Table.Tr>,
      isExpanded ? (
        <Table.Tr key={`${dimension._id}-producers`}>
          <Table.Td colSpan={4} style={{ backgroundColor: 'var(--mantine-color-gray-0)', padding: '12px 20px' }}>
            <Text fw={500} size="sm" mb={6}>Dependencias del ámbito:</Text>
            {producerCount > 0 ? (
              <Group gap={6} wrap="wrap">
                {(dimension.producers || []).map(producer => (
                  <Badge key={producer._id} variant="light" color="blue">
                    {producer.name}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Text size="sm" c="dimmed">No hay dependencias asignadas a este ámbito</Text>
            )}
          </Table.Td>
        </Table.Tr>
      ) : null,
    ].filter(Boolean);
  });

  return (
    <Container size="xl">
      <Group mb="md">
        <TextInput
          placeholder="Buscar en todas los ámbitos"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Select
          placeholder="Filtrar por dependencia"
          data={[
            { value: '', label: 'Todas las dependencias' },
            ...allDependencies.map(dep => ({ value: dep._id, label: dep.name }))
          ]}
          value={selectedDependencyFilter || ''}
          onChange={(value) => {
            setSelectedDependencyFilter(value || null);
          }}
          searchable
          clearable
          style={{ minWidth: 250 }}
        />
      </Group>
      <Group>
        <Button
          onClick={() => { setSelectedDimension(null); setOpened(true); }}
          leftSection={<IconCirclePlus/>}
          disabled={!canManage}
        >
          Crear Nuevo Ámbito
        </Button>
      </Group>
      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th onClick={() => handleSort("name")} style={{ cursor: "pointer" }}>
              <Center inline>
                Nombre
                {sortConfig.key === "name" ? (
                  sortConfig.direction === "asc" ? (
                    <IconArrowBigUpFilled size={16} style={{ marginLeft: "5px" }} />
                  ) : (
                    <IconArrowBigDownFilled size={16} style={{ marginLeft: "5px" }} />
                  )
                ) : (
                  <IconArrowsTransferDown size={16} style={{ marginLeft: "5px" }} />
                )}
              </Center>
            </Table.Th>
            <Table.Th onClick={() => handleSort("responsible")} style={{ cursor: "pointer" }}>
              <Center inline>
                Dependencia responsable
                {sortConfig.key === "responsible" ? (
                  sortConfig.direction === "asc" ? (
                    <IconArrowBigUpFilled size={16} style={{ marginLeft: "5px" }} />
                  ) : (
                    <IconArrowBigDownFilled size={16} style={{ marginLeft: "5px" }} />
                  )
                ) : (
                  <IconArrowsTransferDown size={16} style={{ marginLeft: "5px" }} />
                )}
              </Center>
            </Table.Th>
            <Table.Th>Líder(es) de dependencia</Table.Th>
            <Table.Th><Center>Acciones</Center></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
      <Center>
        <Pagination
          mt={15}
          value={page}
          onChange={setPage}
          total={totalPages}
          siblings={1}
          boundaries={3}
        />
      </Center>
      <Modal
        opened={confirmDeleteModalOpened}
        onClose={() => setConfirmDeleteModalOpened(false)}
        title="Confirmación de Eliminación"
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
        centered
      >
        <Text>¿Estás seguro de que deseas eliminar este ámbito? Esta acción no se puede deshacer.</Text>
        <Group mt="md">
          <Button onClick={() => setConfirmDeleteModalOpened(false)} variant="light" color="gray">
            Cancelar
          </Button>
          <Button onClick={() => handleDelete(dimensionToDelete?._id || "")} color="red">
            Confirmar Eliminación
          </Button>
        </Group>
      </Modal>
      <Modal
        opened={opened}
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
        onClose={handleModalClose}
        title={selectedDimension ? "Editar Ámbito" : "Crear Nuevo Ámbito"}
        size="lg"
      >
        <Stack gap="sm">
          <TextInput
            label="Nombre"
            placeholder="Nombre del ámbito"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Select
            label="Responsable"
            placeholder="Selecciona un responsable"
            data={allDependencies?.map((dep) => ({ value: dep._id, label: dep.name }))}
            value={responsible ? responsible._id : ""}
            onChange={(value) => {
              const selectedDep = allDependencies?.find((dep) => dep._id === value) || null;
              setResponsible(selectedDep);
            }}
            searchable
            clearable
          />
          <MultiSelect
            label="Dependencias del ámbito"
            description="Selecciona las dependencias que pertenecen a este ámbito"
            placeholder="Buscar dependencias..."
            data={allDependencies?.map((dep) => ({ value: dep._id, label: dep.name }))}
            value={selectedProducers}
            onChange={setSelectedProducers}
            searchable
            clearable
            maxDropdownHeight={200}
          />
          <Group mt="xs" grow>
            <Button
              onClick={handleCreateOrEdit}
              leftSection={<IconDeviceFloppy/>}
              rightSection={<span/>}
              justify="space-between"
            >
              {selectedDimension ? "Actualizar" : "Crear"}
            </Button>
            <Button
              onClick={handleModalClose}
              variant="light"
              color="red"
              rightSection={<IconCancel/>}
              leftSection={<span/>}
              justify="space-between"
            >
              Cancelar
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={templatesModalOpened}
        onClose={() => { setTemplatesModalOpened(false); setDimensionTemplates([]); }}
        title={`Plantillas del ámbito: ${templatesModalDimension?.name ?? ""}`}
        size="90%"
        centered
      >
        {/* Selector de periodo */}
        <Group mb="md" gap="sm">
          <Select
            placeholder="Seleccionar periodo"
            clearable
            value={modalPeriodId ?? selectedPeriodId}
            onChange={(v) => {
              setModalPeriodId(v);
              if (templatesModalDimension) handleOpenTemplatesModal(templatesModalDimension, v);
            }}
            data={availablePeriods.map((p) => ({ value: p._id, label: p.name }))}
            style={{ minWidth: 220 }}
          />
        </Group>

        {loadingTemplates ? (
          <Center py="xl"><Loader /></Center>
        ) : dimensionTemplates.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">No hay plantillas asignadas a este ámbito.</Text>
        ) : (
          <ScrollArea>
            <Table striped withTableBorder verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Plantilla</Table.Th>
                  <Table.Th>Responsables</Table.Th>
                  <Table.Th>Productores</Table.Th>
                  <Table.Th>Fecha límite</Table.Th>
                  <Table.Th><Center>Estado (responsables y productores)</Center></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {dimensionTemplates.map((t) => (
                  <Table.Tr key={t._id}>
                    <Table.Td>
                      <Text fw={600}>{t.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      {(t.responsible_producers || []).length > 0 ? (
                        <Stack gap={4}>
                          {t.responsible_producers.map((r) => (
                            <Badge key={r._id} variant="light" color="violet" size="sm">{r.name}</Badge>
                          ))}
                        </Stack>
                      ) : (
                        <Text size="sm" c="dimmed">Sin responsables</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {(t.producers || []).length > 0 ? (
                        <Stack gap={4}>
                          {t.producers.map((p) => (
                            <Badge key={p._id} variant="light" color="gray" size="sm">{p.name}</Badge>
                          ))}
                        </Stack>
                      ) : (
                        <Text size="sm" c="dimmed">Sin productores</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {t.fecha_final ? new Date(t.fecha_final).toLocaleDateString("es-CO") : "Sin fecha"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        {/* Estado responsables */}
                        {(t.responsible_producers || []).map((r) => {
                          const cargada = (t.loaded_dep_codes || []).includes(r.dep_code);
                          return (
                            <Group key={r._id} gap={6}>
                              <Badge size="sm" color={cargada ? "teal" : "violet"} variant="filled">
                                {cargada ? "✓ Cargada" : "⏳ Pendiente"}
                              </Badge>
                              <Text size="xs" fw={600}>{r.name}</Text>
                              <Badge size="xs" variant="outline" color="violet">resp.</Badge>
                            </Group>
                          );
                        })}
                        {/* Estado productores */}
                        {(t.producers || []).length === 0 && (t.responsible_producers || []).length === 0 ? (
                          <Text size="sm" c="dimmed">Sin participantes</Text>
                        ) : (
                          t.producers.map((p) => {
                            const cargada = (t.loaded_dep_codes || []).includes(p.dep_code);
                            return (
                              <Group key={p._id} gap={6}>
                                <Badge size="sm" color={cargada ? "teal" : "orange"} variant="filled">
                                  {cargada ? "✓ Cargada" : "⏳ Pendiente"}
                                </Badge>
                                <Text size="xs">{p.name}</Text>
                              </Group>
                            );
                          })
                        )}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Modal>
    </Container>
  );
};

export default AdminDimensionsPage;
