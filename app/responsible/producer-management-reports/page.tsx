"use client";

import { useEffect, useState } from "react";
import {
  Container,
  Table,
  Button,
  Pagination,
  Center,
  TextInput,
  Title,
  Tooltip,
  Group,
  Progress,
  rem,
  Stack,
  Text,
  Badge,
} from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowBigUpFilled,
  IconArrowBigDownFilled,
  IconArrowsTransferDown,
  IconFileDescription,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useSort } from "@/app/hooks/useSort";
import { usePeriod } from "@/app/context/PeriodContext";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";

/* =======================
   INTERFACES
======================= */

interface Dependency {
  _id: string;
  name: string;
}

interface Report {
  _id: string;
  name: string;
  producers: Dependency[];
}

interface Period {
  _id: string;
  name: string;
  producer_end_date: Date;
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
  updatedAt: string;
}

/* =======================
   COMPONENT
======================= */

const ProducerManagementReportsPage = () => {
  const router = useRouter();
  const { selectedPeriodId } = usePeriod();
  const { data: session } = useSession();

  const [reports, setReports] = useState<PublishedReport[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");

  const { sortedItems, handleSort, sortConfig } =
    useSort<PublishedReport>(reports, { key: null, direction: "asc" });

  /* =======================
     FETCH REPORTS
  ======================= */

  const fetchReports = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pProducerReports`,
        {
          params: {
            email: session?.user?.email,
            periodId: selectedPeriodId,
            page,
            search,
          },
        }
      );

      if (response.data) {
        setReports(response.data.publishedReports || []);
        setTotalPages(response.data.totalPages || 1);
      }
    } catch (error) {
      console.error(error);
      showNotification({
        title: "Error",
        message: "No fue posible obtener los informes de productores",
        color: "red",
      });
      setReports([]);
    }
  };

  useEffect(() => {
    if (session?.user?.email && selectedPeriodId) {
      fetchReports();
    }
  }, [session?.user?.email, selectedPeriodId, page, search]);

  /* =======================
     HELPERS
  ======================= */

  const getProgress = (report: PublishedReport) => {
    const total = report.report.producers.length;
    const loaded = report.filled_reports.length;
    return {
      total,
      loaded,
      percentage: total > 0 ? (loaded / total) * 100 : 0,
    };
  };

  /* =======================
     ROWS
  ======================= */

  const rows = sortedItems.map((pubReport) => {
    const progress = getProgress(pubReport);

    return (
      <Table.Tr key={pubReport._id}>
        <Table.Td>
          <Center>
            <Badge variant="light">{pubReport.period.name}</Badge>
          </Center>
        </Table.Td>

        <Table.Td>{pubReport.report.name}</Table.Td>

        <Table.Td>
          <Center>
            {dateToGMT(pubReport.period.producer_end_date)}
          </Center>
        </Table.Td>

        <Table.Td>
          <Center>{dateToGMT(pubReport.updatedAt)}</Center>
        </Table.Td>

        <Table.Td>
          <Center>
            <Tooltip label="Ver detalle del informe">
              <Stack
                gap={0}
                style={{ cursor: "pointer" }}
                onClick={() =>
                  router.push(
                    `/responsible/producer-management-reports/${pubReport._id}`
                  )
                }
              >
                <Progress.Root mt="xs" size="md" radius="md" w={rem(200)}>
                  <Progress.Section value={progress.percentage} />
                </Progress.Root>
                <Text size="sm" ta="center" mt={5}>
                  {progress.loaded} de {progress.total}
                </Text>
              </Stack>
            </Tooltip>
          </Center>
        </Table.Td>

        <Table.Td>
          <Center>
            <Button
              variant="outline"
              onClick={() =>
                router.push(
                  `/responsible/producer-management-reports/${pubReport._id}`
                )
              }
            >
              <IconFileDescription size={16} />
            </Button>
          </Center>
        </Table.Td>
      </Table.Tr>
    );
  });

  /* =======================
     RENDER
  ======================= */

  return (
    <Container size="xl">
      <DateConfig />

      <Title ta="center" mb="md">
        Informes de gestión de productores
      </Title>

      <TextInput
        placeholder="Buscar informes"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />

      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th onClick={() => handleSort("period.name")}>
              <Center inline>
                Periodo
                {sortConfig.key === "period.name" ? (
                  sortConfig.direction === "asc" ? (
                    <IconArrowBigUpFilled size={16} />
                  ) : (
                    <IconArrowBigDownFilled size={16} />
                  )
                ) : (
                  <IconArrowsTransferDown size={16} />
                )}
              </Center>
            </Table.Th>

            <Table.Th onClick={() => handleSort("report.name")}>
              <Center inline>
                Nombre
                {sortConfig.key === "report.name" ? (
                  sortConfig.direction === "asc" ? (
                    <IconArrowBigUpFilled size={16} />
                  ) : (
                    <IconArrowBigDownFilled size={16} />
                  )
                ) : (
                  <IconArrowsTransferDown size={16} />
                )}
              </Center>
            </Table.Th>

            <Table.Th>
              <Center>Plazo Máximo</Center>
            </Table.Th>

            <Table.Th>
              <Center>Última Modificación</Center>
            </Table.Th>

            <Table.Th>
              <Center>Progreso</Center>
            </Table.Th>

            <Table.Th>
              <Center>Acciones</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          {rows.length > 0 ? (
            rows
          ) : (
            <Table.Tr>
              <Table.Td colSpan={6} ta="center">
                No hay informes de gestión de productores en el periodo
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Center>
        <Pagination
          mt={15}
          value={page}
          onChange={setPage}
          total={totalPages}
        />
      </Center>
    </Container>
  );
};

export default ProducerManagementReportsPage;
