"use client"

import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { Accordion, AccordionPanel, Button, Checkbox, Container, Divider, Group, rem, Select, Table, Text, Title } from "@mantine/core"
import { DatePickerInput } from "@mantine/dates";
import { showNotification } from "@mantine/notifications";
import { IconCancel, IconChevronLeft, IconCopy, IconCopyPlusFilled } from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Period {
  _id: string;
  name: string;
  producer_end_date: Date;
  responsible_end_date: Date;
}

interface Templates {
  _id: string;
  name: string;
  duplicate: boolean;
  customDeadline: boolean;
  deadline: Date | null;
}

interface Reports {
  _id: string;
  name: string;
  duplicate: boolean;
  customDeadline: boolean;
  deadline: Date | null;
}

interface ProducerReports {
  _id: string;
  name: string;
  duplicate: boolean;
  customDeadline: boolean;
  deadline: Date | null;
}

const DuplicatePeriodPage = () => {
  const { data: session } = useSession();
  const router = useRouter();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [availablePeriods, setAvailablePeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>();
  const [targetPeriod, setTargetPeriod] = useState<Period | null>();
  const [showItems, setShowItems] = useState<boolean>(false);
  const [templates, setTemplates] = useState<Templates[]>([]);
  const [reports, setReports] = useState<Reports[]>([]);
  const [producerReports, setProducerReports] = useState<ProducerReports[]>([]);

  const fetchPeriods = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/periods/every`, {
        params: {
          email: session?.user?.email,
        },
      });
      setPeriods(response.data);
    } catch (error) {
      console.error("Error fetching periods:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al obtener los periodos",
        color: "red",
      });
    }
  }

  const fetchAvailablePeriods = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/periods/active`)
      setAvailablePeriods(response.data);
    } catch (error) {
      console.error("Error fetching available periods:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al obtener los periodos disponibles",
        color: "red",
      });
    }
  }

  const fetchOptions = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/periods/feedDuplicate`, {
        params: {
          email: session?.user?.email,
          fromPeriod: selectedPeriod?._id,
          toPeriod: targetPeriod?._id,
        },
      });
      response.data.templates.forEach((template: any) => {
        template.deadline = targetPeriod?.producer_end_date ? new Date(targetPeriod.producer_end_date) : null;
        template.customDeadline = false;
        template.duplicate = true;
      });
      setTemplates(response.data.templates);
      response.data.reports.forEach((report: any) => {
        report.deadline = targetPeriod?.producer_end_date ? new Date(targetPeriod.producer_end_date) : null;
        report.customDeadline = false;
        report.duplicate = true;
      });
      setReports(response.data.reports);
      response.data.producerReports.forEach((producerReport: any) => {
        producerReport.deadline = targetPeriod?.producer_end_date ? new Date(targetPeriod.producer_end_date) : null;
        producerReport.customDeadline = false;
        producerReport.duplicate = true;
      });
      setProducerReports(response.data.producerReports)
    } catch (error) {
      console.error("Error fetching options:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al obtener las opciones",
        color: "red",
      });
    }
  }

  useEffect(() => {
    fetchPeriods();
    fetchAvailablePeriods();
  }, []);

  const handleFeedDuplicate = async () => {
    if(!selectedPeriod || !targetPeriod) {
      showNotification({
        title: "Error",
        message: "Selecciona un periodo a duplicar y un periodo objetivo",
        color: "red"
      });
      return;
    }
    setShowItems(true);
    fetchOptions();
  }

  const handleDuplicatePeriod = async () => {
    try {
      const publishTemplateUrl = `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/publish`;
      const publishReportUrl = `${process.env.NEXT_PUBLIC_API_URL}/pReports/publish`;
      const publishProducerReportUrl = `${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/publish`;

      const templatesToPublish = templates.filter(template => template.duplicate);
      const reportsToPublish = reports.filter(report => report.duplicate);
      const producerReportsToPublish = producerReports.filter(producerReport => producerReport.duplicate);

      const templatePromises = templatesToPublish.map(template => {
        return axios.post(publishTemplateUrl, {
          period_id: targetPeriod?._id,
          template_id: template._id,
          deadline: template.deadline,
          user_email: session?.user?.email
        });
      });

      const reportPromises = reportsToPublish.map(report => {
        return axios.post(publishReportUrl, {
          periodId: targetPeriod?._id,
          reportId: report._id,
          deadline: report.deadline,
          email: session?.user?.email
        });
      });

      const producerReportPromises = producerReportsToPublish.map(producerReport => {
        return axios.post(publishProducerReportUrl, {
          period: targetPeriod?._id,
          reportId: producerReport._id,
          deadline: producerReport.deadline,
          email: session?.user?.email
        });
      });

      await Promise.all([...templatePromises, ...reportPromises, ...producerReportPromises]);
      showNotification({
        title: "Éxito",
        message: "El periodo se ha duplicado correctamente",
        color: "green",
      });

      router.back()
    } catch (error) {
      console.error("Error duplicating period:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al duplicar el periodo",
        color: "red",
      });
    }
  }

  const tableBuilder = (body: React.ReactNode) => {
    return (
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Clonar</Table.Th>
            <Table.Th>Nombre</Table.Th>
            <Table.Th>Fecha Límite Periodo</Table.Th>
            <Table.Th>Necesita Fecha Inferior</Table.Th>
            <Table.Th>Fecha Límite</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {body}
        </Table.Tbody>
      </Table>
    )
  }

  const templatesTable = templates.map((template, index) => {
    const handleDuplicateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const updatedTemplates = [...templates];
      updatedTemplates[index] = {
        ...template,
        duplicate: event.currentTarget.checked,
      };
      setTemplates(updatedTemplates);
    };
  
    const handleCustomDeadlineChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const updatedTemplates = [...templates];
      updatedTemplates[index] = {
        ...template,
        customDeadline: event.currentTarget.checked,
      };
      setTemplates(updatedTemplates);
    };
  
    const handleDeadlineChange = (date: Date | null) => {
      const updatedTemplates = [...templates];
      updatedTemplates[index] = {
        ...template,
        deadline: date,
      };
      setTemplates(updatedTemplates);
    };
  
    return (
      <Table.Tr key={template._id}>
        <Table.Td>
          <Checkbox
            checked={template.duplicate}
            onChange={handleDuplicateChange}
          />
        </Table.Td>
        <Table.Td>{template.name}</Table.Td>
        <Table.Td>{template.deadline ? dateToGMT(template.deadline) : ""}</Table.Td>
        <Table.Td>
          <Checkbox
            checked={template.customDeadline}
            onChange={handleCustomDeadlineChange}
          />
        </Table.Td>
        <Table.Td>
            {template.customDeadline && (
              <DatePickerInput
                locale="es"
                value={template.deadline}
                onChange={handleDeadlineChange}
                maxDate={targetPeriod?.producer_end_date}
              />
            )}
        </Table.Td>
      </Table.Tr>
    );
  });
  
  const reportsTable = reports.map((report, index) => {
    const handleDuplicateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const updatedReports = [...reports];
      updatedReports[index] = {
        ...report,
        duplicate: event.currentTarget.checked,
      };
      setReports(updatedReports);
    };
  
    const handleCustomDeadlineChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const updatedReports = [...reports];
      updatedReports[index] = {
        ...report,
        customDeadline: event.currentTarget.checked,
      };
      setReports(updatedReports);
    };
  
    const handleDeadlineChange = (date: Date | null) => {
      const updatedReports = [...reports];
      updatedReports[index] = {
        ...report,
        deadline: date,
      };
      setReports(updatedReports);
    };
  
    return (
      <Table.Tr key={report._id}>
        <Table.Td>
          <Checkbox
            checked={report.duplicate}
            onChange={handleDuplicateChange}
          />
        </Table.Td>
        <Table.Td>{report.name}</Table.Td>
        <Table.Td>{report.deadline ? dateToGMT(report.deadline) : ""}</Table.Td>
        <Table.Td>
          <Checkbox
            checked={report.customDeadline}
            onChange={handleCustomDeadlineChange}
          />
        </Table.Td>
        <Table.Td>
          {report.customDeadline && (
            <DatePickerInput
              locale="es"
              value={report.deadline}
              onChange={handleDeadlineChange}
              maxDate={targetPeriod?.producer_end_date}
            />
          )}
        </Table.Td>
      </Table.Tr>
    );
  });

  const producerReportsTable = producerReports.map((producerReport, index) => {
    const handleDuplicateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const updatedProducerReports = [...producerReports];
      updatedProducerReports[index] = {
        ...producerReport,
        duplicate: event.currentTarget.checked,
      };
      setProducerReports(updatedProducerReports);
    };
  
    const handleCustomDeadlineChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const updatedProducerReports = [...producerReports];
      updatedProducerReports[index] = {
        ...producerReport,
        customDeadline: event.currentTarget.checked,
      };
      setProducerReports(updatedProducerReports);
    };
  
    const handleDeadlineChange = (date: Date | null) => {
      const updatedProducerReports = [...producerReports];
      updatedProducerReports[index] = {
        ...producerReport,
        deadline: date,
      };
      setProducerReports(updatedProducerReports);
    };
  
    return (
      <Table.Tr key={producerReport._id}>
        <Table.Td>
          <Checkbox
            checked={producerReport.duplicate}
            onChange={handleDuplicateChange}
          />
        </Table.Td>
        <Table.Td>{producerReport.name}</Table.Td>
        <Table.Td>{producerReport.deadline ? dateToGMT(producerReport.deadline) : ""}</Table.Td>
        <Table.Td>
          <Checkbox
            checked={producerReport.customDeadline}
            onChange={handleCustomDeadlineChange}
          />
        </Table.Td>
        <Table.Td>
          {producerReport.customDeadline && (
            <DatePickerInput
              locale="es"
              value={producerReport.deadline}
              onChange={handleDeadlineChange}
              maxDate={targetPeriod?.producer_end_date}
            />
          )}
        </Table.Td>
      </Table.Tr>
    );
  });
  

  return (
    <Container size={'lg'}>
      <DateConfig/>
      <Title ta='center'>Clonación de Periodo</Title>
      <Button
        leftSection={<IconChevronLeft/>}
        variant="light"
        onClick={() => router.back()}
      >
        Ir Atrás
      </Button>
      <Divider m='md'/>
      <Group grow mt={'md'}>
        <Select
          label={<Text fw={700}>Periodo a Clonar</Text>}
          data={periods.map(period => ({ value: period._id, label: period.name }))}
          onChange={async (value) => {
            setSelectedPeriod(periods.find(period => period._id === value) || null)
            setTargetPeriod(null)
            setShowItems(false)
          }}
          value={selectedPeriod?._id}
        />
        <Select
          label={<Text fw={700}>Periodo Objetivo</Text>}
          data={availablePeriods.map(period => ({ value: period._id, label: period.name }))}
          onChange={(value) => {
            if(selectedPeriod?._id === value) {
              showNotification({
                title: "Error",
                message: "El periodo a clonar y el periodo objetivo no pueden ser iguales",
                color: "red",
              });
            } else {
              setTargetPeriod(availablePeriods.find(period => period._id === value) || null)
              setShowItems(false)
            }
          }}
          value={targetPeriod?._id}
        />
      </Group>
      <Divider m='md'/>
      <Group mt={'md'} justify="space-around">
        {!showItems && <Button
          w={rem(300)}
          color="orange"
          variant="light"
          leftSection={<IconCopy/>}
          onClick={handleFeedDuplicate}
        >
          Empezar a Clonar Periodo
        </Button>
        }
        {
          showItems && <Button
            w={rem(300)}
            color="red"
            variant="light"
            leftSection={<IconCancel/>}
            onClick={() => {
              setShowItems(false);
              setReports([]);
              setTemplates([]);
              setProducerReports([]);
            }}
          >
            Cancelar
          </Button>
        }
        {
          showItems && <Button
            w={rem(300)}
            color="green"
            variant="light"
            leftSection={<IconCopy/>}
            onClick={handleDuplicatePeriod}
          >
            Clonar Periodo
          </Button>
        }
      </Group>
      {
        showItems && (
          <Accordion chevronPosition="right" variant="separated" mt={'md'}>
            <Accordion.Item key="templates" value="Plantillas">
                <Accordion.Control disabled={templates.length === 0}>
                  Plantillas de Productores
                </Accordion.Control>
                <AccordionPanel>
                  {tableBuilder(templatesTable)}
                </AccordionPanel>
            </Accordion.Item>
            <Accordion.Item key="producer-reports" value="Informes de Productores">
                <Accordion.Control disabled={producerReports.length === 0}>
                  Informes de Productores
                </Accordion.Control>
                <AccordionPanel>
                  {tableBuilder(producerReportsTable)}
                </AccordionPanel>
            </Accordion.Item>
            <Accordion.Item key="reports" value="Informes de Ámbitos">
                <Accordion.Control disabled={reports.length === 0}>
                  Informes de Ámbitos
                </Accordion.Control>
                <AccordionPanel>
                  {tableBuilder(reportsTable)}
                </AccordionPanel>
            </Accordion.Item>
          </Accordion>
        )
      }
    </Container>
  )
}

export default DuplicatePeriodPage