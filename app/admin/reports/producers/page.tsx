"use client"
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { Button, Center, Checkbox, Container, FileInput, Group, Modal, MultiSelect, Pagination, rem, Select, Switch, Table, Text, Textarea, TextInput, Title, Tooltip } from "@mantine/core";
import { DateInput, DatePickerInput } from "@mantine/dates";
import { showNotification } from "@mantine/notifications";
import { IconArrowRight, IconCancel, IconCheck, IconCirclePlus, IconDeviceFloppy, IconEdit, IconEye, IconSend, IconTrash, IconUser, IconX } from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

interface Report {
  _id: string;
  name: string;
  description: string;
  report_example: DriveFile;
  requires_attachment: boolean;
  file_name: string;
  created_by: {
    email: string;
    full_name: string;
  };
  published: boolean,
}

interface Period {
  _id: string;
  name: string;
  producer_end_date: Date;
}

interface DriveFile {
  id: string;
  name: string;
  view_link: string;
}


const StatusColor: Record<string, string> = {
  Pendiente: "orange",
  "En Borrador": "grape",
  "En Revisión": "cyan",
  Aprobado: "lime",
  Rechazado: "red",
};

const ProducerReportPage = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");

  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [customDeadline, setCustomDeadline] = useState(false);

  const [opened, setOpened] = useState(false);



  
  const fetchReports = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/producerReports/all`, {
        params: {
          email: session?.user?.email,
          page: page,
          search: search,
          periodId: selectedPeriod
        },
      });
      setReports(response.data);
    } catch (error) {
      console.error("Error fetching reports:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al obtener los informes",
        color: "red",
      });
    }
  }

  const fetchPeriods = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/periods/active`);
      console.log(response.data);
      setPeriods(response.data);
    } catch (error) {
      console.error("Error fetching periods:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al obtener los periodos",
        color: "red",
      });
    }
  }

  const handlePublish = async (reportId: string) => {
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/publish`, {
        reportId,
        deadline: customDeadline ? deadline : selectedPeriod ?
          new Date(periods.find(period => period._id === selectedPeriod)?.producer_end_date || '') : null,
        period: selectedPeriod,
        email: session?.user?.email
      });
      showNotification({
        title: "Éxito",
        message: "Informe publicado correctamente",
        color: "green",
      });
      setOpened(false);
      setSelectedReport(null);
      setDeadline(null);
      setCustomDeadline(false);
      await fetchReports();
    } catch (error) {
      console.error("Error publishing report:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al publicar el informe",
        color: "red",
      });
    }
  }

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchReports();
    }, 200);

    return () => clearTimeout(delayDebounceFn);
  }, [search, selectedPeriod]);

  useEffect(() => {
    fetchPeriods();
  }, [selectedReport]);

  useEffect(() => {
  const fetchActivePeriod = async () => {
    try {
      const { data } = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/periods/active`);
      console.log(data);
      if (data.length > 0) {
        setSelectedPeriod(data[0]._id); // Aquí lo estableces como valor por defecto
      }
    } catch (error) {
      console.error("Error fetching active period:", error);
    }
  };
  fetchActivePeriod();
}, []);

  const rows = reports?.map((report: Report) => (
    <Table.Tr key={report._id}>
      <Table.Td maw={rem(500)}>
        {report.name}
      </Table.Td>
      <Table.Td>
        <Text size="sm" lineClamp={1}>{report.created_by.full_name}</Text>
      </Table.Td>
      <Table.Td>
        <Center>
          <Group gap={'xs'}>
            <Tooltip
              label="Ver formato informe"
              position="top"
              withArrow
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button
                onClick={() => {
                  if(typeof window !== 'undefined') 
                    window.open(report.report_example.view_link, '_blank');
                }}
                variant="outline"
              >
                <IconEye size={16} />
              </Button>
            </Tooltip>
            <Tooltip
              label="Editar informe"
              position="top"
              withArrow
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button
                onClick={ () => {
                  router.push(`producers/${report._id}`);
                }}
                variant="outline"
              >
                <IconEdit size={16} />
              </Button>
            </Tooltip>
<Tooltip label="Borrar informe">
  <Button
    color="red"
    variant="outline"
    onClick={async () => {
      if (!window.confirm("¿Estás seguro de eliminar este informe? Esta acción no se puede deshacer.")) return;

      try {
        await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/producerReports/${report._id}`);
        showNotification({
          title: "Eliminado",
          message: "Informe eliminado correctamente.",
          color: "green"
        });
        fetchReports();
      } catch (error: any) {
  const msg = error.response?.data?.message || "Error inesperado.";
  showNotification({
    title: "Error",
    message: msg,
    color: "red"
  });
}
    }}
  >
    <IconTrash size={16} />
  </Button>
</Tooltip>
          </Group>
        </Center>
      </Table.Td>
      <Table.Td>
        <Center>
          <Tooltip label={report.published ? "Ya asignado en este periodo" : "Asignar informe a periodo"}>
  <span>
    <Button
      onClick={() => {
        setSelectedReport(report);
        setOpened(true);
      }}
      disabled={report.published}
      variant="outline"
    >
      <IconUser size={16} />
    </Button>
  </span>
</Tooltip>
        </Center>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <DateConfig />
      <Title mb={'xl'}>Configuración Informes de Productores</Title>
      <Group mb='md'>
        <Button
          onClick={() => {
            router.push("producers/create");
          }}
          leftSection={<IconCirclePlus/>}
        >
          Crear Nuevo Informe
        </Button>
        <Button
          ml={"auto"}
          onClick={() => router.push("/reports")}
          variant="outline"
          rightSection={<IconArrowRight size={16} />}
        >
          Ir a Informes Publicados
        </Button>
      </Group>
      <TextInput
        placeholder="Buscar en todos los reportes"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />
      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>
              Nombre
            </Table.Th>
            <Table.Th>
              Creado Por
            </Table.Th>
            <Table.Th>
              <Center>Acciones</Center>
            </Table.Th>
            <Table.Th>
              <Center>Asignar</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows}
        </Table.Tbody>
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
        opened={opened}
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
        onClose={() => {
          setOpened(false)
          setSelectedReport(null);
          setDeadline(null);
          setCustomDeadline(false);
        }}
        title={<Text fw={700}>Asignar Informe a Periodo</Text>}
        size="md"
      >
        <Select
          data={periods?.map((period) => ({ value: period._id, label: period.name }))}
          placeholder="Seleccionar Periodo"
          label="Periodo"
          value={selectedPeriod}
          onChange={(value) => {
            setSelectedPeriod(value)
            const selectedPeriod = periods.find((period) => period._id === value);
            setDeadline(selectedPeriod ? new Date(selectedPeriod.producer_end_date) : null);
          }}
        />
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
          <DateInput
            locale="es"
            label="Fecha Límite"
            value={deadline}
            onChange={setDeadline}
            maxDate={deadline ?? undefined}
          />
        }
        <Group mt={'md'} grow>
          <Button
            leftSection={<IconCancel />}
            color="red"
            variant="outline"
            onClick={() => {
              setOpened(false)
              setSelectedReport(null);
              setDeadline(null);
              setCustomDeadline(false);
            }}
          >
            Cancelar
          </Button>
          <Button
            leftSection={<IconSend />}
            variant="light"
            onClick={() => handlePublish(selectedReport?._id || '')}
          >
            Asignar
          </Button>
        </Group>
      </Modal>
    </Container>
    );
}

export default ProducerReportPage;