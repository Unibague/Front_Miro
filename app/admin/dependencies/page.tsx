"use client";

import { useEffect, useState } from "react";
import { Container, Table, Button, Modal, TextInput, Group, Pagination, Center, Select, MultiSelect, Text, Badge } from "@mantine/core";
import { IconEdit, IconRefresh, IconTrash, IconArrowBigUpFilled, IconArrowBigDownFilled, IconArrowsTransferDown, IconUsers } from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from 'next/navigation';
import { showNotification } from "@mantine/notifications";
import styles from "./AdminDependenciesPage.module.css";
import { useSort } from "../../hooks/useSort";

interface Dependency {
  _id: string;
  dep_code: string;
  name: string;
  members: string[];
  responsible: string;
  dep_father: string;
  visualizers: string[]
}

interface MemberOption {
  value: string;
  label: string;
}

interface UserWithDependencies {
  email: string;
  full_name: string;
  dep_code: string;
  additional_dependencies: string[];
}

interface DependencyOption {
  value: string;
  label: string;
}

const AdminDependenciesPage = () => {
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [opened, setOpened] = useState(false);
  const [selectedDependency, setSelectedDependency] = useState<Dependency | null>(null);
  const [dep_code, setDepCode] = useState("");
  const [name, setName] = useState("");
  const [responsible, setResponsible] = useState<string | null>(null);
  const [dep_father, setDepFather] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedProducers, setSelectedProducers] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [permissionsModalOpened, setPermissionsModalOpened] = useState(false);
  const [usersWithDependencies, setUsersWithDependencies] = useState<UserWithDependencies[]>([]);
  const [availableDependencies, setAvailableDependencies] = useState<DependencyOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserWithDependencies | null>(null);
  const [selectedAdditionalDeps, setSelectedAdditionalDeps] = useState<string[]>([]);
  const [userStatusModalOpened, setUserStatusModalOpened] = useState(false);
  const [allUsersStatus, setAllUsersStatus] = useState<UserWithDependencies[]>([]);
  const { sortedItems: sortedDependencies, handleSort, sortConfig } = useSort<Dependency>(dependencies, { key: null, direction: "asc" });
  const router = useRouter();

  const fetchDependencies = async (page: number, search: string) => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`, {
        params: { page, limit: 10, search },
      });
      if (response.data) {
        setDependencies(response.data.dependencies || []);
        setTotalPages(response.data.pages || 1);
      }
    } catch (error) {
      console.error("Error fetching dependencies:", error);
      setDependencies([]);
    }
  };

  const fetchMembers = async (dep_code: string) => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/${dep_code}/members`);
      if (response.data) {
        const memberOptions = response.data
          .filter((member: any) => member.email && member.email.includes('@') && member.email.split('@')[0].length > 0)
          .map((member: any) => ({
            value: member.email,
            label: `${member.full_name} (${member.email})`,
          }));
        setMembers(memberOptions);
      }
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  useEffect(() => {
    fetchDependencies(page, search);
  }, [page]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchDependencies(page, search);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const handleSyncDependencies = async () => {
    setIsLoading(true);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/users/updateAll`);
      showNotification({
        title: "Sincronizado",
        message: "Dependencias sincronizadas exitosamente",
        color: "teal",
      });
      fetchDependencies(page, search);
    } catch (error) {
      console.error("Error syncing dependencies:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al sincronizar las dependencias",
        color: "red",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowTemplates = (dependency: Dependency) => {
    router.push(`/admin/dependencies/templates/${dependency._id}`);
  }

  const handleEdit = (dependency: Dependency) => {
    router.push(`/admin/dependencies/update/${dependency._id}`);
  };

  const handleSave = async () => {
    if (!dep_code || !name) {
      showNotification({
        title: "Error",
        message: "El código y el nombre son requeridos",
        color: "red",
      });
      return;
    }

    try {
      const dependencyData = {
        dep_code,
        name,
        responsible,
        dep_father,
        producers: selectedProducers,
      };

      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/${selectedDependency?._id}`, dependencyData);
      showNotification({
        title: "Actualizado",
        message: "Dependencia actualizada exitosamente",
        color: "teal",
      });

      handleModalClose();
      fetchDependencies(page, search);
    } catch (error) {
      console.error("Error actualizando dependencia:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al actualizar la dependencia",
        color: "red",
      });
    }
  };

  const handleModalClose = () => {
    setOpened(false);
    setDepCode("");
    setName("");
    setResponsible(null);
    setDepFather(null);
    setSelectedDependency(null);
    setSelectedProducers([]);
    setMembers([]);
  };

  const handlePermissionsModal = async () => {
    try {
      const [usersResponse, depsResponse] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/users-with-dependencies`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/dependencies-list`)
      ]);
      
      const usersData = await usersResponse.json();
      const depsData = await depsResponse.json();
      
      setUsersWithDependencies(usersData);
      setAvailableDependencies(depsData.map((dep: any) => ({
        value: dep.dep_code,
        label: `${dep.name}`
      })));
      
      // Limpiar estado anterior
      setSelectedUser(null);
      setSelectedAdditionalDeps([]);
      setPermissionsModalOpened(true);
    } catch (error) {
      showNotification({
        title: "Error",
        message: "Error al cargar datos de permisos",
        color: "red",
      });
    }
  };

  const handleUserStatusModal = async () => {
    try {
      const [usersResponse, depsResponse] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/users-with-dependencies`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/dependencies-list`)
      ]);
      
      const usersData = await usersResponse.json();
      const depsData = await depsResponse.json();
      
      setAllUsersStatus(usersData);
      setAvailableDependencies(depsData.map((dep: any) => ({
        value: dep.dep_code,
        label: `${dep.name}`
      })));
      setUserStatusModalOpened(true);
    } catch (error) {
      showNotification({
        title: "Error",
        message: "Error al cargar estado de usuarios",
        color: "red",
      });
    }
  };

  const handleUserSelect = (user: UserWithDependencies) => {
    setSelectedUser(user);
    setSelectedAdditionalDeps(user.additional_dependencies || []);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/users/${selectedUser.email}/dependencies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additional_dependencies: selectedAdditionalDeps })
      });
      
      showNotification({
        title: "Actualizado",
        message: "Permisos actualizados exitosamente",
        color: "teal",
      });
      
      // Refrescar datos y limpiar estado
      await handlePermissionsModal();
      setSelectedUser(null);
      setSelectedAdditionalDeps([]);
      setPermissionsModalOpened(false);
    } catch (error) {
      showNotification({
        title: "Error",
        message: "Error al actualizar permisos",
        color: "red",
      });
    }
  };

  //filter dependencies

  const filteredDependencies = sortedDependencies.filter(
    (dependency) => dependency.members && dependency.members.length > 0
  );

 const rows = filteredDependencies.map((dependency) => (
    <Table.Tr key={dependency._id}>
      <Table.Td>{dependency.dep_code}</Table.Td>
      <Table.Td>{dependency.name}</Table.Td>
      <Table.Td>
        {dependency.visualizers.length > 0 ? <Group gap={5}>
    {dependency.visualizers.slice(0, 1).map((v, index) => (
      <Text key={index} > {v} </Text>
    ))}
    {dependency.visualizers.length > 1 && (
      <Badge variant="outline">+{dependency.visualizers.length - 1} más</Badge>
    )}
  </Group> : <Text> No definido </Text> }
  
</Table.Td>
      {/* <Table.Td>{dependency.dep_father}</Table.Td> */}
      <Table.Td>
        <Center>
          <Group gap={5}>
            <Button variant="outline" color="orange" onClick={() => handleShowTemplates(dependency)}>
               Plantillas
            </Button>
            <Button variant="outline" onClick={() => handleEdit(dependency)}>
              <IconEdit size={16} />
            </Button>
          </Group>
        </Center>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <Group className={styles.customGroup} mb="md">
        <TextInput
          placeholder="Buscar en todas las dependencias"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          className={styles.searchInput}
        />
        <Button
          variant="outline"
          color="blue"
          leftSection={<IconUsers size={16} />}
          onClick={handlePermissionsModal}
        >
          Permisos a más dependencias
        </Button>
        <Button
          variant="outline"
          color="green"
          leftSection={<IconUsers size={16} />}
          onClick={handleUserStatusModal}
        >
          Estado de usuarios
        </Button>
        <Button
          variant="light"
          onClick={handleSyncDependencies}
          className={styles.syncButton} 
          loading={isLoading}
          leftSection={<IconRefresh/>}
        >
          Sincronizar las Dependencias
        </Button>
      </Group>
      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
          <Table.Th onClick={() => handleSort("dep_code")} style={{ cursor: "pointer" }}>
              <Center inline>
                Código
                {sortConfig.key === "dep_code" ? (
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
            <Table.Th onClick={() => handleSort("responsible")} style={{ cursor: "pointer" }}>
              <Center inline>
                Líder(es)
                {sortConfig.key === "responsible" ? (
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
            {/* <Table.Th>Dependencia Padre</Table.Th> */}
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
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
        onClose={handleModalClose}
        title={
          selectedDependency ? "Editar Dependencia" : "Crear Nueva Dependencia"
        }
      >
        <TextInput label="Código" value={dep_code} readOnly mb="md" />
        <TextInput label="Nombre" value={name} readOnly mb="md" />
        <TextInput
          label="Dependencia Padre"
          value={dep_father || ""}
          readOnly
          mb="md"
        />
        <Select
          label="Responsable"
          placeholder="Selecciona un responsable"
          data={members}
          value={responsible}
          onChange={setResponsible}
          searchable
          clearable
          mb="md"
        />
        <MultiSelect
          label="Productores"
          placeholder="Selecciona productores"
          data={members}
          value={selectedProducers}
          onChange={setSelectedProducers}
          searchable
        />
        <Group mt="md">
          <Button onClick={handleSave}>Guardar</Button>
          <Button variant="outline" onClick={handleModalClose}>
            Cancelar
          </Button>
        </Group>
      </Modal>
      
      <Modal
        opened={permissionsModalOpened}
        onClose={() => {
          setPermissionsModalOpened(false);
          setSelectedUser(null);
          setSelectedAdditionalDeps([]);
        }}
        title="Permisos a más dependencias"
        size="lg"
      >
        <Group mb="md">
          <Select
            label="Seleccionar usuario"
            placeholder="Buscar usuario..."
            data={usersWithDependencies.map(user => ({
              value: user.email,
              label: `${user.full_name} (${user.email})`
            }))}
            searchable
            value={selectedUser?.email || null}
            onChange={(email) => {
              const user = usersWithDependencies.find(u => u.email === email);
              if (user) handleUserSelect(user);
            }}
          />
        </Group>
        
        {selectedUser && (
          <>
            <Text size="sm" mb="xs">Dependencia principal: {availableDependencies.find(dep => dep.value === selectedUser.dep_code)?.label || selectedUser.dep_code}</Text>
            <MultiSelect
              label="Dependencias adicionales"
              placeholder="Seleccionar dependencias..."
              data={availableDependencies}
              value={selectedAdditionalDeps}
              onChange={setSelectedAdditionalDeps}
              searchable
            />
            <Group mt="md">
              <Button onClick={handleSavePermissions}>Guardar</Button>
              <Button variant="outline" onClick={() => {
                setPermissionsModalOpened(false);
                setSelectedUser(null);
                setSelectedAdditionalDeps([]);
              }}>
                Cancelar
              </Button>
            </Group>
          </>
        )}
      </Modal>
      
      <Modal
        opened={userStatusModalOpened}
        onClose={() => setUserStatusModalOpened(false)}
        title="Estado de usuarios"
        size="95%"
        centered
      >
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Usuario</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Dependencia Principal</Table.Th>
              <Table.Th>Dependencias Adicionales</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {allUsersStatus.map((user) => (
              <Table.Tr key={user.email}>
                <Table.Td>{user.full_name}</Table.Td>
                <Table.Td>{user.email}</Table.Td>
                <Table.Td>{availableDependencies.find(dep => dep.value === user.dep_code)?.label || user.dep_code}</Table.Td>
                <Table.Td>
                  {user.additional_dependencies && user.additional_dependencies.length > 0 ? (
                    <Group gap={5}>
                      {user.additional_dependencies.map((depCode, index) => (
                        <Badge key={index} variant="outline">
                          {availableDependencies.find(dep => dep.value === depCode)?.label || depCode}
                        </Badge>
                      ))}
                    </Group>
                  ) : (
                    <Text size="sm" c="dimmed">Sin dependencias adicionales</Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Modal>
    </Container>
  );
};

export default AdminDependenciesPage;
