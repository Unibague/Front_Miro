"use client";

import { useEffect, useRef, useState } from "react";
import { Container, Table, Button, Modal, TextInput, Group, Pagination, Center, Select, MultiSelect, Text, Badge, Alert, Tooltip, Stack, Accordion, ScrollArea } from "@mantine/core";
import { IconEdit, IconRefresh, IconTrash, IconArrowBigUpFilled, IconArrowBigDownFilled, IconArrowsTransferDown, IconUsers, IconAlertTriangle, IconFileSpreadsheet, IconHistory } from "@tabler/icons-react";
import { modals } from '@mantine/modals';
import axios from "../config/axios";
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { showNotification } from "@mantine/notifications";
import styles from "./AdminDependenciesPage.module.css";
import { useSort } from "../../hooks/useSort";
import { logDependencyPermissionChange, logDependencyUpdate, compareDependencyChanges, compareDependencyPermissions } from "@/app/utils/auditUtils";
import { useViewPermission } from "@/app/hooks/useViewPermission";
import { usePeriod } from "@/app/context/PeriodContext";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { usePersistentSearch } from "@/app/hooks/usePersistentSearch";

interface Dependency {
  _id: string;
  dep_code: string;
  name: string;
  members: string[];
  responsible: string;
  dep_father: string;
  visualizers: string[];
  active?: boolean;
  inactive_since?: string | null;
  replaced_by?: string | null;
}

type TipoCambioSync = "creada" | "reactivada" | "modificada" | "desactivada" | "reemplazada";

interface CambioSync {
  tipo: TipoCambioSync;
  dep_code: string;
  nombre: string;
  campo?: string;
  antes?: string | null;
  despues?: string | null;
  reemplazada_por?: string | null;
  reemplazada_por_nombre?: string | null;
}

interface ResumenSync {
  creadas: number;
  reactivadas: number;
  modificadas: number;
  desactivadas: number;
  reemplazadas: number;
}

interface RegistroSync {
  _id?: string;
  fecha: string;
  origen?: string;
  ejecutado_por?: string;
  total_recibidas?: number;
  resumen: ResumenSync;
  cambios: CambioSync[];
}

const TIPO_CAMBIO_SYNC: Record<TipoCambioSync, { label: string; color: string }> = {
  creada: { label: "Nueva", color: "teal" },
  reactivada: { label: "Reactivada", color: "blue" },
  modificada: { label: "Modificada", color: "yellow" },
  desactivada: { label: "Inactivada", color: "gray" },
  reemplazada: { label: "Reemplazada", color: "orange" },
};

const detalleCambio = (c: CambioSync) => {
  switch (c.tipo) {
    case "creada": return "Nueva dependencia en el sistema externo";
    case "reactivada": return "Volvió a aparecer en el sistema externo";
    case "modificada": return `${c.campo}: ${c.antes ?? "—"} → ${c.despues ?? "—"}`;
    case "desactivada": return "Ya no llega del sistema externo; quedó inactiva (no se elimina)";
    case "reemplazada": return `Quedó inactiva. La reemplaza ${c.reemplazada_por_nombre ?? ""} (código ${c.reemplazada_por})`;
  }
};

const textoResumenSync = (r: ResumenSync) =>
  [
    r.creadas && `${r.creadas} nuevas`,
    r.reactivadas && `${r.reactivadas} reactivadas`,
    r.modificadas && `${r.modificadas} modificadas`,
    r.reemplazadas && `${r.reemplazadas} reemplazadas`,
    r.desactivadas && `${r.desactivadas} inactivadas`,
  ].filter(Boolean).join(" · ") || "Sin cambios";

