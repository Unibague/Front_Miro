"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Container,
  Table,
  Button,
  TextInput,
  Group,
  Title,
  Divider,
  Box,
  Checkbox,
  ScrollArea,
  Pagination,
  Center,
  Tooltip,
  Grid,
  Select,
} from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { IconArrowLeft, IconDeviceFloppy, IconTrash } from "@tabler/icons-react";
import { paramId } from "@/app/utils/routeParams";

interface Dimension {
  _id: string;
  name: string;
  responsible: Dependency;
  producers: string[];
}

interface Dependency {
  _id: string
  dep_code: string;
  name: string;
  responsible: string;
}

interface User {
  email: string;
  full_name: string;
}

const AdminDimensionEditPage = () => {
  const router = useRouter();
  const params = useParams();
  const id = paramId(params);
  const [dimension, setDimension] = useState<Dimension | null>(null);
  const [dimensionName, setDimensionName] = useState<string>("");
  const [allDependencies, setAllDependencies] = useState<Dependency[]>([]);
  const [selectedDependencie, setSelectedDependencie] = useState<Dependency>();
  const [producers, setProducers] = useState<string[]>([]);
  const [producerNames, setProducerNames] = useState<{ [key: string]: string }>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [responsibles, setResponsibles] = useState<User[]>([]);
  const [selectedResponsible, setSelectedResponsible] = useState<string>("");
  const [dependencies, setDependencies] = useState<Dependency[]>([]);

  useEffect(() => {
    const fetchDimension = async () => {
      if (id) {
        try {
          const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/${id}`);
          const dimensionData = response.data;
          setDimension(dimensionData);
          setDimensionName(dimensionData.name);
          setProducers(dimensionData.producers);
          setSelectedResponsible(dimensionData.responsible);

          const responsiblesResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users/responsibles`);
          setResponsibles(responsiblesResponse.data);

          const producerResponse = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/names`, {
            codes: dimensionData.producers,
          });

          const newProducerNames = producerResponse.data.reduce((acc: any, dep: any) => {
            acc[dep.dep_code] = dep.name;
            return acc;
          }, {});
          setProducerNames(newProducerNames);
        } catch (error) {
          console.error("Error fetching dimension:", error);
        }
      }
    };

    fetchDimension();
  }, [id]);

  useEffect(() => {
    const fetchDependencies = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`, {
          params: { page, search },
        });
        setAllDependencies(response.data.dependencies);
        setTotalPages(response.data.pages);
      } catch (error) {
        console.error("Error fetching dependencies:", error);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchDependencies();
    }, 150);

    return () => clearTimeout(delayDebounceFn);
  }, [page, search]);

  const handleSave = async (updatedProducers?: string[]) => {
    if (dimension) {
      try {
        await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/${dimension._id}`, {
          ...dimension,
          name: dimensionName,
          responsible: selectedResponsible,
          producers: updatedProducers || producers,
        });
        showNotification({
          title: "Actualizado",
          message: "Ámbito actualizado exitosamente",
          color: "teal",
        });
      } catch (error) {
        console.error("Error updating dimension:", error);
        showNotification({
          title: "Error",
          message: "Hubo un error al actualizar el ámbito",
          color: "red",
        });
      }
    }
  };

  const handleProducerToggle = async (dep_code: string) => {
    let updatedProducers;
    if (producers.includes(dep_code)) {
      updatedProducers = producers.filter((producer) => producer !== dep_code);
    } else {
      updatedProducers = [...producers, dep_code];
    }
    setProducers(updatedProducers);

    if (!producerNames[dep_code]) {
      try {
        const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/names`, {
          codes: [dep_code],
        });

        const newProducerNames = {
          ...producerNames,
          [dep_code]: response.data[0].name,
        };
        setProducerNames(newProducerNames);
      } catch (error) {
        console.error("Error fetching producer name:", error);
      }
    }
    await handleSave(updatedProducers);
  };

  const selectedProducerRows = producers.map((dep_code) => (
    <Table.Tr key={dep_code}>
      <Table.Td>{producerNames[dep_code] || dep_code}</Table.Td>
      <Table.Td>
        <Button color="red" variant="outline" onClick={() => handleProducerToggle(dep_code)}>
          <IconTrash size={16} />
        </Button>
      </Table.Td>
    </Table.Tr>
  ));

  const allDependenciesRows = allDependencies.map((dep) => (
    <Table.Tr key={dep.dep_code}>
      <Table.Td>
        <Checkbox
          checked={producers.includes(dep.dep_code)}
          onChange={() => handleProducerToggle(dep.dep_code)}
        />
      </Table.Td>
      <Table.Td>{dep.name}</Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <Title ta={"center"} order={2} mb="md">
        Gestionar Ámbito
      </Title>
      <Box mb="lg">
        <TextInput
          label="Nombre de la Ámbito"
          value={dimensionName}
          onChange={(event) => setDimensionName(event.currentTarget.value)}
          mb="md"
        />
        <Select
          label="Responsable"
          placeholder="Selecciona un responsable"
          value={selectedDependencie?.name ?? dimension?.responsible?.name}
          onSearchChange={(value) => setSearch(value)}
          onChange={(value) => setSelectedResponsible(value!)}
          data={allDependencies.map((dep) => ({ value: dep._id, label: dep.name }))}
          searchable
          mb="md"
        />
        <Group mt="md">
          <Button
        variant="outline" 
        onClick={() => router.back()}
        leftSection={<IconArrowLeft />}
          >
        Volver
          </Button>
          <Button
        onClick={() => handleSave()}
        leftSection={<IconDeviceFloppy />}
          >
        Guardar
          </Button>
        </Group>
      </Box>
      <Divider my="sm" />
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Title order={4} mb="md">
            Agregar Productores
          </Title>
          <TextInput
            placeholder="Buscar dependencias"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            mb="md"
          />
          <Tooltip
            label="Desplázate para ver más dependencias"
            transitionProps={{ transition: "slide-up", duration: 300 }}
            withArrow
          >
            <ScrollArea style={{ height: 300 }}>
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Seleccionar</Table.Th>
                    <Table.Th>Nombre del Productor</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{allDependenciesRows}</Table.Tbody>
              </Table>
            </ScrollArea>
          </Tooltip>
          <Center mt="md">
            <Pagination value={page} onChange={setPage} total={totalPages} />
          </Center>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Title order={4} mb="md">
            Productores Seleccionados
          </Title>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre del Productor</Table.Th>
                <Table.Th>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{selectedProducerRows}</Table.Tbody>
          </Table>
        </Grid.Col>
      </Grid>
    </Container>
  );
};

export default AdminDimensionEditPage;
