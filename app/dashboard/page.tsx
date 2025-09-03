"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Modal, Button, Badge, Select, Container, Grid, Card, Text, Group, Title, Center, Indicator, useMantineColorScheme} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { IconHexagon3d, IconChartHistogram, IconChartBarPopular, IconBuilding, IconFileAnalytics, IconCalendarMonth, IconZoomCheck, IconUserHexagon, IconReport, IconFileUpload, IconUserStar, IconChecklist, IconClipboardData, IconReportSearch, IconFilesOff, IconCheckbox, IconHomeCog, IconClipboard, IconHierarchy2,IconMail   } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRole } from "../context/RoleContext";
import { useColorScheme } from "@mantine/hooks";
import { usePeriod } from "@/app/context/PeriodContext";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { useParams } from "next/navigation";

const DashboardPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const { userRole, setUserRole } = useRole();
  const [notificationShown, setNotificationShown] = useState(false);
  const [isResponsible, setIsResponsible] = useState(false);
  const colorScheme = useColorScheme();
  const [pendingReports, setPendingReports] = useState<number>(0);
  const [pendingTemplates, setPendingTemplates] = useState<number>(0);
  const [nextReportDeadline, setNextReportDeadline] = useState<string | null>(null);
  const [nextTemplateDeadline, setNextTemplateDeadline] = useState<string | null>(null);
  const { selectedPeriodId } = usePeriod();
  const [isVisualizer, setIsVisualizer] = useState(false);
  const userEmail = session?.user?.email ?? "";

  const params = useParams();
const { id } = params ?? {};

  const fetchPendingItems = async (role: string) => {
    if (session?.user?.email && selectedPeriodId) {
        try {
            // Si es Administrador, no hacer nada
            if (role === "Administrador") {
                setPendingReports(0);
                setPendingTemplates(0);
                setNextReportDeadline(null);
                setNextTemplateDeadline(null);
                return;
            }

            let reportsResponse;

            if (role === "Responsable") {
                // Obtener reportes para el responsable con todos los datos
                reportsResponse = await axios.get(
                    `${process.env.NEXT_PUBLIC_API_URL}/pReports/responsible`,
                    { params: { email: session.user.email, periodId: selectedPeriodId, limit: 10000 } }
                );
            } else {
                // Obtener reportes para el productor con todos los datos
                reportsResponse = await axios.get(
                    `${process.env.NEXT_PUBLIC_API_URL}/pProducerReports/producer`,
                    { params: { email: session.user.email, periodId: selectedPeriodId, limit: 10000 } }
                );
            }

                        console.log(reportsResponse.data, 'Producer reports ');

            // // Se obtiene el total de reportes publicados
            // const totalReports = reportsResponse.data.publishedReports.length;

            // Se filtran los reportes pendientes
            const pendingReportsData = reportsResponse.data.pendingReports 

            // Se establece el número de reportes pendientes
            setPendingReports(pendingReportsData.length);
            setNextReportDeadline(
                pendingReportsData.length > 0 ? dayjs(pendingReportsData[0].deadline).format("DD/MM/YYYY") : null
            );

            if (role !== "Responsable") {
                // Obtener plantillas disponibles solo si el usuario no es "Responsable"
                const templatesResponse = await axios.get(
                    `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/available`,
                    { params: { email: session.user.email, periodId: selectedPeriodId, limit: 10000 } }
                );

                // Se obtiene el total de plantillas
                const totalTemplates = templatesResponse.data.templates.length;

                // Se establece el número total de plantillas pendientes
                setPendingTemplates(totalTemplates);
                setNextTemplateDeadline(
                    totalTemplates > 0 ? dayjs(templatesResponse.data.templates[0].deadline).format("DD/MM/YYYY") : null
                );
            } else {
                setPendingTemplates(0);
                setNextTemplateDeadline(null);
            }
        } catch (error) {
            console.error("Error obteniendo reportes y plantillas pendientes:", error);
        }
    }
};