function TablaCambiosSync({ cambios }: { cambios: CambioSync[] }) {
  if (!cambios.length) return <Text size="sm" c="dimmed">No hubo cambios.</Text>;
  return (
    <Table striped withTableBorder fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Cambio</Table.Th>
          <Table.Th>Código</Table.Th>
          <Table.Th>Dependencia</Table.Th>
          <Table.Th>Detalle</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {cambios.map((c, i) => (
          <Table.Tr key={`${c.tipo}-${c.dep_code}-${c.campo ?? ""}-${i}`}>
            <Table.Td><Badge size="sm" variant="light" color={TIPO_CAMBIO_SYNC[c.tipo].color}>{TIPO_CAMBIO_SYNC[c.tipo].label}</Badge></Table.Td>
            <Table.Td>{c.dep_code}</Table.Td>
            <Table.Td>{c.nombre}</Table.Td>
            <Table.Td>{detalleCambio(c)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
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
  const { canManage } = useViewPermission("dependencies");
  const { data: session } = useSession();
  const { selectedPeriodId } = usePeriod();
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
  const [search, setSearch] = usePersistentSearch();
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
  const [isDownloading, setIsDownloading] = useState(false);
  const [estadoFiltro, setEstadoFiltro] = useState<string>("todas");
  const [syncResultado, setSyncResultado] = useState<RegistroSync | null>(null);
  const [historialOpened, setHistorialOpened] = useState(false);
  const [historial, setHistorial] = useState<RegistroSync[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const abrirHistorial = async () => {
    setHistorialOpened(true);
    setCargandoHistorial(true);
    try {
      const { data } = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/sync-logs`, { params: { limit: 30 } });
      setHistorial(Array.isArray(data) ? data : []);
    } catch {
      showNotification({ title: "Error", message: "No se pudo cargar el historial de sincronizaciones", color: "red" });
    } finally {
      setCargandoHistorial(false);
    }
  };

  const handleDownloadExcel = async () => {
    setIsDownloading(true);
    try {
      // Primero obtenemos dependencias y usuarios (obligatorios)
      const [depsRes, usersRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`, { params: { limit: 100000 } }),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users/all`),
      ]);

      const allDeps: Dependency[] = depsRes.data.dependencies || [];
      const allUsers: { email: string; full_name: string; name?: string }[] = usersRes.data || [];
      const userMap = new Map(allUsers.map((u) => [u.email, u.full_name || u.name || u.email]));

      // Plantillas: petición independiente para no bloquear si falla
      let depTemplatesMap: Record<string, string[]> = {};
      try {
        const templatesRes = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/templates-summary`,
          { params: selectedPeriodId ? { periodId: selectedPeriodId } : {} }
        );
        depTemplatesMap = templatesRes.data || {};
      } catch {
        // Si falla, el Excel se descarga igual sin la columna de plantillas
      }

      const data = allDeps.map((dep) => {
        const miembros = (dep.members || []).map((email) => userMap.get(email) || email);
        const plantillas = depTemplatesMap[dep._id] || [];
        return {
          "Código": dep.dep_code,
          "Nombre": dep.name,
          "Estado": dep.active === false ? "Inactiva" : "Activa",
          "Inactiva desde": dep.active === false && dep.inactive_since
            ? new Date(dep.inactive_since).toLocaleDateString("es-CO")
            : "",
          "Líder(es)": dep.responsible || "No definido",
          "Dependencia Padre": dep.dep_father || "",
          "Número de miembros": miembros.length,
          "Miembros": miembros.join("\n"),
          "Número de plantillas": plantillas.length,
          "Plantillas Asignadas": plantillas.join("\n"),
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 12 },  // Código
        { wch: 40 },  // Nombre
        { wch: 12 },  // Estado
        { wch: 16 },  // Inactiva desde
        { wch: 35 },  // Líder(es)
        { wch: 30 },  // Dependencia Padre
        { wch: 18 },  // Número de miembros
        { wch: 45 },  // Miembros
        { wch: 18 },  // Número de plantillas
        { wch: 55 },  // Plantillas Asignadas
      ];
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let row = range.s.r + 1; row <= range.e.r; row++) {
        const cellMiembros = ws[XLSX.utils.encode_cell({ r: row, c: 7 })];
        if (cellMiembros) cellMiembros.s = { alignment: { wrapText: true, vertical: "top" } };
        const cellPlantillas = ws[XLSX.utils.encode_cell({ r: row, c: 9 })];
        if (cellPlantillas) cellPlantillas.s = { alignment: { wrapText: true, vertical: "top" } };
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dependencias");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
      saveAs(new Blob([buf], { type: "application/octet-stream" }), "dependencias.xlsx");
    } catch (error) {
      showNotification({ title: "Error", message: "No se pudo descargar el Excel", color: "red" });
    } finally {
      setIsDownloading(false);
    }
  };
  


  const fetchDependencies = async (page: number, search: string) => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`, {
        params: { page, limit: 10, search, ...(estadoFiltro !== "todas" ? { estado: estadoFiltro } : {}) },
      });
      if (response.data) {
        console.log('=== DEPENDENCIES DATA ===');
        console.log('Response:', response.data);
        console.log('Dependencies:', response.data.dependencies);
        response.data.dependencies?.forEach((dep: any, index: number) => {
          console.log(`Dependency ${index}:`, {
            _id: dep._id,
            dep_code: dep.dep_code,
            name: dep.name,
            responsible: dep.responsible,
            members: dep.members
          });
        });
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
          .reduce((acc: any[], member: any) => {
            if (!acc.find(item => item.value === member.email)) {
              acc.push({
                value: member.email,
                label: `${member.full_name} (${member.email})`,
              });
            }
            return acc;
          }, []);
        setMembers(memberOptions);
      }
    } catch (error) {
      console.error("Error fetching members:", error);
      setMembers([]);
    }
  };

  useEffect(() => {
    fetchDependencies(page, search);
  }, [page]);

  // Al cambiar el filtro de estado se vuelve a la primera página (no en la carga inicial)
  const filtroInicializado = useRef(false);
  useEffect(() => {
    if (!filtroInicializado.current) {
      filtroInicializado.current = true;
      return;
    }
    if (page !== 1) setPage(1);
    else fetchDependencies(1, search);
  }, [estadoFiltro]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchDependencies(page, search);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // Refresh data when returning to this page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchDependencies(page, search);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [page, search]);

  const handleSyncConfirmation = () => {
    modals.openConfirmModal({
      title: 'Confirmar Sincronización',
      children: (
        <Text size="sm">
          ¿Estás seguro de que deseas sincronizar todas las dependencias? Se crearán o actualizarán las vigentes y se asignarán sus líderes. Las que ya no existan en el sistema externo se marcarán como inactivas (nunca se eliminan de la base de datos). Al terminar verás qué cambió.
        </Text>
      ),
      labels: { confirm: 'Sincronizar', cancel: 'Cancelar' },
      confirmProps: { color: 'blue' },
      onConfirm: handleSyncDependencies,
    });
  };

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
      
      const { data: syncResult } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/dependencies/updateAll`,
        payload,
        { headers }
      );
      
      // Recargar los datos después de la sincronización exitosa
      await fetchDependencies(page, search);
      
      showNotification({
        title: "Sincronizado",
        message: `${syncResult.count ?? 0} dependencias sincronizadas y ${syncResult.leadersAssigned ?? 0} líderes asignados. ${syncResult.resumen ? textoResumenSync(syncResult.resumen) : ""}`,
        color: "teal",
      });
      if (Array.isArray(syncResult.cambios) && syncResult.cambios.length > 0) {
        setSyncResultado({ fecha: new Date().toISOString(), resumen: syncResult.resumen, cambios: syncResult.cambios });
      }
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
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/users-with-dependencies`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/dependencies-list`)
      ]);
      
      const usersData = usersResponse.data;
      const depsData = depsResponse.data;
      
      setUsersWithDependencies(usersData);
      const uniqueDeps = depsData
        .reduce((acc: any[], dep: any) => {
          if (!acc.find(item => item.value === dep.dep_code)) {
            acc.push({
              value: dep.dep_code,
              label: `${dep.name}`
            });
          }
          return acc;
        }, []);
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
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/users-with-dependencies`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/dependencies-list`)
      ]);
      
      const usersData = usersResponse.data;
      const depsData = depsResponse.data;
      
      setAllUsersStatus(usersData);
      const uniqueDeps = depsData
        .reduce((acc: any[], dep: any) => {
          if (!acc.find(item => item.value === dep.dep_code)) {
            acc.push({
              value: dep.dep_code,
              label: `${dep.name}`
            });
          }
          return acc;
        }, []);
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

 const rows = sortedDependencies.map((dependency) => (
    <Table.Tr key={dependency._id}>
      <Table.Td>{dependency.dep_code}</Table.Td>
      <Table.Td>
        <Group gap={6}>
          <Text>{dependency.name}</Text>
          {dependency.active === false ? (
            <Tooltip label={dependency.inactive_since ? `Inactiva desde el ${new Date(dependency.inactive_since).toLocaleDateString("es-CO")}` : "Inactiva"}>
              <Badge color="gray" size="sm">Inactiva</Badge>
            </Tooltip>
          ) : (
            <Badge color="teal" variant="light" size="sm">Activa</Badge>
          )}
          {dependency.replaced_by && (
            <Badge color="orange" variant="light" size="sm">Reemplazada por {dependency.replaced_by}</Badge>
          )}
        </Group>
      </Table.Td>
      <Table.Td>
        {dependency.responsible ? (
          <Text>{dependency.responsible}</Text>
        ) : (
          <Text c="dimmed">No definido</Text>
        )}
      </Table.Td>
      {/* <Table.Td>{dependency.dep_fathe}</Table.Td> */}
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
          variant="outline"
          color="teal"
          leftSection={<IconFileSpreadsheet size={16} />}
          onClick={handleDownloadExcel}
          loading={isDownloading}
        >
          Descargar Excel
        </Button>
        <Select
          value={estadoFiltro}
          onChange={(v) => setEstadoFiltro(v ?? "todas")}
          allowDeselect={false}
          w={150}
          data={[
            { value: "todas", label: "Todas" },
            { value: "activas", label: "Activas" },
            { value: "inactivas", label: "Inactivas" },
          ]}
        />
        <Button
          variant="outline"
          color="gray"
          leftSection={<IconHistory size={16} />}
          onClick={abrirHistorial}
        >
          Historial de sincronizaciones
        </Button>
        <Button
          variant="light"
          onClick={handleSyncConfirmation}
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
      <Modal
        opened={!!syncResultado}
        onClose={() => setSyncResultado(null)}
        title="Cambios de la sincronización"
        size="xl"
      >
        {syncResultado && (
          <Stack gap="sm">
            <Text size="sm">{textoResumenSync(syncResultado.resumen)}</Text>
            <Text size="xs" c="dimmed">Ninguna dependencia se eliminó: las que dejaron de llegar quedaron inactivas.</Text>
            <ScrollArea.Autosize mah={480}>
              <TablaCambiosSync cambios={syncResultado.cambios} />
            </ScrollArea.Autosize>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={historialOpened}
        onClose={() => setHistorialOpened(false)}
        title="Historial de sincronizaciones"
        size="xl"
      >
        {cargandoHistorial ? (
          <Center py="md"><Text size="sm" c="dimmed">Cargando...</Text></Center>
        ) : historial.length === 0 ? (
          <Text size="sm" c="dimmed">Todavía no hay sincronizaciones con cambios registrados.</Text>
        ) : (
          <Accordion variant="separated">
            {historial.map((log) => (
              <Accordion.Item key={log._id ?? log.fecha} value={log._id ?? log.fecha}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap" pr="sm">
                    <Text size="sm" fw={600}>{new Date(log.fecha).toLocaleString("es-CO")}</Text>
                    <Text size="xs" c="dimmed">{textoResumenSync(log.resumen)}</Text>
                  </Group>
                  {log.ejecutado_por && (
                    <Text size="xs" c="dimmed">
                      {log.origen === "usuarios" ? "Sincronización de usuarios" : "Sincronización de dependencias"} · {log.ejecutado_por}
                    </Text>
                  )}
                </Accordion.Control>
                <Accordion.Panel>
                  <TablaCambiosSync cambios={log.cambios} />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </Modal>

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
              .reduce((acc: any[], user) => {
                if (!acc.find(item => item.value === user.email)) {
                  acc.push({
                    value: user.email,
                    label: `${user.full_name} (${user.email})`
                  });
                }
                return acc;
              }, [])}
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
