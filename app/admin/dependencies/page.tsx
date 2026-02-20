"use client";

import { useEffect, useState } from "react";
import { Container, Table, Button, Modal, TextInput, Group, Pagination, Center, Select, MultiSelect, Text, Badge, Alert } from "@mantine/core";
import { IconEdit, IconRefresh, IconTrash, IconArrowBigUpFilled, IconArrowBigDownFilled, IconArrowsTransferDown, IconUsers, IconAlertTriangle } from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { showNotification } from "@mantine/notifications";
import styles from "./AdminDependenciesPage.module.css";
import { useSort } from "../../hooks/useSort";
import { logDependencyPermissionChange, logDependencyUpdate, compareDependencyChanges, compareDependencyPermissions } from "@/app/utils/auditUtils";

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
  const { data: session } = useSession();
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const isAdmin = session?.user?.role === 'admin';
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
  const [userFilterSearch, setUserFilterSearch] = useState("");
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
          }))
          .filter((option: any, index: number, self: any[]) => 
            index === self.findIndex(o => o.value === option.value)
          );
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
    
    console.log('=== SYNC DEBUG ===');
    console.log('Session:', session);
    console.log('User email:', session?.user?.email);
    console.log('Is admin:', isAdmin);
    
    if (!session?.user?.email) {
      showNotification({
        title: "Error",
        message: "No se pudo obtener el email del administrador",
        color: "red",
      });
      setIsLoading(false);
      return;
    }
    
    try {
      const payload = { adminEmail: session.user.email };
      const headers = { 
        'user-email': session.user.email,
        'Content-Type': 'application/json'
      };
      
      console.log('Payload:', payload);
      console.log('Headers:', headers);
      
      // Establecer cookie para el middleware
      document.cookie = `userEmail=${session.user.email}; path=/`;
      
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/updateAll`, payload, { headers });
      
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

    console.log('=== SAVE DEBUG ===');
    console.log('Session:', session);
    console.log('User email:', session?.user?.email);
    console.log('Selected dependency ID:', selectedDependency?._id);
    
    if (!session?.user?.email) {
      showNotification({
        title: "Error",
        message: "No se pudo obtener el email del administrador",
        color: "red",
      });
      return;
    }

    try {
      // Guardar estado anterior para auditoría
      const oldDependency = selectedDependency ? {
        responsible: selectedDependency.responsible,
        producers: selectedDependency.members || []
      } : null;
      
      const dependencyData = {
        dep_code,
        name,
        responsible,
        dep_father,
        producers: selectedProducers,
        adminEmail: session.user.email
      };
      
      console.log('Dependency data:', dependencyData);
      
      // Establecer cookie para el middleware
      document.cookie = `userEmail=${session.user.email}; path=/`;

      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/${selectedDependency?._id}`, dependencyData, {
        headers: {
          'user-email': session.user.email,
          'Content-Type': 'application/json'
        }
      });
      
      // Registrar cambios en auditoría
      if (session?.user?.email && oldDependency) {
        const newDependency = {
          responsible,
          producers: selectedProducers
        };
        
        const changes = compareDependencyChanges(oldDependency, newDependency);
        
        if (Object.keys(changes).length > 0) {
          await logDependencyUpdate(
            dep_code,
            name,
            changes,
            session.user.email
          );
        }
      }
      
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
      const uniqueDeps = depsData
        .map((dep: any) => ({
          value: dep.dep_code,
          label: `${dep.name}`
        }))
        .filter((option: any, index: number, self: any[]) => 
          index === self.findIndex(o => o.value === option.value)
        );
      setAvailableDependencies(uniqueDeps);
      
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
      const uniqueDeps = depsData
        .map((dep: any) => ({
          value: dep.dep_code,
          label: `${dep.name}`
        }))
        .filter((option: any, index: number, self: any[]) => 
          index === self.findIndex(o => o.value === option.value)
        );
      setAvailableDependencies(uniqueDeps);
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
      // Guardar estado anterior para auditoría
      const oldPermissions = selectedUser.additional_dependencies || [];
      
      console.log('=== DEBUG INFO ===');
      console.log('Usuario seleccionado:', selectedUser);
      console.log('Dependencias adicionales seleccionadas:', selectedAdditionalDeps);
      console.log('Tipo de selectedAdditionalDeps:', typeof selectedAdditionalDeps);
      console.log('Es array?', Array.isArray(selectedAdditionalDeps));
      console.log('Longitud:', selectedAdditionalDeps?.length);
      
      const payload = { additionalDependencies: selectedAdditionalDeps };
      console.log('Payload completo:', JSON.stringify(payload, null, 2));
      
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/users/${selectedUser.email}/dependencies`,
        {
          ...payload,
          adminEmail: session?.user?.email
        }
      );
      
      console.log('Respuesta completa del backend:', response.data);
      
      // Registrar cambios en auditoría
      if (session?.user?.email) {
        const permissionChanges = compareDependencyPermissions(oldPermissions, selectedAdditionalDeps);
        
        console.log('=== AUDIT DEBUG ===');
        console.log('Old permissions:', oldPermissions);
        console.log('New permissions:', selectedAdditionalDeps);
        console.log('Permission changes:', permissionChanges);
        console.log('Admin email:', session.user.email);
        
        if (permissionChanges.added.length > 0 || permissionChanges.removed.length > 0) {
          console.log('Calling logDependencyPermissionChange...');
          try {
            await logDependencyPermissionChange(
              selectedUser.email,
              selectedUser.full_name,
              permissionChanges,
              session.user.email
            );
            console.log('Audit log sent successfully');
          } catch (auditError) {
            console.error('Error sending audit log:', auditError);
          }
        } else {
          console.log('No changes detected, skipping audit log');
        }
      } else {
        console.log('No admin email found, skipping audit log');
      }
      
      showNotification({
        title: "✅ Permisos Actualizados",
        message: `Dependencias actualizadas para ${selectedUser.full_name}. Email de notificación enviado.`,
        color: "teal",
        autoClose: 5000,
      });
      
      // Mostrar todas las dependencias del usuario
      if (response.data.allDependencies) {
        console.log('Todas las dependencias del usuario:', response.data.allDependencies);
        const totalDeps = response.data.allDependencies.length;
        const additionalCount = response.data.allDependencies.filter((dep: any) => dep.type === 'adicional').length;
        
        showNotification({
          title: "📋 Resumen de Dependencias",
          message: `${selectedUser.full_name} ahora tiene acceso a ${totalDeps} dependencias (${additionalCount} adicionales)`,
          color: "blue",
          autoClose: 4000,
        });
      }
      
      // Refrescar datos y limpiar estado
      await handlePermissionsModal();
      setSelectedUser(null);
      setSelectedAdditionalDeps([]);
      setPermissionsModalOpened(false);
    } catch (error) {
      console.error("Error updating permissions:", error);
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
            <Table.Th onClick={() => handleSort("visualizers")} style={{ cursor: "pointer" }}>
              <Center inline>
                Líder(es)
                {sortConfig.key === "visualizers" ? (
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
          selectedDependency ? (isAdmin ? "Editar Dependencia" : "Ver Dependencia") : "Crear Nueva Dependencia"
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
        <Alert
          icon={<IconAlertTriangle size={16} />}
          title="Advertencia"
          color="yellow"
          mb="md"
        >
          ¡¡Al actualizar las dependencias de un usuario, se enviará automáticamente un correo electrónico de notificación al usuario informándole sobre los cambios realizados.!!
        </Alert>
        
        <Group mb="md">
          <Select
            label="Seleccionar usuario"
            placeholder="Buscar usuario..."
            data={usersWithDependencies
              .map(user => ({
                value: user.email,
                label: `${user.full_name} (${user.email})`
              }))
              .filter((option, index, self) => 
                index === self.findIndex(o => o.value === option.value)
              )}
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
        onClose={() => {
          setUserStatusModalOpened(false);
          setUserFilterSearch("");
        }}
        title="Estado de usuarios"
        size="95%"
        centered
      >
        <TextInput
          placeholder="Buscar usuarios por nombre..."
          value={userFilterSearch}
          onChange={(event) => setUserFilterSearch(event.currentTarget.value)}
          mb="md"
        />
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
            {allUsersStatus
              .filter((user) => 
                user.full_name && user.full_name.toLowerCase().includes(userFilterSearch.toLowerCase())
              )
              .map((user) => (
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
                    <Text size="sm" c="dimmed">Sin Dependencias Adicionales</Text>
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
