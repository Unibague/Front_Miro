"use client";

import { use, useEffect, useState } from "react";
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
  Pill,
  PillGroup,
  Progress,
  rem,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBrandGoogleDrive,
  IconFileDescription,
  IconTrash
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { dateToGMT } from "@/app/components/DateConfig";
import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import { useRole } from "../context/RoleContext";
import { usePeriod } from "../context/PeriodContext";

interface Report {
  _id: string;
  name: string;
  description: string;
  report_example: DriveFile;
  requires_attachment: boolean;
  created_by: {
    email: string;
    full_name: string;
  };
  dimensions: Dimension[];
  producers: Dependency[];
}

interface DriveFile {
  id: string;
  name: string;
  view_link: string;
}

interface Dependency {
  _id: string;
  name: string;
  responsible: string;
}

interface Dimension {
  _id: string;
  name: string;
  responsible: Dependency;
}

interface Period {
  _id: string;
  name: string;
  responsible_start_date: Date;
  responsible_end_date: Date;
}

interface FilledReport {
  _id: string;
  dimension: Dimension;
  send_by: any;
  loaded_date: Date;
  report_file: File;
  attachments: File[];
  status: string | null;
  status_date: Date;
  observations: string | null;
  evaluated_by: any;
}

interface PublishedReport {
  _id: string;
  report: Report;
  period: Period;
  filled_reports: FilledReport[];
  folder_id: string;
}

