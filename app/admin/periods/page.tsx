"use client";

import { useEffect, useState } from "react";
import { Container, Table, Button, Modal, TextInput, Group, Pagination, Center, Switch, Stack } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { IconArrowBigDownFilled, IconArrowBigUpFilled, IconArrowsTransferDown, IconCirclePlus, IconCopy, IconEdit, IconTrash } from "@tabler/icons-react";
import { useSort } from "../../hooks/useSort";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import "dayjs/locale/es";
import { useRouter } from "next/navigation";
import { usePeriod } from "@/app/context/PeriodContext";
import { useViewPermission } from "@/app/hooks/useViewPermission";

interface Period {
  _id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

const AdminPeriodsPage = () => {
  const router = useRouter();
  const { refreshPeriods } = usePeriod();
  const { canManage } = useViewPermission("periods");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [opened, setOpened] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const { sortedItems: sortedPeriods, handleSort, sortConfig } = useSort<Period>(periods, { key: null, direction: "asc" });

  const fetchPeriods = async (page: number, search: string) => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/periods/all`, {
        params: { page, limit: 10, search },
      });
      if (response.data) {
        setPeriods(response.data.periods || []);
        setTotalPages(response.data.pages || 1);
      }
    } catch (error) {
      console.error("Error fetching periods:", error);
      setPeriods([]);
    }
  };

  useEffect(() => {
    fetchPeriods(page, search);
  }, [page]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchPeriods(page, search);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const handleEdit = (period: Period) => {
    setSelectedPeriod(period);
    setName(period.name);
    setStartDate(period.start_date ? new Date(period.start_date) : null);
    setEndDate(period.end_date ? new Date(period.end_date) : null);
    setIsActive(period.is_active);
    setOpened(true);
  };

  const handleSave = async () => {
    if (!name || name.length > 6 || !startDate || !endDate) {
      showNotification({
        title: "Error",
        message: "Nombre (máx. 6 caracteres), fecha inicio y fecha fin son requeridos",
        color: "red",
      });
      return;
    }

    try {
      const periodData = {
        name,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        is_active: isActive,
      };

      if (selectedPeriod) {
        await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/periods/${selectedPeriod._id}`, periodData);
        showNotification({ title: "Actualizado", message: "Periodo actualizado exitosamente", color: "teal" });
      } else {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/periods/create`, periodData);
        showNotification({ title: "Creado", message: "Periodo creado exitosamente", color: "teal" });
      }

      handleModalClose();
      await refreshPeriods();
      fetchPeriods(page, search);
    } catch (error) {
      console.error("Error guardando periodo:", error);
      showNotification({ title: "Error", message: "Hubo un error al guardar el periodo", color: "red" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/periods/${id}`);
      showNotification({ title: "Eliminado", message: "Periodo eliminado exitosamente", color: "teal" });
      await refreshPeriods();
      fetchPeriods(page, search);
    } catch (error) {
      console.error("Error eliminando periodo:", error);
      showNotification({ title: "Error", message: "Hubo un error al eliminar el periodo", color: "red" });
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/periods/${id}/toggle-active`, {
        is_active: !currentStatus,
      });
      showNotification({
        title: "Actualizado",
        message: `Periodo ${!currentStatus ? "activado" : "desactivado"} exitosamente`,
        color: "teal",
      });
      await refreshPeriods();
      fetchPeriods(page, search);
    } catch (error) {
      console.error("Error cambiando estado del periodo:", error);
      showNotification({ title: "Error", message: "Hubo un error al cambiar el estado del periodo", color: "red" });
    }
  };

  const handleModalClose = () => {
    setOpened(false);
    setName("");
    setStartDate(null);
    setEndDate(null);
    setIsActive(true);
    setSelectedPeriod(null);
  };

  const rows = sortedPeriods.map((period) => (
    <Table.Tr key={period._id}>
      <Table.Td><Center>{period.name}</Center></Table.Td>
      <Table.Td><Center>{dateToGMT(period.start_date, "DD MMM, YYYY")}</Center></Table.Td>
      <Table.Td><Center>{dateToGMT(period.end_date, "DD MMM, YYYY")}</Center></Table.Td>
      <Table.Td>
        <Center>
          <Switch checked={period.is_active} onChange={() => canManage && handleToggleActive(period._id, period.is_active)} label={period.is_active ? "Activo" : "Inactivo"} color="teal" disabled={!canManage} />
        </Center>
      </Table.Td>
      <Table.Td>
        <Center>
          <Group gap={5}>
            <Button variant="outline" onClick={() => handleEdit(period)} disabled={!canManage}>
              <IconEdit size={16} />
            </Button>
            <Button color="red" variant="outline" onClick={() => handleDelete(period._id)} disabled={!canManage}>
              <IconTrash size={16} />
            </Button>
          </Group>
        </Center>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <DateConfig />
      <TextInput
        placeholder="Buscar en todos los periodos"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />
      <Group>
        <Button
          onClick={() => {
            setSelectedPeriod(null);
            setOpened(true);
          }}
          leftSection={<IconCirclePlus />}
          disabled={!canManage}
        >
          Crear Nuevo Periodo
        </Button>
        <Button
          ml="auto"
          onClick={() => router.push("periods/duplicate")}
          leftSection={<IconCopy />}
          color="orange"
          variant="light"
        >
          Duplicar Plantillas e Informes de Periodo
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
            <Table.Th><Center>Inicio Periodo</Center></Table.Th>
            <Table.Th><Center>Fin Periodo</Center></Table.Th>
            <Table.Th><Center>Estado</Center></Table.Th>
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
        opened={opened}
        size="md"
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
        onClose={handleModalClose}
        title={selectedPeriod ? "Editar Periodo" : "Crear Nuevo Periodo"}
      >
        <TextInput
          label="Nombre del Periodo"
          placeholder="Máximo 6 caracteres"
          value={name}
          onChange={(event) => setName(event.currentTarget.value.slice(0, 6))}
          mb="md"
        />
        <Stack mb="md">
          <DateInput
            label="Fecha de Inicio del Periodo"
            locale="es"
            placeholder="Selecciona una fecha"
            value={startDate}
            onChange={setStartDate}
          />
        </Stack>
        <Stack mb="md">
          <DateInput
            label="Fecha de Fin del Periodo"
            locale="es"
            placeholder="Selecciona una fecha"
            value={endDate}
            onChange={setEndDate}
            minDate={startDate || undefined}
          />
        </Stack>
        <Switch
          label="Período Activo"
          description="Los períodos activos pueden ser utilizados para publicar plantillas"
          checked={isActive}
          onChange={(event) => setIsActive(event.currentTarget.checked)}
          mb="md"
          color="teal"
        />
        <Group mt="md">
          <Button onClick={handleSave}>Guardar</Button>
          <Button variant="outline" onClick={handleModalClose}>Cancelar</Button>
        </Group>
      </Modal>
    </Container>
  );
};

export default AdminPeriodsPage;
