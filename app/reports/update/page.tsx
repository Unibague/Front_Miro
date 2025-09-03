"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import {
  Badge,
  Button,
  Center,
  Container,
  Divider,
  Group,
  Modal,
  Pagination,
  Progress,
  rem,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import {
  IconArrowLeft,
  IconCalendar,
  IconFileDescription,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { showNotification } from "@mantine/notifications";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { usePeriod } from "@/app/context/PeriodContext";

dayjs.extend(utc);


interface Report {
  _id: string;
  name: string;
  producers: Dependency[];
}

interface Dependency {
  _id: string;
  name: string;
  responsible: string;
}

interface Period {
  _id: string;
  name: string;
  responsible_start_date: Date;
  responsible_end_date: Date;
  producer_report_start_date: Date;
  producer_report_end_date: Date;
}

interface FilledReport {
  _id: string;
  status: string | null;
}

interface PublishedReport {
  _id: string;
  report: Report;
  period: Period;
  filled_reports: FilledReport[];
  deadline: Date;
}

const AdminPubReportsPage = () => {
  const { data: session } = useSession();
  const [pubReports, setPubReports] = useState<PublishedReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
    const { selectedPeriodId } = usePeriod();
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [openedDeadlineModal, setOpenedDeadlineModal] = useState(false);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [newDeadline, setNewDeadline] = useState<Date | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<Period | null>(null);
  const router = useRouter();
  const theme = useMantineTheme();

  const fetchReports = async (page: number, search: string) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/`,
        {
          params: {
            page,
            limit:100,
            search,
            email: session?.user?.email,
            periodId: selectedPeriodId,
          },
        }
      );
      if (response.data) {
        setPubReports(response.data.publishedReports);
        setTotalPages(response.data.totalPages);
        // Obtener el período actual de los informes publicados
        if (response.data.publishedReports.length > 0) {
          setCurrentPeriod(response.data.publishedReports[0].period);
        }
      }
    } catch (error) {
      console.error(error);
      setPubReports([]);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchReports(page, search);
    }
  }, [page, session?.user?.email, selectedPeriodId]);

  useEffect(() => {
    if (session?.user?.email) {
      const delay = setTimeout(() => {
        fetchReports(page, search);
      }, 500);
      return () => clearTimeout(delay);
    }
  }, [search]);

  const updateDeadlines = async () => {
    if (!newDeadline || selectedReports.length === 0) return;
    
    // Validar que la fecha esté dentro del rango permitido
    if (currentPeriod?.producer_report_start_date && currentPeriod?.producer_report_end_date) {
      const startDate = new Date(currentPeriod.producer_report_start_date);
      const endDate = new Date(currentPeriod.producer_report_end_date);
      if (newDeadline < startDate || newDeadline > endDate) {
        showNotification({
          title: "Error",
          message: "La fecha debe estar dentro del rango del período",
          color: "red",
        });
        return;
      }
    }
    
    setLoading(true);
    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/update-deadlines`, {
        reportIds: selectedReports,
        deadline: newDeadline,
        email: session?.user?.email,
      });
      showNotification({
        title: "Éxito",
        message: "Fechas actualizadas correctamente",
        color: "green",
      });
      setOpenedDeadlineModal(false);
      setSelectedReports([]);
      fetchReports(page, search);
    } catch (error) {
      showNotification({
        title: "Error",
        message: "No se pudieron actualizar las fechas",
        color: "red",
      });
    }
    setLoading(false);
  };

  const rows = pubReports.map((pubReport) => {
    const isSelected = selectedReports.includes(pubReport._id);
    return (
      <Table.Tr key={pubReport._id}>
        <Table.Td>
          <Group>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedReports((prev) => [...prev, pubReport._id]);
                } else {
                  setSelectedReports((prev) =>
                    prev.filter((id) => id !== pubReport._id)
                  );
                }
              }}
            />
            {pubReport.report.name}
          </Group>
        </Table.Td>
        <Table.Td>
          {dayjs(pubReport.deadline).format("DD/MM/YYYY")}
        </Table.Td>
        <Table.Td>
          <Progress value={(pubReport.filled_reports.length / pubReport.report.producers.length) * 100} />
        </Table.Td>
        <Table.Td>
          {pubReport.filled_reports.filter((r) => r.status === "En Revisión").length}
        </Table.Td>
        <Table.Td>
          <Group>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconFileDescription size={14} />}
              onClick={() => router.push(`${pubReport._id}`)}
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
      <Title ta="center" mb={"md"}>
        Gestión Informes de Productores
      </Title>
      <TextInput
        placeholder="Buscar informes"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        mb="md"
      />
      <Group mb="sm">
        <Button
          variant="outline"
          onClick={() => router.push("/admin/reports/producers")}
          leftSection={<IconArrowLeft size={16} />}
        >
          Ir a Configuración
        </Button>
        <Button
          onClick={() => {
            const allIds = pubReports.map((r) => r._id);
            setSelectedReports(allIds);
            setOpenedDeadlineModal(true);
          }}
          leftSection={<IconCalendar size={16} />}
        >
          Cambiar fecha a todos
        </Button>
        <Button
          disabled={selectedReports.length === 0}
          onClick={() => setOpenedDeadlineModal(true)}
        >
          Cambiar fecha seleccionados
        </Button>
      </Group>
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nombre de Informe</Table.Th>
            <Table.Th>Fecha de entrega</Table.Th>
            <Table.Th>Progreso</Table.Th>
            <Table.Th>En Revisión</Table.Th>
            <Table.Th>Acciones</Table.Th>
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
        />
      </Center>

      <Modal
        opened={openedDeadlineModal}
        onClose={() => {
          setOpenedDeadlineModal(false);
          setNewDeadline(null);
        }}
        title="Actualizar fecha de entrega"
        centered
      >
        <Stack>
          {currentPeriod && currentPeriod.producer_report_start_date && currentPeriod.producer_report_end_date && (
            <Text size="sm" c="dimmed" mb="xs">
              Rango permitido (Según fechas Inicio de Informes Productor - Fin de Informes Productor ): {new Date(currentPeriod.producer_report_start_date).toLocaleDateString('es-ES')} - {new Date(currentPeriod.producer_report_end_date).toLocaleDateString('es-ES')}
            </Text>
          )}
          <DateInput
            label="Nueva fecha límite"
            value={newDeadline}
            onChange={setNewDeadline}
            minDate={currentPeriod?.producer_report_start_date ? new Date(currentPeriod.producer_report_start_date) : undefined}
            maxDate={currentPeriod?.producer_report_end_date ? new Date(currentPeriod.producer_report_end_date) : undefined}
            locale="es"
            placeholder="Selecciona una fecha dentro del rango permitido"
          />
          <Button 
            loading={loading} 
            onClick={updateDeadlines}
            disabled={!newDeadline || (currentPeriod?.producer_report_start_date && currentPeriod?.producer_report_end_date && (
              new Date(newDeadline) < new Date(currentPeriod.producer_report_start_date) ||
              new Date(newDeadline) > new Date(currentPeriod.producer_report_end_date)
            ))}
          >
            Actualizar
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
};

export default AdminPubReportsPage;