const fetchVisualizers = async () => {
  if (!session?.user?.email) return; // Evita errores si el usuario no está autenticado

  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`
    );

    console.log("🔍 Respuesta del backend corregida:", response.data.dependencies); // 👀 DEBUG

    // Verificar si el usuario está en la lista de visualizadores
    const isUserVisualizer = response.data.dependencies.some((dep: any) =>
      Array.isArray(dep.visualizers) && dep.visualizers.includes(session?.user?.email)
    );

    setIsVisualizer(isUserVisualizer);
    console.log("✅ El usuario es visualizador:", isUserVisualizer); // 👀 DEBUG
  } catch (error) {
    console.error("❌ Error fetching visualizers:", error);
  }
};


useEffect(() => {
  if (status === "authenticated") {
    fetchVisualizers();
  }
}, [session, status]);





useEffect(() => {
    if (status === "authenticated" && selectedPeriodId) {
        fetchPendingItems(userRole);
    }
}, [session, status, userRole, selectedPeriodId]);


  useEffect(() => {
    if (status === "authenticated" && selectedPeriodId) {
      fetchPendingItems(userRole);
    }
  }, [session, status, userRole, selectedPeriodId]);

  useEffect(() => {
    if (userRole) {
      setPendingReports(0);
      setPendingTemplates(0);
      setNextReportDeadline(null);
      setNextTemplateDeadline(null);
    }
  }, [userRole]);
  

  useEffect(() => {
    const fetchUserRoles = async () => {
      if (session?.user?.email && !notificationShown) {
        try {
          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/users/roles`,
            { params: { email: session.user.email } }
          );
          setAvailableRoles(response.data.roles);
          if (!response.data.activeRole) {
            setOpened(true);
          } else {
            if (userRole !== response.data.activeRole) {
              setUserRole(response.data.activeRole);
              showNotification({
                title: "Bienvenido",
                message: `Tu rol actual es ${response.data.activeRole}`,
                autoClose: 5000,
                color: "teal",
              });
              setNotificationShown(true);
            }
          }
        } catch (error) {
          console.error("Error fetching roles:", error);
        }
      }
    };

    if (status === "authenticated") {
      fetchUserRoles();
    }
  }, [session, status, notificationShown, userRole]);

  useEffect(() => {
    const checkIfUserIsResponsible = async () => {
      if (session?.user?.email) {
        try {
          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`,
            { params: { search: session.user.email } }
          );
          const userDependencies = response.data.dependencies.filter(
            (dependency: any) => dependency.responsible === session.user?.email
          );
          setIsResponsible(userDependencies.length > 0);
        } catch (error) {
          console.error("Error checking user responsibilities:", error);
        }
      }
    };

    const checkIfUserIsVisualizerOfDependency = async () => {
      if (session?.user?.email) {
        try {
          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`,
            { params: { search: session.user.email } }
          );
          const userDependencies = response.data.dependencies.filter(
            (dependency: any) => dependency.visualizers.includes(session?.user?.email)
          );
          setIsVisualizer(userDependencies.length > 0);
        } catch (error) {
          console.error("Error checking user responsibilities:", error);
        }
      }
    };

    checkIfUserIsResponsible();
    checkIfUserIsVisualizerOfDependency();
  }, [session]);

  const renderMessage = () => {
    if (pendingReports === 0 && pendingTemplates === 0) return null; // No renderizar nada si no hay pendientes
  
    return (
      <Center mt="md">
        <Badge
          color="red"
          size="lg"
          variant="light"
          style={{
            padding: "10px 15px", // Reduce el padding para ajustarse al texto
            textAlign: "center", // Asegura que el texto esté alineado al centro
            display: pendingReports > 0 || pendingTemplates > 0 ? "inline-flex" : "none", // Mantiene el tamaño adecuado
            maxWidth: "max-content", // Ajusta el ancho al contenido
            whiteSpace: "pre-wrap", // Permite saltos de línea si el contenido es muy largo
            margin: "20px auto", // Centra el badge y da margen con otros elementos
            justifyContent: "center", // Centra el contenido horizontalmente
            alignItems: "center", // Centra el contenido verticalmente
            lineHeight: "normal", // Asegura que la altura de línea no sea excesiva
            height: "auto", // Permite que el `Badge` se adapte al contenido
          }}
        >
          {pendingReports > 0 && (
            <>
              Tienes <strong>{pendingReports}</strong> reportes pendientes.{" "}
              {nextReportDeadline && `Fecha de vencimiento más próxima: ${nextReportDeadline}.`}
              <br />
              <br />
            </>
          )}
          {pendingTemplates > 0 && userRole !== "Responsable" && (
            <>
              Tienes <strong>{pendingTemplates}</strong> plantillas pendientes.{" "}
              {nextTemplateDeadline && `Fecha de vencimiento más próxima: ${nextTemplateDeadline}.`}
            </>
          )}
        </Badge>
      </Center>
    );
  };
  
  const handleRoleSelect = async (role: string) => {
    if (!session?.user?.email) return;

    try {
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/users/updateActiveRole`,
        {
          email: session.user.email,
          activeRole: role,
        }
      );
      console.log("Active role updated:", response.data);
      setUserRole(role);
      setOpened(false);
      showNotification({
        title: "Rol actualizado",
        message: `Tu nuevo rol es ${role}`,
        autoClose: 5000,
        color: "teal",
      });
    } catch (error) {
      console.error("Error updating active role:", error);
      showNotification({
        title: "Error",
        message: "No se pudo actualizar el rol",
        autoClose: 5000,
        color: "red",
      });
    }
  };

  const renderCards = () => {
    const cards = [];

    switch (userRole) {
      case "Administrador":
        cards.push(
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-templates">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconFileAnalytics size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Configurar Plantillas</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Crea, edita, elimina o asigna plantillas a los productores.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/templates')}>
                Ir a Configurar Plantillas
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-published-templates">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconChecklist size={80}></IconChecklist></Center>
              <Group mt="md" mb="xs">
                  <Text ta={"center"} w={500}>Gestionar Plantillas</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Administra las plantillas cargadas por los productores.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/templates/published')}>
                Ir a Gestión de Plantillas
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="producers-reports">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center>
                <IconClipboardData size={80}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Configurar Informes Productores</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Crea, edita y asigna los informes que generarán los productores.
                </Text>
              <Button
                variant="light"
                fullWidth
                mt="md"
                radius="md"
                onClick={() => router.push('/admin/reports/producers')}
              >
                Ir a Configuración de Informes
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="uploaded-reports-producers">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center>
                <IconReportSearch size={80}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Informes Productores</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Gestiona el proceso de cargue de los informes por parte de los productores.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/reports')}>
                Ir a Gestión de Informes
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-reports">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
               <Center style={{ position: "relative" }}>
                <IconClipboard size={80}/>
                <IconHexagon3d size={36} style={{ position: "absolute", top: "57%", left: "50%", transform: "translate(-50%, -50%)" }}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Configurar Informes Ámbitos</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Crea, edita y asigna los informes que generarán las ámbitos.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/reports')}>
                Ir a Configuración de Informes
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="uploaded-reports">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center>
                <IconReportSearch size={80}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Informes Ámbitos</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Gestiona el proceso de cargue de los informes por parte de las ámbitos.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/reports/uploaded')}>
                Ir a Gestión de Informes
              </Button>
            </Card>
          </Grid.Col>,


<Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-gestion-reports">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
               <Center style={{ position: "relative" }}>
                <IconChartBarPopular size={80}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Configurar Informes de Gestión</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Crea, edita y asigna los informes de gestión.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/reports')}>
                Ir a Configuración de Informes de gestión
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-gestion-uploaded-reports">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center>
                <IconReportSearch size={80}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Administrar Informes de Gestión</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Adminsitra el proceso de cargue de los informes de gestión.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/reports/uploaded')}>
                Ir a administración de Informes 
              </Button>
            </Card>
          </Grid.Col>,

          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-periods">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconCalendarMonth size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Periodos</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Administra todos los periodos de la plataforma Miró.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/periods')}>
                Ir a Gestión de Periodos
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-dimensions">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconHexagon3d size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Ámbitos</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Administra los ámbitos y sus responsables.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/dimensions')}>
                Ir a Gestión de Ámbitos
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-dependencies">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconBuilding size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Dependencias</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Administra las dependencias y sus responsables.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/dependencies')}>
                Ir a Gestión de Dependencias
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-validations">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconZoomCheck size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Validaciones</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Administra todas las validaciones para asignarlas en las plantillas.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/validations')}>
                Ir a Gestión de Validaciones
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-users">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconUserHexagon size={80}></IconUserHexagon></Center>
              <Group mt="md" mb="xs">
                  <Text ta={"center"} w={500}>Gestionar Usuarios</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Administra los roles y permisos de los usuarios.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/users')}>
                Ir a Gestión de Usuarios
              </Button>
            </Card>
            </Grid.Col>,
              <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-logs">
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Center><IconFilesOff size={80}/></Center>
                <Group mt="md" mb="xs">
                  <Text ta={"center"} w={500}>Valida los Registros de Error</Text>
                </Group>
                <Text ta={"center"} size="sm" color="dimmed">
                  Verifica los registros de error de las plantillas cargadas.
                </Text>
                <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/logs')}>
                  Ir a los registros de error
                </Button>
              </Card>
            </Grid.Col>,
            <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-homeSettings">
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Center><IconHomeCog size={80}/></Center>
                <Group mt="md" mb="xs">
                  <Text ta={"center"} w={500}>Ajustes Pagina Inicial</Text>
                </Group>
                <Text ta={"center"} size="sm" color="dimmed">
                  Ajusta la información de la pagina de inicio.
                </Text>
                <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/homeSettings')}>
                  Ir a los ajustes de inicio
                </Button>
              </Card>
            </Grid.Col>,
            <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-reminders">
  <Card shadow="sm" padding="lg" radius="md" withBorder>
    <Center><IconMail   size={80}/></Center>
    <Group mt="md" mb="xs">
      <Text ta={"center"} w={500}>Recordatorios por correo</Text>
    </Group>
    <Text ta={"center"} size="sm" color="dimmed">
      Ajusta cuándo se deben enviar recordatorios por email para plantillas e informes pendientes.
    </Text>
    <Button
      variant="light"
      fullWidth
      mt="md"
      radius="md"
      onClick={() => router.push('/admin/reminders')}
    >
      Ir a Recordatorios
    </Button>
  </Card>
</Grid.Col>,

        );
        break;
      case "Responsable":
        cards.push(
          // <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="responsible-templates">
          //   <Card shadow="sm" padding="lg" radius="md" withBorder>
          //     <Center><IconFileAnalytics size={80}/></Center>
          //     <Group mt="md" mb="xs">
          //       <Text ta={"center"} w={500}>Crear | Asignar Plantillas</Text>
          //     </Group>
          //     <Text ta={"center"} size="sm" color="dimmed">
          //       Crea y gestiona las plantillas que llenarán los usuarios.
          //     </Text>
          //     <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/responsible/templates')}>
          //       Ir a Gestión de Plantillas
          //     </Button>
          //   </Card>
          // </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="responsible-published-templates">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconChecklist size={80}></IconChecklist></Center>
              <Group mt="md" mb="xs">
                  <Text ta={"center"} w={500}>Gestionar Plantillas Productores</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Haz seguimiento y descarga las plantillas de tus productores.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/templates/published')}>
                Ir a Plantillas Cargadas
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="responsible-reports">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
             <Center><IconClipboardData size={80}/></Center>
             <Group mt="md" mb="xs">
               <Text ta={"center"} w={500}>Gestionar Informes Productores</Text>
             </Group>
             <Text ta={"center"} size="sm" color="dimmed">
              Haz seguimiento y descarga los informes de tus productores 
             </Text>
             <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/reports')}>
               Ir a Informes de Productores
             </Button>
            </Card>
         </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="dimension-reports">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Center style={{ position: "relative" }}>
                <IconClipboard size={80}/>
                <IconHexagon3d size={36} style={{ position: "absolute", top: "57%", left: "50%", transform: "translate(-50%, -50%)" }}/>
                </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Informes Ámbito</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
              Revisa los informes que debes entregar, cárgalos y haz los ajustes de acuerdo a las observaciones
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/responsible/reports')}>
                Ir a Informes de Ámbito
              </Button>
            </Card>
          </Grid.Col>,
        // <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="responsible-dimensions">
        //   <Card shadow="sm" padding="lg" radius="md" withBorder>
        //     <Center><IconHexagon3d size={80}/></Center>
        //     <Group mt="md" mb="xs">
        //       <Text ta={"center"} w={500}>Gestionar Mi Dimensión</Text>
        //     </Group>
        //     <Text ta={"center"} size="sm" color="dimmed">
        //       Gestiona la dimensión de la que eres responsable.
        //     </Text>
        //     <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/responsible/dimension')}>
        //       Ir a Gestión de Mi Dimensión
        //     </Button>
        //   </Card>
        // </Grid.Col>,
        );
        break;
      case "Productor":
        cards.push(
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="producer-my-templates">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconFileAnalytics size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Plantillas</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Consulta las plantillas que debes llenar, carga y edita los datos solicitados.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/producer/templates')}>
                Ir a Gestionar Plantillas
              </Button>
            </Card>
          </Grid.Col>,
          // <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="producer-send-info">
          //   <Card shadow="sm" padding="lg" radius="md" withBorder>
          //     <Center><IconFileUpload size={80}/></Center>
          //     <Group mt="md" mb="xs">
          //       <Text ta={"center"} w={500}>Plantillas Enviadas</Text>
          //     </Group>
          //     <Text ta={"center"} size="sm" color="dimmed">
          //       Gestiona la información de tus plantillas cargadas.
          //     </Text>
          //     <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/producer/templates/uploaded')}>
          //       Ir a Plantillas Enviadas
          //     </Button>
          //   </Card>
          // </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="producer-reports">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Center><IconClipboardData size={80}/></Center>
            <Group mt="md" mb="xs">
              <Text ta={"center"} w={500}>Gestionar Informes</Text>
            </Group>
            <Text ta={"center"} size="sm" color="dimmed">
              Revisa los informes que debes entregar, carga los informes y haz los ajustes de acuerdo a las observaciones
            </Text>
            <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/producer/reports')}>
              Ir a Informes de Productores
            </Button>
          </Card>
        </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="producer-validations">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Center><IconCheckbox size={80}/></Center>
            <Group mt="md" mb="xs">
              <Text ta={"center"} w={500}>Validaciones</Text>
            </Group>
            <Text ta={"center"} size="sm" color="dimmed">
            Conoce las validaciones que deben cumplir los datos de tus plantillas
            </Text>
            <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/validations')}>
              Ir a Validaciones
            </Button>
          </Card>
        </Grid.Col>,
        );
        if (isVisualizer) {

          cards.push(
            <Grid.Col
            span={{ base: 12, md: 5, lg: 4 }}
            key="administer-dependency"
          >
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center>
                <IconUserStar size={80} />
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>
                  Administrar Mi Dependencia
                </Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Selecciona qué miembros de tu equipo tendrán acceso a Miró
              </Text>
              <Button
                variant="light"
                fullWidth
                mt="md"
                radius="md"
                onClick={() => router.push("/dependency")}
              >
                Ir a Gestión de Dependencia
              </Button>
            </Card>
          </Grid.Col>,

            <Grid.Col
              span={{ base: 12, md: 5, lg: 4 }}
              key="view-child-dependency-templates"
            >
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Center>
                  <IconHierarchy2 size={80} />
                </Center>
                <Group mt="md" mb="xs">
                  <Text ta={"center"} w={500}>
                    Visualizar plantillas de dependencias hijo
                  </Text>
                </Group>
                <Text ta={"center"} size="sm" color="dimmed">
                  Observa el progreso de carga de las plantillas de tus
                  dependencias hijo
                </Text>
                <Button
                  variant="light"
                  fullWidth
                  mt="md"
                  radius="md"
                  onClick={() =>
                    router.push("/dependency/children-dependencies/templates")
                  }
                >
                  Ir a visualizador
                </Button>
              </Card>
            </Grid.Col>,
            <Grid.Col
              span={{ base: 12, md: 5, lg: 4 }}
              key="view-child-dependency-reports"
            >
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Center>
                  <IconClipboardData size={80} />
                </Center>
                <Group mt="md" mb="xs">
                  <Text ta={"center"} w={500}>
                    Visualizar reportes de dependencias hijo
                  </Text>
                </Group>
                <Text ta={"center"} size="sm" color="dimmed">
                  Observa los reportes generados por las dependencias hijo y su
                  estado de cumplimiento.
                </Text>
                <Button
                  variant="light"
                  fullWidth
                  mt="md"
                  radius="md"
                  onClick={() =>
                    router.push("/dependency/children-dependencies/reports")
                  }
                >
                  Ir a visualizador de reportes
                </Button>
              </Card>
            </Grid.Col>
          );
        }
  break;
      case "Usuario":
      default:
        cards.push(
          <Container key="default-message">
            <Text>Bienvenido al sistema. Por favor selecciona un rol desde el menú superior.</Text>
          </Container>
        );
        break;
    }

    // if (isResponsible) {
    //   cards.push(
    //     <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="administer-dependency">
    //       <Card shadow="sm" padding="lg" radius="md" withBorder>
    //         <Center><IconUserStar size={80}/></Center>
    //         <Group mt="md" mb="xs">
    //           <Text ta={"center"} w={500}>Administrar Mi Dependencia</Text>
    //         </Group>
    //         <Text ta={"center"} size="sm" color="dimmed">
    //           Selecciona qué miembros de tu equipo tendrán acceso a Miró
    //         </Text>
    //         <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/dependency')}>
    //           Ir a Gestión de Dependencia
    //         </Button>
    //       </Card>
    //     </Grid.Col>
    //   );
    // }
    return cards;
  };

  return (
    <>
      <Container>
        <Center>
          <Title mt="md" mb="md">Inicio</Title>
        </Center>
        {renderMessage()}
        <Grid justify="center" align="center">
          {renderCards()}
        </Grid>
      </Container>
      <Modal
        opened={opened}
        onClose={() => {}}
        title="Selecciona un rol"
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
        withCloseButton={false}
      >
        <Select
          label="Selecciona uno de tus roles"
          placeholder="Elige un rol"
          data={availableRoles}
          value={selectedRole}
          onChange={(value) => setSelectedRole(value || "")}
        />
        <Button
          mt="md"
          onClick={() => handleRoleSelect(selectedRole)}
          disabled={!selectedRole}
        >
          Guardar
        </Button>
      </Modal>
    </>
  );
};

export default DashboardPage;