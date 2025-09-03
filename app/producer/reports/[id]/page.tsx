"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { Badge, Button, Center, Collapse, Container, Divider, FileButton, Group, Modal, Pill, rem, Select, Table, Text, TextInput, Title, Tooltip, useMantineTheme } from "@mantine/core";
import { IconArrowLeft, IconBulb, IconChevronsLeft, IconCirclePlus, IconCloud, IconCloudUpload, IconDownload, IconEdit, IconEye, IconSend, IconX } from "@tabler/icons-react";
import classes from "../../../responsible/reports/ResponsibleReportsPage.module.css";
import DropzoneCustomComponent from "@/app/components/DropzoneCustomDrop/DropzoneCustomDrop";
import DateConfig, { dateNow, dateToGMT } from "@/app/components/DateConfig";

interface Report {
  _id: string;
  name: string;
  description: string;
  report_example: DriveFile
  requires_attachment: boolean;
  created_by: {
    email: string;
    full_name: string;
  };
}

interface Dimension {
  _id: string;
  name: string;
}

interface Period {
  _id: string;
  name: string;
  responsible_start_date: Date;
  responsible_end_date: Date;
  producer_report_start_date: Date;
  producer_report_end_date: Date;
}

interface AttachmentFile extends File {
  description?: string;
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
  dimension: Dimension;
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
  deadline: Date;
}

const StatusColor: Record<string, string> = {
  Pendiente: "orange",
  "En Borrador": "grape",
  "En Revisión": "cyan",
  Aprobado: "lime",
  Rechazado: "red",
};

