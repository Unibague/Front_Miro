"use client";

import { useEffect, useState } from "react";
import { Container, Table, Button, Pagination, Center, TextInput, Group, Modal, Tooltip } from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { IconEdit, IconTrash, IconCirclePlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useDisclosure } from "@mantine/hooks";

interface Category {
  _id: string;
  name: string;
  templates: {
    templateId: {
      _id: string;
      name: string; 
    };
    sequence: number;
  }[];
}

const CategoryAdminPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [modalOpen, { open, close }] = useDisclosure(false);
  const router = useRouter();

  // Fetch categories from API
  const fetchCategories = async (page: number, search: string) => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/categories/all`, {
        params: { page, limit: 10, search },
      });
  
      if (response.data) {
        setCategories(response.data.categories || []);
        setTotalPages(response.data.pages || 1);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
      setCategories([]);
    }
  };
  

  useEffect(() => {
    fetchCategories(page, search);
  }, [page]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchCategories(page, search);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      const response = await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/categories/${categoryId}`);
      showNotification({
        title: "Categoría eliminada",
        message: "La categoría se ha eliminado exitosamente.",
        color: "teal",
      });
      fetchCategories(page, search); // Refrescar la lista después de eliminar
    } catch (error) {
      console.error("Error deleting category:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al eliminar la categoría.",
        color: "red",
      });
    }
  };
  

  // Redirect to edit category page
  const handleEditCategory = (category: Category) => {
    setSelectedCategory(category);
    // Navigate to the edit page with the category ID
    router.push(`/templates/edit-category/${category._id}`);
  };

  return (
    <Container size="xl">
      <TextInput
        placeholder="Buscar categorías"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />

      <Group justify="flex-start" mb="md">
        <Button
          leftSection={<IconCirclePlus />}
          onClick={() => router.push("/templates/create-category")}
        >
          Crear Nueva Categoría
        </Button>
      </Group>

      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nombre de la Categoría</Table.Th>
            <Table.Th>Plantillas Asociadas</Table.Th>
            <Table.Th>Acciones</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {categories.length > 0 ? (
            categories.map((category) => (
              <Table.Tr key={category._id}>
                <Table.Td>{category.name}</Table.Td>
                <Table.Td>
  {category.templates.length > 0 ? (
    <ul style={{ margin: 0, paddingLeft: 16 }}>
      {category.templates.map((t) => (
        <li key={t.templateId._id}>{t.templateId.name} (#{t.sequence})</li>
      ))}
    </ul>
  ) : (
    <i>No hay plantillas</i>
  )}
</Table.Td>

                <Table.Td>
                  <Group>
                    <Tooltip label="Editar">
                      <Button
                        variant="outline"
                        onClick={() => handleEditCategory(category)}
                      >
                        <IconEdit size={16} />
                      </Button>
                    </Tooltip>
                    <Tooltip label="Eliminar">
                      <Button
                        variant="outline"
                        color="red"
                        onClick={() => handleDeleteCategory(category._id)}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))
          ) : (
            <Table.Tr>
              <Table.Td colSpan={2} style={{ textAlign: "center" }}>
                No hay categorías registradas.
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
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
    </Container>
  );
};

export default CategoryAdminPage;
