"use client";

import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { useRole } from "@/app/context/RoleContext";
import { Accordion, Badge, Button, Center, Collapse, Container, Group, Modal, rem, Select, Table, Text, Textarea, Title, Tooltip, useMantineColorScheme, useMantineTheme } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconArrowLeft, IconCancel, IconCheckupList, IconChevronsLeft, IconDeviceFloppy, IconHistory } from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Report {
  _id: string;
  name: string;
  description: string;
  report_example: DriveFile
  created_by: {
    email: string;
    full_name: string;
  };
  requires_attachment: boolean;
  dimensions: Dimension[];
  producers: Dependency[];
}

interface Dependency {
  _id: string;
  name: string;
  responsible: string
}

interface Dimension {
  _id: string;
  name: string;
  responsible: Dependency
}

interface Period {
  _id: string;
  name: string;
  responsible_start_date: Date;
  responsible_end_date: Date;
}

interface DriveFile {
  id: string;
  name: string;
  download_link: string;
  view_link: string;
  description?: string;
}

interface User {
  email: string;
  full_name: string;
}

interface FilledReport {
  _id: string;
  dependency: Dependency;
  send_by: any;
  loaded_date: Date;
  report_file: DriveFile;
  attachments: DriveFile[];
  status: string;
  status_date: Date;
  observations: string;
  evaluated_by: User;
}

interface PublishedReport {
  _id: string;
  report: Report;
  period: Period;
  filled_reports: FilledReport[];
  folder_id: string;
}

const StatusColor: Record<string, string> = {
  Pendiente: "orange",
  "En Borrador": "grape",
  "En Revisión": "cyan",
  Aprobado: "lime",
  Rechazado: "red",
};

