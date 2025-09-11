"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Container, TextInput, Table, Switch, Button, Group, Select, Title, MultiSelect } from "@mantine/core";
import { useSession } from "next-auth/react";
import axios from "axios";
import { showNotification } from "@mantine/notifications";

interface Member {
  email: string;
  full_name: string;
  isProducer: boolean;
}

const DependencyPage = () => {
  const router = useRouter();
  const { data: session } = useSession();
  
  // Solo el rol Administrador puede editar
  const isAdmin = session?.user?.role === 'admin' || false;
  const [dependency, setDependency] = useState({
    _id: "",
    dep_code: "",
    name: "",
    responsible: "",
    dep_father: "",
    members: [] as string[],
    visualizers: [] as string[],
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [secondaryMembers, setSecondaryMembers] = useState<Member[]>([]);
  const [selectAllProducers, setSelectAllProducers] = useState(false);

  useEffect(() => {
    const fetchDependency = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/responsible`,
          { params: { email: session?.user?.email } }
        );
        setDependency(response.data);


        const membersResponse = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/${response.data.dep_code}/members`
        );

        const updatedMembers = await Promise.all(
          membersResponse.data.map(async (member: any) => {
            const rolesResponse = await axios.get(
              `${process.env.NEXT_PUBLIC_API_URL}/users/roles?email=${member.email}`
            );
            const isProducer = rolesResponse.data.roles.includes("Productor");
            return {
              email: member.email,
              full_name: member.full_name,
              isProducer,
            };
          })
        );

        setMembers(updatedMembers);
        
        // Obtener miembros secundarios (con dependencias adicionales)
        const secondaryResponse = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/dependency/${response.data.dep_code}/secondary-members`
        );
        
        if (secondaryResponse.data) {
          const updatedSecondaryMembers = await Promise.all(
            secondaryResponse.data.map(async (member: any) => {
              const rolesResponse = await axios.get(
                `${process.env.NEXT_PUBLIC_API_URL}/users/roles?email=${member.email}`
              );
              const isProducer = rolesResponse.data.roles.includes("Productor");
              return {
                email: member.email,
                full_name: member.full_name,
                isProducer,
              };
            })
          );
          setSecondaryMembers(updatedSecondaryMembers);
        }
      } catch (error) {
        console.error("Error fetching dependency or members:", error);
      }
    };

    fetchDependency();

  }, []);

  const handleSave = async () => {
    try {
      // Combinar miembros principales y secundarios
      const allMembers = [...members, ...secondaryMembers];
      
      const producers = allMembers
        .filter((member) => member.isProducer)
        .map((member) => member.email);

      const nonProducers = allMembers
        .filter((member) => !member.isProducer)
        .map((member) => member.email);

      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/users/updateProducer`,
        [
          ...producers.map((email) => ({
            email,
            roles: ["Productor"],
          })),
          ...nonProducers.map((email) => ({
            email,
            roles: [],
          })),
        ]
      );

      if (dependency.visualizers && Array.isArray(dependency.visualizers)) {
        await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/${dependency._id}/visualizers`,

          { visualizers: dependency.visualizers }
        );
      }

      showNotification({
        title: "Actualizado",
        message: "Dependencia actualizada exitosamente",
        color: "teal",
      });
    } catch (error) {
      console.error("Error updating dependency:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al actualizar la dependencia",
        color: "red",
      });
    }
  };

  const toggleProducer = (email: string) => {
    // Actualizar en miembros principales
    setMembers((prevMembers) =>
      prevMembers.map((member) =>
        member.email === email
          ? { ...member, isProducer: !member.isProducer }
          : member
      )
    );
    
    // Actualizar en miembros secundarios
    setSecondaryMembers((prevMembers) =>
      prevMembers.map((member) =>
        member.email === email
          ? { ...member, isProducer: !member.isProducer }
          : member
      )
    );
  };

  const toggleAllProducers = () => {
    setSelectAllProducers((prevState) => !prevState);
    
    // Actualizar miembros principales
    setMembers((prevMembers) =>
      prevMembers.map((member) => ({
        ...member,
        isProducer: !selectAllProducers,
      }))
    );
    
    // Actualizar miembros secundarios
    setSecondaryMembers((prevMembers) =>
      prevMembers.map((member) => ({
        ...member,
        isProducer: !selectAllProducers,
      }))
    );
  };

  return (
    <Container size="md">
      <Title ta={"center"} order={2}>
        Gestionar Mi Dependencia
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
        readOnly        
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
        disabled={!isAdmin}
      />
      <Switch
        label="Activar todos los colaboradores"
        checked={selectAllProducers}
        onChange={toggleAllProducers}
        mb="md"
        disabled={!isAdmin}
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
                  disabled={!isAdmin}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Title order={4} mt="xl" mb="md">
        Miembros Secundarios
      </Title>
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Miembro</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Acceso</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {secondaryMembers.length > 0 ? (
            secondaryMembers.map((member) => (
              <Table.Tr key={member.email}>
                <Table.Td>{member.full_name}</Table.Td>
                <Table.Td>{member.email}</Table.Td>
                <Table.Td>
                  <Switch
                    checked={member.isProducer}
                    onChange={() => toggleProducer(member.email)}
                    disabled={!isAdmin}
                  />
                </Table.Td>
              </Table.Tr>
            ))
          ) : (
            <Table.Tr>
              <Table.Td colSpan={3} style={{ textAlign: 'center', color: 'gray' }}>
                No hay miembros secundarios
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Group mt="md">
        {isAdmin && <Button onClick={handleSave}>Guardar</Button>}
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          {isAdmin ? 'Cancelar' : 'Volver'}
        </Button>
      </Group>
    </Container>
  );
};

export default DependencyPage;
