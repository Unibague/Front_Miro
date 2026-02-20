"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import {
  Badge,
  Button,
  Center,
  Container,
  Group,
  Select,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { dateToGMT } from "@/app/components/DateConfig";
import { IconBulb, IconReportAnalytics } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { usePeriod } from "@/app/context/PeriodContext";
import dayjs from "dayjs";
import "dayjs/locale/es";

interface Report {
  _id: string;
  name: string;
}

interface Dimension {
  _id: string;
  name: string;
  responsible?: { email: string; name: string };
}

interface Period {
  _id: string;
  name: string;
  responsible_start_date: Date;
  responsible_end_date: Date;
}

interface DriveFile {
  id: string;
  name: string;
  view_link: string;
  download_link: string;
}

interface User {
  email: string;
  full_name: string;
}

interface FilledReport {
  _id: string;
  dimension: Dimension;
  send_by: any;
  loaded_date: Date;
  report_file: DriveFile;
  attachments: DriveFile[];
  status: string;
  status_date: Date;
  observations: string;
  evaluated_by: User;
}

interface PublishedReport {
  _id: string;
  report: {
    _id: string;
    name: string;
    description: string;
    report_example_id: string;
    report_example_link: string;
    report_example_download: string;
    requires_attachment: boolean;
    file_name: string;
    created_by: {
      email: string;
      full_name: string;
    };
    dimensions: Dimension[];
  };
  period: Period;
  filled_reports: FilledReport[];
  folder_id: string;
  deadline: Date;
}

const StatusColor: Record<string, string> = {
  Pendiente: "orange",
  "En Borrador": "grape",
  "En Revisión": "cyan",
  Aprobado: "lime",
  Rechazado: "red",
};