const UploadedReportsPage = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const { userRole, setUserRole } = useRole();
  const { id } = useParams<{ id: string }>();
  const [publishedReport, setPublishedReport] = useState<PublishedReport>();
  const [collapseOpened, setCollapseOpened] = useState(false);
  const [status, setStatus] = useState<string | null>("");
  const [observations, setObservations] = useState<string>("");
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const [loading, setLoading] = useState(false);


  const fetchReport = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/${id}`,{
          params: {
            email: session?.user?.email
          }
        }
      );
      setPublishedReport(response.data);
    } catch (error) {
      console.error("Error fetching report:", error);
    }
  }

  useEffect(() => {
    fetchReport();
  }, []);

  const changeFilledReportStatus = async (filledReportId: string) => {
    setLoading(true);
    if(!status) {
      showNotification({
        title: "Error",
        message: "Por favor seleccione un estado",
        color: "red",
      });
      setLoading(false);
      return;
    }
    if (status === "Rechazado" && !observations) {
      showNotification({
        title: "Error",
        message: "Por favor ingrese una razón de rechazo",
        color: "red",
      });
      setLoading(false);
      return;
    }
    try {
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/status`,
        {
          reportId: publishedReport?._id,
          filledRepId: filledReportId,
          status,
          observations,
          email: session?.user?.email,
        }
      );
      if (response.data) {
        setCollapseOpened(false);
        await fetchReport();
        setStatus(null);
        showNotification({
          title: "Éxito",
          message: "Estado actualizado correctamente",
          color: "green",
        });
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
      showNotification({
        title: "Error",
        message: "Ocurrió un error al actualizar el estado",
        color: "red",
      });
    }
  }

  console.log(publishedReport);

  const items = publishedReport?.filled_reports?.map((filledReport) => {
    return (
      <Accordion.Item 
      key={filledReport._id} value={filledReport._id}
      >
        <Accordion.Control>
          <Group>
            <IconCheckupList />
            <Badge
              w={rem(110)}
              color={
                StatusColor[filledReport?.status ?? ""] ?? "orange"
              }
              variant={"light"}
            >
              {filledReport?.status}
            </Badge>
            <Text>{filledReport.dependency.name}</Text>
            <Text ml={'auto'} mr={'md'} size="sm" fw={700}>
              {dateToGMT(filledReport.loaded_date)}
            </Text>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Group grow mb={'sm'}>
            <Center>
              <Text fw={700} size="md">
                Enviado por: <Text tt='capitalize'>
                {(filledReport.send_by.full_name).toLowerCase()}
                </Text>
              </Text>
            </Center>
            <Center>
              <Text fw={700}>
                Fecha Envío: <Text>
                  {dateToGMT(filledReport.loaded_date, 'MMMM D, YYYY HH:mm')}
                </Text>
              </Text>
            </Center>
            <Center>
              <Text fw={700}>
                Acciones:
                <Group>
                  <Button
                    variant="light"
                    size="sm"
                    onClick={() => {setCollapseOpened(!collapseOpened)}}
                    leftSection={<IconCheckupList size={18} />}
                    disabled={userRole === "Responsable"}
                  >
                    Evaluar
                  </Button>
                  <Button
                    variant="light"
                    size="sm"
                    color="gray"
                    leftSection={<IconHistory size={18} />}
                    disabled
                  >
                    Historial
                  </Button>
                </Group>
              </Text>
            </Center>
          </Group>
          <Collapse 
            in={collapseOpened}
            color="red" 
            style={{ backgroundColor: 
              colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[1]
            }}
            tabIndex={1}
          >
            <Group grow align="flex-start" m={'md'} pb={'md'} pt={'xs'} justify="center">
              <Select
                maw={rem(350)}
                data={["Aprobado", "Rechazado", "En Revisón"]}
                placeholder="Seleccionar estado"
                label="Estado"
                onChange={(value) => setStatus(value ?? null)} 
                value={status}
                defaultValue={filledReport.status}
              />
              {
                status === "Rechazado" && (
                  <Textarea
                    label="Observaciones"
                    placeholder="Escribe aquí la razón de tu rechazo"
                    value={observations}
                    onChange={(event) => setObservations(event.currentTarget.value)}
                    required
                    autosize
                  />
                )
              }
              <Button
                maw={rem(350)}
                mt={25}
                variant="filled"
                leftSection={<IconDeviceFloppy />}
                onClick={async () => {
                  await changeFilledReportStatus(filledReport._id);
                }}
                disabled={userRole === "Responsable"}
              >
                Guardar cambios
              </Button>
            </Group>
          </Collapse>
          <Table withColumnBorders withTableBorder striped>
            <Table.Thead>
              <Table.Th maw={rem(50)}></Table.Th>
              <Table.Th maw={rem(10)}><Center>#</Center></Table.Th>
              <Table.Th>Archivo</Table.Th>
              {publishedReport?.report.requires_attachment && (
                <Table.Th miw={rem(250)}>Descripción</Table.Th>
              )}
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td fw={700} maw={rem(50)}>
                  Reporte
                </Table.Td>
                <Table.Td/>
                <Table.Td>
                  <Button
                    onClick={() => {
                      if(typeof window !== 'undefined') {
                        window.open(filledReport.report_file.view_link, '_blank');
                      }
                    }}
                    variant="light"
                    size="compact-xs"
                    color="green"
                    autoContrast
                  >
                    {filledReport.report_file.name}
                  </Button>
                </Table.Td>
                {publishedReport?.report.requires_attachment && (
                  <Table.Td>
                    {filledReport.report_file.description}
                  </Table.Td>
                )}
              </Table.Tr>
              {filledReport.attachments.map((attachment, index) => (
                <Table.Tr key={attachment.id}>
                  {
                    index === 0 && (
                      <Table.Td fw={700} rowSpan={100}>
                        Anexos
                      </Table.Td>
                    )
                  }
                  <Table.Td ta={'center'}>
                    {index + 1}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      onClick={() => {
                        if(typeof window !== 'undefined') {
                          window.open(attachment.view_link, '_blank');
                        }
                      }}
                      variant="light"
                      size="compact-xs"
                    >
                      {attachment.name}
                    </Button>
                  </Table.Td>
                  {publishedReport?.report.requires_attachment && (
                    <Table.Td>
                      {attachment.description}
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Accordion.Panel>
      </Accordion.Item>
    )
  })
  const missingItems = publishedReport?.report.producers?.map((dep) => {
    if (
      !publishedReport?.filled_reports?.some(
        (filledReport: FilledReport) =>
          filledReport.dependency._id === dep._id
      )
    ) {
      return (
        <Tooltip
          key={dep._id}
          label= {`${dep.name} no ha enviado ningún informe`}
          transitionProps={{ transition: "fade-up", duration: 300 }}
        >
          <Accordion.Item key={dep._id} value={dep._id}>
            <Accordion.Control disabled>
              <Group>
                <IconCancel color="red" />
                <Badge
                  w={rem(110)}
                  color={"orange"}
                  variant={"light"}
                >
                  Sin envío
                </Badge>
                {dep.name}
              </Group>
            </Accordion.Control>
          </Accordion.Item>
        </Tooltip>
      );
    }
  });

  return (
    <Container size={"xl"}>
      <DateConfig/>
      <Title ta="center">{`Envíos para: ${publishedReport?.report.name}`}</Title>
      <Accordion>
        {items}
        {missingItems}
      </Accordion>
    </Container>
  );
}

export default UploadedReportsPage;