const AdminPubReportsPage = () => {
  const { data: session } = useSession();
  const { selectedPeriodId } = usePeriod();
  const { userRole, setUserRole } = useRole();
  const [pubReports, setPubReports] = useState<PublishedReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<
    PublishedReport | null | undefined
  >(null);
  const [filledReportRows, setFilledReportRows] = useState<FilledReport[]>([]);
  const [filledReport, setFilledReport] = useState<FilledReport | null>(null);
  const [opened, setOpened] = useState<boolean>(false);
  const [statusOpened, setStatusOpened] = useState<boolean>(false);
  const [newStatus, setNewStatus] = useState<string | null>(null);
  const [observations, setObservations] = useState<string | null>(null);
  const [filledReportsHistory, setFilledReportsHistory] = useState<
    FilledReport[]
  >([]);
  const [frameFile, setFrameFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const theme = useMantineTheme();

  const fetchReports = async (page: number, search: string) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/`,
        {
          params: {
            page: page,
            search: search,
            email: session?.user?.email,
            periodId: selectedPeriodId,
          },
        }
      );
      if (response.data) {
        console.log(response.data);
        setPubReports(response.data.publishedReports);
        setTotalPages(response.data.totalPages);
        if (selectedReport) {
          setSelectedReport(
            response.data.publishedReports.find(
              (report: any) => report._id === selectedReport._id
            )
          );
          setFilledReportRows(
            response.data.publishedReports.find(
              (report: any) => report._id === selectedReport._id
            ).filled_reports
          );
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
      const delayDebounceFn = setTimeout(() => {
        fetchReports(page, search);
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [search, session?.user?.email, page]);

  const giveReportPercentage = (pubReport: PublishedReport) => {
    return (
      (pubReport.filled_reports?.length / pubReport.report.producers.length) * 100
    );
  };

  const truncateString = (str: string, maxLength: number = 20): string => {
    return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
  };

  const handleOpenModalStatus = (index: number, newStatus: string | null) => {
    setStatusOpened(true);
    const report = selectedReport?.filled_reports[index];
    if (report) {
      setFilledReport(report);
    }
    setNewStatus(newStatus);
  };

  const handleCloseModalStatus = () => {
    setLoading(false);
    setStatusOpened(false);
    setNewStatus(null);
    setFilledReport(null);
    setObservations(null);
    fetchReports(page, search);
  };

  const handleUpdateStatus = async () => {
    setLoading(true);
    if (filledReport && newStatus) {
      if (newStatus === "Rechazado" && !observations) {
        showNotification({
          title: "Error",
          message: "Por favor ingrese una razón de rechazo",
          color: "red",
        });
        setLoading(false);
        return;
      }
      try {
        const response = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/pReports/status`,
          {
            reportId: selectedReport?._id,
            filledRepId: filledReport._id,
            status: newStatus,
            observations: observations,
            email: session?.user?.email,
          }
        );
        if (response.data) {
          handleCloseModalStatus();
          showNotification({
            title: "Éxito",
            message: "Estado actualizado correctamente",
            color: "green",
          });
          fetchReports(page, search);
        }
      } catch (error) {
        handleCloseModalStatus();
        showNotification({
          title: "Error",
          message: "Ocurrió un error al actualizar el estado",
          color: "red",
        });
      }
    }
  };

  const handleDeletePubReport = async (reportId: string) => {
    try {
      const response = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/${reportId}`,
        {
          params: {
            email: session?.user?.email,
          },
        }
      );
      if (response.data) {
        showNotification({
          title: "Éxito",
          message: "Informe eliminado correctamente",
          color: "green",
        });
        fetchReports(page, search);
      }
    } catch (error: any) {
      if (error.response.status === 400) {
        showNotification({
          title: "Error",
          message: "Ocurrió un error al eliminar el informe",
          color: "red",
          autoClose: 1200,
        });
        showNotification({
          title: "Error",
          message:
            "El informe que intentas borrar tiene borradores de envío de los responsables",
          color: "red",
          autoClose: 4000,
        });
      }
    }
  };

  const rows = pubReports?.length ? (
    pubReports.map((pubReport: PublishedReport) => {
      return (
        <Table.Tr key={pubReport._id}>
          <Table.Td w={rem(70)}>
            <Center>
              <Badge size={rem(12)} h={rem(8)} variant="light" p={"xs"}>
                {pubReport.period.name}
              </Badge>
            </Center>
          </Table.Td>
          <Table.Td>{pubReport.report.name}</Table.Td>
          <Table.Td>
            <Center>
              <Stack gap={0} w={"100%"}>
                <Progress.Root
                  mt={"xs"}
                  size={"md"}
                  radius={"md"}
                  w={"100%"}
                  onClick={() => router.push(`reports/${pubReport._id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <Progress.Section
                    value={giveReportPercentage(pubReport)}
                  />
                </Progress.Root>
                <Text size="sm" ta={"center"} mt={rem(5)}>
                  {pubReport.filled_reports.length} de{" "}
                  {pubReport.report.producers.length}
                </Text>
              </Stack>
            </Center>
          </Table.Td>
          <Table.Td>
            <Center>
              {pubReport.filled_reports.reduce((acc, filledReport) => {
                if (filledReport.status === "En Revisión") {
                  return acc + 1;
                }
                return acc;
              }, 0)}
            </Center>
          </Table.Td>
          <Table.Td>
            <Center>
              <Group>
                <Tooltip
                  label="Ver informes cargados"
                  transitionProps={{ transition: "fade-up", duration: 300 }}
                >
                  <Button
                    variant="outline"
                    onClick={() => router.push(`reports/${pubReport._id}`)}
                  >
                    <IconFileDescription size={16} />
                  </Button>
                </Tooltip>
                <Tooltip
                  label={
                    userRole !== "Administrador" ? "No tienes permiso para borrar" :
                    pubReport.filled_reports.length > 0
                      ? "No puedes borrar porque hay informes cargados"
                      : "Borrar publicación del informe"
                  }
                  transitionProps={{ transition: "fade-up", duration: 300 }}
                >
                  <Button
                    variant="outline"
                    color="red"
                    disabled={pubReport.filled_reports.length > 0 || userRole !== "Administrador"}
                    onClick={() => handleDeletePubReport(pubReport._id)}
                  >
                    <IconTrash size={16} />
                  </Button>
                </Tooltip>
              </Group>
            </Center>
          </Table.Td>
        </Table.Tr>
      );
    })
  ) : (
    <Table.Tr>
      <Table.Td colSpan={10}>No se encontraron informes publicados</Table.Td>
    </Table.Tr>
  );

  return (
    <Container size="xl">
      <Title ta="center" mb={"md"}>
        Gestión Informes de Productores
      </Title>
      <TextInput
        placeholder="Buscar en los informes publicados"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />
      <Group justify="space-between">
        <Button
          onClick={() => router.push("admin/reports/producers")}
          variant="outline"
          leftSection={<IconArrowLeft size={16} />}
        >
          Ir a Configuración de Informes
        </Button>

        <Button
          onClick={() => router.push("/reports/update")}
          variant="outline"
          leftSection={<IconArrowRight size={16} />}
        >
          Cambiar fechas de entrega
        </Button>

      </Group>
      <Table striped withTableBorder mt="md">
      <Table.Thead>
          <Table.Tr>
            <Table.Th miw={rem(60)}>
              <Center>
                Periodo
              </Center>
            </Table.Th>
            <Table.Th>
              <Center inline>
                Nombre de Informe
              </Center>
            </Table.Th>
            <Table.Th>
              <Center>Progreso de Envíos</Center>
            </Table.Th>
            <Table.Th>
              <Center>Pendientes por Evaluar</Center>
            </Table.Th>
            <Table.Th>
              <Center miw={rem(130)}>Acciones</Center>
            </Table.Th>
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
    </Container>
  )
}
export default AdminPubReportsPage;
