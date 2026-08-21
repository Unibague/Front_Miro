"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Container,
  TextInput,
  Button,
  Group,
  Select,
  Table,
  Switch,
  Title,
  MultiSelect,
} from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { paramId } from "@/app/utils/routeParams";

interface Member {
  email: string;
  full_name: string;
  isProducer: boolean;
}

const AdminUpdateDependencyPage = () => {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = paramId(params);

  const [dependency, setDependency] = useState({
    dep_code: "",
    name: "",
    responsible: "",
    dep_father: "",
    members: [] as string[],
    visualizers: [] as string[],
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [selectAllProducers, setSelectAllProducers] = useState(false);

  useEffect(() => {
    if (id) {
      const fetchDependency = async () => {
        try {
          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/dependencies/${id}`
          );

          setDependency(response.data);
          
          // Traer TODOS los usuarios de la dependencia (incluyendo inactivos)
          const allUsersResponse = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/users/${response.data.dep_code}/users`
          );

          // Los usuarios ya vienen con sus roles del backend, no necesitamos hacer otra llamada
          const updatedMembers = allUsersResponse.data.map((member: any) => {
            const isProducer = member.roles?.includes("Productor") || false;
            return {
              email: member.email,
              full_name: member.full_name,
              isProducer,
            };
          });

          setMembers(updatedMembers);
        } catch (error) {
          console.error("Error fetching dependency or members:", error);
        }
      };
      fetchDependency();
    }
  }, [id]);

  const handleSave = async () => {
    if (!session?.user?.email) {
      showNotification({
        title: "Error",
        message: "No se pudo obtener el email del administrador",
        color: "red",
      });
      return;
    }

    try {
      const producers = members
        .filter((member) => member.isProducer)
        .map((member) => member.email);

      const nonProducers = members
        .filter((member) => !member.isProducer)
        .map((member) => member.email);

      const headers = {
        'user-email': session.user.email,
        'Content-Type': 'application/json'
      };

      // Establecer cookie para el middleware
      document.cookie = `userEmail=${session.user.email}; path=/`;

      // ✅ PASO 1: ACTUALIZAR LA LISTA DE MIEMBROS (NUEVO)
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/dependencies/${id}`,
        {
          dep_code: dependency.dep_code,
          name: dependency.name,
          responsible: dependency.visualizers && dependency.visualizers.length > 0 ? dependency.visualizers[0] : null,
          dep_father: dependency.dep_father,
          producers: producers,
          adminEmail: session.user.email
        },
        { headers }
      );
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/dependencies/setResponsible`,
        {
          dep_code: dependency.dep_code,
          email: dependency.visualizers && dependency.visualizers.length > 0 ? dependency.visualizers[0] : null,
          adminEmail: session.user.email
        },
        { headers }
      );

      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/users/updateProducer`,
        {
          users: [
            ...producers.map((email) => ({
              email,
              roles: ["Productor"],
            })),
            ...nonProducers.map((email) => ({
              email,
              roles: [],
            })),
          ],
          adminEmail: session.user.email
        },
        { headers }
      );

      if (dependency.visualizers && Array.isArray(dependency.visualizers)) {
        await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/${id}/visualizers`,
          { 
            visualizers: dependency.visualizers,
            adminEmail: session.user.email
          },
          { headers }
        );
      }
 
      showNotification({
        title: "Actualizado",
        message: "Dependencia actualizada exitosamente",
        color: "teal",
      });

      router.push("/admin/dependencies");
    } catch (error: any) {
      console.error('❌ ERROR:', error.response?.data || error.message);
      showNotification({
        title: "Error",
        message: "Hubo un error al actualizar la dependencia",
        color: "red",
      });
    }
  };

  const toggleProducer = (email: string) => {
    setMembers((prevMembers) =>
      prevMembers.map((member) =>
        member.email === email
          ? { ...member, isProducer: !member.isProducer }
          : member
      )
    );
  };

  const toggleAllProducers = () => {
    setSelectAllProducers((prevState) => !prevState);
    setMembers((prevMembers) =>
      prevMembers.map((member) => ({
        ...member,
        isProducer: !selectAllProducers,
      }))
    );
  };

  return (
    <Container size="md">
      <Title ta={"center"} order={2}>
        Gestionar Dependencia
      </Title>
      <TextInput label="Código" value={dependency.dep_code} readOnly mb="md" />
      <TextInput
        label="Dependencia Padre"
        value={dependency.dep_father}
        readOnly
        mb="md"
      />
      <TextInput label="Nombre" value={dependency.name} readOnly mb="md" />

      {/* <Select
        label="Líder de Dependencia"
        value={dependency.responsible}
        onChange={(value) =>
          setDependency({ ...dependency, responsible: value ?? "" })
        }
        data={members.map((member) => ({
          value: member.email,
          label: member.full_name,
        }))}
        mb="md"
        allowDeselect={false}
        searchable
        nothingFoundMessage="No existe ningún miembro con ese nombre."
      /> */}
      <MultiSelect
        label="Líderes"
        placeholder={
          dependency.visualizers && dependency.visualizers.length > 0
            ? ""
            : "Selecciona los líderes de la dependencia"
        }
        data={members.map((member) => ({
          value: member.email,
          label: member.full_name,
        }))}
        value={dependency.visualizers ?? []}
        onChange={(values) =>
          setDependency({ ...dependency, visualizers: values })
        }
        searchable
        clearable
        mb="md"
      />
      <Switch
        label="Activar todos los colaboradores"
        checked={selectAllProducers}
        onChange={toggleAllProducers}
        mb="md"
      />
      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Miembro</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Acceso</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {members.map((member) => (
            <Table.Tr key={member.email}>
              <Table.Td>{member.full_name}</Table.Td>
              <Table.Td>{member.email}</Table.Td>
              <Table.Td>
                <Switch
                  checked={member.isProducer}
                  onChange={() => toggleProducer(member.email)}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Group mt="md">
        <Button onClick={handleSave}>Guardar</Button>
        <Button
          variant="outline"
          onClick={() => router.push("/admin/dependencies")}
        >
          Cancelar
        </Button>
      </Group>
    </Container>
  );
};

export default AdminUpdateDependencyPage;