const ResponsibleReportsPage = () => {
  const router = useRouter();
  const { selectedPeriodId } = usePeriod();
  const { data: session } = useSession();

  const [search, setSearch] = useState("");
  const [selectedDimensionFilter, setSelectedDimensionFilter] = useState<string | null>(null);
  const [userDimensions, setUserDimensions] = useState<Dimension[]>([]);
  const [pendingReports, setPendingReports] = useState<PublishedReport[]>([]);
  const [deliveredReports, setDeliveredReports] = useState<PublishedReport[]>([]);
  const [pendingReportsCount, setPendingReportsCount] = useState<number>(0);
  const [nextDeadline, setNextDeadline] = useState<string | null>(null);

  const [validPeriod, setValidPeriod] = useState<{ [key: string]: boolean }>({});
  const [loadingPeriodIds, setLoadingPeriodIds] = useState<Set<string>>(new Set());

  const validatePeriodDates = async (periodId: string) => {
    if (loadingPeriodIds.has(periodId) || validPeriod[periodId] !== undefined) return;

    setLoadingPeriodIds(prev => new Set(prev.add(periodId)));

    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/periods/byId/${periodId}`);
      const { responsible_start_date, responsible_end_date } = response.data;
      const today = new Date();
      const isValid = today <= new Date(responsible_end_date);
      setValidPeriod(prev => ({ ...prev, [periodId]: isValid }));
    } catch (error) {
      console.error("Error validating period", error);
    } finally {
      setLoadingPeriodIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(periodId);
        return newSet;
      });
    }
  };

  useEffect(() => {
    [...pendingReports, ...deliveredReports].forEach(report => validatePeriodDates(report.period._id));
  }, [pendingReports, deliveredReports]);

  const fetchReports = async () => {
    try {
      const params: any = {
        search,
        email: session?.user?.email,
        periodId: selectedPeriodId,
      };
      if (selectedDimensionFilter) {
        params.dimensionId = selectedDimensionFilter;
      }
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pReports/responsible`, {
        params: {
          search,
          email: session?.user?.email,
          periodId: selectedPeriodId,
        },
      });

      if (response.data) {
        let filteredPending = response.data.pendingReports || [];
        let filteredDelivered = response.data.deliveredReports || [];
        
        if (selectedDimensionFilter) {
          filteredPending = filteredPending.filter((report: PublishedReport) => 
            report.report.dimensions?.some(dim => dim._id === selectedDimensionFilter)
          );
          filteredDelivered = filteredDelivered.filter((report: PublishedReport) => 
            report.report.dimensions?.some(dim => dim._id === selectedDimensionFilter)
          );
        }
        
        setPendingReports(filteredPending);
        setDeliveredReports(filteredDelivered);
        setPendingReportsCount(filteredPending.length);

        const sorted = response.data.pendingReports?.sort((a: PublishedReport, b: PublishedReport) =>
          dayjs(a.deadline).isBefore(dayjs(b.deadline)) ? -1 : 1
        );

        setNextDeadline(
          sorted.length > 0 ? dayjs(sorted[0].deadline).format("DD/MM/YYYY") : null
        );
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
    }
  };

  const fetchUserDimensions = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/dimensions/responsible`,
        { params: { email: session?.user?.email } }
      );
      setUserDimensions(response.data || []);
    } catch (error) {
      console.error("❌ Error fetching user dimensions:", error);
      setUserDimensions([]);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchUserDimensions();
    }
  }, [session?.user?.email]);

  useEffect(() => {
    if (session?.user?.email) {
      const delayDebounceFn = setTimeout(() => {
        fetchReports();
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [search, session?.user?.email, selectedPeriodId, selectedDimensionFilter]);

  const renderReportRows = (reports: PublishedReport[]) =>
    reports.map((pRep) => (
      <Table.Tr key={pRep._id}>
        <Table.Td>{pRep.period.name}</Table.Td>
        <Table.Td>{dateToGMT(pRep.deadline)}</Table.Td>
        <Table.Td>{pRep.report.name}</Table.Td>
        <Table.Td>
          <Center>
            <Badge color={StatusColor[pRep.filled_reports[0]?.status] ?? "orange"} variant="light">
              {pRep.filled_reports[0]?.status ?? "Pendiente"}
            </Badge>
          </Center>
        </Table.Td>
        <Table.Td>
          <Center>
            {pRep.filled_reports[0]?.status_date ? dateToGMT(pRep.filled_reports[0].status_date) : ""}
          </Center>
        </Table.Td>
        <Table.Td>
          <Center>
            <Tooltip
label={validPeriod[pRep.period._id] === false ? "Plazo terminado para acceder a este informe" : "Ver informe"}
              withArrow
              color={validPeriod[pRep.period._id] === false ? "red" : "blue"}
            >
              <div>
                <Button
                  onClick={() => {
                    if (validPeriod[pRep.period._id]) {
                      router.push(`reports/${pRep._id}`);
                    } else {
                      alert(
                        `No puedes acceder a este informe aún. Solo está disponible entre ` +
                        `${dayjs(pRep.period.responsible_start_date).format("DD/MM/YYYY")} y ` +
                        `${dayjs(pRep.period.responsible_end_date).format("DD/MM/YYYY")}`
                      );
                    }
                  }}
                  variant="outline"
                  color={validPeriod[pRep.period._id] ? "blue" : "gray"}
                  disabled={validPeriod[pRep.period._id] === false}
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
      <Title ta="center" mb="md">
        Gestión de Informes de Responsables
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

      <Group mb="md">
        <TextInput
          placeholder="Buscar en los informes publicados"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Select
          placeholder="Filtrar por ámbito"
          data={[
            { value: '', label: 'Todos mis ámbitos' },
            ...userDimensions.map(dim => ({ value: dim._id, label: dim.name }))
          ]}
          value={selectedDimensionFilter}
          onChange={setSelectedDimensionFilter}
          clearable
          style={{ minWidth: 250 }}
        />
      </Group>

      {/* Tabla de pendientes */}
      <Title order={4} mt="md" mb="sm">
        Pendientes
      </Title>
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Periodo</Table.Th>
            <Table.Th>Fecha Límite</Table.Th>
            <Table.Th>Nombre</Table.Th>
            <Table.Th>
              <Center>Estado</Center>
            </Table.Th>
            <Table.Th>
              <Center>Fecha de Estado</Center>
            </Table.Th>
            <Table.Th>
              <Center>Ver</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pendingReports.length > 0 ? (
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

      {/* Tabla de entregados */}
      <Title order={4} mt="xl" mb="sm">
        Entregados
      </Title>
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Periodo</Table.Th>
            <Table.Th>Fecha Límite</Table.Th>
            <Table.Th>Nombre</Table.Th>
            <Table.Th>
              <Center>Estado</Center>
            </Table.Th>
            <Table.Th>
              <Center>Fecha de Estado</Center>
            </Table.Th>
            <Table.Th>
              <Center>Ver</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {deliveredReports.length > 0 ? (
            renderReportRows(deliveredReports)
          ) : (
            <Table.Tr>
              <Table.Td colSpan={6} align="center">
                No hay reportes entregados.
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Text c="dimmed" size="xs" ta="center" mt="md">
        <IconBulb color="#797979" size={20} />
        <br />
        Si quieres ver el detalle o cargar un informe, toca el botón de "Ver informe".
      </Text>
    </Container>
  );
};

export default ResponsibleReportsPage;
