"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActionIcon,
  Box,
  Container,
  Title,
  Text,
  SimpleGrid,
  Paper,
  Group,
  ThemeIcon,
  Loader,
  Center,
  Button,
  Divider,
  Stack,
  Tooltip,
  ScrollArea,
  Table,
  Accordion,
  Badge,
  Progress,
  Select,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconLayoutDashboard,
  IconBuildingCommunity,
  IconCalendarEvent,
  IconUsers,
  IconHeartHandshake,
  IconTarget,
  IconRoute,
  IconAward,
  IconBriefcase,
  IconFileSpreadsheet,
} from "@tabler/icons-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import axios from "axios";
import { useRouter } from "next/navigation";
import { usePeriod } from "@/app/context/PeriodContext";
import ConsultaInfoSidebar from "../components/ConsultaInfoSidebar";

interface DistributionEntry {
  value: string;
  count: number;
}

interface PlantillaNumericField {
  name: string;
  total: number;
  average: number;
  count: number;
}

interface PlantillaCategoricalField {
  name: string;
  distribution: DistributionEntry[];
  topValue: string;
  topCount: number;
  totalValues: number;
}

// Desglose GENERICO de una plantilla dentro de su ámbito: sus propios
// totales/promedios numéricos y su propia distribución de valores, sin
// mezclarse con las demás plantillas del ámbito.
interface PlantillaStats {
  templateId: string;
  name: string;
  totalRegistros: number;
  numeric: PlantillaNumericField[];
  categorical: PlantillaCategoricalField[];
  timeline: TimelinePoint[];
}

interface TimelinePoint {
  month: string; // "YYYY-MM"
  totalRegistros: number;
}

interface ActividadCurada {
  codigo: string;
  descripcion: string;
}

interface DependenciaCurada {
  dependencia: string;
  totalActividades: number;
}

// Resumen a la medida, presente SOLO en el ámbito Bienestar Institucional.
interface CuradoBienestar {
  totalActividades: number;
  totalParticipantes: number;
  totalRecursoHumano: number;
  totalBeneficiarios: number;
  totalPersonasImpactadas: number;
  actividades: ActividadCurada[];
  porDependencia: DependenciaCurada[];
}

interface RutaAprendizaje {
  ruta: string;
  matriculados: number;
  insignias: number;
}

// Resumen a la medida de la plantilla RUTAS_DE_APRENDIZAJE (Estructura y
// Procesos Académicos).
interface CuradoRutasAprendizaje {
  totalMatriculados: number;
  totalRutas: number;
  totalInsigniasEntregadas: number;
  rutas: RutaAprendizaje[];
}

interface EmpresaPractica {
  empresa: string;
  estudiantes: number;
}

interface ModalidadPractica {
  modalidad: string;
  estudiantes: number;
}

// Resumen a la medida de Prácticas Académicas (Estructura y Procesos
// Académicos).
interface CuradoPracticas {
  totalEstudiantes: number;
  totalEmpresas: number;
  porEmpresa: EmpresaPractica[];
  porModalidad: ModalidadPractica[];
}

interface NamedValue {
  name: string;
  value: number;
}

interface HojaBreakdown {
  label: string;
  type: "donut" | "bar";
  data: NamedValue[];
}
interface HojaDetalle {
  nombre: string;
  totalRegistros: number;
  desgloses: HojaBreakdown[];
}
interface DependenciaBienestarDetalle {
  dependencia: string;
  actividades: number;
  beneficiarios: number;
  recursoHumano: number;
}
interface ActividadBienestarAnalytics {
  fileId: string;
  fileName: string;
  nature: string;
  totalActivities: number;
  registeredBeneficiaries: number;
  totalParticipations: number;
  hasGroupedBeneficiaries: boolean;
  groupedBeneficiaries: number;
  externalBeneficiaries: number;
  humanResourceRecords: number;
  activitiesByUnit: NamedValue[];
  activitiesByCategory: NamedValue[];
  activitiesByMonth: NamedValue[];
  beneficiariesByType: NamedValue[];
  beneficiariesByUnit: NamedValue[];
  humanResourcesByUnit: NamedValue[];
  humanResourcesByCategory: NamedValue[];
  hojas: HojaDetalle[];
  porDependencia: DependenciaBienestarDetalle[];
  hojasPorDependencia: Record<string, HojaDetalle[]>;
}

