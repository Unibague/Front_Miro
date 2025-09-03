"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import {
  Badge,
  Button,
  Center,
  Container,
  Table,
  Text,
  TextInput,
  Title,
  Pagination,
  Tooltip
} from "@mantine/core";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { IconBulb, IconReportAnalytics } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { usePeriod } from "@/app/context/PeriodContext";
import dayjs from "dayjs";
import "dayjs/locale/es";

interface Report {
  _id: string;
  name: string;
    description: string;
}

interface Period {
  _id: string;
  name: string;
    producer_report_start_date?: string | Date;
  producer_report_end_date?: string | Date;
}

interface User {
  email: string;
  full_name: string;
}

interface DriveFile {
  id: string;
  name: string;
  view_link: string;
  download_link: string;
}

interface FilledReport {
  _id: string;
  send_by: User;
  loaded_date: Date;
  report_file: DriveFile;
  status: string;
  status_date: Date;
}

interface PublishedReport {
  _id: string;
  report: Report;
  period: Period;
  filled_reports: FilledReport[];
  deadline: string | Date;
}

const StatusColor: Record<string, string> = {
  Pendiente: "orange",
  "En Borrador": "grape",
  "En Revisión": "cyan",
  Aprobado: "lime",
  Rechazado: "red",
};

const ProducerReportsPage = () => {
  const router = useRouter();
  const { selectedPeriodId } = usePeriod();
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [publishedReports, setPublishedReports] = useState<PublishedReport[]>([]);
  const [pagePending, setPagePending] = useState(1);
  const [totalPagesPending, setTotalPagesPending] = useState(1);
  const [pageCompleted, setPageCompleted] = useState(1);
  const [totalPagesCompleted, setTotalPagesCompleted] = useState(1);
  const [pendingReportsCount, setPendingReportsCount] = useState<number>(0);
  const [nextDeadline, setNextDeadline] = useState<string | null>(null);

  const [validProducerPeriod, setValidProducerPeriod] = useState<{ [key: string]: boolean }>({});
  const [loadingProducerPeriodIds, setLoadingProducerPeriodIds] = useState<Set<string>>(new Set());

  const validateProducerPeriodDates = async (periodId: string) => {
  if (loadingProducerPeriodIds.has(periodId) || validProducerPeriod[periodId] !== undefined) return;

  setLoadingProducerPeriodIds(prev => new Set(prev.add(periodId)));

  try {
    const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/periods/byId/${periodId}`);
    const { producer_report_start_date, producer_report_end_date } = response.data;
    const today = new Date();
    const isValid = today <= new Date(producer_report_end_date);
    setValidProducerPeriod(prev => ({ ...prev, [periodId]: isValid }));
  } catch (error) {
    console.error("Error validating producer period", error);
  } finally {
    setLoadingProducerPeriodIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(periodId);
      return newSet;
    });
  }
};


  useEffect(() => {
    if (session?.user?.email) {
      const delayDebounceFn = setTimeout(() => {
        fetchReports();
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [search, session?.user?.email, selectedPeriodId, pagePending, pageCompleted]);

useEffect(() => {
  publishedReports.forEach(report => {
    validateProducerPeriodDates(report.period._id);
  });
}, [publishedReports]);

const fetchReports = async () => {
  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/producer`,
      {
        params: {
          search: search,
          email: session?.user?.email,
          periodId: selectedPeriodId,
        },
      }
    );

    if (response.data) {

      console.log(response.data)

      const pending = response.data.pendingReports;
      const completed = response.data.completedReports;

      setPublishedReports([...pending, ...completed]);
      setPendingReportsCount(pending.length);
      setNextDeadline(
        pending.length > 0
          ? dayjs(pending[0].deadline).format("DD/MM/YYYY")
          : null
      );
    }
  } catch (error) {
    console.error("Error fetching producer reports:", error);
    setPublishedReports([]);
    setPendingReportsCount(0);
    setNextDeadline(null);
  }
};


const pendingReports = publishedReports.filter(
  (pRep) =>
    !pRep.filled_reports.length || pRep.filled_reports[0].status === "Pendiente"
);

