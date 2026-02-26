"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import {
  Badge,
  Button,
  Center,
  Container,
  Group,
  Pagination,
  Progress,
  rem,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconArrowLeft, IconFileDescription, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { dateNow } from "@/app/components/DateConfig";
import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import { usePeriod } from "@/app/context/PeriodContext";

interface Dimension {
  _id: string;
  name: string;
}

interface Report {
  _id: string;
  name: string;
  dimensions: Dimension[];
  ai_generation?: {
    source_reports?: {
      producer?: { _id: string; name: string };
      responsible?: { _id: string; name: string };
    };
  };
}

interface Period {
  _id: string;
  name: string;
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

const PAGE_SIZE = 10;

const isAmbitPublishedReport = (pubReport: PublishedReport) =>
  Boolean(
    pubReport?.report?.ai_generation?.source_reports?.producer &&
      pubReport?.report?.ai_generation?.source_reports?.responsible
  );

export default function AdminAmbitUploadedReportsPage() {
  const { data: session } = useSession();
  const { selectedPeriodId } = usePeriod();
  const router = useRouter();

  const [allReports, setAllReports] = useState<PublishedReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchReports = async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pReports/all`, {
        params: {
          page: 1,
          limit: 500,
          search,
          email: session.user.email,
          periodId: selectedPeriodId,
        },
      });

      const publishedReports: PublishedReport[] = response.data?.publishedReports || [];
      setAllReports(publishedReports.filter(isAmbitPublishedReport));
    } catch (error) {
      console.error(error);
      setAllReports([]);
      showNotification({
        title: "Error",
        message: "No se pudieron cargar los informes de ambito publicados.",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.user?.email) return;
    fetchReports();
  }, [session?.user?.email, selectedPeriodId]);

  useEffect(() => {
    if (!session?.user?.email) return;
    const timer = setTimeout(() => {
      fetchReports();
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const filteredReports = useMemo(() => {
    if (!search.trim()) return allReports;
    const q = search.toLowerCase();
    return allReports.filter(
      (pub) =>
        pub.report?.name?.toLowerCase().includes(q) ||
        pub.period?.name?.toLowerCase().includes(q)
    );
  }, [allReports, search]);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));
  const paginatedReports = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredReports.slice(start, start + PAGE_SIZE);
  }, [filteredReports, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const giveReportPercentage = (pubReport: PublishedReport) => {
    const total = pubReport.report?.dimensions?.length || 0;
    if (total === 0) return 0;
    return (pubReport.filled_reports.length / total) * 100;
  };

  const pendingToEvaluate = (pubReport: PublishedReport) =>
    pubReport.filled_reports.reduce((acc, filledReport) => {
      const status = (filledReport.status || "").toLowerCase();
      if (status.includes("revisi")) {
        return acc + 1;
      }
      return acc;
    }, 0);

  const handleDeletePubReport = (reportId: string) => {
    modals.openConfirmModal({
      title: "Confirmar eliminacion",
      centered: true,
      children: (
        <Text size="sm">
          Estas seguro de eliminar esta publicacion del informe de ambito?
          <br />
          Esta accion no se puede deshacer.
        </Text>
      ),
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/pReports/delete/${reportId}`, {
            params: { email: session?.user?.email },
          });
          showNotification({
            title: "Eliminado",
            message: "Publicacion eliminada correctamente.",
            color: "green",
          });
          await fetchReports();
        } catch (error) {
          console.error(error);
          showNotification({
            title: "Error",
            message: "No se pudo eliminar la publicacion.",
            color: "red",
          });
        }
      },
    });
  };

  const rows =
    paginatedReports.length > 0 ? (
      paginatedReports.map((pubReport) => (
        <Table.Tr key={pubReport._id}>
          <Table.Td>
            <Center>
              <Badge variant="light">{pubReport.period?.name || "-"}</Badge>
            </Center>
          </Table.Td>
          <Table.Td>{pubReport.report?.name || "-"}</Table.Td>
          <Table.Td>
            <Center>
              <div style={{ width: 220 }}>
                <Progress.Root size="sm" radius="xl">
                  <Progress.Section value={giveReportPercentage(pubReport)} />
                </Progress.Root>
                <Text size="sm" ta="center" mt={rem(5)}>
                  {pubReport.filled_reports.length} de {pubReport.report?.dimensions?.length || 0}
                </Text>
              </div>
            </Center>
          </Table.Td>
          <Table.Td>
            <Center>{pendingToEvaluate(pubReport)}</Center>
          </Table.Td>
          <Table.Td>
            <Center>
              <Group gap="xs">
                <Tooltip label="Ver informes cargados">
                  <Button variant="outline" onClick={() => router.push(`/admin/reports/uploaded/${pubReport._id}`)}>
                    <IconFileDescription size={18} />
                  </Button>
                </Tooltip>
                <Tooltip
                  label={
                    new Date(pubReport.deadline) < dateNow()
                      ? "No puedes borrar informes que ya culminaron"
                      : pubReport.filled_reports.length > 0
                        ? "No puedes borrar porque hay informes cargados"
                        : "Borrar publicacion del informe"
                  }
                >
                  <Button
                    variant="outline"
                    color="red"
                    disabled={
                      pubReport.filled_reports.length > 0 || new Date(pubReport.deadline) < dateNow()
                    }
                    onClick={() => handleDeletePubReport(pubReport._id)}
                  >
                    <IconTrash size={18} />
                  </Button>
                </Tooltip>
              </Group>
            </Center>
          </Table.Td>
        </Table.Tr>
      ))
    ) : (
      <Table.Tr>
        <Table.Td colSpan={5}>
          <Text ta="center" c="dimmed">
            {loading ? "Cargando informes publicados..." : "No se encontraron informes de ambito publicados"}
          </Text>
        </Table.Td>
      </Table.Tr>
    );

  return (
    <Container size="xl">
      <Title ta="center" mb="md">
        Gestion de Informes de ambitos
      </Title>

      <TextInput
        placeholder="Buscar en los informes publicados"
        value={search}
        onChange={(event) => {
          setPage(1);
          setSearch(event.currentTarget.value);
        }}
        mb="md"
      />

      <Group>
        <Button
          onClick={() => router.push("/admin/reports/ambitos")}
          variant="outline"
          leftSection={<IconArrowLeft size={16} />}
        >
          Ir a Configuracion de Informes
        </Button>
      </Group>

      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th miw={rem(70)}>
              <Center>Periodo</Center>
            </Table.Th>
            <Table.Th>Informe</Table.Th>
            <Table.Th>
              <Center>Progreso</Center>
            </Table.Th>
            <Table.Th>
              <Center>Pendientes por Evaluar</Center>
            </Table.Th>
            <Table.Th>
              <Center>Acciones</Center>
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
  );
}
