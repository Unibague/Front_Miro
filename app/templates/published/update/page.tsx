"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import {
  Button,
  Center,
  Container,
  Group,
  Modal,
  Pagination,
  Progress,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconArrowLeft, IconCalendar, IconEdit, IconFileDescription } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { showNotification } from "@mantine/notifications";
import dayjs from "dayjs";
import { usePeriod } from "@/app/context/PeriodContext";
import "dayjs/locale/es";

interface Template {
  _id: string;
  name: string;
  producers: { _id: string; name: string }[];
}

interface PublishedTemplate {
  _id: string;
  template: Template;
  period: { _id: string; name: string };
  loaded_data: any[];
  deadline: Date;
  fecha_inicio?: Date;
  fecha_final_productores?: Date;
  fecha_final_responsables?: Date;
  fecha_final?: Date;
}

interface DateFields {
  fecha_inicio: Date | null;
  fecha_final_productores: Date | null;
  fecha_final_responsables: Date | null;
  fecha_final: Date | null;
}

const emptyDates = (): DateFields => ({
  fecha_inicio: null,
  fecha_final_productores: null,
  fecha_final_responsables: null,
  fecha_final: null,
});

const UpdatePublishedTemplatesDeadlinePage = () => {
  const { data: session } = useSession();
  const { selectedPeriodId } = usePeriod();
  const router = useRouter();

  const [pubTemplates, setPubTemplates] = useState<PublishedTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [dates, setDates] = useState<DateFields>(emptyDates());
  const [editingId, setEditingId] = useState<string | null>(null); // null = bulk

  const fetchTemplates = async (p: number, s: string) => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/dimension`, {
        params: {
          email: session?.user?.email,
          page: p,
          limit: 100,
          search: s,
          periodId: selectedPeriodId,
          filterByUserScope: true,
        },
      });
      if (response.data) {
        setPubTemplates(response.data.templates);
        setTotalPages(response.data.pages);
      }
    } catch {
      setPubTemplates([]);
    }
  };

  useEffect(() => {
    if (session?.user?.email) fetchTemplates(page, search);
  }, [page, session?.user?.email, selectedPeriodId]);

  useEffect(() => {
    if (!session?.user?.email) return;
    const delay = setTimeout(() => fetchTemplates(page, search), 500);
    return () => clearTimeout(delay);
  }, [search]);

  const openBulkModal = (ids: string[]) => {
    setEditingId(null);
    setSelectedTemplates(ids);
    setDates(emptyDates());
    setModalOpen(true);
  };

  const openSingleModal = (pt: PublishedTemplate) => {
    setEditingId(pt._id);
    setSelectedTemplates([pt._id]);
    setDates({
      fecha_inicio: pt.fecha_inicio ? new Date(pt.fecha_inicio) : null,
      fecha_final_productores: pt.fecha_final_productores ? new Date(pt.fecha_final_productores) : null,
      fecha_final_responsables: pt.fecha_final_responsables ? new Date(pt.fecha_final_responsables) : null,
      fecha_final: pt.fecha_final ? new Date(pt.fecha_final) : (pt.deadline ? new Date(pt.deadline) : null),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (selectedTemplates.length === 0) return;
    setLoading(true);
    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/update-deadlines`, {
        templateIds: selectedTemplates,
        fecha_inicio: dates.fecha_inicio,
        fecha_final_productores: dates.fecha_final_productores,
        fecha_final_responsables: dates.fecha_final_responsables,
        fecha_final: dates.fecha_final,
        deadline: dates.fecha_final,
        email: session?.user?.email,
      });
      showNotification({ title: "Éxito", message: "Fechas actualizadas correctamente", color: "green" });
      setModalOpen(false);
      setSelectedTemplates([]);
      setEditingId(null);
      fetchTemplates(page, search);
    } catch {
      showNotification({ title: "Error", message: "No se pudieron actualizar las fechas", color: "red" });
    }
    setLoading(false);
  };

  const fmt = (date: Date | string | null | undefined) =>
    date ? dayjs(date).locale("es").format("DD/MM/YYYY") : "—";

  const rows = pubTemplates.map((pt) => {
    const isSelected = selectedTemplates.includes(pt._id);
    return (
      <Table.Tr key={pt._id} style={isSelected ? { background: "var(--mantine-color-blue-0)" } : undefined}>
        <Table.Td>
          <Group gap="xs">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) =>
                setSelectedTemplates((prev) =>
                  e.target.checked ? [...prev, pt._id] : prev.filter((id) => id !== pt._id)
                )
              }
            />
            <Text size="sm" fw={500}>{pt.template.name}</Text>
          </Group>
        </Table.Td>
        <Table.Td><Text size="sm">{fmt(pt.fecha_inicio)}</Text></Table.Td>
        <Table.Td><Text size="sm">{fmt(pt.fecha_final_productores)}</Text></Table.Td>
        <Table.Td><Text size="sm">{fmt(pt.fecha_final_responsables)}</Text></Table.Td>
        <Table.Td><Text size="sm" fw={600} c="blue">{fmt(pt.fecha_final ?? pt.deadline)}</Text></Table.Td>
        <Table.Td>
          <Progress
            value={
              pt.template.producers?.length
                ? (pt.loaded_data.length / pt.template.producers.length) * 100
                : 0
            }
            size="sm"
          />
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            <Button
              size="compact-xs"
              variant="light"
              leftSection={<IconEdit size={12} />}
              onClick={() => openSingleModal(pt)}
            >
              Fechas
            </Button>
            <Button
              size="compact-xs"
              variant="light"
              color="gray"
              leftSection={<IconFileDescription size={12} />}
              onClick={() => router.push(`/templates/uploaded/${pt._id}?resume=true`)}
            >
              Ver
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Container size="xl">
      <Title ta="center" mb="md">Gestión de Plantillas Publicadas</Title>
      <TextInput
        placeholder="Buscar plantillas"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        mb="md"
      />
      <Group mb="sm">
        <Button
          variant="outline"
          onClick={() => router.push("/admin/templates")}
          leftSection={<IconArrowLeft size={16} />}
        >
          Ir a Configuración
        </Button>
        <Button
          leftSection={<IconCalendar size={16} />}
          onClick={() => openBulkModal(pubTemplates.map((r) => r._id))}
        >
          Cambiar fechas a todos
        </Button>
        <Button
          disabled={selectedTemplates.length === 0}
          leftSection={<IconCalendar size={16} />}
          onClick={() => openBulkModal(selectedTemplates)}
        >
          Cambiar fechas seleccionados ({selectedTemplates.length})
        </Button>
      </Group>

      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Plantilla</Table.Th>
            <Table.Th>Fecha Inicial</Table.Th>
            <Table.Th>Fecha Final Productores</Table.Th>
            <Table.Th>Fecha Final Responsables</Table.Th>
            <Table.Th>Fecha Final Admins</Table.Th>
            <Table.Th>Progreso</Table.Th>
            <Table.Th>Acciones</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
      <Center>
        <Pagination mt={15} value={page} onChange={setPage} total={totalPages} />
      </Center>

      <Modal
        opened={modalOpen}
        onClose={() => { setModalOpen(false); setEditingId(null); }}
        title={editingId ? "Editar fechas de la plantilla" : `Editar fechas (${selectedTemplates.length} plantillas)`}
        size="sm"
      >
        <Stack gap="sm">
          <DateInput
            label="Fecha inicial (productores pueden empezar)"
            locale="es"
            placeholder="Seleccionar fecha"
            value={dates.fecha_inicio}
            onChange={(d) => setDates((prev) => ({ ...prev, fecha_inicio: d }))}
            clearable
          />
          <DateInput
            label="Fecha final productores"
            locale="es"
            placeholder="Seleccionar fecha"
            value={dates.fecha_final_productores}
            onChange={(d) => setDates((prev) => ({ ...prev, fecha_final_productores: d }))}
            minDate={dates.fecha_inicio ?? undefined}
            clearable
          />
          <DateInput
            label="Fecha final responsables"
            locale="es"
            placeholder="Seleccionar fecha"
            value={dates.fecha_final_responsables}
            onChange={(d) => setDates((prev) => ({ ...prev, fecha_final_responsables: d }))}
            minDate={dates.fecha_final_productores ?? dates.fecha_inicio ?? undefined}
            clearable
          />
          <DateInput
            label="Fecha final administradores"
            locale="es"
            placeholder="Seleccionar fecha"
            value={dates.fecha_final}
            onChange={(d) => setDates((prev) => ({ ...prev, fecha_final: d }))}
            minDate={dates.fecha_final_responsables ?? dates.fecha_final_productores ?? dates.fecha_inicio ?? undefined}
            clearable
          />
          <Button loading={loading} onClick={handleSave} mt="xs">
            Guardar fechas
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
};

export default UpdatePublishedTemplatesDeadlinePage;