const completedReports = publishedReports.filter(
  (pRep) =>
    pRep.filled_reports.length && pRep.filled_reports[0].status !== "Pendiente"
);


  const renderReportRows = (reports: PublishedReport[]) =>
    reports.map((pRep) => (
      <Table.Tr key={pRep._id}>
        <Table.Td>{pRep.period?.name}</Table.Td>
        <Table.Td>{dateToGMT(pRep.deadline)}</Table.Td> 
        <Table.Td>{pRep.report.name}</Table.Td>
        <Table.Td>{pRep.report.description}</Table.Td>
        <Table.Td>
          <Center>
            <Badge color={StatusColor[pRep.filled_reports[0]?.status] ?? "orange"} variant={"light"}>
              {pRep.filled_reports[0]?.status ?? "Pendiente"}
            </Badge>
          </Center>
        </Table.Td>
        <Table.Td>
          <Center>
           
          </Center>
        </Table.Td>
        <Table.Td>
          <Center>
<Tooltip
  label={validProducerPeriod[pRep.period._id] === false ? "Plazo terminado para acceder a este informe" : "Ver informe"}
  withArrow
  disabled={validProducerPeriod[pRep.period._id]}
  color={validProducerPeriod[pRep.period._id] === false ? "red" : "blue"}
>
  <div>
    <Button
      onClick={() => {
        if (validProducerPeriod[pRep.period._id]) {
          router.push(`reports/${pRep._id}`);
        } else {
          alert(
            `No puedes acceder a este informe aún. Solo está disponible entre ` +
            `${dayjs(pRep.period.producer_report_start_date).format("DD/MM/YYYY")} y ` +
            `${dayjs(pRep.period.producer_report_end_date).format("DD/MM/YYYY")}`
          );
        }
      }}
      variant="outline"
      color={validProducerPeriod[pRep.period._id] ? "blue" : "gray"}
      disabled={validProducerPeriod[pRep.period._id] === false}
    >
      <IconReportAnalytics size={18} />
    </Button>
  </div>
</Tooltip>
          </Center>
        </Table.Td>
      </Table.Tr>
    ));

  return (
    <Container size="xl">
      <DateConfig />

      {/* Reportes Pendientes */}
      <Title ta="center" mb="md">
        Reportes Pendientes
      </Title>
      <Text ta="center" mt="sm" mb="md">
        {pendingReportsCount > 0 ? (
          <>
            Tienes <strong>{pendingReportsCount}</strong> reportes pendientes.
            <br />
            {nextDeadline ? `La fecha de vencimiento es el ${nextDeadline}.` : "No hay fecha de vencimiento próxima."}
          </>
        ) : (
          <>No tienes reportes pendientes.</>
        )}
      </Text>

      <TextInput
        placeholder="Buscar reportes..."
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />

      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Periodo</Table.Th>
            <Table.Th>Fecha Límite</Table.Th>
            <Table.Th>Nombre de Informe</Table.Th>
            <Table.Th>Descripción</Table.Th>
            <Table.Th>
              <Center>Estado</Center>
            </Table.Th>
            <Table.Th>
              <Center>Fecha de Estado</Center>
            </Table.Th>
            <Table.Th>
              <Center>Ver Informe</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
        {publishedReports.length > 0 ? (
            renderReportRows(pendingReports)
          ) : (
            <Table.Tr>
              <Table.Td colSpan={6} align="center">
                No hay reportes pendientes.
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Center>
      <Pagination 
          mt={15}
          value={pagePending} 
          onChange={setPagePending} 
          total={totalPagesPending} 
          siblings={1}
          boundaries={3}
  />
      </Center>

      {/* Reportes Entregados */}
      <Title ta="center" mb="md">
        Reportes Entregados
      </Title>

      <Table striped withTableBorder mt="md">
        <Table.Tbody>
          {completedReports.length > 0 ? (
            renderReportRows(completedReports)
          ) : (
            <Table.Tr>
              <Table.Td colSpan={6} align="center">
                No hay reportes entregados.
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Center>
      <Pagination 
          mt={15}
          value={pagePending} 
          onChange={setPagePending} 
          total={totalPagesPending} 
          siblings={1}
          boundaries={3}
  />
      </Center>
    </Container>
  );
};

export default ProducerReportsPage;
