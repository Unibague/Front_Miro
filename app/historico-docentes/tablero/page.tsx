"use client";

import { useEffect, useMemo, useState } from "react";
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
  IconChartBar,
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
  Tooltip as ReTooltip, PieChart, Pie, Cell, LineChart, Line,
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

interface ActividadBienestarAnalytics {
  fileId: string;
  fileName: string;
  nature: string;
  totalActivities: number;
  registeredBeneficiaries: number;
  totalParticipations: number;
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
  dependenciaPeriodoActual: NamedValue[];
  nivelFormacionPeriodoActual: NamedValue[];
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
  porSectorEmpresasRegistradas: NamedValue[];
}

// Resumen a la medida de Estrategias Curriculares (Estructura y Procesos
// Académicos).
interface EstrategiasCurricularesHistoricoAnalytics {
  fileId: string;
  fileName: string;
  totalEstrategias: number;
  totalProgramas: number;
  porTipo: NamedValue[];
  porNacionalInternacional: NamedValue[];
  porEnfoqueMetodologia: NamedValue[];
  porFuncionSustantiva: NamedValue[];
  porDimensionFormacion: NamedValue[];
  porPrograma: NamedValue[];
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
  porPrograma: NamedValue[];
  topCursos: NamedValue[];
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
}

// Resumen a la medida de Estímulos a Funcionarios (Gestión Institucional).
interface EstimulosFuncionariosAnalytics {
  fileId: string;
  fileName: string;
  totalEstimulos: number;
  totalFuncionariosUnicos: number;
  porTipoEstimulo: NamedValue[];
  porDependenciaQueReporta: NamedValue[];
  porPrograma: NamedValue[];
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
  topEstrategiasPorParticipantes: NamedValue[];
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
}

// Resumen a la medida de Grupos de Investigación (Investigación e Indagación).
interface GruposInvestigacionAnalytics {
  fileId: string;
  fileName: string;
  totalGrupos: number;
  porClasificacion: NamedValue[];
  porPrograma: NamedValue[];
}

// Resumen a la medida de Líneas de Investigación (Investigación e Indagación).
interface LineasInvestigacionAnalytics {
  fileId: string;
  fileName: string;
  totalLineas: number;
  totalGrupos: number;
  porGrupo: NamedValue[];
}

