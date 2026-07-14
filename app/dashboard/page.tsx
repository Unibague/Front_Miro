"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Modal, Button, Badge, Select, Container, Grid, Card, Text, Group, Title, Center, Indicator, useMantineColorScheme, Paper, Stack, ThemeIcon } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { IconHexagon3d, IconChartHistogram, IconChartBarPopular, IconBuilding, IconFileAnalytics, IconCalendarMonth, IconMessageCircle, IconZoomCheck, IconUserHexagon, IconReport, IconFileUpload, IconUserStar, IconChecklist, IconClipboardData, IconReportSearch, IconFilesOff, IconCheckbox, IconHomeCog, IconClipboard, IconHierarchy2, IconMail, IconFilter, IconRobot, IconTarget, IconCalendarStats, IconShield, IconUsersGroup, IconDatabase } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRole } from "../context/RoleContext";
import { useColorScheme } from "@mantine/hooks";
import { usePeriod } from "@/app/context/PeriodContext";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { paramId } from "@/app/utils/routeParams";
import AIChat from "@/app/components/AIAssistant/AIChat";
import { processesMenRoutes } from "@/app/processes-MEN/config/routes";

// Llaves de permiso que viven dentro de cada modulo grande del dashboard.
// Se usan para decidir si la tarjeta de ENTRADA a ese modulo debe verse:
// basta con tener acceso a cualquiera de sus vistas hijas, no a una llave fija.
const GESTION_REPORTES_KEYS = [
  "adminTemplates", "publishedTemplates", "producerTemplates", "templatesWithFilters",
  "adminReports", "publishedReports", "producerReportsConfig", "producerReportsManagement",
  "producerReports", "responsibleReports", "ambitosReportsConfig", "ambitosReportsManagement",
  "templatesLogs", "reminders", "audit", "templatesManagement", "dependenciesHierarchy",
  "traceability", "validationsView", "historicoDocentes", "snies", "cna",
];
const PDI_KEYS = ["pdi", "pdiMine", "pdiDashboard", "pdiForms", "pdiCharts"];
const RESPONSIBLE_ADMIN_KEYS = ["responsibleReports", "dependency", "childDependenciesTemplates", "childDependenciesReports"];
const CONFIGURATION_KEYS = ["configuration", "users", "profiles", "homeSettings"];

const DashboardPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = paramId(params);

  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const { userRole, setUserRole, viewPermissions, setViewPermissions, userAccessProfiles, setUserAccessProfiles, permissionsLoaded } = useRole();
  const [notificationShown, setNotificationShown] = useState(false);
  const [isResponsible, setIsResponsible] = useState(false);
  const colorScheme = useColorScheme();
  const [pendingReports, setPendingReports] = useState<number>(0);
  const [pendingTemplates, setPendingTemplates] = useState<number>(0);
  const [encargadoTemplatesCount, setEncargadoTemplatesCount] = useState<number>(0);
  const [nextReportDeadline, setNextReportDeadline] = useState<string | null>(null);
  const [nextTemplateDeadline, setNextTemplateDeadline] = useState<string | null>(null);
  const [nextEncargadoDeadline, setNextEncargadoDeadline] = useState<string | null>(null);
  const { selectedPeriodId } = usePeriod();
  const [isVisualizer, setIsVisualizer] = useState(false);
  const userEmail = session?.user?.email ?? "";
  const showSupportTemplatesModule = true;

  const hasViewPermission = (key: string) =>
    Array.isArray(viewPermissions[key]) && viewPermissions[key].length > 0;

  // Solo para el mensaje de "sin módulos asignados" (no se usa para decidir
  // qué módulos mostrar; eso ahora es por módulo, ver canSee).
  const hasProfile = userAccessProfiles.length > 0;

  // La decisión es por módulo, no global: si el perfil del usuario tiene
  // ALGO configurado para esta vista puntual (así sea de otro módulo), esa
  // configuración manda. Pero si ningún perfil ha tocado todavía esta vista
  // en particular, no la ocultamos solo porque el usuario tenga perfil en
  // otros módulos: se usa el rol (Administrador/Productor/Responsable) como
  // antes, para no bloquear módulos que aún no se han configurado.
  const canSee = (key: string, roles: string[]) => {
    if (Object.prototype.hasOwnProperty.call(viewPermissions, key)) {
      return hasViewPermission(key);
    }
    return roles.includes(userRole);
  };

  // Para tarjetas "entrada de modulo": deben verse si el usuario puede ver
  // CUALQUIERA de las vistas que viven dentro de ese modulo, no solo una
  // llave suelta (si no, un perfil con acceso a una vista hija nunca podria
  // llegar a ella porque la tarjeta de entrada estaria oculta).
  const canSeeAny = (keys: string[], roles: string[]) => keys.some((key) => canSee(key, roles));
  const [aiChatOpened, setAiChatOpened] = useState(false);

  const [avRcOpen, setAvRcOpen] = useState(false);

  // gestionReportesOpen vive en la URL para que el historial del navegador funcione
  const gestionReportesOpen = searchParams?.get("view") === "gestion";

  useEffect(() => {
    if (searchParams?.get("gestionProcesos") === "1") {
      setAvRcOpen(true);
      router.replace("/dashboard", { scroll: false });
    }
  }, [searchParams, router]);

  const activeModule: "home" | "reports" | "snies" | "cna" | "pdi" | "configuracion" | "responsible-admin" =
    pathname === "/reports" || pathname === "/operations"
      ? "reports"
      : pathname === "/snies"
        ? "snies"
        : pathname === "/cna"
          ? "cna"
          : pathname === "/pdi-modulo"
            ? "pdi"
            : pathname === "/configuracion"
              ? "configuracion"
              : pathname === "/responsible/admin"
                ? "responsible-admin"
                : "home";

  const shouldRedirectFromDashboardHome = false;

  const shouldWaitDashboardRedirect =
    pathname === "/dashboard" &&
    status === "authenticated" &&
    !opened &&
    permissionsLoaded &&
    !userRole;

  const getDefaultRouteByRole = (role: string) => {
    switch (role) {
      case "Administrador":
        return "/dashboard";
      case "Responsable":
        return "/dashboard";
      case "Productor":
        return "/dashboard";
      default:
        return "/dashboard";
    }
  };

  const fetchPendingItems = async (role: string) => {
    if (session?.user?.email && selectedPeriodId) {
        try {
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
            const pendingReportsData = Array.isArray(reportsResponse.data?.pendingReports)
              ? reportsResponse.data.pendingReports
              : [];

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

                const templatesList = Array.isArray(templatesResponse.data?.templates)
                  ? templatesResponse.data.templates
                  : [];
                const totalTemplates = templatesList.length;
                const encargadoList = templatesList.filter((t: any) => t.isEncargado);
                const regularList = templatesList.filter((t: any) => !t.isEncargado);

                setPendingTemplates(totalTemplates);
                setEncargadoTemplatesCount(encargadoList.length);

                // Fecha más próxima para productores regulares
                const regularDeadlines = regularList
                    .map((t: any) => {
                        const raw = t.fecha_final_productores
                            ?? t.template?.fecha_final_productores
                            ?? t.fecha_final
                            ?? t.template?.fecha_final
                            ?? t.deadline;
                        return raw ? new Date(raw) : null;
                    })
                    .filter((d: Date | null): d is Date => d !== null && !isNaN(d.getTime()));
                const minRegular = regularDeadlines.length > 0
                    ? new Date(Math.min(...regularDeadlines.map((d: Date) => d.getTime())))
                    : null;
                setNextTemplateDeadline(minRegular ? dayjs(minRegular).format("DD/MM/YYYY") : null);

                // Fecha más próxima para el productor encargado
                const encargadoDeadlines = encargadoList
                    .map((t: any) => {
                        const raw = t.fecha_final_responsables
                            ?? t.template?.fecha_final_responsables
                            ?? t.fecha_final_productores
                            ?? t.template?.fecha_final_productores
                            ?? t.deadline;
                        return raw ? new Date(raw) : null;
                    })
                    .filter((d: Date | null): d is Date => d !== null && !isNaN(d.getTime()));
                const minEncargado = encargadoDeadlines.length > 0
                    ? new Date(Math.min(...encargadoDeadlines.map((d: Date) => d.getTime())))
                    : null;
                setNextEncargadoDeadline(minEncargado ? dayjs(minEncargado).format("DD/MM/YYYY") : null);
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
    if (!session?.user?.email) return;

    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`
      );

      const raw = response.data;
      const dependencies: unknown[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && Array.isArray((raw as { dependencies?: unknown[] }).dependencies)
          ? (raw as { dependencies: unknown[] }).dependencies
          : [];

      const email = session.user.email;
      const isUserVisualizer = dependencies.some((dep: unknown) => {
        if (typeof dep !== "object" || dep === null) return false;
        const v = (dep as { visualizers?: unknown }).visualizers;
        return Array.isArray(v) && v.includes(email);
      });

      setIsVisualizer(isUserVisualizer);
    } catch (error) {
      console.error("Error fetching visualizers:", error);
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
          const roles = response.data.roles ?? [];
          setAvailableRoles(roles);
          if (!response.data.activeRole) {
            // Solo abrir modal si tiene roles para elegir
            if (roles.length > 0) {
              setOpened(true);
            }
            // Si no tiene roles, queda como "Usuario" sin bloquear
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
            textAlign: "center",
            display: pendingReports > 0 || pendingTemplates > 0 ? "inline-flex" : "none",
            maxWidth: "max-content", // Ajusta el ancho al contenido
            whiteSpace: "pre-wrap",
            margin: "20px auto", // Centra el badge y da margen con otros elementos
            justifyContent: "center", // Centra el contenido horizontalmente
            alignItems: "center", // Centra el contenido verticalmente
            lineHeight: "normal",
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
              Tienes <strong>{pendingTemplates}</strong>{" "}
              {pendingTemplates === 1 ? "plantilla pendiente" : "plantillas pendientes"}.
            </>
          )}
        </Badge>
      </Center>
    );
  };
  
  const handleRoleSelect = async (role: string) => {
    if (!session?.user?.email) return;

    try {
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/users/updateActiveRole`,
        { email: session.user.email, activeRole: role }
      );

      // Recargar permisos del cargo para el nuevo rol activo
      const permResponse = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/users/roles`,
        { params: { email: session.user.email } }
      );
      setUserRole(role);
      setViewPermissions(permResponse.data.viewPermissions || {});
      setUserAccessProfiles(permResponse.data.accessProfiles || []);

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

  const renderActionCard = (opts: {
    permissionKey: string;
    roles: string[];
    icon: React.ReactNode;
    title: string;
    description: string;
    route: string;
    buttonLabel: string;
  }) => {
    if (!canSee(opts.permissionKey, opts.roles)) return null;

    return (
      <Grid.Col span={{ base: 12, md: 5, lg: 4 }} key={opts.permissionKey}>
        <Card shadow="sm" padding="lg" radius="md" withBorder onClick={() => router.push(opts.route)} style={{ cursor: "pointer" }}>
          <Center>{opts.icon}</Center>
          <Group mt="md" mb="xs">
            <Text ta={"center"} w={500}>{opts.title}</Text>
          </Group>
          <Text ta={"center"} size="sm" color="dimmed">
            {opts.description}
          </Text>
          <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push(opts.route)}>
            {opts.buttonLabel}
          </Button>
        </Card>
      </Grid.Col>
    );
  };

  // Cada tarjeta se filtra por permiso (canSee): si el usuario tiene un perfil
  // personalizado, manda el permiso de la vista; si no tiene perfil, manda el
  // rol por defecto listado aqui. Asi una tarjeta nueva solo necesita entrar a
  // esta lista, sin depender de un switch(userRole) rigido.
  const renderCards = () => {
    const cardDefs: Array<Parameters<typeof renderActionCard>[0]> = [
      {
        permissionKey: "adminTemplates",
        roles: ["Administrador"],
        icon: <IconFileAnalytics size={80} />,
        title: "Configurar Plantillas",
        description: "Crea, edita, elimina o asigna plantillas a los productores.",
        route: "/admin/templates",
        buttonLabel: "Ir a Configurar Plantillas",
      },
      {
        permissionKey: "publishedTemplates",
        roles: ["Administrador", "Responsable"],
        icon: <IconChecklist size={80} />,
        title: "Gestionar Plantillas",
        description: "Administra las plantillas cargadas por los productores.",
        route: "/templates/published",
        buttonLabel: "Ir a Gestión de Plantillas",
      },
      {
        permissionKey: "producerReportsConfig",
        roles: ["Administrador"],
        icon: <IconClipboardData size={80} />,
        title: "Configurar Informes de Gestión de Productores",
        description: "Crea, edita y asigna los informes que generarán los productores.",
        route: "/admin/reports/producers",
        buttonLabel: "Ir a Configuración de Informes",
      },
      {
        permissionKey: "producerReportsManagement",
        roles: ["Administrador", "Responsable"],
        icon: <IconReportSearch size={80} />,
        title: "Gestionar Informes Productores",
        description: "Gestiona el proceso de cargue de los informes por parte de los productores.",
        route: "/reportproducers",
        buttonLabel: "Ir a Gestión de Informes",
      },
      {
        permissionKey: "ambitosReportsConfig",
        roles: ["Administrador"],
        icon: (
          <Center style={{ position: "relative" }}>
            <IconClipboard size={80} />
            <IconHexagon3d size={36} style={{ position: "absolute", top: "57%", left: "50%", transform: "translate(-50%, -50%)" }} />
          </Center>
        ),
        title: "Configurar Informes de Ámbitos",
        description: "Crea, edita y asigna los informes que generarán los Ámbitos.",
        route: "/admin/reports/ambitos",
        buttonLabel: "Ir a Configuración de Informes",
      },
      {
        permissionKey: "ambitosReportsManagement",
        roles: ["Administrador"],
        icon: <IconReportSearch size={80} />,
        title: "Gestionar Informes Ámbitos",
        description: "Gestiona el proceso de cargue de los informes por parte de las Ámbitos.",
        route: "/admin/reports/ambitos/uploaded",
        buttonLabel: "Ir a Gestión de Informes",
      },
      {
        permissionKey: "adminReports",
        roles: ["Administrador"],
        icon: <IconChartBarPopular size={80} />,
        title: "Configurar Informes de Gestión de Responsables",
        description: "Crea, edita y asigna los informes de gestión de responsables.",
        route: "/admin/reports",
        buttonLabel: "Ir a Configuración de Informes.",
      },
      {
        permissionKey: "publishedReports",
        roles: ["Administrador"],
        icon: <IconReportSearch size={80} />,
        title: "Gestionar informes Responsables",
        description: "Adminsitra el proceso de cargue de los informes de gestión.",
        route: "/admin/reports/uploaded",
        buttonLabel: "Ir a administración de Informes",
      },
      {
        permissionKey: "periods",
        roles: ["Administrador"],
        icon: <IconCalendarMonth size={80} />,
        title: "Gestionar Periodos",
        description: "Administra todos los periodos de la plataforma Miró.",
        route: "/admin/periods",
        buttonLabel: "Ir a Gestión de Periodos",
      },
      {
        permissionKey: "dimensions",
        roles: ["Administrador"],
        icon: <IconHexagon3d size={80} />,
        title: "Gestionar Ámbitos",
        description: "Administra los Ámbitos y sus responsables.",
        route: "/admin/dimensions",
        buttonLabel: "Ir a Gestión de Ámbitos",
      },
      {
        permissionKey: "dependencies",
        roles: ["Administrador"],
        icon: <IconBuilding size={80} />,
        title: "Gestionar Dependencias",
        description: "Administra las dependencias y sus responsables.",
        route: "/admin/dependencies",
        buttonLabel: "Ir a Gestión de Dependencias",
      },
      {
        permissionKey: "validations",
        roles: ["Administrador"],
        icon: <IconZoomCheck size={80} />,
        title: "Gestionar Validaciones",
        description: "Administra todas las validaciones para asignarlas en las plantillas.",
        route: "/admin/validations",
        buttonLabel: "Ir a Gestión de Validaciones",
      },
      {
        permissionKey: "templatesLogs",
        roles: ["Administrador"],
        icon: <IconFilesOff size={80} />,
        title: "Valida los Registros de Error",
        description: "Verifica los registros de error de las plantillas cargadas.",
        route: "/admin/logs",
        buttonLabel: "Ir a los registros de error",
      },
      {
        permissionKey: "reminders",
        roles: ["Administrador"],
        icon: <IconMail size={80} />,
        title: "Recordatorios por correo",
        description: "Ajusta cuándo se deben enviar recordatorios por email para plantillas e informes pendientes.",
        route: "/admin/reminders",
        buttonLabel: "Ir a Recordatorios",
      },
      {
        permissionKey: "audit",
        roles: ["Administrador"],
        icon: <IconChartHistogram size={80} />,
        title: "Historial de Trazabilidad",
        description: "Consulta el historial de cambios en plantillas y Ámbitos",
        route: "/admin/audit",
        buttonLabel: "Ir a Historial",
      },
      {
        permissionKey: "templatesManagement",
        roles: ["Administrador"],
        icon: <IconFilter size={80} />,
        title: "Gestión de Plantillas con Filtros",
        description: "Gestiona plantillas con filtros avanzados y configuraciones administrativas",
        route: "/admin/templates-management",
        buttonLabel: "Ir a Plantillas con Filtros",
      },
      {
        permissionKey: "dependenciesHierarchy",
        roles: ["Administrador"],
        icon: <IconHierarchy2 size={80} />,
        title: "Jerarquía de Dependencias",
        description: "Administra la estructura jerárquica de dependencias padre-hijo con vista de árbol.",
        route: "/admin/dependencies-hierarchy",
        buttonLabel: "Ir a Jerarquía de Dependencias",
      },
      {
        permissionKey: "responsibleReports",
        roles: ["Responsable"],
        icon: <IconChartBarPopular size={80} />,
        title: "Informe de Gestión de Responsables",
        description: "Revisa los informes que debes entregar, cárgalos y haz los ajustes de acuerdo a las observaciones",
        route: "/responsible/reports",
        buttonLabel: "Ir a Informes de Gestión de Responsables",
      },
      {
        permissionKey: "producerTemplates",
        roles: ["Productor"],
        icon: <IconFileAnalytics size={80} />,
        title: "Gestionar Plantillas",
        description: "Consulta las plantillas que debes llenar, carga y edita los datos solicitados.",
        route: "/producer/templates",
        buttonLabel: "Ir a Gestionar Plantillas",
      },
      {
        permissionKey: "producerReports",
        roles: ["Productor"],
        icon: <IconClipboardData size={80} />,
        title: "Informe de gestión de productor",
        description: "Revisa los informes que debes entregar, carga los informes y haz los ajustes de acuerdo a las observaciones",
        route: "/producer/reports",
        buttonLabel: "Ir a Informes de Productores",
      },
      {
        permissionKey: "templatesWithFilters",
        roles: ["Responsable", "Productor"],
        icon: <IconFilter size={80} />,
        title: "Gestión de Plantillas con Filtros",
        description: "Visualiza plantillas con filtros avanzados. Solo verás información de tu dependencia/ámbito",
        route: "/templates-with-filters",
        buttonLabel: "Ir a Plantillas con Filtros",
      },
      {
        permissionKey: "validationsView",
        roles: ["Responsable"],
        icon: <IconCheckbox size={80} />,
        title: "Validaciones",
        description: "Conoce las validaciones que deben cumplir los datos de tus plantillas.",
        route: "/validations",
        buttonLabel: "Ir a Validaciones",
      },
      {
        permissionKey: "traceability",
        roles: ["Responsable", "Productor"],
        icon: <IconChartHistogram size={80} />,
        title: "Historial de Cambios",
        description: "Consulta los cambios realizados en plantillas e informes de tus dependencias",
        route: "/traceability",
        buttonLabel: "Ir a Historial de Cambios",
      },
    ];

    const cards = cardDefs.map(renderActionCard).filter(Boolean);

    if (cards.length === 0) {
      cards.push(
        <Grid.Col span={12} key="no-roles-message">
          <Paper
            withBorder
            radius="xl"
            p="xl"
            style={{ textAlign: "center", background: "var(--mantine-color-gray-0)" }}
          >
            <Text fw={600} size="lg" mb="xs">Sin módulos asignados</Text>
            <Text size="sm" c="dimmed">
              {hasProfile ? (
                <>
                  Tu perfil no tiene permisos asignados para este módulo.<br />
                  Contacta al administrador del sistema para que ajuste tu perfil.
                </>
              ) : (
                <>
                  Tu cuenta aún no tiene roles ni permisos configurados.<br />
                  Contacta al administrador del sistema para que te asigne un rol.
                </>
              )}
            </Text>
          </Paper>
        </Grid.Col>
      );
    }

    return cards;
  };

  const renderSniesCards = () => {
    return (
      <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
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
      <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
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

  const renderCardsFallback = () => (
    <Grid.Col span={12}>
      <Center>
        <Text c="dimmed">No tienes permisos para este modulo.</Text>
      </Center>
    </Grid.Col>
  );

  const renderConfigurationCards = () => {
    const cards = [
      renderActionCard({
        permissionKey: "users",
        roles: ["Administrador"],
        icon: <IconUserHexagon size={80} />,
        title: "Gestionar Usuarios",
        description: "Administra los roles y permisos de los usuarios.",
        route: "/admin/users",
        buttonLabel: "Ir a Gestión de Usuarios",
      }),
      renderActionCard({
        permissionKey: "profiles",
        roles: ["Administrador"],
        icon: <IconShield size={80} />,
        title: "Gestionar perfiles",
        description: "Define qué vistas puede consultar o administrar cada perfil del sistema.",
        route: "/configuracion/perfiles",
        buttonLabel: "Ir a Gestion de Perfiles",
      }),
      renderActionCard({
        permissionKey: "homeSettings",
        roles: ["Administrador"],
        icon: <IconHomeCog size={80} />,
        title: "Ajustes Pagina Inicial",
        description: "Ajusta la información de la pagina de inicio.",
        route: "/admin/homeSettings",
        buttonLabel: "Ir a los ajustes de inicio",
      }),
    ].filter(Boolean);

    return cards.length > 0 ? <>{cards}</> : renderCardsFallback();
  };

  const renderResponsiblePdiCards = () => {
    const cards = [
      renderActionCard({
        permissionKey: "pdiMine",
        roles: ["Responsable", "Administrador"],
        icon: <IconTarget size={80} />,
        title: "Proyectos PDI",
        description: "Consulta y actualiza el avance de los proyectos PDI asignados a ti.",
        route: "/pdi/mis-indicadores",
        buttonLabel: "Ir a Mis Proyectos PDI",
      }),
    ].filter(Boolean);

    return cards.length > 0 ? <>{cards}</> : renderCardsFallback();
  };

  const renderResponsibleAdminCards = () => {
    const cards = [
      renderActionCard({
        permissionKey: "dependency",
        roles: ["Responsable", "Administrador"],
        icon: <IconUserStar size={80} />,
        title: "Ver Mi Dependencia",
        description: "Selecciona que miembros de tu equipo tendran acceso a Miro.",
        route: "/dependency",
        buttonLabel: "Ir a Gestion de Dependencia",
      }),
      renderActionCard({
        permissionKey: "childDependenciesTemplates",
        roles: ["Responsable", "Administrador"],
        icon: <IconHierarchy2 size={80} />,
        title: "Visualizar plantillas de dependencias hijo",
        description: "Observa el progreso de carga de las plantillas de tus dependencias hijo.",
        route: "/dependency/children-dependencies/templates",
        buttonLabel: "Ir a visualizador",
      }),
      renderActionCard({
        permissionKey: "childDependenciesReports",
        roles: ["Responsable", "Administrador"],
        icon: <IconClipboardData size={80} />,
        title: "Visualizar reportes de dependencias hijo",
        description: "Observa los reportes generados por las dependencias hijo y su estado de cumplimiento.",
        route: "/dependency/children-dependencies/reports",
        buttonLabel: "Ir a visualizador de reportes",
      }),
    ].filter(Boolean);

    return cards.length > 0 ? <>{cards}</> : renderCardsFallback();
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
      <>
        {canSee("dateReview", ["Administrador"]) && (
          <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconCalendarMonth size={80} /></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Gestión de procesos MEN</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Registro calificado, Acreditación voluntaria y Plan de mejoramiento.
              </Text>
              <Button variant="light" fullWidth mt="md" radius="md" onClick={() => router.push(processesMenRoutes.home)}>
                Ir a gestión de procesos MEN
              </Button>
            </Card>
          </Grid.Col>
        )}

        {canSee("dateReviewComunicaciones", ["Administrador"]) && (
          <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconMessageCircle size={80} stroke={1.2} /></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Comunicaciones MEN</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Gestión ante el MEN.
              </Text>
              <Button
                variant="light"
                fullWidth
                mt="md"
                radius="md"
                onClick={() => router.push(processesMenRoutes.comunicaciones)}
              >
                Ir a comunicaciones MEN
              </Button>
            </Card>
          </Grid.Col>
        )}

        {canSee("dateReviewResponsible", ["Responsable", "Productor"]) && (
          <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Center><IconCalendarMonth size={80} /></Center>
              <Group mt="md" mb="xs">
                <Text ta={"center"} w={500}>Estado de procesos MEN</Text>
              </Group>
              <Text ta={"center"} size="sm" color="dimmed">
                Consulta el estado de fases y actividades de los programas de tu facultad.
              </Text>
              <Button
                variant="light"
                fullWidth
                mt="md"
                radius="md"
                onClick={() => router.push("/processes-MEN/responsible")}
              >
                Ver procesos de mi facultad
              </Button>
            </Card>
          </Grid.Col>
        )}
      </>
    );
  };

  return (
    <>
      <style>{`
        .module-card { transition: transform 0.22s ease, box-shadow 0.22s ease !important; }
        .module-card:hover { transform: translateY(-6px) !important; box-shadow: 0 28px 64px rgba(0,0,0,0.28) !important; }
      `}</style>
      <Container py="xl">
        <Stack gap="xl">
        {renderMessage()}
        {(activeModule !== "home" || avRcOpen || gestionReportesOpen) && (
          <Group justify="flex-start">
            <Button variant="subtle" onClick={() => {
              if (avRcOpen) {
                setAvRcOpen(false);
              } else if (["reports", "snies", "cna"].includes(activeModule)) {
                // "Plantillas y reportes", SNIES y CNA son hijos del submenú
                // "Gestión de reportes", así que volver debe regresar ahí
                // (nivel intermedio) en lugar de saltar al home del dashboard.
                router.push("/dashboard?view=gestion");
              } else {
                // Navegación explícita en vez de router.back(): activeModule se deriva
                // de la URL, así que "volver" siempre significa ir al home del dashboard,
                // sin depender del historial del navegador (que puede estar roto por
                // redirecciones duras de NextAuth, impersonación, recargas, etc.).
                router.push("/dashboard");
              }
            }}>
              Volver al módulo
            </Button>
          </Group>
        )}
        {activeModule === "home" && !avRcOpen && !gestionReportesOpen ? (
          <Grid justify="center" align="stretch">
            {canSeeAny(GESTION_REPORTES_KEYS, ["Administrador", "Responsable", "Productor"]) && (
            <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
              <Card
                radius="xl"
                p="xl"
                className="module-card"
                onClick={() => router.push("/dashboard?view=gestion")}
                style={{
                  cursor: "pointer",
                  height: 340,
                  color: "white",
                  border: "none",
                  overflow: "hidden",
                  transition: "transform 0.22s ease, box-shadow 0.22s ease",
                  position: "relative" as const,
                  background: "linear-gradient(135deg, #0f4c75 0%, #1b6ca8 100%)",
                  boxShadow: "0 18px 45px rgba(15, 76, 117, 0.22)",
                }}
              >
                <Stack justify="space-between" h="100%" align="center">
                  <Stack align="center" gap="md">
                    <ThemeIcon size={68} radius="xl" color="rgba(255,255,255,0.18)" style={{ border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                      <IconReportSearch size={34} />
                    </ThemeIcon>
                    <Title order={3} c="white" ta="center" fw={700} style={{ letterSpacing: "-0.3px" }}>
                      Gestión de reportes
                    </Title>
                    <Text c="rgba(255,255,255,0.78)" ta="center" lineClamp={2} size="sm">
                      Plantillas, reportes, SNIES, CNA y consulta de información.
                    </Text>
                  </Stack>
                  <Button variant="white" color="blue" radius="xl" size="md" fw={600} style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
                    Abrir módulo
                  </Button>
                </Stack>
              </Card>
            </Grid.Col>
            )}

            {canSee("supportTemplates", ["Administrador"]) && (
              <>
                {showSupportTemplatesModule && (
                  <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
                    <Card
                      radius="xl"
                      p="xl"
                      className="module-card"
                      onClick={() => router.push("/apoyos-plantillas")}
                      style={{
                        cursor: "pointer",
                        height: 340,
                        color: "white",
                        border: "none",
                        overflow: "hidden",
                        transition: "transform 0.22s ease, box-shadow 0.22s ease",
                        position: "relative" as const,
                        background: "linear-gradient(135deg, #164e63 0%, #0891b2 100%)",
                        boxShadow: "0 18px 45px rgba(8, 145, 178, 0.22)",
                      }}
                    >
                      <Stack justify="space-between" h="100%" align="center">
                        <Stack align="center" gap="xs">
                          <ThemeIcon size={68} radius="xl" color="rgba(255,255,255,0.18)" style={{ border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                            <IconDatabase size={34} />
                          </ThemeIcon>
                          <Title order={3} c="white" ta="center" fw={700} style={{ letterSpacing: "-0.3px" }}>
                            Cruce de apoyos SIGA/Iceberg
                          </Title>
                          <Text c="rgba(255,255,255,0.78)" ta="center" lineClamp={2} size="sm">
                            Cruza plantillas de apoyos con SIGA/Iceberg e historial de periodos.
                          </Text>
                        </Stack>
                        <Button variant="white" color="cyan" radius="xl" size="md" fw={600} style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
                          Abrir modulo
                        </Button>
                      </Stack>
                    </Card>
                  </Grid.Col>
                )}
              </>
            )}

            {(canSee("dateReview", ["Administrador"]) || canSee("dateReviewComunicaciones", ["Administrador"]) || canSee("dateReviewResponsible", ["Responsable", "Productor"])) && (
              <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
                <Card
                  radius="xl"
                  p="xl"
                  className="module-card"
                  onClick={() =>
                    userRole === "Administrador"
                      ? setAvRcOpen(true)
                      : router.push("/processes-MEN/responsible")
                  }
                  style={{
                    cursor: "pointer",
                    height: 340,
                    color: "white",
                    border: "none",
                  overflow: "hidden",
                  transition: "transform 0.22s ease, box-shadow 0.22s ease",
                  position: "relative" as const,
                    background: "linear-gradient(135deg, #1a3a2a 0%, #2e7d52 100%)",
                    boxShadow: "0 18px 45px rgba(26, 58, 42, 0.22)",
                  }}
                >
                  <Stack justify="space-between" h="100%" align="center">
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={68} radius="xl" color="rgba(255,255,255,0.18)" style={{ border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                        <IconCalendarMonth size={34} />
                      </ThemeIcon>
                      <Title order={3} c="white" ta="center" fw={700} style={{ letterSpacing: "-0.3px" }}>
                        Procesos de calidad MEN
                      </Title>
                      <Text c="rgba(255,255,255,0.78)" ta="center" lineClamp={2} size="sm">
                        {userRole === "Administrador"
                          ? "RC, AV y comunicaciones MEN."
                          : "Estado de fases y actividades de los programas de tu facultad."}
                      </Text>
                    </Stack>
                    <Button
                      variant="white"
                      color="green"
                      radius="xl"
                      onClick={(e) => {
                        e.stopPropagation();
                        userRole === "Administrador"
                          ? setAvRcOpen(true)
                          : router.push("/processes-MEN/responsible");
                      }}
                    >
                      Abrir módulo
                    </Button>
                  </Stack>
                </Card>
              </Grid.Col>
            )}

            {canSeeAny(PDI_KEYS, ["Administrador", "Responsable"]) && (
              <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
                <Card
                  radius="xl"
                  p="xl"
                  className="module-card"
                  onClick={() => router.push(userRole === "Responsable" ? "/pdi-modulo" : "/pdi")}
                  style={{
                    cursor: "pointer",
                    height: 340,
                    color: "white",
                    border: "none",
                  overflow: "hidden",
                  transition: "transform 0.22s ease, box-shadow 0.22s ease",
                  position: "relative" as const,
                    background: "linear-gradient(135deg, #9d0c0c 0%, #c73a3a 100%)",
                    boxShadow: "0 18px 45px rgba(101, 29, 29, 0.22)",
                  }}
                >
                  <Stack justify="space-between" h="100%" align="center">
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={68} radius="xl" color="rgba(255,255,255,0.18)" style={{ border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                        <IconChartBarPopular size={34} />
                      </ThemeIcon>
                      <Title order={3} c="white" ta="center" fw={700} style={{ letterSpacing: "-0.3px" }}>
                        PDI
                      </Title>
                      <Text c="rgba(255,255,255,0.78)" ta="center" lineClamp={2} size="sm">
                        {userRole === "Responsable"
                          ? "Seguimiento de tus proyectos, acciones e indicadores PDI."
                          : "Proyecto de Desarrollo Institucional."}
                      </Text>
                    </Stack>
                    <Button variant="white" color="violet" radius="xl" size="md" fw={600} style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
                      Abrir módulo
                    </Button>
                  </Stack>
                </Card>
              </Grid.Col>
            )}


            {canSeeAny(RESPONSIBLE_ADMIN_KEYS, ["Responsable"]) && (
              <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
                <Card
                  radius="xl"
                  p="xl"
                  className="module-card"
                  onClick={() => router.push("/responsible/admin")}
                  style={{
                    cursor: "pointer",
                    height: 340,
                    color: "white",
                    border: "none",
                  overflow: "hidden",
                  transition: "transform 0.22s ease, box-shadow 0.22s ease",
                  position: "relative" as const,
                    background: "linear-gradient(135deg, #263238 0%, #607d8b 100%)",
                    boxShadow: "0 18px 45px rgba(38, 50, 56, 0.22)",
                  }}
                >
                  <Stack justify="space-between" h="100%" align="center">
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={68} radius="xl" color="rgba(255,255,255,0.18)" style={{ border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                        <IconBuilding size={34} />
                      </ThemeIcon>
                      <Title order={3} c="white" ta="center" fw={700} style={{ letterSpacing: "-0.3px" }}>
                        Administración
                      </Title>
                      <Text c="rgba(255,255,255,0.78)" ta="center" lineClamp={2} size="sm">
                        Dependencia y visualizadores de dependencias hijo.
                      </Text>
                    </Stack>
                    <Button variant="white" color="gray" radius="xl" size="md" fw={600} style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
                      Abrir módulo
                    </Button>
                  </Stack>
                </Card>
              </Grid.Col>
            )}
            

            {canSeeAny(CONFIGURATION_KEYS, ["Administrador"]) && (
              <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
                <Card
                  radius="xl"
                  p="xl"
                  className="module-card"
                  onClick={() => router.push("/configuracion")}
                  style={{
                    cursor: "pointer",
                    height: 340,
                    color: "white",
                    border: "none",
                  overflow: "hidden",
                  transition: "transform 0.22s ease, box-shadow 0.22s ease",
                  position: "relative" as const,
                    background: "linear-gradient(135deg, #263238 0%, #546e7a 100%)",
                    boxShadow: "0 18px 45px rgba(38, 50, 56, 0.22)",
                  }}
                >
                  <Stack justify="space-between" h="100%" align="center">
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={68} radius="xl" color="rgba(255,255,255,0.18)" style={{ border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                        <IconHomeCog size={34} />
                      </ThemeIcon>
                      <Title order={3} c="white" ta="center" fw={700} style={{ letterSpacing: "-0.3px" }}>
                      Configuración
                      </Title>
                      <Text c="rgba(255,255,255,0.78)" ta="center" lineClamp={2} size="sm">
                        Perfiles y permisos de vistas.
                      </Text>
                    </Stack>
                    <Button variant="white" color="gray" radius="xl" size="md" fw={600} style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
                      Abrir módulo
                    </Button>
                  </Stack>
                </Card>
              </Grid.Col>
            )}

            {/* Fallback: usuario sin roles ni permisos */}
            {!canSeeAny(GESTION_REPORTES_KEYS, ["Administrador", "Responsable", "Productor"]) &&
             !canSee("supportTemplates", ["Administrador"]) &&
             !canSee("dateReview", ["Administrador"]) &&
             !canSee("dateReviewComunicaciones", ["Administrador"]) &&
             !canSee("dateReviewResponsible", ["Responsable", "Productor"]) &&
             !canSeeAny(PDI_KEYS, ["Administrador", "Responsable"]) &&
             !canSeeAny(RESPONSIBLE_ADMIN_KEYS, ["Administrador", "Responsable"]) &&
             !canSeeAny(CONFIGURATION_KEYS, ["Administrador"]) && (
              <Grid.Col span={12}>
                <Paper
                  withBorder
                  radius="xl"
                  p="xl"
                  style={{ textAlign: "center", background: "var(--mantine-color-gray-0)" }}
                >
                  <Text fw={600} size="lg" mb="xs">Sin módulos asignados</Text>
                  <Text size="sm" c="dimmed">
                    Tu cuenta aún no tiene roles ni permisos configurados.<br />
                    Contacta al administrador del sistema para que te asigne un rol.
                  </Text>
                </Paper>
              </Grid.Col>
            )}

          </Grid>
        ) : (
          <Grid justify="center" align="stretch">
            {gestionReportesOpen
              ? (
                <>
                  <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
                    <Card
                      radius="xl"
                      p="xl"
                      className="module-card"
                      onClick={() => router.push("/reports")}
                      style={{
                        cursor: "pointer",
                        height: 340,
                        color: "white",
                        border: "none",
                        overflow: "hidden",
                        transition: "transform 0.22s ease, box-shadow 0.22s ease",
                        position: "relative" as const,
                        background: "linear-gradient(135deg, #0f1f39 0%, #1f4f82 100%)",
                        boxShadow: "0 18px 45px rgba(15, 31, 57, 0.22)",
                      }}
                    >
                      <Stack justify="space-between" h="100%" align="center">
                        <Stack align="center" gap="xs">
                          <ThemeIcon size={68} radius="xl" color="rgba(255,255,255,0.18)" style={{ border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                            <IconFileAnalytics size={34} />
                          </ThemeIcon>
                          <Title order={3} c="white" ta="center" fw={700} style={{ letterSpacing: "-0.3px" }}>
                            Plantillas y reportes
                          </Title>
                          <Text c="rgba(255,255,255,0.78)" ta="center" lineClamp={2} size="sm">
                            {userRole === "Administrador"
                              ? "Gestión plantillas y reportes."
                              : "Plantillas, informes, filtros, validaciones e historial."}
                          </Text>
                        </Stack>
                        <Button variant="white" color="blue" radius="xl" size="md" fw={600} style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
                          Abrir módulo
                        </Button>
                      </Stack>
                    </Card>
                  </Grid.Col>

                  {canSee("snies", ["Administrador"]) && (
                    <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
                        <Card
                          radius="xl"
                          p="xl"
                          className="module-card"
                          onClick={() => router.push("/snies")}
                          style={{
                            cursor: "pointer",
                            height: 340,
                            color: "white",
                            border: "none",
                  overflow: "hidden",
                  transition: "transform 0.22s ease, box-shadow 0.22s ease",
                  position: "relative" as const,
                            background: "linear-gradient(135deg, #0c7a6b 0%, #27b39d 100%)",
                            boxShadow: "0 18px 45px rgba(12, 122, 107, 0.22)",
                          }}
                        >
                          <Stack justify="space-between" h="100%" align="center">
                            <Stack align="center" gap="xs">
                              <ThemeIcon size={68} radius="xl" color="rgba(255,255,255,0.18)" style={{ border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                                <IconHexagon3d size={34} />
                              </ThemeIcon>
                              <Title order={3} c="white" ta="center" fw={700} style={{ letterSpacing: "-0.3px" }}>
                                SNIES
                              </Title>
                              <Text c="rgba(255,255,255,0.78)" ta="center" lineClamp={2} size="sm">
                                Gestión SNIES.
                              </Text>
                            </Stack>
                            <Button variant="white" color="teal" radius="xl" size="md" fw={600} style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
                              Abrir módulo
                            </Button>
                          </Stack>
                        </Card>
                      </Grid.Col>
                  )}

                  {canSee("cna", ["Administrador"]) && (
                      <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
                        <Card
                          radius="xl"
                          p="xl"
                          className="module-card"
                          onClick={() => router.push("/cna")}
                          style={{
                            cursor: "pointer",
                            height: 340,
                            color: "white",
                            border: "none",
                  overflow: "hidden",
                  transition: "transform 0.22s ease, box-shadow 0.22s ease",
                  position: "relative" as const,
                            background: "linear-gradient(135deg, #7a3e0c 0%, #d98a2b 100%)",
                            boxShadow: "0 18px 45px rgba(122, 62, 12, 0.22)",
                          }}
                        >
                          <Stack justify="space-between" h="100%" align="center">
                            <Stack align="center" gap="xs">
                              <ThemeIcon size={68} radius="xl" color="rgba(255,255,255,0.18)" style={{ border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                                <IconReport size={34} />
                              </ThemeIcon>
                              <Title order={3} c="white" ta="center" fw={700} style={{ letterSpacing: "-0.3px" }}>
                                CNA
                              </Title>
                              <Text c="rgba(255,255,255,0.78)" ta="center" lineClamp={2} size="sm">
                                Gestión CNA.
                              </Text>
                            </Stack>
                            <Button variant="white" color="orange" radius="xl" size="md" fw={600} style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
                              Abrir módulo
                            </Button>
                          </Stack>
                        </Card>
                      </Grid.Col>
                  )}

                  {canSee("historicoDocentes", ["Administrador", "Responsable", "Productor"]) && (
                    <Grid.Col span={{ base: 12, md: 6, lg: 5 }}>
                      <Card
                        radius="xl"
                        p="xl"
                        className="module-card"
                        onClick={() => router.push("/historico-docentes")}
                        style={{
                          cursor: "pointer",
                          height: 340,
                          color: "white",
                          border: "none",
                  overflow: "hidden",
                  transition: "transform 0.22s ease, box-shadow 0.22s ease",
                  position: "relative" as const,
                          background: "linear-gradient(135deg, #3b0764 0%, #7c3aed 100%)",
                          boxShadow: "0 18px 45px rgba(59, 7, 100, 0.22)",
                        }}
                      >
                        <Stack justify="space-between" h="100%" align="center">
                          <Stack align="center" gap="xs">
                            <ThemeIcon size={68} radius="xl" color="rgba(255,255,255,0.18)" style={{ border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                              <IconUsersGroup size={34} />
                            </ThemeIcon>
                            <Title order={3} c="white" ta="center" fw={700} style={{ letterSpacing: "-0.3px" }}>
                              Consulta de Información
                            </Title>
                            <Text c="rgba(255,255,255,0.78)" ta="center" lineClamp={2} size="sm">
                              Consulta plantillas, informes e histórico docentes (SNIES).
                            </Text>
                          </Stack>
                          <Button variant="white" color="violet" radius="xl" size="md" fw={600} style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>
                            Abrir módulo
                          </Button>
                        </Stack>
                      </Card>
                    </Grid.Col>
                  )}
                </>
              )
              : avRcOpen
              ? renderAvRcCards()
              : activeModule === "reports"
              ? renderCards()
              : activeModule === "snies"
              ? renderSniesCards()
              : activeModule === "configuracion"
              ? renderConfigurationCards()
              : activeModule === "pdi"
              ? renderResponsiblePdiCards()
              : activeModule === "responsible-admin"
              ? renderResponsibleAdminCards()
              : renderCnaCards()}
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
        {availableRoles.length === 0 ? (
          <>
            <Text size="sm" c="dimmed" mb="md">
              Tu cuenta aún no tiene roles asignados. Contacta al administrador del sistema para que te asigne un rol.
            </Text>
          </>
        ) : (
          <>
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
          </>
        )}
      </Modal>
    </>
  );
};

export default DashboardPage;


