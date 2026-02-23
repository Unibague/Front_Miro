"use client";

import { useEffect, useState } from "react";
import {
  Container,
  Title,
  Button,
  Group,
  Card,
  Text,
  Stack,
  Badge,
  ActionIcon,
  Modal,
  TextInput,
  Select,
  Switch,
  Tooltip,
  Collapse,
  Box,
} from "@mantine/core";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconChevronDown,
  IconChevronRight,
  IconBuilding,
  IconBuildingCommunity,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useSession } from "next-auth/react";
import DateConfig from "@/app/components/DateConfig";

interface Dependency {
  _id: string;
  dep_code: string;
  name: string;
  parent_id?: string;
  children?: Dependency[];
  responsible?: string;
  active: boolean;
}

const AdminDependenciesPage = () => {
  const { data: session } = useSession();
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingDependency, setEditingDependency] = useState<Dependency | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  // Form states
  const [formData, setFormData] = useState({
    dep_code: "",
    name: "",
    parent_id: "",
    responsible: "",
    active: true,
  });

  const fetchDependencies = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/hierarchy`, {
        params: { email: session?.user?.email }
      });
      setDependencies(response.data);
    } catch (error) {
      console.error("Error fetching dependencies:", error);
      showNotification({
        title: "Error",
        message: "No se pudieron cargar las dependencias",
        color: "red",
      });
    }
  };

  useEffect(() => {
    fetchDependencies();
  }, []);

  const handleSubmit = async () => {
    if (!formData.dep_code || !formData.name) {
      showNotification({
        title: "Error",
        message: "Código y nombre son requeridos",
        color: "red",
      });
      return;
    }

    modals.openConfirmModal({
      title: editingDependency ? "Confirmar actualización" : "Confirmar creación",
      children: (
        <Text size="sm">
          ¿Estás seguro de que deseas {editingDependency ? "actualizar" : "crear"} esta dependencia?
        </Text>
      ),
      labels: { confirm: "Confirmar", cancel: "Cancelar" },
      confirmProps: { color: "blue" },
      onConfirm: async () => {
        try {
          if (editingDependency) {
            await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/update-hierarchy/${editingDependency._id}`, {
              ...formData,
              userEmail: session?.user?.email,
            });
            showNotification({
              title: "Actualizado",
              message: "Dependencia actualizada exitosamente",
              color: "green",
            });
          } else {
            await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/create`, {
              ...formData,
              userEmail: session?.user?.email,
            });
            showNotification({
              title: "Creado",
              message: "Dependencia creada exitosamente",
              color: "green",
            });
          }
          closeModal();
          resetForm();
          fetchDependencies();
        } catch (error: any) {
          showNotification({
            title: "Error",
            message: error.response?.data?.message || "Error al procesar la solicitud",
            color: "red",
          });
        }
      },
    });
  };

  const handleEdit = (dependency: Dependency) => {
    setEditingDependency(dependency);
    setFormData({
      dep_code: dependency.dep_code,
      name: dependency.name,
      parent_id: dependency.parent_id || "",
      responsible: dependency.responsible || "",
      active: dependency.active,
    });
    openModal();
  };

  const handleDelete = (dependency: Dependency) => {
    modals.openConfirmModal({
      title: "Confirmar eliminación",
      children: (
        <Text size="sm">
          ¿Estás seguro de que deseas eliminar la dependencia "{dependency.name}"?
          {dependency.children && dependency.children.length > 0 && (
            <>
              <br /><br />
              <strong>Esta dependencia tiene {dependency.children.length} dependencia(s) hija(s) que también serán afectadas.</strong>
            </>
          )}
        </Text>
      ),
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/delete/${dependency._id}`, {
            params: { userEmail: session?.user?.email },
          });
          showNotification({
            title: "Eliminado",
            message: "Dependencia eliminada exitosamente",
            color: "green",
          });
          fetchDependencies();
        } catch (error: any) {
          showNotification({
            title: "Error",
            message: error.response?.data?.message || "Error al eliminar la dependencia",
            color: "red",
          });
        }
      },
    });
  };

  const resetForm = () => {
    setFormData({
      dep_code: "",
      name: "",
      parent_id: "",
      responsible: "",
      active: true,
    });
    setEditingDependency(null);
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const getAllDependenciesFlat = (deps: Dependency[]): Dependency[] => {
    const result: Dependency[] = [];
    const traverse = (items: Dependency[]) => {
      items.forEach(item => {
        result.push(item);
        if (item.children) {
          traverse(item.children);
        }
      });
    };
    traverse(deps);
    return result;
  };

  const renderDependency = (dependency: Dependency, level: number = 0) => {
    const hasChildren = dependency.children && dependency.children.length > 0;
    const isExpanded = expandedItems.has(dependency._id);

    return (
      <Box key={dependency._id} ml={level * 20}>
        <Card withBorder mb="xs" p="sm">
          <Group justify="space-between">
            <Group>
              {hasChildren && (
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => toggleExpanded(dependency._id)}
                >
                  {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                </ActionIcon>
              )}
              {level === 0 ? (
                <IconBuildingCommunity size={20} color="blue" />
              ) : (
                <IconBuilding size={18} color="gray" />
              )}
              <div>
                <Group gap="xs">
                  <Text fw={500}>{dependency.name}</Text>
                  <Badge size="sm" variant="light">
                    {dependency.dep_code}
                  </Badge>
                  <Badge 
                    size="sm" 
                    color={dependency.active ? "green" : "red"}
                    variant="light"
                  >
                    {dependency.active ? "Activo" : "Inactivo"}
                  </Badge>
                </Group>
                {dependency.responsible && (
                  <Text size="sm" c="dimmed">
                    Responsable: {dependency.responsible}
                  </Text>
                )}
              </div>
            </Group>
            <Group gap="xs">
              <Tooltip label="Editar dependencia">
                <ActionIcon
                  variant="outline"
                  color="blue"
                  onClick={() => handleEdit(dependency)}
                >
                  <IconEdit size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Eliminar dependencia">
                <ActionIcon
                  variant="outline"
                  color="red"
                  onClick={() => handleDelete(dependency)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Card>
        
        {hasChildren && (
          <Collapse in={isExpanded}>
            <Box ml="md">
              {dependency.children!.map(child => renderDependency(child, level + 1))}
            </Box>
          </Collapse>
        )}
      </Box>
    );
  };

  return (
    <Container size="xl">
      <DateConfig />
      <Title mb="md">Gestión de Dependencias</Title>
      
      <Group mb="md">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            resetForm();
            openModal();
          }}
        >
          Nueva Dependencia
        </Button>
      </Group>

      <Stack>
        {dependencies.map(dependency => renderDependency(dependency))}
        {dependencies.length === 0 && (
          <Text ta="center" c="dimmed" py="xl">
            No hay dependencias configuradas
          </Text>
        )}
      </Stack>

      <Modal
        opened={modalOpened}
        onClose={() => {
          closeModal();
          resetForm();
        }}
        title={editingDependency ? "Editar Dependencia" : "Nueva Dependencia"}
        size="md"
      >
        <Stack>
          <TextInput
            label="Código de Dependencia"
            placeholder="Ej: DEP001"
            value={formData.dep_code}
            onChange={(e) => setFormData({ ...formData, dep_code: e.target.value })}
            required
          />
          
          <TextInput
            label="Nombre"
            placeholder="Nombre de la dependencia"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          
          <Select
            label="Dependencia Padre"
            placeholder="Seleccionar dependencia padre (opcional)"
            data={getAllDependenciesFlat(dependencies)
              .filter(dep => dep._id !== editingDependency?._id)
              .map(dep => ({
                value: dep._id,
                label: `${dep.dep_code} - ${dep.name}`,
              }))}
            value={formData.parent_id}
            onChange={(value) => setFormData({ ...formData, parent_id: value || "" })}
            clearable
            searchable
          />
          
          <TextInput
            label="Responsable"
            placeholder="Nombre del responsable (opcional)"
            value={formData.responsible}
            onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
          />
          
          <Switch
            label="Dependencia activa"
            checked={formData.active}
            onChange={(e) => setFormData({ ...formData, active: e.currentTarget.checked })}
          />
          
          <Group justify="flex-end" mt="md">
            <Button variant="outline" onClick={() => {
              closeModal();
              resetForm();
            }}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingDependency ? "Actualizar" : "Crear"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
};

export default AdminDependenciesPage;