// Resumen a la medida de Redes de Investigación (Investigación e Indagación).
interface RedesInvestigacionAnalytics {
  fileId: string;
  fileName: string;
  totalRegistros: number;
  totalInvestigadoresUnicos: number;
  totalRedes: number;
  porRed: NamedValue[];
  porPrograma: NamedValue[];
  topInstituciones: NamedValue[];
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
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

function ActividadBienestarReport({ report }: { report: ActividadBienestarAnalytics }) {
  const categoryChartData = report.activitiesByCategory.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));
  const humanCategoryData = report.humanResourcesByCategory.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{report.fileName}</Text>
            <Badge color="violet" variant="light">{report.nature}</Badge>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Análisis funcional de las cuatro hojas relacionadas</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Actividades únicas" value={report.totalActivities} />
        <MetricCard label="Beneficiarios registrados" value={report.registeredBeneficiaries} color="blue" />
        <MetricCard label="Participaciones" value={report.totalParticipations} color="cyan" />
        <MetricCard label="Beneficiarios agrupados" value={report.groupedBeneficiaries} color="teal" />
        <MetricCard label="Beneficiarios externos" value={report.externalBeneficiaries} color="orange" />
        <MetricCard label="Registros de recurso humano" value={report.humanResourceRecords} color="indigo" />
      </SimpleGrid>
      <Text size="xs" c="dimmed" mb="lg">
        Los beneficiarios registrados y los beneficiarios agrupados provienen de hojas distintas; se muestran separados para evitar duplicarlos.
      </Text>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Actividades por unidad responsable" data={report.activitiesByUnit} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Actividades por categoría</Text>
          <ResponsiveContainer width="100%" height={Math.max(210, categoryChartData.length * 34)}>
            <BarChart data={categoryChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Actividades"]} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" my="lg">
        <NamedDonut title="Beneficiarios por tipo" data={report.beneficiariesByType} />
        <NamedDonut title="Beneficiarios por unidad" data={report.beneficiariesByUnit} />
      </SimpleGrid>

      <Divider label="Recurso humano" labelPosition="left" my="lg" />
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Recurso humano por unidad" data={report.humanResourcesByUnit} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Recurso humano por categoría de actividad</Text>
          <ResponsiveContainer width="100%" height={Math.max(210, humanCategoryData.length * 34)}>
            <BarChart data={humanCategoryData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      {report.activitiesByMonth.length > 1 && (
        <Box mt="lg">
          <Text size="sm" fw={700} mb={4}>Actividades iniciadas por mes</Text>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={report.activitiesByMonth} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Actividades"]} />
              <Line type="monotone" dataKey="value" stroke="#e64980" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
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
            <Text fw={800}>{report.fileName}</Text>
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Representantes"]} />
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
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Representantes"]} />
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
            <Text fw={800}>{report.fileName}</Text>
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Autores"]} />
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
  const dependenciaChartData = report.dependenciaPeriodoActual.map((item) => ({
    ...item,
    shortName: truncate(item.name, 34),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{report.fileName}</Text>
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
        <Text size="sm" fw={700} mb={4}>Docentes distintos por año</Text>
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

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <NamedDonut title="Máximo nivel de formación (periodo actual)" data={report.nivelFormacionPeriodoActual} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Docentes por dependencia (periodo actual, top 10)</Text>
          <ResponsiveContainer width="100%" height={Math.max(210, dependenciaChartData.length * 28)}>
            <BarChart data={dependenciaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={190} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Docentes"]} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
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
            <Text fw={800}>{report.fileName}</Text>
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Matriculados"]} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
    </Paper>
  );
}

function PracticasAcademicasHistoricoReport({ report }: { report: PracticasAcademicasHistoricoAnalytics }) {
  const empresaChartData = report.porEmpresa.map((item) => ({ name: item.name, value: item.value }));
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconBriefcase size={20} color="#7048e8" />
            <Text fw={800}>{report.fileName}</Text>
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estudiantes"]} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      <Box>
        <Text size="sm" fw={700} mb={4}>Estudiantes por empresa (top 10)</Text>
        <ResponsiveContainer width="100%" height={Math.max(150, empresaChartData.length * 30)}>
          <BarChart data={empresaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estudiantes"]} />
            <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

function EstrategiasCurricularesHistoricoReport({ report }: { report: EstrategiasCurricularesHistoricoAnalytics }) {
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 34),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{report.fileName}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Estrategias curriculares por dependencia</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Estrategias" value={report.totalEstrategias} />
        <MetricCard label="Dependencias" value={report.totalProgramas} color="blue" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Nacional vs. internacional" data={report.porNacionalInternacional} />
        <NamedDonut title="Función sustantiva" data={report.porFuncionSustantiva} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Dimensión de formación" data={report.porDimensionFormacion} />
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
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
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
        <Box>
          <Text size="sm" fw={700} mb={4}>Estrategias por dependencia</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={190} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estrategias"]} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
    </Paper>
  );
}

function CapacitacionFuncionariosReport({ report }: { report: CapacitacionFuncionariosAnalytics }) {
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));
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
            <Text fw={800}>{report.fileName}</Text>
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
        <NamedDonut title="Interna vs. externa" data={report.porTipoCapacitacion} />
        <NamedDonut title="Tipo de curso" data={report.porTipoCurso} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Box>
          <Text size="sm" fw={700} mb={4}>Capacitaciones por programa académico</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={190} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Capacitaciones"]} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <Box>
          <Text size="sm" fw={700} mb={4}>Cursos más tomados</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, cursoChartData.length * 28)}>
            <BarChart data={cursoChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={210} tick={{ fontSize: 10 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
    </Paper>
  );
}

function ConveniosCooperacionReport({ report }: { report: ConveniosCooperacionAnalytics }) {
  const areaChartData = report.porAreaResponsable.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{report.fileName}</Text>
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Convenios"]} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
    </Paper>
  );
}

function EstimulosFuncionariosReport({ report }: { report: EstimulosFuncionariosAnalytics }) {
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
            <Text fw={800}>{report.fileName}</Text>
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

      <Box>
        <Text size="sm" fw={700} mb={4}>Por programa académico beneficiario</Text>
        <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
          <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="shortName" width={190} tick={{ fontSize: 11 }} />
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estímulos"]} />
            <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

function OtrasEstrategiasReport({ report }: { report: OtrasEstrategiasAnalytics }) {
  const topChartData = report.topEstrategiasPorParticipantes.map((item) => ({
    name: item.name.length > 40 ? `${item.name.slice(0, 40)}…` : item.name,
    fullName: item.name,
    value: item.value,
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{report.fileName}</Text>
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
    </Paper>
  );
}

function PazYRegionReport({ report }: { report: PazYRegionAnalytics }) {
  const programaChartData = report.porPrograma.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));
  const municipioChartData = report.topMunicipios.map((item) => ({ name: item.name, value: item.value }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{report.fileName}</Text>
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Estudiantes"]} />
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
    </Paper>
  );
}

function GruposInvestigacionReport({ report }: { report: GruposInvestigacionAnalytics }) {
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
            <Text fw={800}>{report.fileName}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Grupos de investigación reconocidos</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="lg">
        <MetricCard label="Grupos" value={report.totalGrupos} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <NamedDonut title="Clasificación Minciencias" data={report.porClasificacion} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Grupos por dependencia del director</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
            <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={190} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Grupos"]} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
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
            <Text fw={800}>{report.fileName}</Text>
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
            <Text fw={800}>{report.fileName}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Investigadores vinculados a redes de investigación</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="lg">
        <MetricCard label="Registros" value={report.totalRegistros} />
        <MetricCard label="Investigadores únicos" value={report.totalInvestigadoresUnicos} color="blue" />
        <MetricCard label="Redes" value={report.totalRedes} color="teal" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Por red" data={report.porRed} />
        <NamedDonut title="Por dependencia del investigador" data={report.porPrograma} />
      </SimpleGrid>

      <Box>
        <Text size="sm" fw={700} mb={4}>Instituciones vinculadas (top 10)</Text>
        <ResponsiveContainer width="100%" height={Math.max(150, institucionChartData.length * 28)}>
          <BarChart data={institucionChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="shortName" width={220} tick={{ fontSize: 10 }} />
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
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
            <Text fw={800}>{report.fileName}</Text>
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Participantes"]} />
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
            <Text fw={800}>{report.fileName}</Text>
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      <Box>
        <Text size="sm" fw={700} mb={4}>Por dependencia del director</Text>
        <ResponsiveContainer width="100%" height={Math.max(150, programaChartData.length * 28)}>
          <BarChart data={programaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="shortName" width={220} tick={{ fontSize: 10 }} />
            <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
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

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{report.fileName}</Text>
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
        <Box>
          <Text size="sm" fw={700} mb={4}>Por país (código)</Text>
          <ResponsiveContainer width="100%" height={Math.max(150, paisChartData.length * 26)}>
            <BarChart data={paisChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
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
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
              <Bar dataKey="value" fill="#7048e8" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
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
        // A pedido explicito: mientras se termina de curar el resto de
        // ambitos, el tablero solo muestra estos dos.
        const visibleDimensions = data.filter((dimension) => {
          const name = dimension.name.toUpperCase();
          return name.includes("BIENESTAR INSTITUCIONAL")
            || name.includes("COMUNIDAD DE ESTUDIANTES")
            || name.includes("COMUNIDAD DE PROFESORES")
            || name.includes("ESTRUCTURA Y PROCESOS ACADÉMICOS")
            || name.includes("ESTRUCTURA Y PROCESOS ACADEMICOS")
            || name.includes("GESTIÓN INSTITUCIONAL")
            || name.includes("GESTION INSTITUCIONAL")
            || name.includes("INTERACCION CON EL ENTORNO")
            || name.includes("INTERACCIÓN CON EL ENTORNO")
            || name.includes("INVESTIGACIÓN E INDAGACIÓN")
            || name.includes("INVESTIGACION E INDAGACION")
            || name.includes("VISIBILIDAD REGIONAL");
        });
        setStats(visibleDimensions.sort((a, b) => b.totalRegistrosReportados - a.totalRegistrosReportados));
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

  const barDataByAmbito = useMemo(
    () => stats.map((s) => ({
      name: s.name.length > 18 ? `${s.name.slice(0, 18)}…` : s.name,
      fullName: s.name,
      registros: s.totalRegistrosReportados,
    })),
    [stats]
  );

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
                <Title order={3}>Consulta de Información</Title>
                <Text size="xs" c="dimmed">Tablero por Ámbito</Text>
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
              />
            )}
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : stats.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">No hay ámbitos configurados todavía.</Text>
          ) : (
            <>
              <Paper withBorder radius="md" p="md" mb="lg">
                <Group gap="xs" mb="sm">
                  <ThemeIcon color="blue" variant="light" size={26} radius="xl"><IconChartBar size={14} /></ThemeIcon>
                  <Text fw={700} size="sm">Registros reportados por ámbito</Text>
                </Group>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barDataByAmbito} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <ReTooltip
                      formatter={(value: any) => [Number(value).toLocaleString("es-CO"), "Registros"]}
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
                    />
                    <Bar dataKey="registros" fill={BLUE} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>

              <Stack gap="md">
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

                  // Cada reporte a la medida aporta su propio numero
                  // "resumen" para el encabezado del ámbito; se evalua en
                  // orden y se usa el primero que aplique.
                  const headerSummary = [
                    dimension.actividadBienestar && `${dimension.actividadBienestar.totalActivities.toLocaleString("es-CO")} actividades`,
                    dimension.representacionEstudiantil && `${dimension.representacionEstudiantil.totalRegistros.toLocaleString("es-CO")} reg.`,
                    dimension.docentesHistoricoSnies && `${dimension.docentesHistoricoSnies.docentesPeriodoActual.toLocaleString("es-CO")} docentes`,
                    dimension.publicacionesAutores && `${dimension.publicacionesAutores.totalPublicaciones.toLocaleString("es-CO")} publicaciones`,
                    dimension.rutasAprendizajeHistorico && `${dimension.rutasAprendizajeHistorico.totalMatriculados.toLocaleString("es-CO")} matriculados`,
                    dimension.practicasAcademicasHistorico && `${dimension.practicasAcademicasHistorico.totalEstudiantes.toLocaleString("es-CO")} en práctica`,
                    dimension.estrategiasCurricularesHistorico && `${dimension.estrategiasCurricularesHistorico.totalEstrategias.toLocaleString("es-CO")} estrategias`,
                    dimension.capacitacionFuncionarios && `${dimension.capacitacionFuncionarios.totalCapacitaciones.toLocaleString("es-CO")} capacitaciones`,
                    dimension.conveniosCooperacion && `${dimension.conveniosCooperacion.totalConvenios.toLocaleString("es-CO")} convenios`,
                    dimension.estimulosFuncionarios && `${dimension.estimulosFuncionarios.totalEstimulos.toLocaleString("es-CO")} estímulos`,
                    dimension.otrasEstrategias && `${dimension.otrasEstrategias.totalEstrategias.toLocaleString("es-CO")} estrategias`,
                    dimension.pazYRegion && `${dimension.pazYRegion.totalRegistros.toLocaleString("es-CO")} reg.`,
                    dimension.gruposInvestigacion && `${dimension.gruposInvestigacion.totalGrupos.toLocaleString("es-CO")} grupos`,
                    dimension.lineasInvestigacion && `${dimension.lineasInvestigacion.totalLineas.toLocaleString("es-CO")} líneas`,
                    dimension.redesInvestigacion && `${dimension.redesInvestigacion.totalRegistros.toLocaleString("es-CO")} reg.`,
                    dimension.semillerosParticipantes && `${dimension.semillerosParticipantes.totalSemilleros.toLocaleString("es-CO")} semilleros`,
                    dimension.trabajoGrado && `${dimension.trabajoGrado.totalTrabajos.toLocaleString("es-CO")} trabajos`,
                    dimension.movilidadEntranteEstudiantes && `${dimension.movilidadEntranteEstudiantes.totalRegistros.toLocaleString("es-CO")} reg.`,
                    dimension.movilidadEntranteFuncionarios && `${dimension.movilidadEntranteFuncionarios.totalRegistros.toLocaleString("es-CO")} reg.`,
                    dimension.movilidadSalienteEstudiantes && `${dimension.movilidadSalienteEstudiantes.totalRegistros.toLocaleString("es-CO")} reg.`,
                    dimension.movilidadSalienteFuncionarios && `${dimension.movilidadSalienteFuncionarios.totalRegistros.toLocaleString("es-CO")} reg.`,
                  ].find(Boolean) || `${dimension.totalRegistrosReportados.toLocaleString("es-CO")} reg.`;

                  const visiblePlantillas = hasSpecialReport
                    ? []
                    : dimension.plantillas;

                  const hasNothingToShow = !hasSpecialReport
                    && !dimension.curado
                    && !dimension.rutasAprendizaje
                    && !dimension.practicas
                    && visiblePlantillas.length === 0;

                  return (
                    <Paper key={dimension._id} withBorder radius="md" p="md">
                      <Group justify="space-between" align="center" mb="md">
                        <Text fw={700} size="lg">{dimension.name}</Text>
                        <Text fw={800} size="lg" c="violet" style={{ whiteSpace: "nowrap" }}>
                          {headerSummary}
                        </Text>
                      </Group>

                      {hasNothingToShow && (
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          Sin información reportada todavía.
                        </Text>
                      )}

                      {dimension.actividadBienestar && (
                        <ActividadBienestarReport report={dimension.actividadBienestar} />
                      )}

                      {dimension.representacionEstudiantil && (
                        <RepresentacionEstudiantilReport report={dimension.representacionEstudiantil} />
                      )}

                      {dimension.docentesHistoricoSnies && (
                        <DocentesHistoricoSniesReport report={dimension.docentesHistoricoSnies} />
                      )}

                      {dimension.publicacionesAutores && (
                        <PublicacionesAutoresReport report={dimension.publicacionesAutores} />
                      )}

                      {dimension.rutasAprendizajeHistorico && (
                        <RutasAprendizajeHistoricoReport report={dimension.rutasAprendizajeHistorico} />
                      )}

                      {dimension.practicasAcademicasHistorico && (
                        <PracticasAcademicasHistoricoReport report={dimension.practicasAcademicasHistorico} />
                      )}

                      {dimension.estrategiasCurricularesHistorico && (
                        <EstrategiasCurricularesHistoricoReport report={dimension.estrategiasCurricularesHistorico} />
                      )}

                      {dimension.capacitacionFuncionarios && (
                        <CapacitacionFuncionariosReport report={dimension.capacitacionFuncionarios} />
                      )}

                      {dimension.conveniosCooperacion && (
                        <ConveniosCooperacionReport report={dimension.conveniosCooperacion} />
                      )}

                      {dimension.estimulosFuncionarios && (
                        <EstimulosFuncionariosReport report={dimension.estimulosFuncionarios} />
                      )}

                      {dimension.otrasEstrategias && (
                        <OtrasEstrategiasReport report={dimension.otrasEstrategias} />
                      )}

                      {dimension.pazYRegion && (
                        <PazYRegionReport report={dimension.pazYRegion} />
                      )}

                      {dimension.gruposInvestigacion && (
                        <GruposInvestigacionReport report={dimension.gruposInvestigacion} />
                      )}

                      {dimension.lineasInvestigacion && (
                        <LineasInvestigacionReport report={dimension.lineasInvestigacion} />
                      )}

                      {dimension.redesInvestigacion && (
                        <RedesInvestigacionReport report={dimension.redesInvestigacion} />
                      )}

                      {dimension.semillerosParticipantes && (
                        <SemillerosParticipantesReport report={dimension.semillerosParticipantes} />
                      )}

                      {dimension.trabajoGrado && (
                        <TrabajoGradoReport report={dimension.trabajoGrado} />
                      )}

                      {dimension.movilidadEntranteEstudiantes && (
                        <MovilidadReport report={dimension.movilidadEntranteEstudiantes} titulo="Movilidad entrante de estudiantes" />
                      )}

                      {dimension.movilidadEntranteFuncionarios && (
                        <MovilidadReport report={dimension.movilidadEntranteFuncionarios} titulo="Movilidad entrante de funcionarios" />
                      )}

                      {dimension.movilidadSalienteEstudiantes && (
                        <MovilidadReport report={dimension.movilidadSalienteEstudiantes} titulo="Movilidad saliente de estudiantes" />
                      )}

                      {dimension.movilidadSalienteFuncionarios && (
                        <MovilidadReport report={dimension.movilidadSalienteFuncionarios} titulo="Movilidad saliente de funcionarios" />
                      )}

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
                    </Paper>
                  );
                })}
              </Stack>
            </>
          )}
        </Container>
      </Box>
    </Box>
  );
}