// Resumen a la medida del archivo de Representación Estudiantil, presente
// SOLO en el ámbito Comunidad de Estudiantes.
interface RepresentacionEstudiantilAnalytics {
  fileId: string;
  fileName: string;
  dependencia: string;
  periodoElectividad: string;
  totalRegistros: number;
  totalInstancias: number;
  totalEstudiantes: number;
  totalProgramas: number;
  porCandidato: NamedValue[];
  porInstancia: NamedValue[];
  porPrograma: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida del archivo de Publicaciones y Autores, presente SOLO
// en el ámbito Comunidad de Profesores.
interface PublicacionesAutoresAnalytics {
  fileId: string;
  fileName: string;
  totalPublicaciones: number;
  totalRegistrosAutoria: number;
  totalAutoresUnicos: number;
  porTipo: NamedValue[];
  porDependencia: NamedValue[];
  porOrigenAutor: NamedValue[];
  porPrograma: NamedValue[];
  publicacionesPorMes: NamedValue[];
  hojas: HojaDetalle[];
}

// Un programa académico o un área de apoyo transversal (ej. "Facultad
// Ciencias Naturales y Matemáticas" = Ciencias Básicas), con el desglose de
// cuántos de sus docentes son planta (tiempo completo/medio tiempo) vs
// cátedra en el periodo más reciente.
interface DependenciaDetalle {
  nombre: string;
  tipo: "programa" | "apoyo";
  total: number;
  tiempoCompleto: number;
  catedra: number;
}

// Resumen a la medida del archivo Docentes Histórico SNIES, presente SOLO en
// el ámbito Comunidad de Profesores: evolución anual de docentes contratados
// más una fotografía del periodo más reciente.
interface DocentesHistoricoSniesAnalytics {
  fileId: string;
  fileName: string;
  anoInicio: string;
  anoFin: string;
  periodoActual: string;
  totalDocentesHistorico: number;
  docentesPeriodoActual: number;
  docentesPorAno: NamedValue[];
  dedicacionPeriodoActual: NamedValue[];
  escalafonPeriodoActual: NamedValue[];
  programasPeriodoActual: DependenciaDetalle[];
  areasApoyoPeriodoActual: DependenciaDetalle[];
  nivelFormacionPeriodoActual: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Rutas de Aprendizaje (Estructura y Procesos
// Académicos), a partir del archivo subido en Consulta de Información —
// distinto del "rutasAprendizaje" viejo (basado en plantillas Template).
interface RutaAprendizajeHistorico {
  ruta: string;
  matriculados: number;
  insignias: number;
}
interface RutasAprendizajeHistoricoAnalytics {
  fileId: string;
  fileName: string;
  totalMatriculados: number;
  totalEstudiantesUnicos: number;
  totalRutas: number;
  totalInsigniasEntregadas: number;
  rutas: RutaAprendizajeHistorico[];
  porPrograma: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Prácticas Académicas (Estructura y Procesos
// Académicos), a partir del archivo subido en Consulta de Información.
interface PracticasAcademicasHistoricoAnalytics {
  fileId: string;
  fileName: string;
  totalEstudiantes: number;
  totalEmpresas: number;
  promedioLogro: number | null;
  porModalidad: NamedValue[];
  porPrograma: NamedValue[];
  porEmpresa: NamedValue[];
  porEmpresaRegistrada: NamedValue[];
  porSectorEmpresasRegistradas: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Estrategias Curriculares (Estructura y Procesos
// Académicos).
interface EstrategiasCurricularesHistoricoAnalytics {
  fileId: string;
  fileName: string;
  totalEstrategias: number;
  totalProgramas: number;
  totalParticipantesInternos: number;
  totalParticipantesExternos: number;
  porTipo: NamedValue[];
  porNacionalInternacional: NamedValue[];
  porEnfoqueMetodologia: NamedValue[];
  porFuncionSustantiva: NamedValue[];
  porDimensionFormacion: NamedValue[];
  porPrograma: NamedValue[];
  porComunidadSectorExterno: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Capacitación y Formación de Funcionarios (Gestión
// Institucional).
interface CapacitacionFuncionariosAnalytics {
  fileId: string;
  fileName: string;
  totalCapacitaciones: number;
  totalBeneficiariosUnicos: number;
  totalHorasCursadas: number;
  porTipoCapacitacion: NamedValue[];
  porTipoCurso: NamedValue[];
  porProgramaAcademico: NamedValue[];
  porAreaApoyo: NamedValue[];
  topCursos: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Convenios de Cooperación (Gestión Institucional).
interface ConveniosCooperacionAnalytics {
  fileId: string;
  fileName: string;
  totalConvenios: number;
  totalActivos: number;
  totalUsuarios: number;
  totalInstitucionesAsociadas: number;
  porTipoConvenio: NamedValue[];
  porTipologia: NamedValue[];
  porOrigen: NamedValue[];
  porAcademicoNoAcademico: NamedValue[];
  porAlcance: NamedValue[];
  porAreaResponsable: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Estímulos a Funcionarios (Gestión Institucional).
interface EstimulosFuncionariosAnalytics {
  fileId: string;
  fileName: string;
  totalEstimulos: number;
  totalFuncionariosUnicos: number;
  porTipoEstimulo: NamedValue[];
  porDependenciaQueReporta: NamedValue[];
  porProgramaAcademico: NamedValue[];
  porAreaApoyo: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Otras Estrategias (Gestión Institucional).
interface OtrasEstrategiasAnalytics {
  fileId: string;
  fileName: string;
  totalEstrategias: number;
  totalRegistrosParticipacion: number;
  totalParticipantesUnicos: number;
  cooperacionNacional: number;
  cooperacionInternacional: number;
  porCategoria: NamedValue[];
  porTipologia: NamedValue[];
  porComunidadSectorExterno: NamedValue[];
  porPoblacionImpactada: NamedValue[];
  porTipoEnfoque: NamedValue[];
  topEstrategiasPorParticipantes: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Paz y Región (Interacción con el Entorno).
interface PazYRegionAnalytics {
  fileId: string;
  fileName: string;
  totalRegistros: number;
  totalEstudiantesUnicos: number;
  totalProyectos: number;
  totalEntidadesVinculadas: number;
  totalAsesores: number;
  cooperacionInternacional: number;
  porDepartamento: NamedValue[];
  porZona: NamedValue[];
  porOds: NamedValue[];
  porLineaProyecto: NamedValue[];
  porTipoEntidad: NamedValue[];
  porPrograma: NamedValue[];
  topMunicipios: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Grupos de Investigación (Investigación e Indagación).
interface GruposInvestigacionAnalytics {
  fileId: string;
  fileName: string;
  totalGrupos: number;
  porClasificacion: NamedValue[];
  porFacultad: NamedValue[];
  porPrograma: NamedValue[];
  porAnioCreacion: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Líneas de Investigación (Investigación e Indagación).
interface LineasInvestigacionAnalytics {
  fileId: string;
  fileName: string;
  totalLineas: number;
  totalGrupos: number;
  porGrupo: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Redes de Investigación (Investigación e Indagación).
interface RedesInvestigacionAnalytics {
  fileId: string;
  fileName: string;
  totalRegistros: number;
  totalInvestigadoresUnicos: number;
  totalRedes: number;
  porRed: NamedValue[];
  profesoresPorRed: NamedValue[];
  porFacultad: NamedValue[];
  porPrograma: NamedValue[];
  topInstituciones: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Semilleros y sus Participantes (Investigación e
// Indagación).
interface SemillerosParticipantesAnalytics {
  fileId: string;
  fileName: string;
  totalSemilleros: number;
  totalGruposConSemilleros: number;
  totalParticipantes: number;
  totalParticipantesUnicos: number;
  porPrograma: NamedValue[];
  topSemilleros: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Trabajos de Grado (Investigación e Indagación).
interface TrabajoGradoAnalytics {
  fileId: string;
  fileName: string;
  totalRegistros: number;
  totalTrabajos: number;
  totalDirectoresUnicos: number;
  porModalidad: NamedValue[];
  porEstado: NamedValue[];
  porMencion: NamedValue[];
  porGrupo: NamedValue[];
  porPrograma: NamedValue[];
  hojas: HojaDetalle[];
}

// Resumen a la medida de Movilidad (Visibilidad Regional, Nacional e
// Internacional): las 4 variantes (entrante/saliente x
// estudiantes/funcionarios) comparten exactamente la misma forma.
interface MovilidadAnalytics {
  fileId: string;
  fileName: string;
  totalRegistros: number;
  totalPersonasUnicas: number;
  totalDiasMovilidad: number;
  porNacionalInternacional: NamedValue[];
  porTipoMovilidad: NamedValue[];
  porModalidad: NamedValue[];
  porPais: NamedValue[];
  porPrograma: NamedValue[];
  topInstituciones: NamedValue[];
  hojas: HojaDetalle[];
}

interface DimensionStats {
  _id: string;
  name: string;
  totalRegistrosReportados: number;
  plantillas: PlantillaStats[];
  timeline: TimelinePoint[];
  curado: CuradoBienestar | null;
  rutasAprendizaje: CuradoRutasAprendizaje | null;
  practicas: CuradoPracticas | null;
  actividadBienestar: ActividadBienestarAnalytics | null;
  representacionEstudiantil: RepresentacionEstudiantilAnalytics | null;
  publicacionesAutores: PublicacionesAutoresAnalytics | null;
  docentesHistoricoSnies: DocentesHistoricoSniesAnalytics | null;
  rutasAprendizajeHistorico: RutasAprendizajeHistoricoAnalytics | null;
  practicasAcademicasHistorico: PracticasAcademicasHistoricoAnalytics | null;
  estrategiasCurricularesHistorico: EstrategiasCurricularesHistoricoAnalytics | null;
  capacitacionFuncionarios: CapacitacionFuncionariosAnalytics | null;
  conveniosCooperacion: ConveniosCooperacionAnalytics | null;
  estimulosFuncionarios: EstimulosFuncionariosAnalytics | null;
  otrasEstrategias: OtrasEstrategiasAnalytics | null;
  pazYRegion: PazYRegionAnalytics | null;
  gruposInvestigacion: GruposInvestigacionAnalytics | null;
  lineasInvestigacion: LineasInvestigacionAnalytics | null;
  redesInvestigacion: RedesInvestigacionAnalytics | null;
  semillerosParticipantes: SemillerosParticipantesAnalytics | null;
  trabajoGrado: TrabajoGradoAnalytics | null;
  movilidadEntranteEstudiantes: MovilidadAnalytics | null;
  movilidadEntranteFuncionarios: MovilidadAnalytics | null;
  movilidadSalienteEstudiantes: MovilidadAnalytics | null;
  movilidadSalienteFuncionarios: MovilidadAnalytics | null;
}

const BLUE = "#228be6";
const DONUT_COLORS = ["#7048e8", "#228be6", "#20c997", "#fd7e14", "#e64980"];

const formatNumber = (value: number, maxDecimals = 0) =>
  value.toLocaleString("es-CO", { maximumFractionDigits: maxDecimals });

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

// Solo para mostrar: oculta la extensión (.xlsx, .xlsm, .pdf) del nombre del
// archivo en los encabezados de cada reporte curado.
const displayFileName = (name: string) => name.replace(/\.(xlsx|xlsm|pdf)$/i, "");

const normalizeAmbitoName = (name: string) => name
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toUpperCase()
  .replace(/[^A-Z]/g, "");

// Texto corto para orientar al usuario sobre qué tipo de información y
// gráficas va a encontrar dentro de cada ámbito, antes de expandirlo del
// todo. Se matchea por palabras clave del nombre (igual que el resto de
// heurísticas de este módulo) para tolerar variantes de tildes/mayúsculas.
const AMBITO_DESCRIPTIONS: { keywords: string[]; text: string }[] = [
  { keywords: ["BIENESTAR"], text: "Actividades de bienestar, participantes y beneficiarios reportados por dependencia." },
  { keywords: ["COMUNIDAD", "ESTUDIANTES"], text: "Representación estudiantil: comités, instancias y estudiantes representantes por programa." },
  { keywords: ["COMUNIDAD", "PROFESORES"], text: "Publicaciones académicas, autoría y evolución histórica de la planta docente (SNIES)." },
  { keywords: ["ESTRUCTURA", "PROCESOS", "ACADEMIC"], text: "Rutas de aprendizaje, prácticas académicas y estrategias curriculares de los programas." },
  { keywords: ["GESTION", "INSTITUCIONAL"], text: "Capacitación, convenios, estímulos y otras estrategias de gestión con funcionarios." },
  { keywords: ["INTERACCION", "ENTORNO"], text: "Proyectos y actividades de proyección social e interacción con el entorno." },
  { keywords: ["INVESTIGACION", "INDAGACION"], text: "Grupos, líneas y redes de investigación, semilleros y trabajos de grado." },
  { keywords: ["VISIBILIDAD"], text: "Movilidad entrante y saliente de estudiantes y funcionarios, nacional e internacional." },
  { keywords: ["ASEGURAMIENTO", "CALIDAD"], text: "Procesos y evidencias reportadas para el aseguramiento de la calidad institucional." },
  { keywords: ["GOBIERNO", "IDENTIDAD"], text: "Información reportada sobre gobierno e identidad institucional." },
  { keywords: ["EGRESADOS"], text: "Información y seguimiento reportado sobre la comunidad de egresados." },
  { keywords: ["RECURSOS", "FISICOS"], text: "Información reportada sobre recursos físicos y tecnológicos de la institución." },
];

const getAmbitoDescription = (name: string) => {
  const normalized = normalizeAmbitoName(name);
  const match = AMBITO_DESCRIPTIONS.find(({ keywords }) => keywords.every((k) => normalized.includes(k)));
  return match?.text || "Estadísticas e información reportada para este ámbito.";
};

// Las categorias se entienden mejor como proporcion del total; por eso se
// presentan como dona y se acompanan con una leyenda compacta y accesible.
function CategoricalFieldDonut({ field }: { field: PlantillaCategoricalField }) {
  const visibleTotal = field.distribution.reduce((sum, entry) => sum + entry.count, 0);
  const otherCount = Math.max(0, field.totalValues - visibleTotal);
  const data = [
    ...field.distribution.map((entry) => ({ name: entry.value, value: entry.count })),
    ...(otherCount > 0 ? [{ name: "Otros", value: otherCount }] : []),
  ];

  return (
    <Paper withBorder radius="md" p="sm">
      <Tooltip label={field.name} disabled={field.name.length <= 46} multiline w={300}>
        <Text size="sm" fw={600} lineClamp={1} mb={6}>{field.name}</Text>
      </Tooltip>
      <Group wrap="nowrap" align="center" gap="sm">
        <Box w={150} h={130} style={{ flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={34} outerRadius={55} paddingAngle={2}>
                {data.map((entry, idx) => (
                  <Cell key={entry.name} fill={entry.name === "Otros" ? "#adb5bd" : DONUT_COLORS[idx % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip formatter={(value: any, name: any) => [formatNumber(Number(value)), name]} />
            </PieChart>
          </ResponsiveContainer>
        </Box>
        <Stack gap={5} style={{ minWidth: 0, flex: 1 }}>
          {data.slice(0, 6).map((entry, idx) => {
            const pct = field.totalValues > 0 ? Math.round((entry.value / field.totalValues) * 100) : 0;
            return (
              <Group key={entry.name} gap={6} wrap="nowrap" justify="space-between">
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  <Box w={8} h={8} style={{ borderRadius: "50%", flexShrink: 0, background: entry.name === "Otros" ? "#adb5bd" : DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                  <Text size="xs" lineClamp={1}>{entry.name}</Text>
                </Group>
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{entry.value} · {pct}%</Text>
              </Group>
            );
          })}
        </Stack>
      </Group>
    </Paper>
  );
}

// Tarjeta de una plantilla dentro del acordeón "Desglose por plantilla": sus
// totales/promedios numéricos y su distribución de valores categóricos.
function PlantillaPanel({ plantilla }: { plantilla: PlantillaStats }) {
  if (plantilla.numeric.length === 0 && plantilla.categorical.length === 0) {
    return <Text size="sm" c="dimmed" ta="center" py="sm">Sin campos relevantes para resumir todavía.</Text>;
  }

  const numericChartData = plantilla.numeric.map((f) => ({
    name: truncate(f.name, 26),
    fullName: f.name,
    total: f.total,
    average: f.average,
  }));

  return (
    <Stack gap="md">
      {numericChartData.length > 0 && (
        <Box>
          <Text size="xs" fw={600} c="dimmed" mb={4}>Totales reportados</Text>
          <ResponsiveContainer width="100%" height={Math.max(60, numericChartData.length * 34)}>
            <BarChart data={numericChartData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
              <ReTooltip
                formatter={(value: any, _name: any, entry: any) => [
                  `Total ${formatNumber(Number(value), 1)} · promedio ${formatNumber(entry?.payload?.average ?? 0, 1)}`,
                  "",
                ]}
                labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
              />
              <Bar dataKey="total" fill={BLUE} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {plantilla.categorical.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {plantilla.categorical.map((field) => (
            <CategoricalFieldDonut key={field.name} field={field} />
          ))}
        </SimpleGrid>
      )}

      {plantilla.timeline.length > 1 && (
        <Box>
          <Text size="xs" fw={600} c="dimmed" mb={4}>Evolución de registros cargados</Text>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={plantilla.timeline} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
              <Line type="monotone" dataKey="totalRegistros" stroke="#7048e8" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Stack>
  );
}

function MetricCard({ label, value, color = "violet" }: { label: string; value: number; color?: string }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Text size="xs" c="dimmed" fw={600}>{label}</Text>
      <Text fw={800} size="xl" c={color}>{formatNumber(value)}</Text>
    </Paper>
  );
}

function NamedDonut({ title, data }: { title: string; data: NamedValue[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <CategoricalFieldDonut
      field={{
        name: title,
        distribution: data.map((item) => ({ value: item.name, count: item.value })),
        topValue: data[0]?.name || "",
        topCount: data[0]?.value || 0,
        totalValues: total,
      }}
    />
  );
}

function BoxedBar({ title, data, color = "#228be6" }: { title: string; data: NamedValue[]; color?: string }) {
  const chartData = data.map((item) => ({ ...item, shortName: truncate(item.name, 34) }));
  return (
    <Paper withBorder radius="md" p="sm">
      <Text size="sm" fw={600} mb={6}>{title}</Text>
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 34)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
          <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
          <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Paper>
  );
}

// Barra horizontal apilada Tiempo completo/Medio tiempo (planta) vs Cátedra,
// para programas académicos o áreas de apoyo (Ciencias Básicas, Humanidades,
// etc.) — deja ver de un vistazo cuántos docentes de cada uno son de planta.
function DedicacionStackedBar({ title, data }: { title: string; data: DependenciaDetalle[] }) {
  if (data.length === 0) return null;
  const chartData = data.map((item) => ({
    name: item.nombre,
    shortName: truncate(item.nombre, 34),
    "Tiempo completo / Medio tiempo": item.tiempoCompleto,
    "Cátedra": item.catedra,
  }));
  return (
    <Box>
      <Text size="sm" fw={700} mb={4}>{title}</Text>
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 34) + 24}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="shortName" width={190} tick={{ fontSize: 11 }} />
          <ReTooltip
            formatter={(value: any) => [formatNumber(Number(value)), ""]}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Tiempo completo / Medio tiempo" stackId="dedicacion" fill="#228be6" />
          <Bar dataKey="Cátedra" stackId="dedicacion" fill="#fd7e14" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

const sortOtroLast = (data: NamedValue[]) => [...data].sort((a, b) => {
  const aOtro = a.name.trim().toLowerCase() === "otro";
  const bOtro = b.name.trim().toLowerCase() === "otro";
  if (aOtro !== bOtro) return aOtro ? 1 : -1;
  return b.value - a.value;
});

const BAR_COLORS = ["#228be6", "#7048e8", "#12b886", "#f76707", "#e64980", "#15aabf"];

function HojaAnalisisDetalle({ hoja }: { hoja: HojaDetalle }) {
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
      {hoja.desgloses.map((desglose, idx) => (
        desglose.type === "donut"
          ? <NamedDonut key={desglose.label} title={desglose.label} data={desglose.data} />
          : (
            <BoxedBar
              key={desglose.label}
              title={desglose.label}
              data={sortOtroLast(desglose.data)}
              color={BAR_COLORS[idx % BAR_COLORS.length]}
            />
          )
      ))}
    </SimpleGrid>
  );
}

// Seccion "Detalle por hoja" reutilizable: cada plantilla curada (Bienestar,
// Representacion Estudiantil, Publicaciones, SNIES, etc.) le pasa su propio
// arreglo de hojas y esta seccion arma el mismo Divider + tarjetas con
// desgloses, sin repetir el layout en cada Report.
function DetalleHojaSection({ hojas, titulo }: { hojas: HojaDetalle[]; titulo?: string }) {
  const visibles = hojas.filter((hoja) => hoja.totalRegistros > 0);
  if (visibles.length === 0) return null;
  return (
    <>
      <Divider label={titulo || "Detalle por hoja"} labelPosition="left" mt="xl" mb="md" />
      <Stack gap="lg">
        {visibles.map((hoja) => (
          <Paper key={hoja.nombre} withBorder radius="md" p="md">
            <Group gap="xs" mb="md">
              <Text fw={600} size="sm">{hoja.nombre}</Text>
              <Badge size="sm" variant="light" color="violet">
                {hoja.totalRegistros.toLocaleString("es-CO")} registros
              </Badge>
            </Group>
            <HojaAnalisisDetalle hoja={hoja} />
          </Paper>
        ))}
      </Stack>
    </>
  );
}

function ActividadBienestarReport({ report }: { report: ActividadBienestarAnalytics }) {
  const [dependenciaFiltro, setDependenciaFiltro] = useState<string | null>(null);
  const dependenciaOptions = report.porDependencia.map((d) => d.dependencia);
  const dependenciaSeleccionada = dependenciaFiltro
    ? report.porDependencia.find((d) => d.dependencia === dependenciaFiltro)
    : null;

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
            <Badge color="violet" variant="light">{report.nature}</Badge>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Análisis funcional de las cuatro hojas relacionadas</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Actividades únicas" value={report.totalActivities} />
        <MetricCard label="Beneficiarios registrados" value={report.registeredBeneficiaries} color="blue" />
        <MetricCard label="Participaciones" value={report.totalParticipations} color="cyan" />
        {report.hasGroupedBeneficiaries && (
          <MetricCard label="Beneficiarios agrupados" value={report.groupedBeneficiaries} color="teal" />
        )}
        <MetricCard label="Beneficiarios externos" value={report.externalBeneficiaries} color="orange" />
        <MetricCard label="Registros de recurso humano" value={report.humanResourceRecords} color="indigo" />
      </SimpleGrid>
      {report.hasGroupedBeneficiaries && (
        <Text size="xs" c="dimmed" mb="lg">
          Los beneficiarios registrados y los beneficiarios agrupados provienen de hojas distintas; se muestran separados para evitar duplicarlos.
        </Text>
      )}

      {report.activitiesByMonth.length > 1 && (
        <Paper withBorder radius="md" p="sm" mb="lg">
          <Text size="sm" fw={600} mb={6}>Actividades por mes (todas las hojas)</Text>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={report.activitiesByMonth} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Actividades"]} />
              <Line type="monotone" dataKey="value" stroke="#e64980" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {dependenciaOptions.length > 0 && (
        <>
          <Divider label="Filtrar por dependencia" labelPosition="left" mb="md" />
          <Select
            placeholder="Todas las dependencias"
            data={dependenciaOptions}
            value={dependenciaFiltro}
            onChange={setDependenciaFiltro}
            clearable
            searchable
            w={280}
            mb="md"
          />
          {dependenciaSeleccionada && (
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mb="lg">
              <MetricCard label="Actividades" value={dependenciaSeleccionada.actividades} />
              <MetricCard label="Beneficiarios" value={dependenciaSeleccionada.beneficiarios} color="blue" />
              <MetricCard label="Recurso humano" value={dependenciaSeleccionada.recursoHumano} color="indigo" />
            </SimpleGrid>
          )}
        </>
      )}

      <DetalleHojaSection
        hojas={dependenciaFiltro ? report.hojasPorDependencia[dependenciaFiltro] || [] : report.hojas}
        titulo={dependenciaFiltro ? `Detalle por hoja — ${dependenciaFiltro}` : "Detalle por hoja"}
      />
    </Paper>
  );
}

function RepresentacionEstudiantilReport({ report }: { report: RepresentacionEstudiantilAnalytics }) {
  const instanciaChartData = report.porInstancia.map((item) => ({
    ...item,
    shortName: truncate(item.name, 34),
  }));
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
            <Badge color="violet" variant="light">{report.dependencia}</Badge>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Periodo de electividad: {report.periodoElectividad}</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Registros" value={report.totalRegistros} />
        <MetricCard label="Comités / instancias" value={report.totalInstancias} color="blue" />
        <MetricCard label="Estudiantes representantes" value={report.totalEstudiantes} color="teal" />
        <MetricCard label="Programas académicos" value={report.totalProgramas} color="orange" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Principal vs. Suplente" data={report.porCandidato} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Representantes por programa académico</Text>
          <ResponsiveContainer width="100%" height={Math.max(210, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Representantes"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      <Box>
        <Text size="sm" fw={700} mb={4}>Representantes por comité / instancia</Text>
        <ResponsiveContainer width="100%" height={Math.max(210, instanciaChartData.length * 26)}>
          <BarChart data={instanciaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="shortName" width={220} tick={{ fontSize: 10 }} />
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Representantes"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
            <Bar dataKey="value" fill="#7048e8" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

function PublicacionesAutoresReport({ report }: { report: PublicacionesAutoresAnalytics }) {
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Publicaciones y sus autores internos/externos</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="lg">
        <MetricCard label="Publicaciones" value={report.totalPublicaciones} />
        <MetricCard label="Registros de autoría" value={report.totalRegistrosAutoria} color="blue" />
        <MetricCard label="Autores únicos identificados" value={report.totalAutoresUnicos} color="teal" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Publicaciones por tipo" data={report.porTipo} />
        <NamedDonut title="Autores: interno vs. externo" data={report.porOrigenAutor} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Publicaciones por dependencia" data={report.porDependencia} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Autores por programa académico</Text>
          <ResponsiveContainer width="100%" height={Math.max(210, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Autores"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      {report.publicacionesPorMes.length > 1 && (
        <Box>
          <Text size="sm" fw={700} mb={4}>Publicaciones por mes</Text>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={report.publicacionesPorMes} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Publicaciones"]} />
              <Line type="monotone" dataKey="value" stroke="#e64980" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
}

function DocentesHistoricoSniesReport({ report }: { report: DocentesHistoricoSniesAnalytics }) {
  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
            <Badge color="violet" variant="light">{report.anoInicio} - {report.anoFin}</Badge>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Fotografía del periodo más reciente: {report.periodoActual}</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Docentes histórico (2014-2024)" value={report.totalDocentesHistorico} />
        <MetricCard label={`Docentes en ${report.periodoActual}`} value={report.docentesPeriodoActual} color="blue" />
      </SimpleGrid>

      <Box mb="lg">
        <Text size="sm" fw={700} mb={4}>Docentes por periodo (semestre A/B)</Text>
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={report.docentesPorAno} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Docentes"]} />
            <Line type="monotone" dataKey="value" stroke="#7048e8" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </Box>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Dedicación (periodo actual)" data={report.dedicacionPeriodoActual} />
        <NamedDonut title="Escalafón (periodo actual)" data={report.escalafonPeriodoActual} />
      </SimpleGrid>

      <Box mb="lg">
        <NamedDonut title="Máximo nivel de formación (periodo actual)" data={report.nivelFormacionPeriodoActual} />
      </Box>

      <Stack gap="lg">
        <DedicacionStackedBar title="Docentes por programa académico (periodo actual, top 10)" data={report.programasPeriodoActual} />
        <DedicacionStackedBar title="Docentes por área de apoyo (periodo actual)" data={report.areasApoyoPeriodoActual} />
      </Stack>
    </Paper>
  );
}

function RutasAprendizajeHistoricoReport({ report }: { report: RutasAprendizajeHistoricoAnalytics }) {
  const rutasChartData = report.rutas.map((r) => ({
    name: r.ruta.length > 30 ? `${r.ruta.slice(0, 30)}…` : r.ruta,
    fullName: r.ruta,
    matriculados: r.matriculados,
  }));
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconRoute size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Estudiantes matriculados en rutas de aprendizaje</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Matriculados" value={report.totalMatriculados} />
        <MetricCard label="Estudiantes únicos" value={report.totalEstudiantesUnicos} color="blue" />
        <MetricCard label="Rutas activas" value={report.totalRutas} color="teal" />
        <MetricCard label="Insignias entregadas" value={report.totalInsigniasEntregadas} color="orange" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Box>
          <Text size="sm" fw={700} mb={4}>Matriculados por ruta</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, rutasChartData.length * 36)}>
            <BarChart data={rutasChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11 }} />
              <ReTooltip
                formatter={(value: any) => [formatNumber(Number(value)), "Matriculados"]}
                labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
              />
              <Bar dataKey="matriculados" fill="#7048e8" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <Box>
          <Text size="sm" fw={700} mb={4}>Matriculados por programa académico</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Matriculados"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
    </Paper>
  );
}

function PracticasAcademicasHistoricoReport({ report }: { report: PracticasAcademicasHistoricoAnalytics }) {
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));
  const sectorData = report.hojas.find((h) => h.nombre === "Empresas registradas")
    ?.desgloses.find((d) => d.label === "Por sector")?.data || [];

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconBriefcase size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Estudiantes en práctica académica</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Estudiantes en práctica" value={report.totalEstudiantes} />
        <MetricCard label="Empresas distintas" value={report.totalEmpresas} color="indigo" />
        {report.promedioLogro !== null && (
          <MetricCard label="Promedio de logro" value={Number(report.promedioLogro.toFixed(2))} color="teal" />
        )}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Por modalidad" data={report.porModalidad} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Estudiantes por programa académico</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estudiantes"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      {report.porEmpresaRegistrada.length > 0 && (
        <Box mb="lg">
          <Text size="sm" fw={700} mb={4}>Estudiantes en empresas registradas</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, report.porEmpresaRegistrada.length * 30)}>
            <BarChart data={report.porEmpresaRegistrada} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estudiantes"]} />
              <Bar dataKey="value" fill="#7048e8" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {sectorData.length > 0 && (
        <Box>
          <NamedDonut title="Empresas registradas por sector" data={sectorData} />
        </Box>
      )}
    </Paper>
  );
}

function EstrategiasCurricularesHistoricoReport({ report }: { report: EstrategiasCurricularesHistoricoAnalytics }) {
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 34),
  }));
  const comunidadChartData = report.porComunidadSectorExterno.map((item) => ({
    ...item,
    shortName: truncate(item.name, 34),
  }));
  const contribucionesData = report.hojas[0]?.desgloses.find((d) => d.label === "Contribuciones formativas")?.data || [];

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Estrategias curriculares por dependencia</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Estrategias" value={report.totalEstrategias} />
        <MetricCard label="Dependencias" value={report.totalProgramas} color="blue" />
        <MetricCard label="Participantes internos" value={report.totalParticipantesInternos} color="teal" />
        <MetricCard label="Participantes externos" value={report.totalParticipantesExternos} color="grape" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <Box>
          <Text size="sm" fw={700} mb={4}>Tipo de estrategia curricular</Text>
          <Stack gap={6}>
            {report.porTipo.map((item, idx) => {
              const total = report.porTipo.reduce((sum, t) => sum + t.value, 0);
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <Box key={item.name}>
                  <Group justify="space-between" gap="xs" mb={2}>
                    <Text size="xs" lineClamp={1}>{item.name}</Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{item.value} · {pct}%</Text>
                  </Group>
                  <Progress value={pct} color={DONUT_COLORS[idx % DONUT_COLORS.length]} size="sm" radius="xl" />
                </Box>
              );
            })}
          </Stack>
        </Box>
        <Box>
          <Text size="sm" fw={700} mb={4}>Enfoques y metodologías</Text>
          <Stack gap={6}>
            {report.porEnfoqueMetodologia.map((item, idx) => {
              const total = report.porEnfoqueMetodologia.reduce((sum, t) => sum + t.value, 0);
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <Box key={item.name}>
                  <Group justify="space-between" gap="xs" mb={2}>
                    <Text size="xs" lineClamp={1}>{item.name}</Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{item.value} · {pct}%</Text>
                  </Group>
                  <Progress value={pct} color={DONUT_COLORS[idx % DONUT_COLORS.length]} size="sm" radius="xl" />
                </Box>
              );
            })}
          </Stack>
        </Box>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Nacional vs. internacional" data={report.porNacionalInternacional} />
        <NamedDonut title="Función sustantiva" data={report.porFuncionSustantiva} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Dimensión de formación" data={report.porDimensionFormacion} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Estrategias por dependencia</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={190} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estrategias"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      {comunidadChartData.length > 0 && (
        <Box mb="lg">
          <Text size="sm" fw={700} mb={4}>Comunidad o sector externo vinculado</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, comunidadChartData.length * 28)}>
            <BarChart data={comunidadChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={190} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estrategias"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#e64980" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {contribucionesData.length > 0 && (
        <Box>
          <BoxedBar title="Contribuciones formativas" data={contribucionesData} color="#7048e8" />
        </Box>
      )}
    </Paper>
  );
}

function CapacitacionFuncionariosReport({ report }: { report: CapacitacionFuncionariosAnalytics }) {
  const cursoChartData = report.topCursos.map((item) => ({
    ...item,
    shortName: truncate(item.name, 34),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Capacitación y formación de funcionarios</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="lg">
        <MetricCard label="Capacitaciones" value={report.totalCapacitaciones} />
        <MetricCard label="Beneficiarios únicos" value={report.totalBeneficiariosUnicos} color="blue" />
        <MetricCard label="Horas cursadas" value={report.totalHorasCursadas} color="teal" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Tipo de capacitación" data={report.porTipoCapacitacion} />
        <NamedDonut title="Tipo de curso" data={report.porTipoCurso} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <BoxedBar title="Capacitaciones por programa académico (top 10)" data={report.porProgramaAcademico} color="#228be6" />
        <BoxedBar title="Capacitaciones por facultad" data={report.porAreaApoyo} color="#7048e8" />
      </SimpleGrid>

      <Box>
        <Text size="sm" fw={700} mb={4}>Cursos con mayor participación</Text>
        <ResponsiveContainer width="100%" height={Math.max(150, cursoChartData.length * 28)}>
          <BarChart data={cursoChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="shortName" width={210} tick={{ fontSize: 10 }} />
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
            <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

function ConveniosCooperacionReport({ report }: { report: ConveniosCooperacionAnalytics }) {
  const areaChartData = report.porAreaResponsable.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));
  const actividadData = report.hojas[0]?.desgloses.find((d) => d.label === "Actividades que cubre")?.data || [];

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Convenios de cooperación institucional</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Convenios" value={report.totalConvenios} />
        <MetricCard label="Activos" value={report.totalActivos} color="teal" />
        <MetricCard label="Usuarios beneficiados" value={report.totalUsuarios} color="blue" />
        <MetricCard label="Instituciones asociadas" value={report.totalInstitucionesAsociadas} color="indigo" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Tipo de convenio" data={report.porTipoConvenio} />
        <NamedDonut title="Académico vs. no académico" data={report.porAcademicoNoAcademico} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Origen: nacional vs. internacional" data={report.porOrigen} />
        <NamedDonut title="Alcance" data={report.porAlcance} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Box>
          <Text size="sm" fw={700} mb={4}>Por tipología</Text>
          <Stack gap={6}>
            {report.porTipologia.map((item, idx) => {
              const total = report.porTipologia.reduce((sum, t) => sum + t.value, 0);
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <Box key={item.name}>
                  <Group justify="space-between" gap="xs" mb={2}>
                    <Text size="xs" lineClamp={1}>{item.name}</Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{item.value} · {pct}%</Text>
                  </Group>
                  <Progress value={pct} color={DONUT_COLORS[idx % DONUT_COLORS.length]} size="sm" radius="xl" />
                </Box>
              );
            })}
          </Stack>
        </Box>
        <Box>
          <Text size="sm" fw={700} mb={4}>Por área responsable</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, areaChartData.length * 28)}>
            <BarChart data={areaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Convenios"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      {actividadData.length > 0 && (
        <Box mt="lg">
          <NamedDonut title="Actividades que cubre" data={actividadData} />
        </Box>
      )}
    </Paper>
  );
}

function EstimulosFuncionariosReport({ report }: { report: EstimulosFuncionariosAnalytics }) {
  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Estímulos otorgados a funcionarios</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="lg">
        <MetricCard label="Estímulos" value={report.totalEstimulos} />
        <MetricCard label="Funcionarios únicos" value={report.totalFuncionariosUnicos} color="blue" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Tipo de estímulo" data={report.porTipoEstimulo} />
        <NamedDonut title="Dependencia que reporta" data={report.porDependenciaQueReporta} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <BoxedBar title="Por programa académico beneficiario" data={report.porProgramaAcademico} color="#228be6" />
        <BoxedBar title="Por dependencia/área de apoyo beneficiaria" data={report.porAreaApoyo} color="#7048e8" />
      </SimpleGrid>
    </Paper>
  );
}

function OtrasEstrategiasReport({ report }: { report: OtrasEstrategiasAnalytics }) {
  const topChartData = report.topEstrategiasPorParticipantes.map((item) => ({
    name: item.name.length > 40 ? `${item.name.slice(0, 40)}…` : item.name,
    fullName: item.name,
    value: item.value,
  }));
  const enfoqueData = report.hojas[0]?.desgloses.find((d) => d.label === "Enfoques y contribuciones")?.data || [];

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Otras estrategias institucionales y sus participantes</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Estrategias" value={report.totalEstrategias} />
        <MetricCard label="Registros de participación" value={report.totalRegistrosParticipacion} color="cyan" />
        <MetricCard label="Participantes únicos" value={report.totalParticipantesUnicos} color="blue" />
        <MetricCard label="Cooperación nacional/internacional" value={report.cooperacionNacional + report.cooperacionInternacional} color="teal" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Por categoría" data={report.porCategoria} />
        <NamedDonut title="Por tipología" data={report.porTipologia} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Población impactada" data={report.porPoblacionImpactada} />
        <NamedDonut title="Comunidad o sector externo vinculado" data={report.porComunidadSectorExterno} />
      </SimpleGrid>

      <Box mb="lg">
        <NamedDonut title="Tiene alguno de los siguientes enfoques" data={report.porTipoEnfoque} />
      </Box>

      <Box>
        <Text size="sm" fw={700} mb={4}>Estrategias con más participantes</Text>
        <ResponsiveContainer width="100%" height={Math.max(150, topChartData.length * 34)}>
          <BarChart data={topChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={260} tick={{ fontSize: 10 }} />
            <ReTooltip
              formatter={(value: any) => [formatNumber(Number(value)), "Participantes"]}
              labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
            />
            <Bar dataKey="value" fill="#7048e8" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {enfoqueData.length > 0 && (
        <Box mt="lg">
          <BoxedBar title="Enfoques y contribuciones" data={enfoqueData} color="#12b886" />
        </Box>
      )}
    </Paper>
  );
}

function PazYRegionReport({ report }: { report: PazYRegionAnalytics }) {
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));
  const municipioChartData = report.topMunicipios.map((item) => ({ name: item.name, value: item.value }));
  const enfoqueData = report.hojas[0]?.desgloses.find((d) => d.label === "Enfoques y contribuciones")?.data || [];

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Estudiantes en proyectos de Semestre Paz y Región</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm" mb="lg">
        <MetricCard label="Registros" value={report.totalRegistros} />
        <MetricCard label="Estudiantes únicos" value={report.totalEstudiantesUnicos} color="blue" />
        <MetricCard label="Proyectos" value={report.totalProyectos} color="teal" />
        <MetricCard label="Entidades vinculadas" value={report.totalEntidadesVinculadas} color="indigo" />
        <MetricCard label="Asesores" value={report.totalAsesores} color="cyan" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Zona: urbana vs. rural" data={report.porZona} />
        <NamedDonut title="Por departamento" data={report.porDepartamento} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Línea del proyecto" data={report.porLineaProyecto} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Objetivo de Desarrollo Sostenible (ODS)</Text>
          <Stack gap={6}>
            {report.porOds.map((item, idx) => {
              const total = report.porOds.reduce((sum, t) => sum + t.value, 0);
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <Box key={item.name}>
                  <Group justify="space-between" gap="xs" mb={2}>
                    <Text size="xs" lineClamp={1}>{item.name}</Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{item.value} · {pct}%</Text>
                  </Group>
                  <Progress value={pct} color={DONUT_COLORS[idx % DONUT_COLORS.length]} size="sm" radius="xl" />
                </Box>
              );
            })}
          </Stack>
        </Box>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <Box>
          <Text size="sm" fw={700} mb={4}>Estudiantes por programa académico</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estudiantes"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <Box>
          <Text size="sm" fw={700} mb={4}>Municipios con más proyectos (top 10)</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, municipioChartData.length * 28)}>
            <BarChart data={municipioChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      <NamedDonut title="Tipo de entidad" data={report.porTipoEntidad} />

      {enfoqueData.length > 0 && (
        <Box mt="lg">
          <BoxedBar title="Enfoques y contribuciones" data={enfoqueData} color="#e64980" />
        </Box>
      )}
    </Paper>
  );
}

function GruposInvestigacionReport({ report }: { report: GruposInvestigacionAnalytics }) {
  const facultadChartData = report.porFacultad.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Grupos de investigación reconocidos</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="lg">
        <MetricCard label="Grupos" value={report.totalGrupos} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Clasificación Minciencias" data={report.porClasificacion} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Grupos por facultad</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, facultadChartData.length * 28)}>
            <BarChart data={facultadChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={190} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Grupos"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      {programaChartData.length > 0 && (
        <Box mb="lg">
          <Text size="sm" fw={700} mb={4}>Grupos por programa</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={190} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Grupos"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {report.porAnioCreacion.length > 0 && (
        <Box>
          <Text size="sm" fw={700} mb={4}>Grupos por año de creación</Text>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={report.porAnioCreacion} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Grupos"]} />
              <Bar dataKey="value" fill="#7048e8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
}

function LineasInvestigacionReport({ report }: { report: LineasInvestigacionAnalytics }) {
  const grupoChartData = report.porGrupo.map((item) => ({ name: item.name, value: item.value }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Líneas de investigación por grupo</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="lg">
        <MetricCard label="Líneas" value={report.totalLineas} />
        <MetricCard label="Grupos con líneas" value={report.totalGrupos} color="blue" />
      </SimpleGrid>

      <Box>
        <Text size="sm" fw={700} mb={4}>Líneas por grupo de investigación</Text>
        <ResponsiveContainer width="100%" height={Math.max(150, grupoChartData.length * 28)}>
          <BarChart data={grupoChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Líneas"]} />
            <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

function RedesInvestigacionReport({ report }: { report: RedesInvestigacionAnalytics }) {
  const institucionChartData = report.topInstituciones.map((item) => ({
    ...item,
    shortName: truncate(item.name, 34),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Investigadores vinculados a redes de investigación</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="lg">
        <MetricCard label="Registros" value={report.totalRegistros} />
        <MetricCard label="Investigadores únicos" value={report.totalInvestigadoresUnicos} color="blue" />
        <MetricCard label="Redes" value={report.totalRedes} color="teal" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg" mb="lg">
        <NamedDonut title="Por red" data={report.porRed} />
        <NamedDonut title="Profesores por red" data={report.profesoresPorRed} />
        <NamedDonut title="Por facultad" data={report.porFacultad} />
        <NamedDonut title="Por programa" data={report.porPrograma} />
      </SimpleGrid>

      <Box>
        <Text size="sm" fw={700} mb={4}>Instituciones vinculadas (top 10)</Text>
        <ResponsiveContainer width="100%" height={Math.max(150, institucionChartData.length * 28)}>
          <BarChart data={institucionChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="shortName" width={220} tick={{ fontSize: 10 }} />
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
            <Bar dataKey="value" fill="#7048e8" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

function SemillerosParticipantesReport({ report }: { report: SemillerosParticipantesAnalytics }) {
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));
  const semilleroChartData = report.topSemilleros.map((item) => ({ name: item.name, value: item.value }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Semilleros de investigación y sus participantes</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Semilleros" value={report.totalSemilleros} />
        <MetricCard label="Grupos con semilleros" value={report.totalGruposConSemilleros} color="indigo" />
        <MetricCard label="Registros de participación" value={report.totalParticipantes} color="cyan" />
        <MetricCard label="Estudiantes únicos" value={report.totalParticipantesUnicos} color="blue" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Box>
          <Text size="sm" fw={700} mb={4}>Semilleros con más participantes (top 10)</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, semilleroChartData.length * 28)}>
            <BarChart data={semilleroChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Participantes"]} />
              <Bar dataKey="value" fill="#7048e8" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <Box>
          <Text size="sm" fw={700} mb={4}>Participantes por programa académico</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Participantes"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
    </Paper>
  );
}

function TrabajoGradoReport({ report }: { report: TrabajoGradoAnalytics }) {
  const grupoChartData = report.porGrupo.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Trabajos de grado dirigidos</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="lg">
        <MetricCard label="Trabajos de grado" value={report.totalTrabajos} />
        <MetricCard label="Registros (estudiante-tesis)" value={report.totalRegistros} color="cyan" />
        <MetricCard label="Directores únicos" value={report.totalDirectoresUnicos} color="blue" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Por estado" data={report.porEstado} />
        <NamedDonut title="Por modalidad" data={report.porModalidad} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Por mención" data={report.porMencion} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Por grupo de investigación</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, grupoChartData.length * 28)}>
            <BarChart data={grupoChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      <Box>
        <Text size="sm" fw={700} mb={4}>Estudiantes por programa</Text>
        <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
          <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="shortName" width={220} tick={{ fontSize: 10 }} />
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estudiantes"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
            <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

function MovilidadReport({ report, titulo }: { report: MovilidadAnalytics; titulo: string }) {
  const paisChartData = report.porPais.map((item) => ({ name: item.name, value: item.value }));
  const institucionChartData = report.topInstituciones.map((item) => ({
    ...item,
    shortName: truncate(item.name, 34),
  }));
  const enfoqueData = report.hojas[0]?.desgloses.find((d) => d.label === "Enfoques y contribuciones")?.data || [];

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{displayFileName(report.fileName)}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>{titulo}</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="lg">
        <MetricCard label="Registros" value={report.totalRegistros} />
        <MetricCard label="Personas únicas" value={report.totalPersonasUnicas} color="blue" />
        <MetricCard label="Días de movilidad" value={report.totalDiasMovilidad} color="teal" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Nacional vs. internacional" data={report.porNacionalInternacional} />
        <NamedDonut title="Por modalidad" data={report.porModalidad} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        {report.porTipoMovilidad.length > 0 && (
          <Box>
            <Text size="sm" fw={700} mb={4}>Por tipo de movilidad</Text>
            <Stack gap={6}>
              {report.porTipoMovilidad.map((item, idx) => {
                const total = report.porTipoMovilidad.reduce((sum, t) => sum + t.value, 0);
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                return (
                  <Box key={item.name}>
                    <Group justify="space-between" gap="xs" mb={2}>
                      <Text size="xs" lineClamp={1}>{item.name}</Text>
                      <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{item.value} · {pct}%</Text>
                    </Group>
                    <Progress value={pct} color={DONUT_COLORS[idx % DONUT_COLORS.length]} size="sm" radius="xl" />
                  </Box>
                );
              })}
            </Stack>
          </Box>
        )}
        {paisChartData.length > 0 && (
          <Box>
            <Text size="sm" fw={700} mb={4}>Por país</Text>
            <ResponsiveContainer width="100%" height={Math.max(150, paisChartData.length * 26)}>
              <BarChart data={paisChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
                <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Box>
          <Text size="sm" fw={700} mb={4}>Por programa académico</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, report.porPrograma.length * 26)}>
            <BarChart
              data={report.porPrograma.map((item) => ({ ...item, shortName: truncate(item.name, 28) }))}
              layout="vertical"
              margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={170} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <Box>
          <Text size="sm" fw={700} mb={4}>Instituciones/eventos (top 10)</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, institucionChartData.length * 26)}>
            <BarChart data={institucionChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={220} tick={{ fontSize: 10 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? _label} />
              <Bar dataKey="value" fill="#7048e8" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      {enfoqueData.length > 0 && (
        <Box mt="lg">
          <BoxedBar title="Enfoques y contribuciones" data={enfoqueData} color="#f76707" />
        </Box>
      )}
    </Paper>
  );
}

// Tablero de estadisticas POR ÁMBITO: dentro de cada ámbito, desglosa el
// contenido real reportado por CADA PLANTILLA por separado (no todo
// mezclado), y destaca con resúmenes a la medida (stat cards + gráficas) los
// procesos que lo ameritan (Bienestar, Rutas de Aprendizaje, Prácticas).
export default function TableroPorAmbitoPage() {
  const router = useRouter();
  const { selectedPeriodId } = usePeriod();
  const [stats, setStats] = useState<DimensionStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAmbitoId, setSelectedAmbitoId] = useState<string | null>(null);
  // Cuando un ámbito reporta varias plantillas/archivos a la medida (ej. dos
  // reportes curados distintos), se recuerda cuál está filtrado por ámbito,
  // para no mezclar la selección entre ámbitos distintos.
  const [selectedReportByDimension, setSelectedReportByDimension] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/tablero-stats`, {
        params: selectedPeriodId ? { periodId: selectedPeriodId } : {},
      })
      .then((res) => {
        if (!active) return;
        const data: DimensionStats[] = res.data?.stats || [];
        // Se muestran TODOS los ámbitos, tengan o no información reportada
        // todavía (antes se ocultaban los que no tenían curación lista); los
        // que no tienen nada reportado quedan al final y su panel muestra el
        // mensaje "Sin información reportada todavía." al expandirlos.
        setStats([...data].sort((a, b) => b.totalRegistrosReportados - a.totalRegistrosReportados));
      })
      .catch(() => {
        if (active) setStats([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedPeriodId]);

  const ambitoOptions = useMemo(
    () => stats.map((s) => ({ value: s._id, label: s.name })),
    [stats]
  );

  const visibleStats = selectedAmbitoId
    ? stats.filter((s) => s._id === selectedAmbitoId)
    : stats;

  return (
    <Box style={{ display: "flex", minHeight: "100vh" }}>
      <ConsultaInfoSidebar />
      <Box style={{ flex: 1, padding: 20 }}>
        <Container size="xl">
          <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap" gap="md">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/historico-docentes/ambitos")}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon size={40} radius="xl" color="grape" variant="light">
                <IconLayoutDashboard size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Tablero de estadísticas</Title>
                <Text size="xs" c="dimmed">Consulta de Información — Tablero por Ámbito</Text>
              </div>
            </Group>

            {!loading && stats.length > 0 && (
              <Select
                placeholder="Filtrar por ámbito"
                data={ambitoOptions}
                value={selectedAmbitoId}
                onChange={setSelectedAmbitoId}
                clearable
                searchable
                w={260}
                maxDropdownHeight={400}
                comboboxProps={{ withinPortal: true }}
              />
            )}
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : stats.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">No hay ámbitos configurados todavía.</Text>
          ) : (
            <>
              <Accordion multiple defaultValue={[]} variant="separated" radius="md">
                {visibleStats.map((dimension) => {
                  const dependenciaChartData = dimension.curado
                    ? dimension.curado.porDependencia.slice(0, 10).map((d) => ({
                      name: d.dependencia.length > 26 ? `${d.dependencia.slice(0, 26)}…` : d.dependencia,
                      fullName: d.dependencia,
                      total: d.totalActividades,
                    }))
                    : [];

                  const rutasChartData = dimension.rutasAprendizaje
                    ? dimension.rutasAprendizaje.rutas.map((r) => ({
                      name: r.ruta.length > 26 ? `${r.ruta.slice(0, 26)}…` : r.ruta,
                      fullName: r.ruta,
                      matriculados: r.matriculados,
                      insignias: r.insignias,
                    }))
                    : [];

                  const empresasChartData = dimension.practicas
                    ? dimension.practicas.porEmpresa.map((e) => ({
                      name: e.empresa,
                      estudiantes: e.estudiantes,
                    }))
                    : [];

                  // Cuando un ámbito tiene uno o mas reportes a la medida
                  // (Bienestar, Representación Estudiantil, Publicaciones,
                  // Docentes Histórico SNIES), esos reportes reemplazan el
                  // desglose genérico por plantilla y las demás secciones
                  // curadas, en vez de mostrarse junto a ellas.
                  const hasSpecialReport = Boolean(
                    dimension.actividadBienestar
                    || dimension.representacionEstudiantil
                    || dimension.publicacionesAutores
                    || dimension.docentesHistoricoSnies
                    || dimension.rutasAprendizajeHistorico
                    || dimension.practicasAcademicasHistorico
                    || dimension.estrategiasCurricularesHistorico
                    || dimension.capacitacionFuncionarios
                    || dimension.conveniosCooperacion
                    || dimension.estimulosFuncionarios
                    || dimension.otrasEstrategias
                    || dimension.pazYRegion
                    || dimension.gruposInvestigacion
                    || dimension.lineasInvestigacion
                    || dimension.redesInvestigacion
                    || dimension.semillerosParticipantes
                    || dimension.trabajoGrado
                    || dimension.movilidadEntranteEstudiantes
                    || dimension.movilidadEntranteFuncionarios
                    || dimension.movilidadSalienteEstudiantes
                    || dimension.movilidadSalienteFuncionarios
                  );

                  const visiblePlantillas = hasSpecialReport
                    ? []
                    : dimension.plantillas;

                  const hasNothingToShow = !hasSpecialReport
                    && !dimension.curado
                    && !dimension.rutasAprendizaje
                    && !dimension.practicas
                    && visiblePlantillas.length === 0;

                  // Cada reporte a la medida corresponde a UN archivo/plantilla
                  // subido; cuando un ámbito tiene varios, se ofrece un filtro
                  // para ver uno a la vez en vez de todos apilados.
                  const specialReports: { key: string; label: string; node: ReactNode }[] = [];
                  if (dimension.actividadBienestar) {
                    specialReports.push({ key: "actividadBienestar", label: dimension.actividadBienestar.fileName, node: <ActividadBienestarReport report={dimension.actividadBienestar} /> });
                  }
                  if (dimension.representacionEstudiantil) {
                    specialReports.push({ key: "representacionEstudiantil", label: dimension.representacionEstudiantil.fileName, node: <RepresentacionEstudiantilReport report={dimension.representacionEstudiantil} /> });
                  }
                  if (dimension.docentesHistoricoSnies) {
                    specialReports.push({ key: "docentesHistoricoSnies", label: dimension.docentesHistoricoSnies.fileName, node: <DocentesHistoricoSniesReport report={dimension.docentesHistoricoSnies} /> });
                  }
                  if (dimension.publicacionesAutores) {
                    specialReports.push({ key: "publicacionesAutores", label: dimension.publicacionesAutores.fileName, node: <PublicacionesAutoresReport report={dimension.publicacionesAutores} /> });
                  }
                  if (dimension.rutasAprendizajeHistorico) {
                    specialReports.push({ key: "rutasAprendizajeHistorico", label: dimension.rutasAprendizajeHistorico.fileName, node: <RutasAprendizajeHistoricoReport report={dimension.rutasAprendizajeHistorico} /> });
                  }
                  if (dimension.practicasAcademicasHistorico) {
                    specialReports.push({ key: "practicasAcademicasHistorico", label: dimension.practicasAcademicasHistorico.fileName, node: <PracticasAcademicasHistoricoReport report={dimension.practicasAcademicasHistorico} /> });
                  }
                  if (dimension.estrategiasCurricularesHistorico) {
                    specialReports.push({ key: "estrategiasCurricularesHistorico", label: dimension.estrategiasCurricularesHistorico.fileName, node: <EstrategiasCurricularesHistoricoReport report={dimension.estrategiasCurricularesHistorico} /> });
                  }
                  if (dimension.capacitacionFuncionarios) {
                    specialReports.push({ key: "capacitacionFuncionarios", label: dimension.capacitacionFuncionarios.fileName, node: <CapacitacionFuncionariosReport report={dimension.capacitacionFuncionarios} /> });
                  }
                  if (dimension.conveniosCooperacion) {
                    specialReports.push({ key: "conveniosCooperacion", label: dimension.conveniosCooperacion.fileName, node: <ConveniosCooperacionReport report={dimension.conveniosCooperacion} /> });
                  }
                  if (dimension.estimulosFuncionarios) {
                    specialReports.push({ key: "estimulosFuncionarios", label: dimension.estimulosFuncionarios.fileName, node: <EstimulosFuncionariosReport report={dimension.estimulosFuncionarios} /> });
                  }
                  if (dimension.otrasEstrategias) {
                    specialReports.push({ key: "otrasEstrategias", label: dimension.otrasEstrategias.fileName, node: <OtrasEstrategiasReport report={dimension.otrasEstrategias} /> });
                  }
                  if (dimension.pazYRegion) {
                    specialReports.push({ key: "pazYRegion", label: dimension.pazYRegion.fileName, node: <PazYRegionReport report={dimension.pazYRegion} /> });
                  }
                  if (dimension.gruposInvestigacion) {
                    specialReports.push({ key: "gruposInvestigacion", label: dimension.gruposInvestigacion.fileName, node: <GruposInvestigacionReport report={dimension.gruposInvestigacion} /> });
                  }
                  if (dimension.lineasInvestigacion) {
                    specialReports.push({ key: "lineasInvestigacion", label: dimension.lineasInvestigacion.fileName, node: <LineasInvestigacionReport report={dimension.lineasInvestigacion} /> });
                  }
                  if (dimension.redesInvestigacion) {
                    specialReports.push({ key: "redesInvestigacion", label: dimension.redesInvestigacion.fileName, node: <RedesInvestigacionReport report={dimension.redesInvestigacion} /> });
                  }
                  if (dimension.semillerosParticipantes) {
                    specialReports.push({ key: "semillerosParticipantes", label: dimension.semillerosParticipantes.fileName, node: <SemillerosParticipantesReport report={dimension.semillerosParticipantes} /> });
                  }
                  if (dimension.trabajoGrado) {
                    specialReports.push({ key: "trabajoGrado", label: dimension.trabajoGrado.fileName, node: <TrabajoGradoReport report={dimension.trabajoGrado} /> });
                  }
                  if (dimension.movilidadEntranteEstudiantes) {
                    specialReports.push({ key: "movilidadEntranteEstudiantes", label: dimension.movilidadEntranteEstudiantes.fileName, node: <MovilidadReport report={dimension.movilidadEntranteEstudiantes} titulo="Movilidad entrante de estudiantes" /> });
                  }
                  if (dimension.movilidadEntranteFuncionarios) {
                    specialReports.push({ key: "movilidadEntranteFuncionarios", label: dimension.movilidadEntranteFuncionarios.fileName, node: <MovilidadReport report={dimension.movilidadEntranteFuncionarios} titulo="Movilidad entrante de funcionarios" /> });
                  }
                  if (dimension.movilidadSalienteEstudiantes) {
                    specialReports.push({ key: "movilidadSalienteEstudiantes", label: dimension.movilidadSalienteEstudiantes.fileName, node: <MovilidadReport report={dimension.movilidadSalienteEstudiantes} titulo="Movilidad saliente de estudiantes" /> });
                  }
                  if (dimension.movilidadSalienteFuncionarios) {
                    specialReports.push({ key: "movilidadSalienteFuncionarios", label: dimension.movilidadSalienteFuncionarios.fileName, node: <MovilidadReport report={dimension.movilidadSalienteFuncionarios} titulo="Movilidad saliente de funcionarios" /> });
                  }

                  const selectedReportKey = selectedReportByDimension[dimension._id] ?? null;
                  const visibleSpecialReports = specialReports.length > 1 && selectedReportKey
                    ? specialReports.filter((r) => r.key === selectedReportKey)
                    : specialReports;

                  return (
                    <Accordion.Item key={dimension._id} value={dimension._id}>
                      <Accordion.Control>
                        <Text fw={700} size="lg">{dimension.name}</Text>
                        <Text size="xs" c="dimmed" fw={400}>{getAmbitoDescription(dimension.name)}</Text>
                      </Accordion.Control>
                      <Accordion.Panel>

                      {hasNothingToShow && (
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          Sin información reportada todavía.
                        </Text>
                      )}

                      {specialReports.length > 1 && (
                        <Select
                          label="Filtrar por plantilla"
                          placeholder="Todas las plantillas"
                          data={specialReports.map((r) => ({ value: r.key, label: displayFileName(r.label) }))}
                          value={selectedReportKey}
                          onChange={(value) => setSelectedReportByDimension((prev) => ({ ...prev, [dimension._id]: value }))}
                          clearable
                          mb="md"
                          w={320}
                        />
                      )}

                      {visibleSpecialReports.map((r) => (
                        <Box key={r.key}>{r.node}</Box>
                      ))}

                      {dimension.curado && !hasSpecialReport && (
                        <Box mb="lg">
                          <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="md" mb="lg">
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="violet" variant="light" size={32} radius="xl"><IconCalendarEvent size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Actividades</Text>
                                  <Text fw={800} size="lg">{dimension.curado.totalActividades.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="indigo" variant="light" size={32} radius="xl"><IconUsers size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Recurso humano</Text>
                                  <Text fw={800} size="lg">{dimension.curado.totalRecursoHumano.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="blue" variant="light" size={32} radius="xl"><IconUsers size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Participantes</Text>
                                  <Text fw={800} size="lg">{dimension.curado.totalParticipantes.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="teal" variant="light" size={32} radius="xl"><IconHeartHandshake size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Beneficiarios</Text>
                                  <Text fw={800} size="lg">{dimension.curado.totalBeneficiarios.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="orange" variant="light" size={32} radius="xl"><IconTarget size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Personas impactadas</Text>
                                  <Text fw={800} size="lg">{dimension.curado.totalPersonasImpactadas.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                          </SimpleGrid>

                          <Box mb="lg">
                            <Text size="xs" fw={600} c="dimmed" mb={4}>Actividades por dependencia</Text>
                            <ResponsiveContainer width="100%" height={Math.max(140, dependenciaChartData.length * 32)}>
                              <BarChart data={dependenciaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                                <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11 }} />
                                <ReTooltip
                                  formatter={(value: any) => [value, "Actividades"]}
                                  labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
                                />
                                <Bar dataKey="total" fill="#7048e8" radius={[0, 6, 6, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </Box>

                          <Box>
                            <Text size="xs" fw={600} c="dimmed" mb={4}>
                              Actividades registradas ({dimension.curado.actividades.length})
                            </Text>
                            <ScrollArea h={320} type="auto">
                              <Table striped withTableBorder stickyHeader>
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th style={{ width: 140 }}>Código</Table.Th>
                                    <Table.Th>Descripción</Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {dimension.curado.actividades.map((actividad) => (
                                    <Table.Tr key={actividad.codigo}>
                                      <Table.Td style={{ whiteSpace: "nowrap" }}>{actividad.codigo}</Table.Td>
                                      <Table.Td>{actividad.descripcion}</Table.Td>
                                    </Table.Tr>
                                  ))}
                                </Table.Tbody>
                              </Table>
                            </ScrollArea>
                          </Box>
                        </Box>
                      )}

                      {dimension.rutasAprendizaje && !hasSpecialReport && (
                        <Box mb="lg">
                          <Group gap={6} mb="sm">
                            <ThemeIcon color="grape" variant="light" size={24} radius="xl"><IconRoute size={13} /></ThemeIcon>
                            <Text fw={700} size="sm">Rutas de aprendizaje</Text>
                          </Group>
                          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md" mb="md">
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="grape" variant="light" size={32} radius="xl"><IconUsers size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Matriculados</Text>
                                  <Text fw={800} size="lg">{dimension.rutasAprendizaje.totalMatriculados.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="teal" variant="light" size={32} radius="xl"><IconRoute size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Rutas activas</Text>
                                  <Text fw={800} size="lg">{dimension.rutasAprendizaje.totalRutas.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="orange" variant="light" size={32} radius="xl"><IconAward size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Insignias entregadas</Text>
                                  <Text fw={800} size="lg">{dimension.rutasAprendizaje.totalInsigniasEntregadas.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                          </SimpleGrid>
                          <Text size="xs" fw={600} c="dimmed" mb={4}>Matriculados por ruta</Text>
                          <ResponsiveContainer width="100%" height={Math.max(100, rutasChartData.length * 36)}>
                            <BarChart data={rutasChartData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                              <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11 }} />
                              <ReTooltip
                                formatter={(value: any, name: any) => [value, name === "matriculados" ? "Matriculados" : "Insignias"]}
                                labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
                              />
                              <Bar dataKey="matriculados" fill="#7048e8" radius={[0, 6, 6, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </Box>
                      )}

                      {dimension.practicas && !hasSpecialReport && (
                        <Box mb="lg">
                          <Group gap={6} mb="sm">
                            <ThemeIcon color="cyan" variant="light" size={24} radius="xl"><IconBriefcase size={13} /></ThemeIcon>
                            <Text fw={700} size="sm">Prácticas académicas</Text>
                          </Group>
                          <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="md" mb="md">
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="cyan" variant="light" size={32} radius="xl"><IconUsers size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Estudiantes en práctica</Text>
                                  <Text fw={800} size="lg">{dimension.practicas.totalEstudiantes.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="indigo" variant="light" size={32} radius="xl"><IconBriefcase size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Empresas vinculadas</Text>
                                  <Text fw={800} size="lg">{dimension.practicas.totalEmpresas.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                          </SimpleGrid>
                          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            <Box>
                              <Text size="xs" fw={600} c="dimmed" mb={4}>Estudiantes por empresa (top 10)</Text>
                              <ResponsiveContainer width="100%" height={Math.max(100, empresasChartData.length * 30)}>
                                <BarChart data={empresasChartData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                                  <ReTooltip formatter={(value: any) => [value, "Estudiantes"]} />
                                  <Bar dataKey="estudiantes" fill="#15aabf" radius={[0, 6, 6, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </Box>
                            {dimension.practicas.porModalidad.length > 0 && (
                              <Box>
                                <Text size="xs" fw={600} c="dimmed" mb={4}>Por modalidad</Text>
                                <Stack gap={6}>
                                  {dimension.practicas.porModalidad.map((m, idx) => {
                                    const pct = dimension.practicas!.totalEstudiantes > 0
                                      ? Math.round((m.estudiantes / dimension.practicas!.totalEstudiantes) * 100)
                                      : 0;
                                    return (
                                      <Box key={m.modalidad}>
                                        <Group justify="space-between" gap="xs" mb={2}>
                                          <Text size="xs" lineClamp={1}>{m.modalidad}</Text>
                                          <Text size="xs" c="dimmed">{m.estudiantes} · {pct}%</Text>
                                        </Group>
                                        <Progress value={pct} color={DONUT_COLORS[idx % DONUT_COLORS.length]} size="sm" radius="xl" />
                                      </Box>
                                    );
                                  })}
                                </Stack>
                              </Box>
                            )}
                          </SimpleGrid>
                        </Box>
                      )}

                      {visiblePlantillas.length > 0 && (
                        <Box>
                          <Group gap={6} mb="xs">
                            <IconFileSpreadsheet size={14} color="var(--mantine-color-gray-6)" />
                            <Text size="xs" fw={600} c="dimmed">Desglose por plantilla</Text>
                          </Group>
                          <Accordion
                            multiple
                            defaultValue={hasSpecialReport ? [] : visiblePlantillas.slice(0, 2).map((plantilla) => plantilla.templateId)}
                            variant="separated"
                            radius="md"
                          >
                            {visiblePlantillas.map((plantilla) => (
                              <Accordion.Item key={plantilla.templateId} value={plantilla.templateId}>
                                <Accordion.Control>
                                  <Group justify="space-between" wrap="nowrap" pr="sm">
                                    <Text size="sm" fw={600} lineClamp={1}>{plantilla.name}</Text>
                                    <Badge variant="light" color="blue" style={{ flexShrink: 0 }}>
                                      {plantilla.totalRegistros.toLocaleString("es-CO")} reg.
                                    </Badge>
                                  </Group>
                                </Accordion.Control>
                                <Accordion.Panel>
                                  <PlantillaPanel plantilla={plantilla} />
                                </Accordion.Panel>
                              </Accordion.Item>
                            ))}
                          </Accordion>
                        </Box>
                      )}

                      {!hasSpecialReport && dimension.timeline.length > 1 && (
                        <Box mt="lg">
                          <Text size="xs" fw={600} c="dimmed" mb={4}>Evolución del ámbito</Text>
                          <ResponsiveContainer width="100%" height={210}>
                            <LineChart data={dimension.timeline} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
                              <Line type="monotone" dataKey="totalRegistros" stroke="#228be6" strokeWidth={3} dot={{ r: 4 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </Box>
                      )}

                      <Divider my="sm" />
                      <Button
                        variant="subtle"
                        size="xs"
                        leftSection={<IconBuildingCommunity size={14} />}
                        onClick={() => router.push(`/historico-docentes/ambito/${dimension._id}?tab=plantillas`)}
                      >
                        Ver ámbito
                      </Button>
                      </Accordion.Panel>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            </>
          )}
        </Container>
      </Box>
    </Box>
  );
}
