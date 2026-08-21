"use client";

import { useEffect, useState } from "react";
import { Container, Table, Button, Pagination, Center, TextInput, Group, ActionIcon, Tooltip, Modal, Select, Text } from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { IconEdit, IconTrash, IconCopy, IconCirclePlus, IconArrowBigUpFilled, IconArrowBigDownFilled, IconArrowsTransferDown, IconArrowLeft } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useDisclosure } from '@mantine/hooks';
import { useSession } from "next-auth/react";
import { useSort } from "../../hooks/useSort";
import { usePeriod } from "@/app/context/PeriodContext";

interface Validation {
  _id: string;
  name: string;
  columns: {
    name: string;
    is_validator: boolean;
    type: string;
    values: any[];
  }[];
}

const AdminValidationsPage = () => {
  const [validations, setValidations] = useState<Validation[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { data: session } = useSession();
  const { selectedPeriodId, availablePeriods } = usePeriod();
  const { sortedItems: sortedValidations, handleSort, sortConfig } = useSort<Validation>(validations, { key: null, direction: "asc" });
  const [duplicateTarget, setDuplicateTarget] = useState<Validation | null>(null);
  const [duplicateTargetPeriodId, setDuplicateTargetPeriodId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);


  const fetchValidations = async (page: number, search: string) => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/pagination`, {
        params: { page, limit: 10, search, periodId: selectedPeriodId },
      });
      if (response.data) {
        setValidations(response.data.validators || []);
        setTotalPages(response.data.pages || 1);
      }
    } catch (error) {
      console.error("Error fetching validations:", error);
      setValidations([]);
    }
  };

  useEffect(() => {
    if (!selectedPeriodId) return;
    fetchValidations(page, search);
  }, [page, selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId) return;
    const delayDebounceFn = setTimeout(() => {
      fetchValidations(page, search);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search, selectedPeriodId]);

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/validators/delete`, {
        data: { id, periodId: selectedPeriodId, email: session?.user?.email }
      });
      showNotification({
        title: "Eliminado",
        message: "Validación eliminada exitosamente",
        color: "teal",
      });
      fetchValidations(page, search);
    } catch (error) {
      console.error("Error eliminando validación:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al eliminar la validación",
        color: "red",
      });
    }
  };

  const openDuplicateModal = (validation: Validation) => {
    setDuplicateTarget(validation);
    setDuplicateTargetPeriodId(null);
  };

  const closeDuplicateModal = () => {
    if (duplicating) return;
    setDuplicateTarget(null);
    setDuplicateTargetPeriodId(null);
  };

  const handleDuplicate = async () => {
    if (!duplicateTarget || !duplicateTargetPeriodId) return;
    setDuplicating(true);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/validators/duplicate`, {
        id: duplicateTarget._id,
        periodId: selectedPeriodId,
        targetPeriodId: duplicateTargetPeriodId,
        email: session?.user?.email,
      });
      showNotification({
        title: "Duplicada",
        message: "Validación duplicada exitosamente en el periodo seleccionado",
        color: "teal",
      });
      setDuplicateTarget(null);
      setDuplicateTargetPeriodId(null);
    } catch (error: any) {
      showNotification({
        title: "Error",
        message: error?.response?.data?.status || "Hubo un error al duplicar la validación",
        color: "red",
      });
    } finally {
      setDuplicating(false);
    }
  };

  const rows = sortedValidations.map((validation) => (
    <Table.Tr key={validation._id}>
      <Table.Td>{validation.name}</Table.Td>
      <Table.Td>{validation.columns.map(col => col.name).join(', ')}</Table.Td>
      <Table.Td>
        <Center>
          <Group gap={5}>
            <Button
              variant="outline"
              onClick={() => router.push(`/admin/validations/update/${validation._id}`)}
            >
              <IconEdit size={16} />
            </Button>
            <Button color="red" variant="outline" onClick={() => handleDelete(validation._id)}>
              <IconTrash size={16} />
            </Button>
            <Tooltip label="Duplicar en otro periodo" withArrow>
              <Button variant="outline" color="grape" onClick={() => openDuplicateModal(validation)}>
                <IconCopy size={16} />
              </Button>
            </Tooltip>
          </Group>
        </Center>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <TextInput
        placeholder="Buscar validaciones"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />
      <Group mb="md">
        <Tooltip label="Volver" withArrow>
          <ActionIcon
            variant="subtle"
            color="blue"
            size="lg"
            onClick={() => router.back()}
            aria-label="Volver"
          >
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Button onClick={() => router.push('/admin/validations/create')} leftSection={<IconCirclePlus/>}>
          Crear Nueva Validación
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
            <Table.Th>Columnas</Table.Th>
            <Table.Th><Center>Acciones</Center></Table.Th>
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
        opened={!!duplicateTarget}
        onClose={closeDuplicateModal}
        title={`Duplicar validación "${duplicateTarget?.name ?? ""}"`}
        centered
      >
        <Text size="sm" mb="md">
          Selecciona el periodo en el que se creará una copia de esta validación.
        </Text>
        <Select
          label="Periodo destino"
          placeholder="Seleccionar periodo"
          data={availablePeriods
            .filter((period) => period._id !== selectedPeriodId)
            .map((period) => ({ value: period._id, label: period.name }))}
          value={duplicateTargetPeriodId}
          onChange={setDuplicateTargetPeriodId}
          searchable
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="outline" onClick={closeDuplicateModal} disabled={duplicating}>
            Cancelar
          </Button>
          <Button onClick={handleDuplicate} loading={duplicating} disabled={!duplicateTargetPeriodId}>
            Duplicar
          </Button>
        </Group>
      </Modal>
    </Container>
  );
};

export default AdminValidationsPage;
