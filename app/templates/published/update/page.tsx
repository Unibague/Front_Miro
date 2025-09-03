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
import { usePeriod } from "@/app/context/PeriodContext";


interface Template {
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
  producer_template_start_date: Date;
  producer_template_end_date: Date;
}

interface FilledTemplate {
  _id: string;
  status: string | null;
}

interface PublishedTemplate {
  _id: string;
  template: Template;
  period: Period;
  loaded_data: FilledTemplate[];
  deadline: Date;
}

const UpdatePublishedTemplatesDeadlinePage = () => {
  const { data: session } = useSession();
  const [pubTemplates, setPubTemplates] = useState<PublishedTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
    const { selectedPeriodId } = usePeriod();
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [openedDeadlineModal, setOpenedDeadlineModal] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [newDeadline, setNewDeadline] = useState<Date | null>(null);
  const router = useRouter();
  const theme = useMantineTheme();

  const fetchTemplates = async (page: number, search: string) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/dimension`,
{
          params: {
            email: session?.user?.email,
            page,
            limit:100,
            search,
            periodId: selectedPeriodId,
          },
        }
      );
      if (response.data) {
        setPubTemplates(response.data.templates);
        setTotalPages(response.data.pages);
      }
    } catch (error) {
      console.error(error);
      setPubTemplates([]);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchTemplates(page, search);
    }
  }, [page, session?.user?.email, selectedPeriodId]);

  useEffect(() => {
    if (session?.user?.email) {
      const delay = setTimeout(() => {
        fetchTemplates(page, search);
      }, 500);
      return () => clearTimeout(delay);
    }
  }, [search]);

  const updateDeadlines = async () => {
    if (!newDeadline || selectedTemplates.length === 0) return;
    setLoading(true);
    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/update-deadlines`, {
        templateIds: selectedTemplates,
        deadline: newDeadline,
        email: session?.user?.email,
      });
      showNotification({
        title: "Éxito",
        message: "Fechas actualizadas correctamente",
        color: "green",
      });
      setOpenedDeadlineModal(false);
      setSelectedTemplates([]);
      fetchTemplates(page, search);
    } catch (error) {
      showNotification({
        title: "Error",
        message: "No se pudieron actualizar las fechas",
        color: "red",
      });
    }
    setLoading(false);
  };

  const rows = pubTemplates.map((pubtemplate) => {
    const isSelected = selectedTemplates.includes(pubtemplate._id);
    return (
      <Table.Tr key={pubtemplate._id}>
        <Table.Td>
          <Group>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedTemplates((prev) => [...prev, pubtemplate._id]);
                } else {
                  setSelectedTemplates((prev) =>
                    prev.filter((id) => id !== pubtemplate._id)
                  );
                }
              }}
            />
            {pubtemplate.template.name}
          </Group>
        </Table.Td>
        <Table.Td>
          {dayjs(pubtemplate.deadline).format("DD/MM/YYYY")}
        </Table.Td>
        <Table.Td>
          <Progress value={(pubtemplate.loaded_data.length / pubtemplate.template.producers.length) * 100} />
        </Table.Td>
        <Table.Td>
          <Group>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconFileDescription size={14} />}
              onClick={() => router.push(`/templates/uploaded/${pubtemplate._id}?resume=true`)}
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
          onClick={() => router.push("/admin/templates")}
          leftSection={<IconArrowLeft size={16} />}
        >
          Ir a Configuración
        </Button>
        <Button
          onClick={() => {
            const allIds = pubTemplates.map((r) => r._id);
            setSelectedTemplates(allIds);
            setOpenedDeadlineModal(true);
          }}
          leftSection={<IconCalendar size={16} />}
        >
          Cambiar fecha a todos
        </Button>
        <Button
          disabled={selectedTemplates.length === 0}
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
        onClose={() => setOpenedDeadlineModal(false)}
        title="Actualizar fecha de entrega"
        centered
      >
        <Stack>
          <DateInput
            label="Nueva fecha límite"
            value={newDeadline}
            onChange={setNewDeadline}
          />
          <Button loading={loading} onClick={updateDeadlines}>
            Actualizar
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
};

export default UpdatePublishedTemplatesDeadlinePage;
