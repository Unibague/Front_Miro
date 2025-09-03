"use client"

import { Button, Container, Divider, FileInput, Group, MultiSelect, Pill, rem, Switch, Table, Text, Textarea, TextInput, Title } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconCancel, IconCheck, IconDeviceFloppy, IconX } from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Dimension {
  _id: string;
  name: string;
}

interface Dependency {
  _id: string;
  name: string;
}

interface DriveFile {
  id: string;
  name: string;
  view_link: string;
}

interface Report {
  _id: string;
  name: string;
  description: string;
  report_example: DriveFile;
  producers: Dependency[];
  dimensions: Dimension[];
  requires_attachment: boolean;
}

const ProducerReportCreatePage = () => {
  const { data: session } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState<boolean>(false);

  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [file, setFile] = useState<File | undefined>();
  const [uploadedFile, setUploadedFile] = useState<DriveFile | undefined>();
  const [fileName, setFileName] = useState<string>("");
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<Dimension[]>([]);
  const [producers, setProducers] = useState<Dependency[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [requiresAttachment, setRequiresAttachment] = useState<boolean>(false);
  const [errors, setErrors] = useState({
    name: false,
    description: false,
    file: false,
    fileName: false,
    dimensions: false,
    producers: false,
  });

  const fetchReport = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/producerReports/${id}`, {
        params: { email: session?.user?.email }
      });
      const report: Report = response.data;
      console.log(report);
      setName(report.name);
      setDescription(report.description);
      setFileName(report.report_example.name);
      setSelectedDependencies(report.producers.map((dep) => dep._id));
      setSelectedDimensions(report.dimensions);
      setRequiresAttachment(report.requires_attachment);
      setUploadedFile(report.report_example);
    } catch (error) {
      console.error("Error fetching report:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al obtener el informe",
        color: "red",
      });
    }
  }

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

  const fetchDependencies = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all/${session?.user?.email}`);
      setProducers(response.data);
    } catch (error) {
      console.error("Error fetching dependencies:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al obtener las dependencias",
        color: "red",
      });
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    const newErrors = {
      name: !name,
      description: !description,
      file: !file && !uploadedFile,
      fileName: !fileName,
      dimensions: selectedDimensions.length === 0,
      producers: selectedDependencies.length === 0,
    };

    setErrors(newErrors);

    // Verifica si hay errores antes de proceder
    if (Object.values(newErrors).some((error) => error)) {
      showNotification({
        title: "Error",
        message: "Por favor, completa todos los campos requeridos.",
        color: "red",
      });
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("id", id);
    formData.append("name", name);
    formData.append("description", description);
    formData.append("email", session?.user?.email || "");
    if (file) formData.append("report_example", file);
    formData.append("file_name", fileName);
    selectedDimensions.forEach((dim) => {
      formData.append("dimensions[]", dim._id);
    });
    selectedDependencies.forEach((dep) => {
      formData.append("producers[]", dep);
    })
    formData.append("requires_attachment", requiresAttachment.toString());

    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/producerReports/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showNotification({
        title: "Creado",
        message: "Informe actualizado exitosamente",
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


      if (axios.isAxiosError(error) && error.response?.status === 401) {
        showNotification({
          title: "Error",
          message: "Para este informe ya han realizado cargues de información en el periodo en curso, no es posible modificarlo",
          color: "red",
          timeout: 10000
        });
      }
      showNotification({
        title: "Error",
        message: "Hubo un error al actualizar el informe",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDimensions();
    fetchDependencies();
    if (id) fetchReport();
  }, []);

  return (
    <Container size={'lg'}>
      <Title ta={'center'}>Edición de Informe para Productores</Title>
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
        label={<>
          <Text fw={700} size="sm" component="span">
            Plantilla/Formato del Informe
            {uploadedFile && (
              <Pill
                  ml={'sm'}
                  mb={'xs'}
                  size="sm"
                  style={{
                    cursor: "pointer",
                    backgroundColor: "var(--mantine-color-lime-3)",
                    color: "var(--mantine-color-dark-9)", // Wrapped the value in quotes
                  }}
                  onClick={() => {
                    if(typeof window !== 'undefined') 
                      window.open(uploadedFile.view_link, "_blank")
                  }}
              >
                {uploadedFile?.name}
              </Pill>
            )}
          </Text>
        </>}
        placeholder="Reemplaza el archivo actual de base para el informe"
        value={file}
        onChange={(value) => {
          setFile(value ?? undefined);
          setErrors((prev) => ({ ...prev, file: false }));
          setUploadedFile(undefined);
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
        error={!uploadedFile && errors.file && "Este campo es requerido"}
        required
      />

      <MultiSelect
        mb={'xs'}
        label={<Text fw={700} size="sm" component="span">Ámbitos con acceso al informe</Text>}
        placeholder="Selecciona los ámbitos que podrán usar el informe"
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

      <MultiSelect
        mb={'xs'}
        label={<Text fw={700} size="sm" component="span">Productores</Text>}
        placeholder="Selecciona los productores que deberán realizar el informe"
        data={producers.map((dep) => ({ value: dep._id, label: dep.name }))}
        value={selectedDependencies}
        onChange={(value) => {
          setSelectedDependencies(value);
          setErrors((prev) => ({ ...prev, selectedDependencies: value.length === 0 }));
        }}
        error={errors.producers && "Este campo es requerido"}
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
          onClick={handleUpdate}
        >
          Guardar
        </Button>
      </Group>
    </Container>
  );
};

export default ProducerReportCreatePage;