const ResponsibleReportPage = () => {
  const router = useRouter();
  const { id } = useParams();
  const { data: session } = useSession();
  const [publishedReport, setPublishedReport] = useState<PublishedReport>();
  const [sendsHistory, setSendsHistory] = useState<FilledReport[]>([]);
  const [reportFile, setReportFile] = useState<File>();
  const [deletedReport, setDeletedReport] = useState<string>();
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [deletedAttachments, setDeletedAttachments] = useState<string[]>([]);
  const [selectedHistoryReport, setSelectedHistoryReport] = useState<string | null>(null);
  const [canSend, setCanSend] = useState<boolean>(true);
  const [opened, setOpened] = useState(false);
  const [openedReportForm, setOpenedReportForm] = useState(false);
  const [openedHistoryReport, setOpenedHistoryReport] = useState(false);
  const toggle = () => setOpened((prev) => !prev);
  const [saving, setSaving] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);

  const clearSelect = () => {
    setSelectedHistoryReport(null);
  };

  const isWithinProducerDateWindow = (): boolean => {
  const now = dateNow();
  const start = new Date(publishedReport?.period?.producer_report_start_date ?? "");
  const end = new Date(publishedReport?.period?.producer_report_end_date ?? "");
  return now >= start && now <= end;
};

  const fetchReport = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/producer/${id}`, {
          params: {
            email: session?.user?.email
          }
        }
      )
      if (response.data) {
        console.log(response.data)
        setSendsHistory(response.data.filled_reports);
        setPublishedReport(response.data);
      }
    } catch (error) {
      console.error(error);
      showNotification({
        title: "Error",
        message: "No se pudo cargar el informe",
        color: "red",
      });
    }
  }

  useEffect(() => {
    fetchReport();
  }, []);

  const loadDraft = async () => {
    setSaving(true);
    try {
      const formData = new FormData();

      formData.append("email", session?.user?.email ?? "");
      formData.append("publishedReportId", publishedReport?._id ?? "");
      formData.append("filledDraft", JSON.stringify(publishedReport?.filled_reports[0] ?? ""));
      if (reportFile) {
        formData.append("reportFile", reportFile);
      }
      if (deletedReport) {
        formData.append("deletedReport", deletedReport);
      }
      attachments.forEach((attachment) => {
        formData.append("attachments", attachment);
        formData.append(`newAttachmentsDescriptions`, attachment.description ?? "");
      });
      deletedAttachments.forEach((attachment) => {
        formData.append("deletedAttachments", attachment);
      });
      

      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/producer/loadDraft`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      )
      
      setAttachments([]);
      setDeletedAttachments([]);
      setDeletedReport(undefined);
      setReportFile(undefined);
      
      await fetchReport()
      setSaving(false);
      setCanSend(true);
      showNotification({
        title: "Borrador guardado",
        message: "El borrador se ha guardado correctamente",
        color: "green",
      });
    } catch (error) {
      setSaving(false);
      console.error(error);
      showNotification({
        title: "Error",
        message: "No se pudo guardar el borrador",
        color: "red",
      });
    }
  }

  const sendReport = async () => {
    if (!publishedReport) {
      showNotification({
        title: "Error",
        message: "No se ha cargado el informe",
        color: "red",
      });
      return;
    }
    if (!publishedReport?.filled_reports[0]?.report_file && !reportFile) {
      showNotification({
        title: "Error",
        message: "Debes cargar un archivo de reporte",
        color: "red",
      });
      return;
    }

    if (publishedReport?.report.requires_attachment && publishedReport?.filled_reports[0].attachments.length === 0) {
      showNotification({
        title: "Error",
        message: "Debes cargar al menos un anexo",
        color: "red",
      });
      return;
    }

    if (publishedReport?.report.requires_attachment) {
      if (!publishedReport?.filled_reports[0].attachments.every(attachment => attachment.description && attachment.description.trim() !== "")) {
      showNotification({
        title: "Error",
        message: "Todos los anexos deben tener una descripción",
        color: "red",
      });
      return;
      }
    }

    try {
      setSending(true)
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/producer/send`, {
        email: session?.user?.email,
        publishedReportId: publishedReport?._id,
        filledDraftId: publishedReport?.filled_reports[0]._id,
      });

      setAttachments([]);
      setDeletedAttachments([]);
      setDeletedReport(undefined);
      setReportFile(undefined);
      setSending(false);

      await fetchReport();

      showNotification({
        title: "Informe enviado",
        message: "El Informe se ha enviado correctamente",
        color: "green",
      });

    } catch (error) {
      setSending(false);
      console.error(error);
      showNotification({
        title: "Error",
        message: "No se pudo enviar el informe",
        color: "red",
      });
    } 
  }

  const onHistoryChange = (value: string | null) => {
    if (value !== null && publishedReport) {
      const updatedPublishedReport = { ...publishedReport };
      updatedPublishedReport.filled_reports = [sendsHistory[Number(value)]];
      setPublishedReport(updatedPublishedReport);
      setSelectedHistoryReport(value);
      setOpenedHistoryReport(true);
      setOpenedReportForm(false);
    } else {
      setSelectedHistoryReport(null);
      setOpenedHistoryReport(false);
    }
  };

  return (
    <>
      <Container size={'xl'} ml={'md'} fluid>
        <DateConfig/>
        <Title ta={'center'} mb={'md'}>{publishedReport?.report.name}</Title>

        {publishedReport && !isWithinProducerDateWindow() && (
          <Text
            c="red"
            size="md"
            ta="center"
            mt="xs"
            mb="md"
            
          >
            <IconBulb color="#ff0000ff" size={20} style={{ marginBottom: "-4px", marginRight: "4px" }} />
            Este informe solo estará disponible para cargar a partir del{" "}
            {dateToGMT(publishedReport.period.producer_report_start_date, "DD/MM/YYYY")}
          </Text>
        )}

          <Group mb="md">
          <Button
            variant="outline"
            leftSection={<IconArrowLeft />}
            onClick={() => router.back()}
          >
            Ir atrás
          </Button>
        </Group>
        <Group align="flex-start" grow>
          <Text size={'md'}>
            <Text fw="700">Periodo:</Text> 
            {publishedReport?.period.name}
          </Text>
          <Text size={'md'}>
            <Text fw="700">Plazo máximo:</Text>
            {publishedReport?.deadline ? dateToGMT(publishedReport.deadline) : "Fecha no disponible"}
          </Text>
          <Text size={'md'}>
            <Text fw="700">Último estado:</Text>
            <Badge
              w={rem(110)}
              color={
                StatusColor[sendsHistory[0]?.status ?? ""] ?? "orange"
              }
              variant={"light"}
            >
              {sendsHistory[0]?.status ?? "Pendiente"}
            </Badge>
          </Text>
          <Text size={'md'} mb='md'>
          <Text fw="700">Formato de informe:</Text>
            <Group>
              <Tooltip 
                label="Ver formato"
                transitionProps={{ transition: "fade-up", duration: 300 }}
              >
                <Button
                  variant="light"
                  size="sm"
                  onClick={() => {
                    if (typeof window !== "undefined")
                      window.open(publishedReport?.report.report_example.view_link);
                  }}
                >
                  <IconEye/>
                </Button>
              </Tooltip>
              <Tooltip 
                label="Descargar formato"
                transitionProps={{ transition: "fade-up", duration: 300 }}
              >
                <Button
                  variant="light"
                  size="sm"
                  onClick={() => {
                    if (typeof window !== "undefined")
                      window.open(publishedReport?.report.report_example.download_link);
                  }}
                >
                  <IconDownload/>
                </Button>
              </Tooltip>
            </Group>
          </Text>
        </Group>
        <Group grow mb='md' align="flex-start">
          <Text size={'md'} mb='md'>
            <Text fw="700">Descripción:</Text>
            {publishedReport?.report.description ?? "Sin descripción"}
          </Text>
          <Text size={'md'}>
            <Text fw="700">Necesita anexos:</Text>
            {publishedReport?.report.requires_attachment ? "✔ Sí" : "✗ No"}
          </Text>
          <Select
            label={<Text fw={700} size="md">Historial de informes:</Text>}
            placeholder={(sendsHistory?.length ?? 0) < 1 ? "Sin envíos" : "Selecciona un envío"}
            data={
              sendsHistory?.map((report, index) => ({
                value: `${index}`,
                label: `${report.status} - ${dateToGMT(report.loaded_date, 'MMM D, YYYY HH:mm')}`,
              })) || []
            }
            onChange={onHistoryChange}
            value={selectedHistoryReport}
            disabled={(sendsHistory?.length ?? 0) < 1}
            searchable
            clearable
            
          />
          <Tooltip
            label={(new Date(publishedReport?.deadline || "") < dateNow()) ?
              "El plazo para enviar el informe ha expirado" :
              "No puedes modificar el informe si ya fue aprobado o está en revisión"}
            transitionProps={{ transition: "fade-up", duration: 300 }}
            disabled={!isWithinProducerDateWindow() || !sendsHistory.some((report) => report.status === "Aprobado" 
              || report.status === "En Revisión") && (new Date(publishedReport?.deadline || "") >= dateNow()) } 
          >
            <Button
              onClick={() => {
                setOpenedReportForm((prev) => !prev);
                setOpenedHistoryReport(false);
                if (publishedReport) {
                  const updatedPublishedReport = { ...publishedReport, filled_reports: [sendsHistory[0]] };
                  setPublishedReport(updatedPublishedReport);
                }
                clearSelect();
                if (sendsHistory[0]?.status === "Rechazado" && publishedReport) {
                  const updatedPublishedReport = { ...publishedReport, filled_reports: [] };
                  setPublishedReport(updatedPublishedReport);
                }
              }}
              variant="outline"
              leftSection={sendsHistory[0]?.status === "En Borrador"
                ? <IconEdit /> : <IconCloudUpload/>}
              mt={25}
              disabled={sendsHistory.some(
                (report) => report.status === "Aprobado" || report.status === "En Revisión"
              ) || (new Date(publishedReport?.deadline || "") < dateNow()) || !isWithinProducerDateWindow()}
            >
              {sendsHistory[0]?.status === "En Borrador"
                ? "Modificar borrador"
                : "Cargar informe"}
            </Button>
          </Tooltip>
        </Group>
        <Text c="dimmed" size="xs" ta="center" my="md" >
          <IconBulb color="#797979" size={20}></IconBulb>
          <br/>
          {sendsHistory[0]?.status === "En Revisión" ? 
            'Tu informe está en revisión no puedes realizar modificaciones ni generar nuevos envíos' : 
            'Recuerda que tu informe no será revisado si se encuentra "En Borrador"'
          }
        </Text>
        <Divider mb='md'/>
        <Collapse in={openedReportForm}>
          <Group grow gap={'xl'}>
            <Tooltip
              label={(new Date(publishedReport?.deadline || "") < dateNow()) ? 
                "El plazo para enviar el informe ha expirado" :
                "No has hecho cambios"}
              transitionProps={{ transition: "fade-up", duration: 300 }}
              disabled={!canSend}
            >
              <Button
                leftSection={<IconCloudUpload/>}
                mb={'md'}
                variant="outline"
                disabled={canSend || publishedReport?.filled_reports[0]?.status === "Rechazado" ||
                  sendsHistory.some((report) => report.status === "Aprobado" 
                  || report.status === "En Revisión" || (new Date(publishedReport?.deadline || "") < dateNow()))
                }
                onClick={loadDraft}
                loading={saving}
              >
                Guardar borrador
              </Button>
            </Tooltip>
            <Tooltip
              label={publishedReport?.filled_reports[0]?.status !== "En Borrador" ? "Primero debes guardar el borrador" : "Este informe ya fue enviado"}
              transitionProps={{ transition: "fade-up", duration: 300 }}
              disabled={canSend}
            >
              <Button
                leftSection={<IconSend/>}
                mb={'md'}
                variant="outline"
                color="blue"
                disabled={!canSend || publishedReport?.filled_reports[0]?.status !== "En Borrador" || 
                  sendsHistory.some((report) => report.status === "Aprobado" || report.status === "En Revisión")
                  || (new Date(publishedReport?.deadline || "") < dateNow())
                }
                onClick={sendReport}
                loading={sending}
              >
                Enviar informe
              </Button>
            </Tooltip>
          </Group>
          <Text fw={700} mb={'xs'}>Carga tu archivo de informe a continuación: {" "}
            {(publishedReport?.filled_reports[0]?.report_file && !deletedReport) ? (
              <Pill
                withRemoveButton={!(publishedReport?.filled_reports[0]?.status !== "En Borrador" 
                  || !publishedReport?.filled_reports[0]?.status)}
                size="md"
                className={classes.pillDrive}
                onRemove={() => {
                  setDeletedReport(publishedReport?.filled_reports[0].report_file.id)
                  setCanSend(false)
                }}
                onClick={() => {
                  if(typeof window !== "undefined")
                    window.open(publishedReport?.filled_reports[0].report_file.view_link)
                }}
                style={{ cursor: "pointer" }}
              >
                {publishedReport.filled_reports[0].report_file.name}
              </Pill>
            ): reportFile && (
              <Pill
                withRemoveButton
                size="md"
                className={classes.pillFile}
                onRemove={() => setReportFile(undefined)}
              >
                {reportFile?.name}
              </Pill>
            )}
          </Text>
          {!((publishedReport?.filled_reports[0]?.report_file && !deletedReport) || reportFile) && (
            <DropzoneCustomComponent
              onDrop={(files) => {
                if (files.length > 1) {
                  showNotification({
                    title: "Solo puedes cargar un archivo",
                    message: "En el informe solo puedes cargar un archivo",
                    color: "red",
                  });
                  return;
                }
                setReportFile(files[0]);
                setCanSend(false)
                if (publishedReport?.filled_reports[0]?.report_file)
                  setDeletedReport(
                    publishedReport?.filled_reports[0].report_file.id
                  );
              }}
              text="Arrastra o selecciona el archivo con tu informe"
            />
          )}
          {publishedReport?.report.requires_attachment && (
            <>
              <Divider mt='md' mb='md' variant="dashed"/>
              <Text fw={700} mt='md'>Carga tus anexos y sus descripciones:</Text>
              {(publishedReport?.filled_reports[0]?.attachments.length > 0 || attachments.length > 0) ? (
                <Table
                  striped
                  style={{ width: "100%" }}
                  mt="md"
                  mb="md"
                  withColumnBorders
                  withTableBorder
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th maw={rem(100)}>Eliminar</Table.Th>
                      <Table.Th maw={rem(400)}>Archivo</Table.Th>
                      <Table.Th miw={rem(700)}>Descripción</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {publishedReport?.filled_reports[0]?.attachments.map((attachment, index) => (
                      <Table.Tr key={attachment.id}>
                        <Table.Td w={1}>
                          <Center>
                            <Button
                              variant="transparent"
                              size="compact-xs"
                              w={35}
                              onClick={() => {
                                setDeletedAttachments([...deletedAttachments, attachment.id]);
                                publishedReport.filled_reports[0].attachments = publishedReport.filled_reports[0].attachments
                                  .filter((att) => att.id !== attachment.id);
                                setCanSend(false)
                              }}
                              disabled={publishedReport?.filled_reports[0]?.status !== "En Borrador" 
                                || !publishedReport?.filled_reports[0]?.status}
                            >
                              <IconX 
                                size={30}
                                color="red"
                              />
                            </Button>
                          </Center>
                        </Table.Td>
                        <Table.Td>
                          <Group
                            gap="xs"
                            onClick={() => {
                              if(typeof window !== "undefined")
                                window.open(attachment.view_link)
                            }}
                            style={{ cursor: "pointer" }}
                          >
                          <IconCloud size={16} color="gray" />
                          <Text
                            size="sm"
                          >
                            {attachment.name}
                          </Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            disabled={publishedReport?.filled_reports[0]?.status !== "En Borrador" 
                              || !publishedReport?.filled_reports[0]?.status}
                            value={attachment.description}
                            onChange={(event) => {
                              const updatedFilledReports = [...(publishedReport?.filled_reports || [])];
                              const attachmentIndex = updatedFilledReports[0].attachments.findIndex(
                                (att) => att.id === attachment.id
                              );
                              if (attachmentIndex !== -1) {
                                updatedFilledReports[0].attachments[attachmentIndex].description = event.currentTarget.value;
                                setPublishedReport({ ...publishedReport, filled_reports: updatedFilledReports });
                              }
                              setCanSend(false)
                            }}
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {attachments.map((attachment, index) => (
                      <Table.Tr key={index}>
                        <Table.Td w={1}>
                          <Center>
                            <IconX size={30} color="red" onClick={() => {
                              const newAttachments = [...attachments];
                              newAttachments.splice(index, 1);
                              setAttachments(newAttachments);
                              setCanSend(false)
                            }}/>
                          </Center>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {attachment.name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            value={attachment.description}
                            onChange={(event) => {
                              setCanSend(false)
                              const newAttachments = [...attachments];
                              newAttachments[index].description = event.currentTarget.value;
                              setAttachments(newAttachments);
                            }}
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    <Table.Tr>
                      <Table.Td colSpan={3}>
                        <FileButton
                          onChange={(files) => {
                            setAttachments([...attachments, ...files]);
                            setCanSend(false)
                          }}
                          accept="*"
                          multiple
                        >
                          {(props) => 
                            <Button 
                            {...props} 
                            variant="light" 
                            fullWidth
                            leftSection={<IconCirclePlus/>}
                            disabled={publishedReport?.filled_reports[0]?.status !== "En Borrador" 
                              || !publishedReport?.filled_reports[0]?.status}

                            >
                              Añadir anexo(s)
                            </Button>
                          }
                        </FileButton>
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              ) : 
              <DropzoneCustomComponent
                onDrop={(files) => {
                  setAttachments(files);
                  setCanSend(false)
                }}
                text="Arrastra o selecciona los anexos"
              />
              }
            </>
          )}
        </Collapse>
        <Collapse in={openedHistoryReport}>
          <Table withColumnBorders withTableBorder w={'auto'} mb={'md'}>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>
                  <Text size="sm" fw={700}>Estado</Text>
                </Table.Td>
                <Table.Td>
                  {publishedReport?.filled_reports[0]?.status ?? "Pendiente"}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text size="sm" fw={700}>Fecha de estado</Text>
                </Table.Td>
                <Table.Td>
                  {publishedReport?.filled_reports[0]?.status_date ? dateToGMT(publishedReport.filled_reports[0].status_date) : "Sin fecha"}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={700}>
                  Observaciones
                </Table.Td>
                <Table.Td>
                  {publishedReport?.filled_reports[0]?.observations || "Sin observaciones"}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={700}>
                  Evaluador
                </Table.Td>
                <Table.Td tt={'capitalize'}>
                  {(publishedReport?.filled_reports[0]?.evaluated_by?.full_name ?? "Sin evaluador").toLowerCase()}
                </Table.Td>
              </Table.Tr>

            </Table.Tbody>
          </Table>
          <Text fw={700} mb={'xs'}>Archivo de informe:{" "}</Text>
          {publishedReport?.filled_reports[0]?.report_file && (
            <Pill
              fw={700}
              size="md"
              className={classes.pillDrive}
              onClick={() => {
                if(typeof window !== "undefined")
                  window.open(publishedReport?.filled_reports[0].report_file.view_link)
              }}
              style={{ cursor: "pointer" }}
            >
              {publishedReport.filled_reports[0].report_file.name}
            </Pill>
          )}
          {(publishedReport?.filled_reports[0]?.attachments?.length ?? 0) > 0 && (
            <>
              <Divider mt='md' mb='md' variant="dashed"/>
              <Text fw={700} mt='md'>Anexos:</Text>
              <Table
                striped
                style={{ width: "100%" }}
                mt="md"
                mb="md"
                withColumnBorders
                withTableBorder
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th maw={rem(100)}>Eliminar</Table.Th>
                    <Table.Th maw={rem(400)}>Archivo</Table.Th>
                    <Table.Th miw={rem(700)}>Descripción</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {publishedReport?.filled_reports[0]?.attachments.map((attachment) => (
                    <Table.Tr key={attachment.id}>
                      <Table.Td>
                        <Group
                          gap="xs"
                          onClick={() => {
                            if(typeof window !== "undefined")
                              window.open(attachment.view_link)
                          }}
                          style={{ cursor: "pointer" }}
                        >
                        <IconCloud size={16} color="gray" />
                        <Text
                          size="sm"
                        >
                          {attachment.name}
                        </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{attachment.description}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          )}
        </Collapse>
      </Container>
    </>
  );
};

export default ResponsibleReportPage;