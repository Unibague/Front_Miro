"use client";

import { useEffect, useState } from "react";
import { Container, Table, Button, Modal, TextInput, Group, Pagination, Center, Switch, Text, Stack, Select } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { IconArrowBigDownFilled, IconArrowBigUpFilled, IconArrowsTransferDown, IconCirclePlus, IconCopy, IconEdit, IconTrash } from "@tabler/icons-react";
import { useSort } from "../../hooks/useSort";
import DateConfig, { dateToGMT, dateNow } from "@/app/components/DateConfig";
import "dayjs/locale/es";
import { useRouter } from "next/navigation";

interface Period {
  _id: string;
  name: string;
  start_date: string;
  end_date: string;
  producer_start_date: string;
  producer_end_date: string;
  producer_report_start_date: string;
  producer_report_end_date: string;
  responsible_start_date: string;
  responsible_end_date: string;
  is_active: boolean;
}

const AdminPeriodsPage = () => {
  const router = useRouter();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [opened, setOpened] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [productorStartDate, setProductorStartDate] = useState<Date | null>(null);
  const [productorEndDate, setProductorEndDate] = useState<Date | null>(null);
  const [producerReportStartDate, setProducerReportStartDate] = useState<Date | null>(null);
  const [producerReportEndDate, setProducerReportEndDate] = useState<Date | null>(null);
  const [responsibleStartDate, setResponsibleStartDate] = useState<Date | null>(null);
  const [responsibleEndDate, setResponsibleEndDate] = useState<Date | null>(null);
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
    setStartDate(new Date(period.start_date));
    setEndDate(new Date(period.end_date));
    setProductorStartDate(new Date(period.producer_start_date));
    setProductorEndDate(new Date(period.producer_end_date));
    setProducerReportStartDate(new Date(period.producer_report_start_date));
    setProducerReportEndDate(new Date(period.producer_report_end_date));
    setResponsibleStartDate(new Date(period.responsible_start_date));
    setResponsibleEndDate(new Date(period.responsible_end_date));
    setIsActive(period.is_active);
    setOpened(true);
  };

  const handleSave = async () => {
    if (!name || name.length > 6  || !startDate || !endDate || !productorStartDate || !productorEndDate ||!producerReportStartDate || !producerReportEndDate || !responsibleStartDate || !responsibleEndDate)  {
      showNotification({
        title: "Error",
        message: "Todos los campos son requeridos",
        color: "red",
      });
      return;
    }

    try {
      const periodData = {
        name,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        producer_start_date: productorStartDate.toISOString(),
        producer_end_date: productorEndDate.toISOString(),
        producer_report_start_date: producerReportStartDate.toISOString(),
  producer_report_end_date: producerReportEndDate.toISOString(),
        responsible_start_date: responsibleStartDate.toISOString(),
        responsible_end_date: responsibleEndDate.toISOString(),
        is_active: true,
      };

      if (selectedPeriod) {
        await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/periods/${selectedPeriod._id}`, periodData);
        showNotification({
          title: "Actualizado",
          message: "Periodo actualizado exitosamente",
          color: "teal",
        });
      } else {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/periods/create`, periodData);
        showNotification({
          title: "Creado",
          message: "Periodo creado exitosamente",
          color: "teal",
        });
      }

      handleModalClose();
      fetchPeriods(page, search);
    } catch (error) {
      console.error("Error guardando periodo:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al guardar el periodo",
        color: "red",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/periods/${id}`);
      showNotification({
        title: "Eliminado",
        message: "Periodo eliminado exitosamente",
        color: "teal",
      });
      fetchPeriods(page, search);
    } catch (error) {
      console.error("Error eliminando periodo:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al eliminar el periodo",
        color: "red",
      });
    }
  };

  const handleModalClose = () => {
    setOpened(false);
    setName("");
    setStartDate(null);
    setEndDate(null);
    setProductorStartDate(null);
    setProductorEndDate(null);
    setProducerReportStartDate(null);
setProducerReportEndDate(null);
    setResponsibleStartDate(null);
    setResponsibleEndDate(null);
    setIsActive(false);
    setSelectedPeriod(null);
  };

  const rows = sortedPeriods.map((period) => (
    <Table.Tr key={period._id}>
      <Table.Td><Center>{period.name}</Center></Table.Td>
      <Table.Td><Center>{dateToGMT(period.start_date, "DD MMM, YYYY")}</Center></Table.Td>
      <Table.Td><Center>{dateToGMT(period.end_date, "DD MMM, YYYY")}</Center></Table.Td>
      <Table.Td><Center>{dateToGMT(period.producer_start_date, "DD MMM, YYYY")}</Center></Table.Td>
      <Table.Td><Center>{dateToGMT(period.producer_end_date, "DD MMM, YYYY")}</Center></Table.Td>
      <Table.Td><Center>{dateToGMT(period.producer_report_start_date, "DD MMM, YYYY")}</Center></Table.Td>
      <Table.Td><Center>{dateToGMT(period.producer_report_end_date, "DD MMM, YYYY")}</Center></Table.Td>
      <Table.Td><Center>{dateToGMT(period.responsible_start_date, "DD MMM, YYYY")}</Center></Table.Td>
      <Table.Td><Center>{dateToGMT(period.responsible_end_date, "DD MMM, YYYY")}</Center></Table.Td>
      <Table.Td><Center>{period.is_active ? "Activo" : "Inactivo"}</Center></Table.Td>
      <Table.Td>
        <Center>
          <Group gap={5}>
            <Button variant="outline" onClick={() => handleEdit(period)}>
              <IconEdit size={16} />
            </Button>
            <Button color="red" variant="outline" onClick={() => handleDelete(period._id)}>
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
          leftSection={<IconCirclePlus/>}
        >
          Crear Nuevo Periodo
        </Button>
        <Button 
          ml={'auto'}
          onClick={() => {
            router.push("periods/duplicate");
          }}
          leftSection={<IconCopy/>}
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
            <Table.Th><Center>Inicio Productor</Center></Table.Th>
            <Table.Th><Center>Fin Productor</Center></Table.Th>
            <Table.Th><Center>Inicio Informes Productor</Center></Table.Th>
            <Table.Th><Center>Fin Informes Productor</Center></Table.Th>
            <Table.Th><Center>Inicio Responsable</Center></Table.Th>
            <Table.Th><Center>Fin Responsable</Center></Table.Th>
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
        size="lg"
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
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
        <Text size="sm" c="dimmed" mb="md">
          Las fechas de inicio y fin del período limitarán todas las demás fechas. Configure primero estas fechas principales.
        </Text>
        <Stack mb="md">
          <DateInput
            label="Fecha de Inicio del Periodo"
            locale="es"
            placeholder="Selecciona una fecha"
            value={startDate}
            onChange={(date) => {
              setStartDate(date);
              // Limpiar fechas que estén fuera del nuevo rango
              if (date && endDate) {
                if (productorStartDate && (productorStartDate < date || productorStartDate > endDate)) setProductorStartDate(null);
                if (productorEndDate && (productorEndDate < date || productorEndDate > endDate)) setProductorEndDate(null);
                if (producerReportStartDate && (producerReportStartDate < date || producerReportStartDate > endDate)) setProducerReportStartDate(null);
                if (producerReportEndDate && (producerReportEndDate < date || producerReportEndDate > endDate)) setProducerReportEndDate(null);
                if (responsibleStartDate && (responsibleStartDate < date || responsibleStartDate > endDate)) setResponsibleStartDate(null);
                if (responsibleEndDate && (responsibleEndDate < date || responsibleEndDate > endDate)) setResponsibleEndDate(null);
              }
            }}
          />
        </Stack>
        <Stack mb="md">
          <DateInput
            label="Fecha de Fin del Periodo"
            locale="es"
            placeholder="Selecciona una fecha"
            value={endDate}
            onChange={(date) => {
              setEndDate(date);
              // Limpiar fechas que estén fuera del nuevo rango
              if (date && startDate) {
                if (productorStartDate && (productorStartDate < startDate || productorStartDate > date)) setProductorStartDate(null);
                if (productorEndDate && (productorEndDate < startDate || productorEndDate > date)) setProductorEndDate(null);
                if (producerReportStartDate && (producerReportStartDate < startDate || producerReportStartDate > date)) setProducerReportStartDate(null);
                if (producerReportEndDate && (producerReportEndDate < startDate || producerReportEndDate > date)) setProducerReportEndDate(null);
                if (responsibleStartDate && (responsibleStartDate < startDate || responsibleStartDate > date)) setResponsibleStartDate(null);
                if (responsibleEndDate && (responsibleEndDate < startDate || responsibleEndDate > date)) setResponsibleEndDate(null);
              }
            }}
            minDate={startDate || undefined}
          />
        </Stack>
         <Stack mb="md">
          <DateInput
            label="Inicio de Productor"
            locale="es"
            placeholder="Selecciona una fecha"
            value={productorStartDate}
            onChange={setProductorStartDate}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            disabled={!startDate || !endDate}
          />
        </Stack>
        <Stack mb="md">
          <DateInput
            label="Fin de Productor"
            locale="es"
            placeholder="Selecciona una fecha"
            value={productorEndDate}
            onChange={setProductorEndDate}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            disabled={!startDate || !endDate}
          />
        </Stack>
        <Stack mb="md">
          <DateInput
            label="Inicio de Informes Productor"
            locale="es"
            placeholder="Selecciona una fecha"
            value={producerReportStartDate}
            onChange={setProducerReportStartDate}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            disabled={!startDate || !endDate}
          />
        </Stack>
        <Stack mb="md">
          <DateInput
            label="Fin de Informes Productor"
            locale="es"
            placeholder="Selecciona una fecha"
            value={producerReportEndDate}
            onChange={setProducerReportEndDate}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            disabled={!startDate || !endDate}
          />
        </Stack>
        <Stack mb="md">
          <DateInput
            label="Inicio de Responsable"
            locale="es"
            placeholder="Selecciona una fecha"
            value={responsibleStartDate}
            onChange={setResponsibleStartDate}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            disabled={!startDate || !endDate}
          />
        </Stack>
        <Stack mb="md">
          <DateInput
            label="Fin de Responsable"
            locale="es"
            placeholder="Selecciona una fecha"
            value={responsibleEndDate}
            onChange={setResponsibleEndDate}
            minDate={startDate || undefined}
            maxDate={endDate || undefined}
            disabled={!startDate || !endDate}
          />
        </Stack>
        <Group mt="md">
          <Button onClick={handleSave}>Guardar</Button>
          <Button variant="outline" onClick={handleModalClose}>
            Cancelar
          </Button>
        </Group>
      </Modal>
    </Container>
  );
};

export default AdminPeriodsPage;
