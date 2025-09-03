"use client";

import { use, useEffect, useState } from "react";
import {
  Container,
  Table,
  Button,
  Modal,
  TextInput,
  Group,
  Pagination,
  Center,
  FileInput,
  MultiSelect,
  Switch,
  rem,
  Text,
  Textarea,
  Select,
  Tooltip,
  Title,
  Pill,
  Checkbox,
} from "@mantine/core";
import {
  IconArrowBigDownFilled,
  IconArrowBigUpFilled,
  IconArrowRight,
  IconArrowsTransferDown,
  IconCancel,
  IconCheck,
  IconChevronsLeft,
  IconCirclePlus,
  IconDeviceFloppy,
  IconEdit,
  IconFileDescription,
  IconTrash,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { showNotification } from "@mantine/notifications";
import uploadAnimation from "../../../public/lottie/upload.json";
import successAnimation from "../../../public/lottie/success.json";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSort } from "../../hooks/useSort";
import { DateInput, DatePickerInput } from "@mantine/dates";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";

type LottieProps = {
  animationData: object;
  loop: boolean;
};

const Lottie = dynamic(() => import("lottie-react").then((mod) => mod.default), {
  ssr: false,
}) as React.FC<LottieProps>;

interface Report {
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

interface DriveFile {
  id: string;
  name: string;
}

const AdminReportsPage = () => {
  const { data: session } = useSession();
  const [reports, setReports] = useState<Report[]>([]);
  const [opened, setOpened] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState("");
  const [requiresAttachment, setRequiresAttachment] = useState<boolean>(false);
  const [reportExample, setReportExample] = useState<File | null>(null);
  const [frameFile, setFrameFile] = useState<DriveFile | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const [customDeadline, setCustomDeadline] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [loadingPublishOptions, setLoadingPublishOptions] = useState(false);
  const { sortedItems: sortedReports, handleSort, sortConfig } = useSort<Report>(reports, { key: null, direction: "asc" });

  const fetchReports = async (page: number, search: string) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/reports/all`,
        {
          params: { page, limit: 10, search, email: session?.user?.email },
        }
      );
      if (response.data) {
        setReports(response.data.reports);
        setTotalPages(response.data.totalPages || 1);
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
      setReports([]);
    }
  };

  const fetchPublishOptions = async () => {
    setLoadingPublishOptions(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pReports/feed`,
        { params: { email: session?.user?.email } }
      );
      if (response.data) {
        setDimensions(response.data.dimensions);
        setPeriods(response.data.periods);
        console.log('Periods loaded:', response.data.periods);
      }
    } catch (error) {
      console.error("Error fetching publish options:", error);
      setDimensions([]);
      setPeriods([]);
    } finally {
      setLoadingPublishOptions(false);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchReports(page, search);
    }
  }, [page, session?.user?.email]);

  useEffect(() => {
    if (session?.user?.email) {
      const delayDebounceFn = setTimeout(() => {
        fetchReports(page, search);
      }, 500);

      return () => clearTimeout(delayDebounceFn);
    }
  }, [search, session?.user?.email, page]);

  const handleEdit = (report: Report) => {
    setSelectedReport(report);
    setName(report.name);
    setDescription(report.description);
    setRequiresAttachment(report.requires_attachment);
    setFileName(report.file_name);
    setOpened(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/reports/delete/${id}`);
      showNotification({
        title: "Eliminado",
        message: "Informe eliminado exitosamente",
        color: "teal",
      });
      fetchReports(page, search);
    } catch (error) {
      console.error("Error eliminando informe:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al eliminar el informe",
        color: "red",
      });
    }
  };

  const handlePublishModalClose = () => {
    setSelectedReport(null);
    setPublishing(false);
    setDimensions([]);
    setPeriods([]);
    setSelectedDimensions([]);
    setSelectedPeriod(null);
    setCustomDeadline(false);
    setDeadline(null);
  };

  const handleSubmitPublish = async (reportId: string) => {
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/pReports/publish`, {
        reportId,
        deadline: customDeadline ? deadline : selectedPeriod ?
          new Date(periods.find(period => period._id === selectedPeriod)?.responsible_end_date || '') : null,
        periodId: selectedPeriod,
        email: session?.user?.email
      });
      showNotification({
        title: "Éxito",
        message: "Informe publicado correctamente",
        color: "green",
      });
      handlePublishModalClose();
    } catch (error) {
      console.error("Error publishing report:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al publicar el informe",
        color: "red",
      });
    }
  }

  const checkIfChanges = () => {
    if(!selectedReport) return false
    else if (
      name !== selectedReport.name ||
        description !== selectedReport.description ||
        requiresAttachment !== selectedReport.requires_attachment ||
        fileName !== selectedReport.file_name ||
        reportExample
    ) {
      return false;
    }

    return true;
  }

  const rows = sortedReports.map((report: Report) => (
    <Table.Tr key={report._id}>
      <Table.Td>{report.name}</Table.Td>
      <Table.Td>
        {report.created_by?.full_name || report.created_by?.email}
      </Table.Td>
      <Table.Td>
        <Center>
          <Group gap={5}>
            <Tooltip
              label="Editar informe"
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button variant="outline" onClick={() => router.push(`reports/${report._id}`)}>
                <IconEdit size={16} />
              </Button>
            </Tooltip>
            <Tooltip
              label="Eliminar informe"
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button
                color="red"
                variant="outline"
                onClick={() => handleDelete(report._id)}
              >
                <IconTrash size={16} />
              </Button>
            </Tooltip>
            <Tooltip
              label="Ver formato adjunto"
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button
                variant="outline"
                onClick={() => {
                  if(typeof window !== 'undefined') {
                    window.open(report.report_example_link, "_blank");
                  }
                }
                }
              >
                <IconFileDescription size={16} />
              </Button>
            </Tooltip>
          </Group>
        </Center>
      </Table.Td>
      <Table.Td>
        <Center>
          <Tooltip
            label="Asignar a dimension(es)"
            transitionProps={{ transition: 'fade-up', duration: 300 }}
          >
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
      <Title mb={'md'} ta={'center'}>Configuración Informes de Ámbitos</Title>
      <TextInput
        placeholder="Buscar en todos los informes"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />
      <Group>
        <Button
          onClick={() => {
            router.push(`reports/create`);
          }}
          leftSection={<IconCirclePlus/>}
        >
          Crear Nuevo Informe
        </Button>
        <Button
          ml={"auto"}
          onClick={() => router.push("reports/uploaded")}
          variant="outline"
          rightSection={<IconArrowRight size={16} />}
        >
          Ir a Gestión de Informes
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
            <Table.Th onClick={() => handleSort("created_by.full_name")} style={{ cursor: "pointer" }}>
              <Center inline>
                Creado Por
                {sortConfig.key === "created_by.full_name" ? (
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
            <Table.Th>
              <Center>Acciones</Center>
            </Table.Th>
            <Table.Th>
              <Center>Asignar</Center>
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
      <Modal
        opened={publishing}
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
        onClose={handlePublishModalClose}
        title="Asignar Informe a Dimension(es)"
      >
        {periods.length > 0 ? (
          <Select
            data={periods.map((period) => ({
              value: period._id,
              label: period.name,
            }))}
            value={selectedPeriod}
            onChange={(value) => {
              setSelectedPeriod(value || null)
              const selectedPeriod = periods.find((period) => period._id === value);
              console.log(selectedPeriod);
              setDeadline(selectedPeriod ? new Date(selectedPeriod.responsible_end_date) : null);
            }}
            searchable
            placeholder="Selecciona el periodo"
            label="Periodo"
            required
          />
        ) : (
          <Text c="dimmed" ta="center" mt="md">
            No hay períodos activos disponibles para asignar informes en este momento. (Fecha inicio y fin responsable)
          </Text>
        )}
        {
          selectedPeriod &&
          <>
            <Text size="sm" mt={'xs'} c='dimmed'>Fecha Límite: {deadline ? dateToGMT(deadline) : "No disponible"}</Text>
            <Checkbox
              mt={'sm'}
              mb={'xs'}
              label="Establecer un plazo inferior al establecido en el periodo"
              checked={customDeadline}
              onChange={(event) => setCustomDeadline(event.currentTarget.checked)}
            />
          </>
        }
        {
          customDeadline &&
          <DatePickerInput
            locale="es"
            label="Fecha Límite"
            value={deadline}
            onChange={setDeadline}
            maxDate={selectedPeriod ? 
                new Date(periods.find(period => period._id === selectedPeriod)?.responsible_end_date 
                || "") : undefined}
          />
        }
        <Group mt="md" grow>
          <Button 
            onClick={() => selectedReport && handleSubmitPublish(selectedReport._id)}
            disabled={periods.length === 0 || !selectedPeriod}
          >
            Asignar
          </Button>
          <Button variant="outline" onClick={handlePublishModalClose}>
            Cancelar
          </Button>
        </Group>
      </Modal>
    </Container>
  );
};

export default AdminReportsPage;
