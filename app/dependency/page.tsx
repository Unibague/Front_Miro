"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Container, TextInput, Table, Switch, Button, Group, Title, MultiSelect, ActionIcon } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
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

  const canEdit = ['admin', 'Administrador', 'Responsable'].includes(session?.user?.role ?? '');
  const [dependency, setDependency] = useState({
    _id: "",
    dep_code: "",
    name: "",
    responsible: "",
    dep_father: "",
    members: [] as string[],
    visualizers: [] as string[],
  });
  const [parentDependencyName, setParentDependencyName] = useState<string>("");
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

        if (response.data.dep_father) {
          try {
            const parentResponse = await axios.get(
              `${process.env.NEXT_PUBLIC_API_URL}/dependencies/by-code/${response.data.dep_father}`
            );
            setParentDependencyName(parentResponse.data?.name ?? response.data.dep_father);
          } catch {
            setParentDependencyName(response.data.dep_father);
          }
        }

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
      const allMembers = [...members, ...secondaryMembers];

      const producers = allMembers
        .filter((member) => member.isProducer)
        .map((member) => member.email);

      const nonProducers = allMembers
        .filter((member) => !member.isProducer)
        .map((member) => member.email);

      
      const updatePayload = {
        dep_code: dependency.dep_code,
        name: dependency.name,
        responsible: dependency.responsible,
        dep_father: dependency.dep_father,
        producers: producers,
        adminEmail: session?.user?.email,
      };

      try {
        await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/${dependency._id}`,
          updatePayload,
          {
            headers: {
              'user-email': session?.user?.email,
            }
          }
        );
      } catch (step1Error: any) {
        console.error('❌ STEP 1 FAILED:', step1Error.response?.data || step1Error.message);
        throw step1Error;
      }

      try {
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
      } catch (step2Error: any) {
        console.error('❌ STEP 2 FAILED:', step2Error.response?.data || step2Error.message);
        throw step2Error;
      }

      console.log('🟢 STEP 3: Updating visualizers');
      if (dependency.visualizers && Array.isArray(dependency.visualizers)) {
        try {
          await axios.put(
            `${process.env.NEXT_PUBLIC_API_URL}/dependencies/${dependency._id}/visualizers`,
            { visualizers: dependency.visualizers }
          );
        } catch (step3Error: any) {
          console.error('❌ STEP 3 FAILED:', step3Error.response?.data || step3Error.message);
          throw step3Error;
        }
      }

      console.log('✅✅✅ ALL STEPS COMPLETED');
      showNotification({
        title: "Actualizado",
        message: "Dependencia actualizada exitosamente",
        color: "teal",
      });
    } catch (error: any) {
      console.error('❌❌❌ SAVE FAILED:', error.message);
      showNotification({
        title: "Error",
        message: error.response?.data?.message || error.message || "Error al actualizar",
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

    setMembers((prevMembers) =>
      prevMembers.map((member) => ({
        ...member,
        isProducer: !selectAllProducers,
      }))
    );

    setSecondaryMembers((prevMembers) =>
      prevMembers.map((member) => ({
        ...member,
        isProducer: !selectAllProducers,
      }))
    );
  };

  return (
    <Container size="md">
      <Group mb="md">
        <ActionIcon variant="subtle" onClick={() => router.push("/responsible/admin")}>
          <IconArrowLeft size={20} />
        </ActionIcon>
      </Group>

      <Title ta={"center"} order={2}>
        Gestionar Mi Dependencia
      </Title>
      <TextInput label="Código" value={dependency.dep_code} readOnly mb="md" />
      <TextInput
        label="Dependencia Padre"
        value={parentDependencyName}
        readOnly
        mb="md"
      />
      <TextInput label="Nombre" value={dependency.name} readOnly mb="md" />
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
        disabled={!canEdit}
      />
      <Switch
        label="Activar todos los colaboradores"
        checked={selectAllProducers}
        onChange={toggleAllProducers}
        mb="md"
        disabled={!canEdit}
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
                  disabled={!canEdit}
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
                    disabled={!canEdit}
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
        {canEdit && <Button onClick={handleSave}>Guardar</Button>}
      </Group>
    </Container>
  );
};

export default DependencyPage;
