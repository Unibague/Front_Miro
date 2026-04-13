"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Modal, Button, Badge, Select, Container, Grid, Card, Text, Group, Title, Center, Indicator, useMantineColorScheme, Paper, Stack, ThemeIcon } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { IconHexagon3d, IconChartHistogram, IconChartBarPopular, IconBuilding, IconFileAnalytics, IconCalendarMonth, IconZoomCheck, IconUserHexagon, IconReport, IconFileUpload, IconUserStar, IconChecklist, IconClipboardData, IconReportSearch, IconFilesOff, IconCheckbox, IconHomeCog, IconClipboard, IconHierarchy2, IconMail, IconFilter, IconRobot, IconTarget } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRole } from "../context/RoleContext";
import { useColorScheme } from "@mantine/hooks";
import { usePeriod } from "@/app/context/PeriodContext";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { useParams, usePathname } from "next/navigation";
import AIChat from "@/app/components/AIAssistant/AIChat";

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
  const showResponsibleScopeCards = false;
  const [aiChatOpened, setAiChatOpened] = useState(false);

  const [avRcOpen, setAvRcOpen] = useState(false);

  const params = useParams();
  const { id } = params ?? {};
  const pathname = usePathname();
  const activeModule: "home" | "reports" | "snies" | "cna" =
    pathname === "/reports" || pathname === "/operations"
      ? "reports"
      : pathname === "/snies"
      ? "snies"
      : pathname === "/cna"
      ? "cna"
      : "home";

  const shouldRedirectFromDashboardHome =
    pathname === "/dashboard" &&
    status === "authenticated" &&
    !opened &&
    !!userRole &&
    userRole !== "Administrador";

  const shouldWaitDashboardRedirect =
    pathname === "/dashboard" &&
    status === "authenticated" &&
    !opened &&
    !userRole;

  const getDefaultRouteByRole = (role: string) => {
    switch (role) {
      case "Administrador":
        return "/dashboard";
      case "Responsable":
        return "/reports";
      case "Productor":
        return "/reports";
      default:
        return "/dashboard";
    }
  };

      //aalalsd
  const fetchPendingItems = async (role: string) => {
    if (session?.user?.email && selectedPeriodId) {
        try {
            // Si es Administrador, no hacer nada
            //nada
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

            // Se establece el nÃºmero de reportes pendientes
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

                // Se establece el nÃºmero total de plantillas pendientes
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
  if (!session?.user?.email) return; // Evita errores si el usuario no estÃ¡ autenticado

  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`
    );

    console.log("ðŸ” Respuesta del backend corregida:", response.data.dependencies); // ðŸ‘€ DEBUG

    // Verificar si el usuario estÃ¡ en la lista de visualizadores
    const isUserVisualizer = response.data.dependencies.some((dep: any) =>
      Array.isArray(dep.visualizers) && dep.visualizers.includes(session?.user?.email)
    );

    setIsVisualizer(isUserVisualizer);
    console.log("âœ… El usuario es visualizador:", isUserVisualizer); // ðŸ‘€ DEBUG
  } catch (error) {
    console.error("âŒ Error fetching visualizers:", error);
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
    if (
      status === "authenticated" &&
      userRole &&
      userRole !== "Administrador" &&
      pathname === "/dashboard" &&
      !opened
    ) {
      const targetRoute = getDefaultRouteByRole(userRole);
      if (targetRoute !== pathname) {
        router.replace(targetRoute);
      }
    }
  }, [activeModule, opened, pathname, router, status, userRole]);

  useEffect(() => {
    const checkIfUserIsResponsible = async () => {
      if (session?.user?.email) {
        try {
          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`,
            { params: { search: session.user.email } }
          );
          const userDependencies = response.data.dependencies.filter(
            (dependency: any) => dependency.visualizers?.includes(session.user?.email)
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
            textAlign: "center", // Asegura que el texto estÃ© alineado al centro
            display: pendingReports > 0 || pendingTemplates > 0 ? "inline-flex" : "none", // Mantiene el tamaÃ±o adecuado
            maxWidth: "max-content", // Ajusta el ancho al contenido
            whiteSpace: "pre-wrap", // Permite saltos de lÃ­nea si el contenido es muy largo
            margin: "20px auto", // Centra el badge y da margen con otros elementos
            justifyContent: "center", // Centra el contenido horizontalmente
            alignItems: "center", // Centra el contenido verticalmente
            lineHeight: "normal", // Asegura que la altura de lÃ­nea no sea excesiva
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
      const targetRoute = getDefaultRouteByRole(role);
      if (targetRoute !== pathname) {
        router.replace(targetRoute);
      }
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
    console.log('DEBUG - Current userRole:', userRole);

    switch (userRole) {
      case "Administrador":
        cards.push(
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-configure-templates">
            <Card shadow="sm" padding="lg" radius="md" withBorder onClick={() => router.push('/admin/templates')} style={{ cursor: "pointer" }}>
              <Center>
                <IconFileAnalytics size={80}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Configurar Plantillas</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Crea, edita, elimina o asigna plantillas a los productores.
              </Text>
              <Button
                variant="light"
                fullWidth
                mt="md"
                radius="md"
                onClick={() => router.push('/admin/templates')}
              >
                Ir a Configurar Plantillas
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-manage-templates">
            <Card shadow="sm" padding="lg" radius="md" withBorder onClick={() => router.push('/templates/published')} style={{ cursor: "pointer" }}>
              <Center>
                <IconChecklist size={80}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Plantillas</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Administra las plantillas cargadas por los productores.
              </Text>
              <Button
                variant="light"
                fullWidth
                mt="md"
                radius="md"
                onClick={() => router.push('/templates/published')}
              >
                Ir a Gestión de Plantillas
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="producers-reports">
            <Card shadow="sm" padding="lg" radius="md" withBorder onClick={() => router.push('/admin/reports/producers')} style={{ cursor: "pointer" }}>
              <Center>
                <IconClipboardData size={80}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Configurar Informes de Gestión de Productores</Text>
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
            <Card shadow="sm" padding="lg" radius="md" withBorder onClick={() => router.push('/reportproducers')} style={{ cursor: "pointer" }}>
              <Center>
                <IconReportSearch size={80}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Informes Productores</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Gestiona el proceso de cargue de los informes por parte de los productores.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/reportproducers')}>
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
                <Text ta={"center"} w={500}>Configurar Informes de Ámbitos</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Crea, edita y asigna los informes que generarán los Ámbitos.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/reports/ambitos')}>
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
                Gestiona el proceso de cargue de los informes por parte de las Ámbitos.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/reports/ambitos/uploaded')}>
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
                <Text ta={"center"} w={500}>Configurar Informes de Gestión de Responsables</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Crea, edita y asigna los informes de gestión de responsables.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/reports')}>
                Ir a Configuración de Informes.
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-gestion-uploaded-reports">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center>
                <IconReportSearch size={80}/>
              </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar informes Responsables</Text>
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
                Administra los Ámbitos y sus responsables.
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
            <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-audit">
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Center><IconChartHistogram size={80}/></Center>
                <Group mt="md" mb="xs">
                  <Text ta={"center"} w={500}>Historial de Trazabilidad</Text>
                </Group>
                <Text ta={"center"} size="sm" color="dimmed">
                  Consulta el historial de cambios en plantillas y Ámbitos
                </Text>
                <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/audit')}>
                  Ir a Historial
                </Button>
              </Card>
            </Grid.Col>,
            <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-templates-management">
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Center><IconFilter size={80}/></Center>
                <Group mt="md" mb="xs">
                  <Text ta={"center"} w={500}>Gestión de Plantillas con Filtros</Text>
                </Group>
                <Text ta={"center"} size="sm" color="dimmed">
                  Gestiona plantillas con filtros avanzados y configuraciones administrativas
                </Text>
                <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/templates-management')}>
                  Ir a Plantillas con Filtros
                </Button>
              </Card>
            </Grid.Col>,
            <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="admin-dependencies-hierarchy">
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Center><IconHierarchy2 size={80}/></Center>
                <Group mt="md" mb="xs">
                  <Text ta={"center"} w={500}>Jerarquía de Dependencias</Text>
                </Group>
                <Text ta={"center"} size="sm" color="dimmed">
                  Administra la estructura jerárquica de dependencias padre-hijo con vista de árbol.
                </Text>
                <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/admin/dependencies-hierarchy')}>
                  Ir a Jerarquía de Dependencias
                </Button>
              </Card>
            </Grid.Col>,




        );
        break;
      case "Responsable":
        cards.push(
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
               <Text ta={"center"} w={500}>Visualizar Informes de Gestión de Productores</Text>
             </Group>
             <Text ta={"center"} size="sm" color="dimmed">
             Visualiza y da seguimiento a los informes de gestión cargados por los productores de tu ámbito
             </Text>
             <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/reportproducers')}>
               Ir a Informes de Gestión de Productores
             </Button>
            </Card>
         </Grid.Col>,
          showResponsibleScopeCards && (
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="dimension-reports">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Center style={{ position: "relative" }}>
                <IconClipboard size={80}/>
                <IconHexagon3d size={36} style={{ position: "absolute", top: "57%", left: "50%", transform: "translate(-50%, -50%)" }}/>
                </Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Informe de Ámbito</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
              Revisa los informes que debes entregar, cárgalos y haz los ajustes de acuerdo a las observaciones
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/responsible/reports')}>
                Ir a Informes de Ámbito
              </Button>
            </Card>
          </Grid.Col>
          ),
          showResponsibleScopeCards && (
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="responsible-dimensions">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconHexagon3d size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestionar Mi Ámbito</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Gestiona el ámbito del que eres responsable.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/responsible/dimension')}>
                Ir a Gestión de Mi Ámbito
              </Button>
            </Card>
          </Grid.Col>
          ),
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="responsible-view-producer-management-reports">
  <Card shadow="sm" padding="lg" radius="md" withBorder>
    <Center>
      <IconChartBarPopular size={80} />
    </Center>

    <Group mt="md" mb="xs">
      <Text ta="center" w={500}>
       Informe de Gestión de Responsables
      </Text>
    </Group>

    <Text ta="center" size="sm" color="dimmed">
      Revisa los informes que debes entregar, cárgalos y haz los ajustes de acuerdo a las observaciones
    </Text>

    <Button
      variant="light"
      fullWidth
      mt="md"
      radius="md"
      onClick={() => router.push('/responsible/reports')}
    >
       Ir a Informes de Gestión de Responsables
    </Button>
  </Card>
</Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="responsible-templates-with-filters">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconFilter size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestión de Plantillas con Filtros</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
               Visualiza plantillas con filtros avanzados. Solo verás información de tu dependencia/ámbito
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/templates-with-filters')}>
                Ir a Plantillas con Filtros
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="responsible-traceability">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconChartHistogram size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Historial de Cambios</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Consulta los cambios realizados en plantillas e informes de tus dependencias
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/traceability')}>
                Ir a Historial de Cambios
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="responsible-pdi-indicadores">
            <Card shadow="sm" padding="lg" radius="md" withBorder onClick={() => router.push('/pdi/mis-indicadores')} style={{ cursor: "pointer" }}>
              <Center><IconTarget size={80} /></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Indicadores PDI</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Consulta y actualiza el avance de los indicadores PDI asignados a ti.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/pdi/mis-indicadores')}>
                Ir a Mis Indicadores PDI
              </Button>
            </Card>
          </Grid.Col>,
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
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="producer-reports">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Center><IconClipboardData size={80}/></Center>
            <Group mt="md" mb="xs">
              <Text ta={"center"} w={500}>Informe de gestión de productor</Text>
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
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="producer-templates-with-filters-all">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconFilter size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestión de Plantillas con Filtros</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Visualiza plantillas con filtros avanzados. Solo verás información de tu dependencia/ámbito
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/templates-with-filters')}>
                Ir a Plantillas con Filtros
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="producer-traceability">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconChartHistogram size={80}/></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Historial de Cambios</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Consulta los cambios realizados en plantillas e informes de tus dependencias
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/traceability')}>
                Ir a Historial de Cambios
              </Button>
            </Card>
          </Grid.Col>,
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key="producer-pdi-indicadores">
            <Card shadow="sm" padding="lg" radius="md" withBorder onClick={() => router.push('/pdi/mis-indicadores')} style={{ cursor: "pointer" }}>
              <Center><IconTarget size={80} /></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Indicadores PDI</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Consulta y actualiza el avance de los indicadores PDI asignados a ti.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/pdi/mis-indicadores')}>
                Ir a Mis Indicadores PDI
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
                  Ver Mi Dependencia
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
            </Grid.Col>,

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
    //           Selecciona quÃ© miembros de tu equipo tendrÃ¡n acceso a MirÃ³
    //         </Text>
    //         <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push('/dependency')}>
    //           Ir a GestiÃ³n de Dependencia
    //         </Button>
    //       </Card>
    //     </Grid.Col>
    //   );
    // }
    return cards;
  };

  const renderSniesCards = () => {
    return (
      <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
        <Card shadow="sm" padding="lg" radius="md" withBorder onClick={() => router.push("/snies/templates")} style={{ cursor: "pointer" }}>
          <Center>
            <IconFileUpload size={80} />
          </Center>
          <Group mt="md" mb="xs">
            <Text ta={"center"} w={500}>Configurar plantilla SNIES</Text>
          </Group>
          <Text ta={"center"} size="sm" color="dimmed">
            Carga y administra las plantillas SNIES.
          </Text>
          <Button
            variant="light"
            fullWidth
            mt="md"
            radius="md"
            onClick={() => router.push("/snies/templates")}
          >
            Ir a plantilla SNIES
          </Button>
        </Card>
      </Grid.Col>
    );
  };

  const renderCnaCards = () => {
    return (
      <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
        <Card shadow="sm" padding="lg" radius="md" withBorder onClick={() => router.push("/cna/templates")} style={{ cursor: "pointer" }}>
          <Center>
            <IconReport size={80} />
          </Center>
          <Group mt="md" mb="xs">
            <Text ta={"center"} w={500}>Configurar plantilla CNA</Text>
          </Group>
          <Text ta={"center"} size="sm" color="dimmed">
            Carga y administra las plantillas CNA.
          </Text>
          <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push("/cna/templates")}> 
            Ir a plantilla CNA
          </Button>
        </Card>
      </Grid.Col>
    );
  };

  if (shouldRedirectFromDashboardHome || shouldWaitDashboardRedirect) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ minHeight: "60vh", flexDirection: "column", gap: 12 }}>
          <Text c="dimmed">Cargando módulo...</Text>
        </Center>
      </Container>
    );
  }

  const renderAvRcCards = () => {
    return (
      <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Center><IconCalendarMonth size={80} /></Center>
          <Group mt="md" mb="xs">
            <Text ta={"center"} w={500}>Gestión de procesos</Text>
          </Group>
          <Text ta={"center"} size="sm" color="dimmed">
            Gestión de procesos de Registro Calificado y Acreditación Voluntaria.
          </Text>
          <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push("/date-review")}>
            Ir a gestión de procesos
          </Button>
        </Card>
      </Grid.Col>
    );
  };

  return (
    <>
      <Container py="xl">
        <Stack gap="xl">
        {renderMessage()}
        {(activeModule !== "home" || avRcOpen) && !(activeModule === "reports" && ["Productor", "Responsable"].includes(userRole)) && (
          <Group justify="flex-start">
            <Button variant="subtle" onClick={() => { router.push("/dashboard"); setAvRcOpen(false); }}>
              Volver a módulos
            </Button>
          </Group>
        )}
        {activeModule === "home" && !avRcOpen ? (
          <Grid justify="center" align="stretch">
            <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
              <Card
                radius="xl"
                p="xl"
                onClick={() => router.push("/reports")}
                style={{
                  cursor: "pointer",
                  minHeight: 260,
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "linear-gradient(135deg, #0f1f39 0%, #1f4f82 100%)",
                  boxShadow: "0 18px 45px rgba(15, 31, 57, 0.22)",
                }}
              >
                <Stack justify="space-between" h="100%" align="center">
                  <Stack align="center" gap="md">
                    <ThemeIcon size={56} radius="xl" color="rgba(255,255,255,0.15)">
                      <IconFileAnalytics size={28} />
                    </ThemeIcon>
                    <Title order={2} c="white" ta="center">
                      Plantillas y reportes
                    </Title>
                    <Text c="rgba(255,255,255,0.82)" ta="center">
                      Gestión plantillas y reportes.
                    </Text>
                  </Stack>
                  <Button variant="white" color="blue" radius="xl">
                    Abrir módulo
                  </Button>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
              <Card
                radius="xl"
                p="xl"
                onClick={() => router.push("/snies")}
                style={{
                  cursor: "pointer",
                  minHeight: 260,
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "linear-gradient(135deg, #0c7a6b 0%, #27b39d 100%)",
                  boxShadow: "0 18px 45px rgba(12, 122, 107, 0.22)",
                }}
              >
                <Stack justify="space-between" h="100%" align="center">
                  <Stack align="center" gap="md">
                    <ThemeIcon size={56} radius="xl" color="rgba(255,255,255,0.15)">
                      <IconHexagon3d size={28} />
                    </ThemeIcon>
                    <Title order={2} c="white" ta="center">
                      SNIES
                    </Title>
                    <Text c="rgba(255,255,255,0.82)" ta="center">
                      Gestión SNIES.
                    </Text>
                  </Stack>
                  <Button variant="white" color="teal" radius="xl">
                    Abrir módulo
                  </Button>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
              <Card
                radius="xl"
                p="xl"
                onClick={() => router.push("/cna")}
                style={{
                  cursor: "pointer",
                  minHeight: 260,
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "linear-gradient(135deg, #7a3e0c 0%, #d98a2b 100%)",
                  boxShadow: "0 18px 45px rgba(122, 62, 12, 0.22)",
                }}
              >
                <Stack justify="space-between" h="100%" align="center">
                  <Stack align="center" gap="md">
                    <ThemeIcon size={56} radius="xl" color="rgba(255,255,255,0.15)">
                      <IconReport size={28} />
                    </ThemeIcon>
                    <Title order={2} c="white" ta="center">
                      CNA
                    </Title>
                    <Text c="rgba(255,255,255,0.82)" ta="center">
                      Gestión CNA.
                    </Text>
                  </Stack>
                  <Button variant="white" color="orange" radius="xl" onClick={() => router.push("/cna/templates")}> 
                    Abrir módulo
                  </Button>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
              <Card
                radius="xl"
                p="xl"
                onClick={() => setAvRcOpen(true)}
                style={{
                  cursor: "pointer",
                  minHeight: 260,
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "linear-gradient(135deg, #1a3a2a 0%, #2e7d52 100%)",
                  boxShadow: "0 18px 45px rgba(26, 58, 42, 0.22)",
                }}
              >
                <Stack justify="space-between" h="100%" align="center">
                  <Stack align="center" gap="md">
                    <ThemeIcon size={56} radius="xl" color="rgba(255,255,255,0.15)">
                      <IconCalendarMonth size={28} />
                    </ThemeIcon>
                    <Title order={2} c="white" ta="center">
                      Gestión de Procesos
                    </Title>
                    <Text c="rgba(255,255,255,0.82)" ta="center">
                      Gestión de RC y AV.
                    </Text>
                  </Stack>
                  <Button variant="white" color="green" radius="xl">
                    Abrir módulo
                  </Button>
                </Stack>
              </Card>
            </Grid.Col>

           {/* <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
              <Card
                radius="xl"
                p="xl"
                onClick={() => router.push("/pdi")}
                style={{
                  cursor: "pointer",
                  minHeight: 260,
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "linear-gradient(135deg, #9d0c0c 0%, #c73a3a 100%)",
                  boxShadow: "0 18px 45px rgba(101, 29, 29, 0.22)",
                }}
              >
                <Stack justify="space-between" h="100%" align="center">
                  <Stack align="center" gap="md">
                    <ThemeIcon size={56} radius="xl" color="rgba(255,255,255,0.15)">
                      <IconChartBarPopular size={28} />
                    </ThemeIcon>
                    <Title order={2} c="white" ta="center">
                      PDI
                    </Title>
                    <Text c="rgba(255,255,255,0.82)" ta="center">
                      Plan de Desarrollo Institucional.
                    </Text>
                  </Stack>
                  <Button variant="white" color="violet" radius="xl">
                    Abrir módulo
                  </Button>
                </Stack>
              </Card>
            </Grid.Col>*/}
          </Grid>
        ) : (
          <Grid justify="center" align="stretch">
            {avRcOpen ? renderAvRcCards() : activeModule === "reports" ? renderCards() : activeModule === "snies" ? renderSniesCards() : renderCnaCards()}
          </Grid>
        )}
        </Stack>
        
        {/* AI Assistant Button */}
        {/*<Button
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            borderRadius: '50px',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}
          size="lg"
          leftSection={<IconRobot size={20} />}
          onClick={() => setAiChatOpened(true)}
        >
          Hablar con Ardi
        </Button>*/}
      </Container>
      
      <AIChat opened={aiChatOpened} onClose={() => setAiChatOpened(false)} />
      
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


