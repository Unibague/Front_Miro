"use client";

import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import {
  Button,
  Center,
  Container,
  Group,
  Modal,
  Pagination,
  Select,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
  Checkbox,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowRight,
  IconBrain,
  IconEdit,
  IconFileDescription,
  IconSparkles,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Report {
  _id: string;
  name: string;
  description?: string;
  report_example_link?: string;
  requires_attachment?: boolean;
  file_name?: string;
  dimensions?: Array<string | { _id: string; name?: string }>;
  created_by?: {
    email?: string;
    full_name?: string;
  };
  ai_generation?: {
    provider?: string;
    strategy?: string;
    source_reports?: {
      producer?: { _id: string; name: string };
      responsible?: { _id: string; name: string };
    };
    merge_plan?: any;
  };
}

interface ResponsibleSourceReport {
  report_example_link?: string;
}

interface ProducerSourceReport {
  report_example?: {
    view_link?: string;
  };
}

interface ProducerReportOption {
  _id: string;
  name: string;
}

interface ResponsibleReportOption {
  _id: string;
  name: string;
}

interface Dimension {
  _id: string;
  name: string;
}

interface Period {
  _id: string;
  name: string;
  responsible_end_date: Date;
}

const PAGE_SIZE = 10;

const isAmbitReport = (report: Report) =>
  Boolean(report.ai_generation?.source_reports?.producer && report.ai_generation?.source_reports?.responsible);

export default function AdminReportsAmbitosPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [createOpened, setCreateOpened] = useState(false);
  const [creatingWithAI, setCreatingWithAI] = useState(false);
  const [sourceOptionsLoading, setSourceOptionsLoading] = useState(false);
  const [producerReports, setProducerReports] = useState<ProducerReportOption[]>([]);
  const [responsibleReports, setResponsibleReports] = useState<ResponsibleReportOption[]>([]);
  const [selectedProducerReportId, setSelectedProducerReportId] = useState<string | null>(null);
  const [selectedResponsibleReportId, setSelectedResponsibleReportId] = useState<string | null>(null);
  const [ambitReportName, setAmbitReportName] = useState("");
  const [ambitReportDescription, setAmbitReportDescription] = useState("");
  const [aiInstructions, setAiInstructions] = useState("");

  const [publishing, setPublishing] = useState(false);
  const [loadingPublishOptions, setLoadingPublishOptions] = useState(false);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [customDeadline, setCustomDeadline] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [userDimensions, setUserDimensions] = useState<Dimension[]>([]);
  const [selectedDimensionFilter, setSelectedDimensionFilter] = useState<string | null>(null);

  const fetchAmbitReports = async () => {
    if (!session?.user?.email) return;

    setLoading(true);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/reports/all`, {
        params: {
          email: session.user.email,
          page: 1,
          limit: 500,
          search,
        },
      });

      const allReports: Report[] = response.data?.reports || [];
      const ambitReports = allReports.filter(isAmbitReport);
      setReports(ambitReports);
      if (page > 1) {
        const nextTotal = Math.max(1, Math.ceil(ambitReports.length / PAGE_SIZE));
        if (page > nextTotal) setPage(nextTotal);
      }
    } catch (error) {
      console.error("Error fetching ambit reports:", error);
      showNotification({
        title: "Error",
        message: "No fue posible cargar los informes de ambito.",
        color: "red",
      });
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDimensions = async () => {
    if (!session?.user?.email) return;
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/dimensions/user/${session.user.email}`
      );
      setUserDimensions(response.data || []);
    } catch (error) {
      console.error("Error fetching user dimensions:", error);
      setUserDimensions([]);
    }
  };

  useEffect(() => {
    if (!session?.user?.email) return;
    fetchUserDimensions();
  }, [session?.user?.email]);

  useEffect(() => {
    if (!session?.user?.email) return;
    const timer = setTimeout(() => {
      fetchAmbitReports();
    }, 300);
    return () => clearTimeout(timer);
  }, [session?.user?.email, search]);

  const filteredReports = useMemo(() => {
    if (!selectedDimensionFilter) return reports;
    return reports.filter((report: any) =>
      Array.isArray(report.dimensions) &&
      report.dimensions.some((dim: any) => String(dim) === String(selectedDimensionFilter) || dim?._id === selectedDimensionFilter)
    );
  }, [reports, selectedDimensionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));

  const paginatedReports = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredReports.slice(start, start + PAGE_SIZE);
  }, [filteredReports, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const loadSourceOptions = async () => {
    if (!session?.user?.email) return;
    setSourceOptionsLoading(true);
    try {
      const [producerResponse, responsibleResponse] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/producerReports/all`, {
          params: { email: session.user.email, page: 1, search: "" },
        }),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/reports/all`, {
          params: { email: session.user.email, page: 1, limit: 500, search: "" },
        }),
      ]);

      const producerData = Array.isArray(producerResponse.data)
        ? producerResponse.data
        : producerResponse.data?.reports || [];

      const responsibleData = (Array.isArray(responsibleResponse.data)
        ? responsibleResponse.data
        : responsibleResponse.data?.reports || []
      ).filter((r: Report) => !isAmbitReport(r));

      setProducerReports(producerData);
      setResponsibleReports(responsibleData);
    } catch (error) {
      console.error("Error loading source reports:", error);
      showNotification({
        title: "Error",
        message: "No fue posible cargar las fuentes para generar el informe con IA.",
        color: "red",
      });
    } finally {
      setSourceOptionsLoading(false);
    }
  };

  const openCreateModal = async () => {
    setCreateOpened(true);
    if (producerReports.length === 0 || responsibleReports.length === 0) {
      await loadSourceOptions();
    }
  };

  const resetCreateForm = () => {
    setCreateOpened(false);
    setSelectedProducerReportId(null);
    setSelectedResponsibleReportId(null);
    setAmbitReportName("");
    setAmbitReportDescription("");
    setAiInstructions("");
    setCreatingWithAI(false);
  };

  const handleCreateWithAI = async () => {
    if (!selectedProducerReportId || !selectedResponsibleReportId) {
      showNotification({
        title: "Seleccion incompleta",
        message: "Selecciona un informe de productores y uno de responsables.",
        color: "yellow",
      });
      return;
    }

    if (!ambitReportName.trim()) {
      showNotification({
        title: "Nombre requerido",
        message: "Ingresa un nombre para el informe de ambito.",
        color: "yellow",
      });
      return;
    }

    setCreatingWithAI(true);
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/ambitReports/ai-generate`, {
        producerReportId: selectedProducerReportId,
        responsibleReportId: selectedResponsibleReportId,
        name: ambitReportName.trim(),
        description: ambitReportDescription.trim(),
        instructions: aiInstructions.trim(),
        email: session?.user?.email,
      });

      showNotification({
        title: "Informe de ambito creado",
        message: response.data?.message || "El informe de ambito fue creado con IA.",
        color: "green",
      });

      resetCreateForm();
      await fetchAmbitReports();
    } catch (error: any) {
      console.error("Error creating ambit report with AI:", error);
      showNotification({
        title: "Error",
        message:
          error?.response?.data?.message ||
          error?.response?.data?.mensaje ||
          "No se pudo crear el informe de ambito con IA.",
        color: "red",
      });
    } finally {
      setCreatingWithAI(false);
    }
  };

  const confirmDelete = (report: Report) => {
    modals.openConfirmModal({
      title: "Confirmar eliminacion",
      centered: true,
      children: (
        <Text size="sm">
          Estas seguro de eliminar el informe <strong>{report.name}</strong>?
          <br />
          Esta accion no se puede deshacer.
        </Text>
      ),
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/reports/delete/${report._id}`);
          showNotification({
            title: "Eliminado",
            message: "Informe eliminado correctamente.",
            color: "green",
          });
          await fetchAmbitReports();
        } catch (error) {
          console.error("Error deleting report:", error);
          showNotification({
            title: "Error",
            message: "No se pudo eliminar el informe.",
            color: "red",
          });
        }
      },
    });
  };
  const fetchPublishOptions = async () => {
    setLoadingPublishOptions(true);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pReports/feed`, {
        params: { email: session?.user?.email },
      });
      setPeriods(response.data?.periods || []);
    } catch (error) {
      console.error("Error fetching publish options:", error);
      setPeriods([]);
    } finally {
      setLoadingPublishOptions(false);
    }
  };

  const closePublishModal = () => {
    setPublishing(false);
    setSelectedReport(null);
    setPeriods([]);
    setSelectedPeriod(null);
    setCustomDeadline(false);
    setDeadline(null);
  };

  const handleSubmitPublish = async () => {
    if (!selectedReport?._id || !selectedPeriod) return;

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/pReports/publish`, {
        reportId: selectedReport._id,
        deadline: customDeadline
          ? deadline
          : new Date(periods.find((p) => p._id === selectedPeriod)?.responsible_end_date || ""),
        periodId: selectedPeriod,
        email: session?.user?.email,
      });

      showNotification({
        title: "Exito",
        message: "Informe asignado correctamente.",
        color: "green",
      });
      closePublishModal();
    } catch (error) {
      console.error("Error publishing report:", error);
      showNotification({
        title: "Error",
        message: "No se pudo asignar el informe.",
        color: "red",
      });
    }
  };

  const handleOpenAttachment = async (report: Report) => {
    if (report.report_example_link) {
      window.open(report.report_example_link, "_blank");
      return;
    }

    const responsibleSourceId = report.ai_generation?.source_reports?.responsible?._id;
    const producerSourceId = report.ai_generation?.source_reports?.producer?._id;

    try {
      if (responsibleSourceId) {
        const response = await axios.get<ResponsibleSourceReport>(
          `${process.env.NEXT_PUBLIC_API_URL}/reports/${responsibleSourceId}`,
          {
            params: { email: session?.user?.email },
          }
        );
        const link = response.data?.report_example_link;
        if (link) {
          window.open(link, "_blank");
          return;
        }
      }

      if (producerSourceId) {
        const response = await axios.get<ProducerSourceReport>(
          `${process.env.NEXT_PUBLIC_API_URL}/producerReports/${producerSourceId}`,
          {
            params: { email: session?.user?.email },
          }
        );
        const link = response.data?.report_example?.view_link;
        if (link) {
          window.open(link, "_blank");
          return;
        }
      }

      showNotification({
        title: "Sin formato adjunto",
        message: "No se encontro un formato adjunto para este informe de ambito.",
        color: "yellow",
      });
    } catch (error) {
      console.error("Error opening ambit report attachment:", error);
      showNotification({
        title: "Error",
        message: "No fue posible abrir el formato adjunto.",
        color: "red",
      });
    }
  };

  const rows = paginatedReports.map((report) => (
    <Table.Tr key={report._id}>
      <Table.Td>{report.name}</Table.Td>
      <Table.Td>{report.created_by?.full_name || report.created_by?.email || "-"}</Table.Td>
      <Table.Td>
        <Center>
          <Group gap={6}>
            <Tooltip label="Editar informe">
              <Button variant="outline" onClick={() => router.push(`/admin/reports/${report._id}`)}>
                <IconEdit size={16} />
              </Button>
            </Tooltip>
            <Tooltip label="Eliminar informe">
              <Button color="red" variant="outline" onClick={() => confirmDelete(report)}>
                <IconTrash size={16} />
              </Button>
            </Tooltip>
            <Tooltip label="Ver formato adjunto">
              <Button
                variant="outline"
                onClick={() => handleOpenAttachment(report)}
              >
                <IconFileDescription size={16} />
              </Button>
            </Tooltip>
          </Group>
        </Center>
      </Table.Td>
      <Table.Td>
        <Center>
          <Tooltip label="Asignar a ambito(s)">
            <Button
              variant="outline"
              loading={loadingPublishOptions}
              onClick={async () => {
                setSelectedReport(report);
                await fetchPublishOptions();
                setPublishing(true);
              }}
            >
              <IconUser size={16} />
            </Button>
          </Tooltip>
        </Center>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <DateConfig />

      <Title mb="md" ta="center">
        Configuracion Informes de ambitos
      </Title>

      <Group mb="md">
        <TextInput
          placeholder="Buscar en todos los informes de ambito"
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.currentTarget.value);
          }}
          style={{ flex: 1 }}
        />
        
      </Group>

      <Group mb="md">
        <Button leftSection={<IconBrain size={16} />} onClick={openCreateModal}>
          Crear Informe de ambito con IA
        </Button>
        <Button
          ml="auto"
          variant="outline"
          rightSection={<IconArrowRight size={16} />}
          onClick={() => router.push("/admin/reports/ambitos/uploaded")}
        >
          Ir a Gestion de Informes
        </Button>
      </Group>

      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nombre</Table.Th>
            <Table.Th>Creado Por</Table.Th>
            <Table.Th>
              <Center>Acciones</Center>
            </Table.Th>
            <Table.Th>
              <Center>Asignar</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {loading ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed">
                  Cargando informes de ambito...
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : rows.length > 0 ? (
            rows
          ) : (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed">
                  No hay informes de ambito creados con IA.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Center>
        <Pagination mt={15} value={page} onChange={setPage} total={totalPages} siblings={1} boundaries={3} />
      </Center>

      <Modal
        opened={createOpened}
        onClose={resetCreateForm}
        title={<Text fw={700}>Crear Informe de ambito con IA</Text>}
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
        size="lg"
      >
        <Group grow mb="sm">
          <Select
            label="Informe base de Productores"
            placeholder={sourceOptionsLoading ? "Cargando..." : "Selecciona un informe"}
            data={producerReports.map((r) => ({ value: r._id, label: r.name }))}
            value={selectedProducerReportId}
            onChange={setSelectedProducerReportId}
            searchable
            disabled={sourceOptionsLoading}
          />
          <Select
            label="Informe base de Responsables"
            placeholder={sourceOptionsLoading ? "Cargando..." : "Selecciona un informe"}
            data={responsibleReports.map((r) => ({ value: r._id, label: r.name }))}
            value={selectedResponsibleReportId}
            onChange={setSelectedResponsibleReportId}
            searchable
            disabled={sourceOptionsLoading}
          />
        </Group>

        <TextInput
          mb="sm"
          label="Nombre del informe de ambito"
          placeholder="Ej. Informe de ambito - Planeacion"
          value={ambitReportName}
          onChange={(event) => setAmbitReportName(event.currentTarget.value)}
        />

        <Textarea
          mb="sm"
          label="Descripcion"
          placeholder="Describe el objetivo del informe de ambito"
          minRows={2}
          value={ambitReportDescription}
          onChange={(event) => setAmbitReportDescription(event.currentTarget.value)}
        />

        <Textarea
          mb="md"
          label="Instrucciones para la IA (opcional)"
          placeholder="Ej. Priorizar consolidacion, eliminar duplicados, mantener evidencias..."
          minRows={3}
          value={aiInstructions}
          onChange={(event) => setAiInstructions(event.currentTarget.value)}
        />

        <Group justify="flex-end">
          <Button variant="outline" onClick={resetCreateForm} disabled={creatingWithAI}>
            Cancelar
          </Button>
          <Button leftSection={<IconSparkles size={16} />} loading={creatingWithAI} onClick={handleCreateWithAI}>
            Generar con IA
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={publishing}
        onClose={closePublishModal}
        title="Asignar Informe a ambito(s)"
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      >
        {periods.length > 0 ? (
          <Select
            data={periods.map((period) => ({ value: period._id, label: period.name }))}
            value={selectedPeriod}
            onChange={(value) => {
              setSelectedPeriod(value || null);
              const period = periods.find((p) => p._id === value);
              setDeadline(period ? new Date(period.responsible_end_date) : null);
            }}
            searchable
            placeholder="Selecciona el periodo"
            label="Periodo"
            required
          />
        ) : (
          <Text c="dimmed" ta="center" mt="md">
            No hay periodos activos disponibles.
          </Text>
        )}

        {selectedPeriod && (
          <>
            <Text size="sm" mt="xs" c="dimmed">
              Fecha Limite: {deadline ? dateToGMT(deadline) : "No disponible"}
            </Text>
            <Checkbox
              mt="sm"
              mb="xs"
              label="Establecer un plazo inferior al del periodo"
              checked={customDeadline}
              onChange={(event) => setCustomDeadline(event.currentTarget.checked)}
            />
          </>
        )}

        {customDeadline && (
          <DatePickerInput
            locale="es"
            label="Fecha Limite"
            value={deadline}
            onChange={setDeadline}
            maxDate={
              selectedPeriod
                ? new Date(periods.find((p) => p._id === selectedPeriod)?.responsible_end_date || "")
                : undefined
            }
          />
        )}

        <Group mt="md" grow>
          <Button onClick={handleSubmitPublish} disabled={periods.length === 0 || !selectedPeriod}>
            Asignar
          </Button>
          <Button variant="outline" onClick={closePublishModal}>
            Cancelar
          </Button>
        </Group>
      </Modal>
    </Container>
  );
}
