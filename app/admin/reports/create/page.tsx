"use client"

import { Button, Container, Divider, FileInput, Group, MultiSelect, rem, Switch, Table, Text, Textarea, TextInput, Title } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconCancel, IconCheck, IconDeviceFloppy, IconX } from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Dimension {
  _id: string;
  name: string;
}

const ReportCreatePage = () => {
  const { data: session } = useSession();
  const router = useRouter();

  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [file, setFile] = useState<File | undefined>();
  const [fileName, setFileName] = useState<string>("");
  const [selectedDimensions, setSelectedDimensions] = useState<Dimension[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [requiresAttachment, setRequiresAttachment] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState({
    name: false,
    description: false,
    file: false,
    fileName: false,
    dimensions: false,
  });

  const fetchDimensions = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dimensions`);
      setDimensions(response.data);
    } catch (error) {
      console.error("Error fetching dimensions:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al obtener los ámbitos",
        color: "red",
      });
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    const newErrors = {
      name: !name,
      description: !description,
      file: !file,
      fileName: !fileName,
      dimensions: selectedDimensions.length === 0,
    };

    setErrors(newErrors);

    // Verifica si hay errores antes de proceder
    if (Object.values(newErrors).some((error) => error)) {
      showNotification({
        title: "Error",
        message: "Por favor, completa todos los campos requeridos.",
        color: "red",
      });
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("email", session?.user?.email || "");
    if (file) formData.append("report_example", file);
    formData.append("file_name", fileName);
    selectedDimensions.forEach((dim) => {
      formData.append("dimensions[]", dim._id);
    });
    formData.append("requires_attachment", requiresAttachment.toString());

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/reports/create`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showNotification({
        title: "Creado",
        message: "Informe creado exitosamente",
        color: "green",
      });
      router.back();
    } catch (error) {

      if (axios.isAxiosError(error) && error.response?.data?.error) {
    showNotification({
      title: "Error",
      message: error.response.data.error,
      color: "red",
    });
    return;
  }

      console.error("Error creating report:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al crear el informe",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDimensions();
  }, []);

  return (
    <Container size={'lg'}>
      <Title ta={'center'}>Creación de Informe para Ámbitos</Title>
      <Divider m={'md'}/>

      <TextInput
        mb={'xs'}
        label={<Text fw={700} size="sm" component="span">Nombre del informe</Text>}
        placeholder="Ingresa el nombre que tendrá el informe"
        value={name}
        onChange={(event) => {
          setName(event.currentTarget.value);
          setErrors((prev) => ({ ...prev, name: false }));
        }}
        error={errors.name && "Este campo es requerido"}
        required
      />

      <Textarea
        label={<Text fw={700} size="sm" component="span">Descripción</Text>}
        mb={'xs'}
        minRows={1}
        maxRows={5}
        autosize
        placeholder="Ingresa una descripción para el informe"
        value={description}
        onChange={(event) => {
          setDescription(event.currentTarget.value);
          setErrors((prev) => ({ ...prev, description: false }));
        }}
        error={errors.description && "Este campo es requerido"}
        required
      />

      <FileInput
        mb={'xs'}
        label={<Text fw={700} size="sm" component="span">Plantilla/Formato del Informe</Text>}
        placeholder="Carga el archivo que servirá de base para el informe"
        value={file}
        onChange={(value) => {
          setFile(value ?? undefined);
          setErrors((prev) => ({ ...prev, file: false }));
        }}
        error={errors.file && "Este campo es requerido"}
        required
      />

      <TextInput
        mb={'xs'}
        label={<Text fw={700} size="sm" component="span">Nombre del archivo</Text>}
        placeholder="Asigna nombre al archivo que contendrá el formato del informe"
        value={fileName}
        onChange={(event) => {
          setFileName(event.currentTarget.value);
          setErrors((prev) => ({ ...prev, fileName: false }));
        }}
        error={errors.fileName && "Este campo es requerido"}
        required
      />

      <MultiSelect
        mb={'xs'}
        label={<Text fw={700} size="sm" component="span">Ámbitos que diligenciarán el informe:</Text>}
        placeholder="Selecciona las ámbitos que podrán usar el informe"
        data={dimensions.map((dim) => ({ value: dim._id, label: dim.name }))}
        value={selectedDimensions.map((dim) => dim._id)}
        onChange={(value) => {
          const dims = dimensions.filter((dim) => value.includes(dim._id));
          setSelectedDimensions(dims);
          setErrors((prev) => ({ ...prev, selectedDimensions: dims.length === 0 }));
        }}
        error={errors.dimensions && "Este campo es requerido"}
        searchable
        required
      />
      <Group my={"md"}>
        <Text size="sm" fw={700}>¿Requiere Anexos?</Text>
        <Switch
          checked={requiresAttachment}
          onChange={(event) =>
            setRequiresAttachment(event.currentTarget.checked)
          }
          color="rgba(25, 113, 194, 1)"
          size="md"
          thumbIcon={
            requiresAttachment ? (
              <IconCheck
                style={{ width: rem(12), height: rem(12) }}
                color={"rgba(25, 113, 194, 1)"}
                stroke={3}
              />
            ) : (
              <IconX
                style={{ width: rem(12), height: rem(12) }}
                color={"red"}
                stroke={3}
              />
            )
          }
        />
      </Group>
      <Group grow mx={'xl'} mt={'lg'}>
        <Button
          mx={'xl'}
          variant="light"
          color="red"
          leftSection={<IconCancel />}
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button
          mx={'xl'}
          leftSection={<IconDeviceFloppy />}
          onClick={handleCreate}
          loading={loading}
        >
          Guardar
        </Button>
      </Group>
    </Container>
  );
};

export default ReportCreatePage;
