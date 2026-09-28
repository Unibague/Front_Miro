"use client";

import { useState, useEffect } from "react";
import {
  Container,
  Table,
  TextInput,
  Pagination,
  Button,
  Modal,
  Text,
  Title,
  ScrollArea,
  Center,
  Divider,
  Flex,
  Badge,
  List,
  ThemeIcon,
  rem,
  Group,
} from "@mantine/core";
import { IconBulb, IconColumnRemove, IconTrashFilled, IconCheck, IconX, IconArrowBigUpFilled, IconArrowBigDownFilled, IconArrowsTransferDown } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { dateToGMT } from "@/app/components/DateConfig";
import { useSort } from "../../hooks/useSort";
import { usePersistentSearch } from "@/app/hooks/usePersistentSearch";

interface Log {
  _id: string;
  user: {
    full_name: string;
    email: string;
  };
  published_template: {
    _id: string;
    name: string;
  };
  date: Date;
  errors: ErrorItem[];
}

interface ErrorItem {
  column: string;
  description: ErrorDescription[];
}

interface ErrorDescription {
  register: number;
  value: string;
  message: string;
}

const AdminLogsPage = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = usePersistentSearch();
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationModalOpened, setConfirmationModalOpened] = useState(false);
  const { sortedItems: sortedLogs, handleSort, sortConfig } = useSort<Log>(logs, { key: null, direction: "asc" });


  const fetchLogs = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/logs`,
        {
          params: {
            page,
            limit: 10,
            search,
          },
        }
      );
      setLogs(response.data.logs);
      setTotalPages(response.data.totalPages);
    } catch (error) {
      console.error("Error al obtener los logs:", error);
      showNotification({
        title: "Error",
        message: "No se pudieron obtener los logs.",
        color: "red",
        icon: <IconX />,
      });
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, search]);

  const handleDeleteLogs = async () => {
    if (!startDate || !endDate) return;
    
    setLoading(true);
    try {
      const response = await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/logs`, {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      setLoading(false);
      setConfirmationModalOpened(false);
      fetchLogs();

      showNotification({
        title: "Éxito",
        message: `${response.data.deletedCount} logs eliminados exitosamente.`,
        color: "teal",
        icon: <IconCheck />,
      });
    } catch (error) {
      console.error("Error al borrar logs:", error);
      setLoading(false);
      setConfirmationModalOpened(false);

      showNotification({
        title: "Error",
        message: "No se pudieron eliminar los logs. Inténtalo de nuevo.",
        color: "red",
        icon: <IconX />,
      });
    }
  };

  const rows = sortedLogs.map((log) => (
    <Table.Tr key={log._id}>
      <Table.Td>{log.user.full_name}</Table.Td>
      <Table.Td>{log.published_template.name}</Table.Td>
      <Table.Td>{dateToGMT(log.date, 'DD MMM, YYYY HH:mm')}</Table.Td>
      <Table.Td>{log.errors.length}</Table.Td>
      <Table.Td>
        <Button
          variant="outline"
          onClick={() => {
            setSelectedLog(log);
            setModalOpened(true);
          }}
        >
          Ver detalles
        </Button>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <Title ta={"center"} order={2} mb="md">
        Errores en el cargue de informacion (logs)
      </Title>
      <TextInput
        placeholder="Buscar logs"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />
      <ScrollArea>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th onClick={() => handleSort("user.full_name")} style={{ cursor: "pointer" }}>
                <Center inline>
                  Usuario
                  {sortConfig.key === "user.full_name" ? (
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
              <Table.Th onClick={() => handleSort("published_template.name")} style={{ cursor: "pointer" }}>
                <Center inline>
                  Plantilla
                  {sortConfig.key === "published_template.name" ? (
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
              <Table.Th onClick={() => handleSort("date")} style={{ cursor: "pointer" }}>
                <Center inline>
                  Fecha
                  {sortConfig.key === "date" ? (
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
              <Table.Th>Número de Errores</Table.Th>
              <Table.Th>Acciones</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </ScrollArea>
      <Center>
        <Pagination
          value={page}
          onChange={setPage}
          total={totalPages}
          mt="md"
        />
      </Center>
      <Divider mt="md" mb="md" />
      <Title order={3} ta="center">
        Eliminar Logs por rango de Fecha
      </Title>
      <Group justify="center" mt="md" mb="md">
        <DateInput
          placeholder="Fecha de inicio"
          description="Fecha desde donde borrar"
          label="Inicio"
          value={startDate}
          onChange={setStartDate}
          locale="es"
        />
        <DateInput
          placeholder="Fecha de fin"
          description="Fecha hasta donde borrar"
          label="Fin"
          value={endDate}
          onChange={setEndDate}
          locale="es"
        />
      </Group>
      <Group justify="center">
        <Button
          color="red"
          disabled={!startDate || !endDate || loading}
          onClick={() => setConfirmationModalOpened(true)}
          loading={loading}
          leftSection={<IconTrashFilled size={20} />}
        >
          Borrar Logs
        </Button>
      </Group>
      <Text c="dimmed" size="xs" ta={"center"} mt="md" >
        <IconBulb color="#797979" size={20}></IconBulb>
        <br/>
        Recuerda que esta acción no se puede deshacer
      </Text>
      <Modal
        opened={confirmationModalOpened}
        onClose={() => setConfirmationModalOpened(false)}
        title="Confirmación"
        centered
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
      >
        <Text size="md" mb="md">
          {`¿Estás seguro de que deseas borrar los logs seleccionados entre ${startDate ? dateToGMT(startDate, 'DD MMM, YYYY') : ''} y ${endDate ? dateToGMT(endDate, 'DD MMM, YYYY') : ''}? Esta acción no se puede deshacer.`}
        </Text>
        <Group justify="center">
          <Button variant="outline" onClick={() => setConfirmationModalOpened(false)}>
            Cancelar
          </Button>
          <Button color="red" onClick={handleDeleteLogs}>
            Confirmar
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title="Detalles del Log"
        size="auto"
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
      >
        {selectedLog && (
          <div>
            <Title order={3} ta={"center"} mb={5}>
              Registro de errores
            </Title>
            <Table
              striped
              withRowBorders
              withColumnBorders
              withTableBorder
              highlightOnHover
            >
              <Table.Tbody>
                <Table.Tr>
                  <Table.Th style={{ textAlign: "right" }}>Usuario:</Table.Th>
                  <Table.Td>{selectedLog.user.full_name}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th style={{ textAlign: "right" }}>Email:</Table.Th>
                  <Table.Td>{selectedLog.user.email}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th style={{ textAlign: "right" }}>Plantilla:</Table.Th>
                  <Table.Td>{selectedLog.published_template.name}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th style={{ textAlign: "right" }}>Fecha:</Table.Th>
                  <Table.Td>
                    {dateToGMT(selectedLog.date, 'DD MMM, YYYY HH:mm')}
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
            <Divider m={5} />
            <Center mt={15}>
              <Badge size="lg" color="red">
                Errores
              </Badge>
            </Center>
            <ScrollArea style={{ height: 250 }}>
              {selectedLog.errors.map((error, index) => (
                <div key={index} style={{ marginBottom: "1rem" }}>
                  <List
                    spacing="xs"
                    size="sm"
                    center
                    icon={
                      <ThemeIcon color="blue" size={24} radius="xl">
                        <IconColumnRemove
                          style={{ width: rem(16), height: rem(16) }}
                        />
                      </ThemeIcon>
                    }
                  >
                    <List.Item>
                      <Flex gap="xs" align="center">
                        <Text fw={700}>Columna:</Text>
                        <Text>{error.column}</Text>
                      </Flex>
                    </List.Item>
                  </List>

                  {error.description.map((desc, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginLeft: "1rem",
                        marginBottom: "0.5rem",
                        marginTop: "0.5rem",
                      }}
                    >
                      <List spacing="xs" size="sm" center>
                        <List.Item>
                          <Flex gap="xs" align="center">
                            <Text fw={700}>Registro:</Text>
                            <Text>{desc.register}</Text>
                          </Flex>
                        </List.Item>
                        <List.Item>
                          <Flex gap="xs" align="center">
                            <Text fw={700}>Valor:</Text>
                            <Text>{desc.value}</Text>
                          </Flex>
                        </List.Item>
                        <List.Item>
                          <Flex gap="xs" align="center">
                            <Text fw={700}>Mensaje:</Text>
                            <Text>{desc.message}</Text>
                          </Flex>
                        </List.Item>
                      </List>
                    </div>
                  ))}
                  <Divider />
                </div>
              ))}
            </ScrollArea>
          </div>
        )}
      </Modal>
    </Container>
  );
};

export default AdminLogsPage;
