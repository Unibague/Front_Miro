"use client";

import { useState, useEffect } from "react";
import { Container, Title, Card, Text, Button, Group, Table, Modal, TextInput, Select, Switch } from "@mantine/core";
import { IconPlus, IconEdit, IconTrash } from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import axios from "axios";

interface Filter {
  _id: string;
  name: string;
  type: 'dependency' | 'program';
  isActive: boolean;
  description: string;
}

const FiltersPage = () => {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [modalOpened, setModalOpened] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<Filter | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<'dependency' | 'program'>('dependency');
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const fetchFilters = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/filters`);
      setFilters(response.data || []);
    } catch (error) {
      console.error("Error fetching filters:", error);
    }
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  const handleSave = async () => {
    try {
      const filterData = { name, type, description, isActive };
      
      if (selectedFilter) {
        await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/filters/${selectedFilter._id}`, filterData);
        showNotification({
          title: "Actualizado",
          message: "Filtro actualizado exitosamente",
          color: "teal",
        });
      } else {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/filters`, filterData);
        showNotification({
          title: "Creado",
          message: "Filtro creado exitosamente",
          color: "teal",
        });
      }
      
      handleModalClose();
      fetchFilters();
    } catch (error) {
      console.error("Error saving filter:", error);
      showNotification({
        title: "Error",
        message: "Error al guardar el filtro",
        color: "red",
      });
    }
  };

  const handleEdit = (filter: Filter) => {
    setSelectedFilter(filter);
    setName(filter.name);
    setType(filter.type);
    setDescription(filter.description);
    setIsActive(filter.isActive);
    setModalOpened(true);
  };

  const handleDelete = async (filterId: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/filters/${filterId}`);
      showNotification({
        title: "Eliminado",
        message: "Filtro eliminado exitosamente",
        color: "teal",
      });
      fetchFilters();
    } catch (error) {
      console.error("Error deleting filter:", error);
      showNotification({
        title: "Error",
        message: "Error al eliminar el filtro",
        color: "red",
      });
    }
  };

  const handleModalClose = () => {
    setModalOpened(false);
    setSelectedFilter(null);
    setName("");
    setType('dependency');
    setDescription("");
    setIsActive(true);
  };

  const rows = filters.map((filter) => (
    <Table.Tr key={filter._id}>
      <Table.Td>{filter.name}</Table.Td>
      <Table.Td>{filter.type === 'dependency' ? 'Dependencia' : 'Programa'}</Table.Td>
      <Table.Td>{filter.description}</Table.Td>
      <Table.Td>{filter.isActive ? 'Activo' : 'Inactivo'}</Table.Td>
      <Table.Td>
        <Group gap={5}>
          <Button variant="outline" size="xs" onClick={() => handleEdit(filter)}>
            <IconEdit size={16} />
          </Button>
          <Button variant="outline" color="red" size="xs" onClick={() => handleDelete(filter._id)}>
            <IconTrash size={16} />
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <Title ta="center" mt="md" mb="md">
        Gestión de Filtros
      </Title>
      
      <Card withBorder mb="md">
        <Group justify="space-between">
          <Text>Administra los filtros disponibles para las plantillas</Text>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModalOpened(true)}>
            Crear Filtro
          </Button>
        </Group>
      </Card>

      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nombre</Table.Th>
            <Table.Th>Tipo</Table.Th>
            <Table.Th>Descripción</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th>Acciones</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>

      <Modal
        opened={modalOpened}
        onClose={handleModalClose}
        title={selectedFilter ? "Editar Filtro" : "Crear Filtro"}
      >
        <TextInput
          label="Nombre"
          placeholder="Nombre del filtro"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          mb="md"
        />
        
        <Select
          label="Tipo"
          data={[
            { value: 'dependency', label: 'Dependencia' },
            { value: 'program', label: 'Programa' }
          ]}
          value={type}
          onChange={(value) => setType(value as 'dependency' | 'program')}
          mb="md"
        />
        
        <TextInput
          label="Descripción"
          placeholder="Descripción del filtro"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          mb="md"
        />
        
        <Switch
          label="Activo"
          checked={isActive}
          onChange={(event) => setIsActive(event.currentTarget.checked)}
          mb="md"
        />
        
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

export default FiltersPage;