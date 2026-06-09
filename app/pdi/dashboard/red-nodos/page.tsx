"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Container,
  Grid,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconNetwork,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import PdiSidebar from "../../components/PdiSidebar";
import { usePdiConfig } from "../../hooks/usePdiConfig";
import { PDI_ROUTES } from "../../api";
import type { PdiNetworkEdge, PdiNetworkNode, PdiNetworkResponse, PdiNodeIntensity } from "../../types";

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 760;

const MACRO_COLORS: Record<string, { fill: string; stroke: string; soft: string }> = {
  M1: { fill: "#2563eb", stroke: "#1d4ed8", soft: "#dbeafe" },
  M2: { fill: "#0f766e", stroke: "#0f5f59", soft: "#ccfbf1" },
  M3: { fill: "#b45309", stroke: "#92400e", soft: "#fef3c7" },
  M4: { fill: "#be123c", stroke: "#9f1239", soft: "#ffe4e6" },
  M5: { fill: "#7c3aed", stroke: "#6d28d9", soft: "#ede9fe" },
};

const DEFAULT_MACRO_COLOR = { fill: "#475569", stroke: "#334155", soft: "#e2e8f0" };

const SCORE_BY_INTENSITY: Record<PdiNodeIntensity, 1 | 3 | 5> = {
  Baja: 1,
  Media: 3,
  Alta: 5,
};

type PositionedNode = PdiNetworkNode & { x: number; y: number };

type NewEdgeDraft = {
  origen: string;
  destino: string;
  tipo_relacion: string;
  intensidad: PdiNodeIntensity;
};

function macroColor(macro: string) {
  return MACRO_COLORS[macro] ?? DEFAULT_MACRO_COLOR;
}

function relationColor(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("complement")) return "#0f766e";
  if (normalized.includes("depend")) return "#b45309";
  if (normalized.includes("solap")) return "#be123c";
  return "#2563eb";
}

function intensityWidth(score: number) {
  if (score >= 5) return 3.2;
  if (score >= 3) return 1.8;
  return 0.8;
}

function nodeRadius(node: PositionedNode) {
  return 24 + Math.min(7, Math.max(0, node.total_relaciones ?? 0));
}

function shortText(value: string, max = 26) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 3))}...`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function svgSafeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

const MACRO_MANTINE_COLORS: Record<string, string> = {
  M1: "blue", M2: "teal", M3: "orange", M4: "red", M5: "violet",
};
function macroMantineColor(macro: string) {
  return MACRO_MANTINE_COLORS[macro] ?? "gray";
}

function prioridadColor(prioridad: string) {
  const p = (prioridad ?? "").toLowerCase();
  if (p.includes("alta")) return "red";
  if (p.includes("media")) return "blue";
  return "gray";
}

function nivelColor(nivel: string) {
  const n = (nivel ?? "").toLowerCase();
  if (n.includes("alta") || n === "alto") return "red";
  if (n.includes("media") || n === "medio") return "yellow";
  return "gray";
}

function lecturaRapida(prioridad: string) {
  const p = (prioridad ?? "").toLowerCase();
  if (p.includes("alta")) return "Requiere articulación alta – seguimiento prioritario";
  if (p.includes("media")) return "Coordinación moderada – articular en seguimiento PDI";
  return "Baja necesidad de articulación – monitoreo periódico";
}

function layoutNodes(nodes: PdiNetworkNode[]): PositionedNode[] {
  const allHavePosition = nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
  if (allHavePosition) {
    return nodes.map((node) => ({
      ...node,
      x: Number(node.x),
      y: Number(node.y),
    }));
  }

  const groups = new Map<string, PdiNetworkNode[]>();
  for (const node of nodes) {
    const key = node.macro_codigo || "PDI";
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }

  const macroEntries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  const centerX = VIEWBOX_WIDTH / 2;
  const centerY = VIEWBOX_HEIGHT / 2;
  const macroRadiusX = 380;
  const macroRadiusY = 255;

  return macroEntries.flatMap(([macro, macroNodes], macroIndex) => {
    const macroAngle = -Math.PI / 2 + (macroIndex * Math.PI * 2) / Math.max(1, macroEntries.length);
    const groupCenterX = centerX + Math.cos(macroAngle) * macroRadiusX;
    const groupCenterY = centerY + Math.sin(macroAngle) * macroRadiusY;
    const localRadius = macroNodes.length <= 2 ? 54 : 72;

    return macroNodes
      .sort((a, b) => a.codigo.localeCompare(b.codigo, "es"))
      .map((node, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, macroNodes.length);
        return {
          ...node,
          macro_codigo: node.macro_codigo || macro,
          x: clamp(groupCenterX + Math.cos(angle) * localRadius, 80, VIEWBOX_WIDTH - 80),
          y: clamp(groupCenterY + Math.sin(angle) * localRadius, 70, VIEWBOX_HEIGHT - 95),
        };
      });
  });
}

function edgePath(edge: PdiNetworkEdge, source: PositionedNode, target: PositionedNode) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const sourceRadius = nodeRadius(source) + 6;
  const targetRadius = nodeRadius(target) + 12;
  const startX = source.x + (dx / length) * sourceRadius;
  const startY = source.y + (dy / length) * sourceRadius;
  const endX = target.x - (dx / length) * targetRadius;
  const endY = target.y - (dy / length) * targetRadius;
  const direction = edge.origen.localeCompare(edge.destino, "es") > 0 ? -1 : 1;
  const curve = direction * Math.min(64, Math.max(18, length * 0.11));
  const normalX = -dy / length;
  const normalY = dx / length;
  const controlX = (startX + endX) / 2 + normalX * curve;
  const controlY = (startY + endY) / 2 + normalY * curve;

  return {
    d: `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`,
    labelX: controlX,
    labelY: controlY,
  };
}


export default function PdiNodeNetworkPage() {
  const router = useRouter();
  const { config } = usePdiConfig();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const didMoveRef = useRef(false);

  const [network, setNetwork] = useState<PdiNetworkResponse | null>(null);
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [edges, setEdges] = useState<PdiNetworkEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [macroFilter, setMacroFilter] = useState<string>("all");
  const [intensityFilter, setIntensityFilter] = useState<string>("all");
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [newEdge, setNewEdge] = useState<NewEdgeDraft>({
    origen: "",
    destino: "",
    tipo_relacion: "Habilitadora",
    intensidad: "Media",
  });

  const loadNetwork = async () => {
    setLoading(true);
    try {
      const res = await axios.get<PdiNetworkResponse>(PDI_ROUTES.dashboardRedNodos());
      setNetwork(res.data);
      setNodes(layoutNodes(res.data.nodes));
      setEdges(res.data.edges);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setDirty(false);
    } catch (error) {
      console.error(error);
      showNotification({ title: "Error", message: "No se pudo cargar la red de nodos", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNetwork();
  }, []);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const edgeById = useMemo(() => new Map(edges.map((edge) => [edge.id, edge])), [edges]);

  const macroOptions = useMemo(() => {
    const macros = new Map<string, string>();
    for (const node of nodes) {
      if (node.macro_codigo) macros.set(node.macro_codigo, node.macro_nombre || node.macro_codigo);
    }
    return [
      { value: "all", label: "Todos" },
      ...[...macros.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "es"))
        .map(([codigo, nombre]) => ({ value: codigo, label: `${codigo} - ${nombre}` })),
    ];
  }, [nodes]);

  const relationTypeOptions = useMemo(() => {
    const types = new Set<string>(network?.catalogos.tipos_relacion ?? []);
    edges.forEach((edge) => types.add(edge.tipo_relacion));
    return [...types].sort((a, b) => a.localeCompare(b, "es"));
  }, [edges, network]);

  const nodeOptions = useMemo(
    () => nodes.map((node) => ({ value: node.id, label: `${node.codigo} - ${node.nombre}` })),
    [nodes]
  );

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId ? edgeById.get(selectedEdgeId) ?? null : null;

  const visibleData = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesSearch = (node: PositionedNode) => {
      if (!query) return true;
      return `${node.codigo} ${node.nombre} ${node.macro_codigo} ${node.macro_nombre}`.toLowerCase().includes(query);
    };

    const macroMatches = (node?: PositionedNode) => (
      macroFilter === "all" || node?.macro_codigo === macroFilter
    );

    const edgesFiltered = edges.filter((edge) => {
      const source = nodeById.get(edge.origen);
      const target = nodeById.get(edge.destino);
      if (!source || !target) return false;
      if (intensityFilter !== "all" && String(edge.puntaje) !== intensityFilter) return false;
      if (typeFilters.length > 0 && !typeFilters.includes(edge.tipo_relacion)) return false;
      if (macroFilter !== "all" && !macroMatches(source) && !macroMatches(target)) return false;
      if (query && !matchesSearch(source) && !matchesSearch(target)) return false;
      return true;
    });

    const visibleNodeIds = new Set<string>();
    for (const node of nodes) {
      if (macroMatches(node) && matchesSearch(node)) visibleNodeIds.add(node.id);
    }
    for (const edge of edgesFiltered) {
      visibleNodeIds.add(edge.origen);
      visibleNodeIds.add(edge.destino);
    }

    return {
      nodes: nodes.filter((node) => visibleNodeIds.has(node.id)),
      edges: edgesFiltered,
    };
  }, [edges, intensityFilter, macroFilter, nodeById, nodes, search, typeFilters]);

  const updateNode = (id: string, patch: Partial<PositionedNode>) => {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...patch } : node)));
    setDirty(true);
  };

  const updateEdge = (id: string, patch: Partial<PdiNetworkEdge>) => {
    setEdges((current) => current.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)));
    setDirty(true);
  };

  const addEdge = () => {
    if (!newEdge.origen || !newEdge.destino || newEdge.origen === newEdge.destino) return;
    const id = `${newEdge.origen}->${newEdge.destino}`;
    if (edgeById.has(id)) {
      showNotification({ title: "Relación existente", message: "Ya existe una relación con ese origen y destino", color: "yellow" });
      return;
    }

    setEdges((current) => [
      ...current,
      {
        id,
        origen: newEdge.origen,
        destino: newEdge.destino,
        tipo_relacion: newEdge.tipo_relacion || "Habilitadora",
        intensidad: newEdge.intensidad,
        puntaje: SCORE_BY_INTENSITY[newEdge.intensidad],
        justificacion: "",
        recomendacion: "",
      },
    ]);
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
    setDirty(true);
  };

  const removeSelectedEdge = () => {
    if (!selectedEdge) return;

    const source = nodeById.get(selectedEdge.origen);
    const target = nodeById.get(selectedEdge.destino);

    modals.openConfirmModal({
      centered: true,
      radius: "lg",
      size: "md",
      overlayProps: { backgroundOpacity: 0.35, blur: 4 },
      title: (
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={42} radius="xl" color="yellow" variant="light">
            <IconTrash size={21} />
          </ThemeIcon>
          <Box>
            <Text fw={900}>Eliminar relación</Text>
            <Text size="xs" c="dimmed">Esta acción queda pendiente hasta guardar los cambios.</Text>
          </Box>
        </Group>
      ),
      children: (
        <Stack gap="sm">
          <Box
            style={{
              background: "linear-gradient(135deg, #fff7cc 0%, #ffffff 72%)",
              border: "1px solid #fde68a",
              borderRadius: 16,
              padding: 14,
            }}
          >
            <Text size="sm" c="dimmed" fw={700} tt="uppercase" mb={6}>
              Relación seleccionada
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Badge radius="xl" variant="filled" color="dark">{selectedEdge.origen}</Badge>
              <Text fw={900} c="#111827">→</Text>
              <Badge radius="xl" variant="filled" color="dark">{selectedEdge.destino}</Badge>
            </Group>
            <Text size="sm" mt="xs" c="#334155">
              {shortText(source?.nombre || selectedEdge.origen, 42)} → {shortText(target?.nombre || selectedEdge.destino, 42)}
            </Text>
          </Box>
          <Text size="sm" c="dimmed">
            Se eliminará solo esta conexión visual. Los nodos se conservan y puedes revisar el resultado antes de guardar.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red", radius: "xl", leftSection: <IconTrash size={16} /> },
      cancelProps: { radius: "xl", variant: "default" },
      onConfirm: () => {
        setEdges((current) => current.filter((edge) => edge.id !== selectedEdge.id));
        setSelectedEdgeId(null);
        setDirty(true);
      },
    });
  };

  const pointerToSvgPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return {
      x: clamp(transformed.x, 80, VIEWBOX_WIDTH - 80),
      y: clamp(transformed.y, 70, VIEWBOX_HEIGHT - 95),
    };
  };

  const handleNodePointerDown = (event: React.PointerEvent<SVGGElement>, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    didMoveRef.current = false;
    setDraggingId(nodeId);
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingId) return;
    const point = pointerToSvgPoint(event);
    if (!point) return;
    didMoveRef.current = true;
    setNodes((current) => current.map((node) => (node.id === draggingId ? { ...node, x: point.x, y: point.y } : node)));
  };

  const handlePointerUp = () => {
    if (!draggingId) return;
    const moved = didMoveRef.current;
    didMoveRef.current = false;
    setDraggingId(null);
    if (moved) setDirty(true);
  };

  const saveNetwork = async () => {
    setSaving(true);
    try {
      const payload = { nodes, edges };
      const res = await axios.put<PdiNetworkResponse>(PDI_ROUTES.dashboardRedNodos(), payload);
      setNetwork(res.data);
      setNodes(layoutNodes(res.data.nodes));
      setEdges(res.data.edges);
      setDirty(false);
      showNotification({ title: "Guardado", message: "Red de nodos actualizada", color: "teal" });
    } catch (error) {
      console.error(error);
      showNotification({ title: "Error", message: "No se pudo guardar la red de nodos", color: "red" });
    } finally {
      setSaving(false);
    }
  };


  const hoveredConnectedIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const ids = new Set<string>([hoveredNodeId]);
    for (const edge of edges) {
      if (edge.origen === hoveredNodeId) ids.add(edge.destino);
      if (edge.destino === hoveredNodeId) ids.add(edge.origen);
    }
    return ids;
  }, [hoveredNodeId, edges]);

  const summary = useMemo(() => {
    const high = edges.filter((edge) => edge.puntaje >= 5).length;
    const medium = edges.filter((edge) => edge.puntaje === 3).length;
    const low = edges.filter((edge) => edge.puntaje <= 1).length;
    return { high, medium, low };
  }, [edges]);

  const rankingProyectos = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => b.puntaje_total - a.puntaje_total);
    let currentRank = 1;
    return sorted.map((node, index) => {
      if (index > 0 && sorted[index - 1].puntaje_total !== node.puntaje_total) {
        currentRank = index + 1;
      }
      return { ...node, rank: currentRank };
    });
  }, [nodes]);

  const macroRanking = useMemo(() => {
    const map = new Map<string, { codigo: string; nombre: string; proyectos: number; puntaje: number; relaciones: number }>();
    for (const node of nodes) {
      const key = node.macro_codigo || "Sin macro";
      if (!map.has(key)) map.set(key, { codigo: key, nombre: node.macro_nombre || key, proyectos: 0, puntaje: 0, relaciones: 0 });
      const entry = map.get(key)!;
      entry.proyectos += 1;
      entry.puntaje += node.puntaje_total;
      entry.relaciones += node.total_relaciones ?? 0;
    }
    const sorted = [...map.values()].sort((a, b) => b.puntaje - a.puntaje);
    let currentRank = 1;
    return sorted.map((item, index) => {
      if (index > 0 && sorted[index - 1].puntaje !== item.puntaje) currentRank = index + 1;
      return { ...item, rank: currentRank };
    });
  }, [nodes]);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflowY: "auto", height: "100vh", background: "#f8fafc" }}>

        {/* Header fijo */}
        <div style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "white", borderBottom: "1px solid #e2e8f0",
          padding: "12px 28px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <Group gap={12} align="center" wrap="nowrap">
            <ActionIcon variant="subtle" color="gray" radius="xl" size="lg"
              onClick={() => router.push("/pdi/dashboard")} title="Volver">
              <IconArrowLeft size={18} />
            </ActionIcon>
            <div style={{ width: 1, height: 28, background: "#e2e8f0", flexShrink: 0 }} />
            <ThemeIcon size={38} radius="md" variant="gradient" gradient={{ from: "violet", to: "indigo", deg: 135 }}>
              <IconNetwork size={20} />
            </ThemeIcon>
            <div>
              <Group gap={8} align="center" wrap="nowrap">
                <Text fw={800} size="lg" lh={1.2}>Red de nodos PDI</Text>
                <Badge variant="dot" size="sm"
                  color={network?.source?.type === "override" ? "teal" : "orange"}>
                  {network?.source?.type === "override" ? "versión editable" : "Excel base"}
                </Badge>
                {dirty && <Badge color="yellow" variant="filled" size="xs" radius="xl">Sin guardar</Badge>}
              </Group>
              <Text size="xs" c="dimmed">
                {config.nombre}{network?.source?.saved_at ? ` · Guardado ${formatDate(network.source.saved_at)}` : ""}
              </Text>
            </div>
          </Group>
          <Button color="violet" radius="xl" leftSection={<IconDeviceFloppy size={15} />}
            onClick={saveNetwork} loading={saving} disabled={!dirty}>
            Guardar cambios
          </Button>
        </div>

        <Container size="xl" py="lg" px="xl">
          <div style={{ height: 16 }} />

          {loading ? (
            <Center py={100}>
              <Stack align="center" gap="sm">
                <Loader size="lg" color="violet" />
                <Text c="dimmed" size="sm">Cargando red de nodos…</Text>
              </Stack>
            </Center>
          ) : !network ? (
            <Center py={100}><Text c="dimmed">No se pudo cargar la red</Text></Center>
          ) : (
            <Stack gap="md">

              {/* Stats */}
              <Paper withBorder radius="lg" p="sm" bg="white">
                <Group justify="space-between" wrap="wrap" gap="sm">
                  <Group gap={0} wrap="nowrap">
                    {[
                      { label: "Nodos", value: nodes.length, color: "#7c3aed" },
                      { label: "Relaciones", value: edges.length, color: "#0f766e" },
                      { label: "Alta", value: summary.high, color: "#be123c" },
                      { label: "Media", value: summary.medium, color: "#b45309" },
                      { label: "Baja", value: summary.low, color: "#64748b" },
                    ].map((s, i) => (
                      <div key={s.label} style={{
                        padding: "8px 20px",
                        borderRight: i < 4 ? "1px solid #f1f5f9" : undefined,
                        minWidth: 90,
                      }}>
                        <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.05em" }}>{s.label}</Text>
                        <Text fw={900} size="lg" style={{ color: s.color, lineHeight: 1.1 }}>{s.value}</Text>
                      </div>
                    ))}
                  </Group>
                  <Group gap={6} wrap="wrap" pr="sm">
                    {network.summary.macroproyectos.map((m) => (
                      <div key={m.codigo} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: macroColor(m.codigo).soft,
                        border: `1px solid ${macroColor(m.codigo).stroke}30`,
                        borderRadius: 20, padding: "3px 10px",
                      }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: macroColor(m.codigo).fill, flexShrink: 0 }} />
                        <Text size="xs" fw={700} style={{ color: macroColor(m.codigo).stroke }}>{m.codigo}</Text>
                        <Text size="xs" c="dimmed">{m.nodos}</Text>
                      </div>
                    ))}
                  </Group>
                </Group>
              </Paper>

              {/* Filtros */}
              <Paper withBorder radius="lg" p="md" bg="white">
                <Group gap="md" wrap="wrap" align="flex-end">
                  <Select label="Macroproyecto" data={macroOptions} value={macroFilter} radius="md" size="sm"
                    onChange={(v) => setMacroFilter(v || "all")} style={{ minWidth: 210 }} />
                  <MultiSelect label="Tipo de relación" data={relationTypeOptions} value={typeFilters}
                    onChange={setTypeFilters} clearable radius="md" size="sm" style={{ minWidth: 190 }} />
                  <div>
                    <Text size="xs" fw={500} c="dimmed" mb={6}>Intensidad</Text>
                    <Group gap={5}>
                      {[
                        { label: "Todas", value: "all" },
                        { label: "Alta · 5", value: "5" },
                        { label: "Media · 3", value: "3" },
                        { label: "Baja · 1", value: "1" },
                      ].map(opt => (
                        <button key={opt.value} onClick={() => setIntensityFilter(opt.value)} style={{
                          padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                          border: `1px solid ${intensityFilter === opt.value ? "#7c3aed" : "#e2e8f0"}`,
                          background: intensityFilter === opt.value ? "#f5f3ff" : "white",
                          color: intensityFilter === opt.value ? "#7c3aed" : "#64748b",
                          fontWeight: intensityFilter === opt.value ? 700 : 400,
                        }}>{opt.label}</button>
                      ))}
                    </Group>
                  </div>
                  <TextInput label="Buscar" value={search} onChange={(e) => setSearch(e.currentTarget.value)}
                    placeholder="Proyecto o código…" radius="md" size="sm" style={{ minWidth: 170 }} />
                </Group>
              </Paper>

              <Grid gutter="md" align="flex-start">
                <Grid.Col span={{ base: 12, xl: 8 }}>
                  <Paper withBorder radius="lg" bg="white" style={{ overflow: "hidden" }}>
                    {/* Toolbar del canvas */}
                    <div style={{
                      padding: "9px 16px", background: "#fafbff",
                      borderBottom: "1px solid #f1f5f9",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <Group gap={8}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed" }} />
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.07em" }}>Vista de red</Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        <Text span fw={700} c="dark" size="xs">{visibleData.nodes.length}</Text> nodos ·{" "}
                        <Text span fw={700} c="dark" size="xs">{visibleData.edges.length}</Text> relaciones
                        {(macroFilter !== "all" || intensityFilter !== "all" || typeFilters.length > 0 || search) &&
                          <Badge size="xs" color="violet" variant="dot" ml={6}>Filtrado</Badge>}
                      </Text>
                    </div>
                    <svg
                      ref={svgRef}
                      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
                      width="100%"
                      role="img"
                      aria-label="Red de nodos PDI"
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerLeave={handlePointerUp}
                      style={{ display: "block", touchAction: "none", aspectRatio: `${VIEWBOX_WIDTH} / ${VIEWBOX_HEIGHT}` }}
                    >
                      <defs>
                        <linearGradient id="canvas-warmth" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#fffdf5" />
                          <stop offset="54%" stopColor="#f8fbff" />
                          <stop offset="100%" stopColor="#ffffff" />
                        </linearGradient>
                        <pattern id="network-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e7ecf3" strokeWidth="0.8" />
                        </pattern>
                        <filter id="node-shadow" x="-35%" y="-35%" width="170%" height="185%">
                          <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#0f172a" floodOpacity="0.18" />
                        </filter>
                        <filter id="node-label-shadow" x="-15%" y="-30%" width="130%" height="170%">
                          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.1" />
                        </filter>
                        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
                        </marker>
                      </defs>
                      <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="url(#canvas-warmth)" />
                      <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="url(#network-grid)" opacity="0.82" />

                      {visibleData.edges.map((edge) => {
                        const source = nodeById.get(edge.origen);
                        const target = nodeById.get(edge.destino);
                        if (!source || !target) return null;
                        const path = edgePath(edge, source, target);
                        const isSelected = selectedEdgeId === edge.id;
                        const isHovered = hoveredEdgeId === edge.id;
                        const isNodeHoverActive = hoveredConnectedIds !== null;
                        const isConnected = !isNodeHoverActive || hoveredConnectedIds!.has(edge.origen) || hoveredConnectedIds!.has(edge.destino);
                        const color = relationColor(edge.tipo_relacion);
                        const width = intensityWidth(edge.puntaje);
                        const opacity = isSelected || isHovered
                          ? 0.95
                          : isNodeHoverActive
                            ? (isConnected ? 0.85 : 0.07)
                            : 0.38;

                        return (
                          <g key={edge.id} style={{ transition: "opacity 0.15s" }}>
                            <path
                              d={path.d}
                              fill="none"
                              stroke={color}
                              strokeWidth={isSelected || isHovered || (isConnected && isNodeHoverActive) ? width + 1.2 : width}
                              strokeOpacity={opacity}
                              markerEnd="url(#arrow)"
                              style={{ cursor: "pointer" }}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedEdgeId(edge.id);
                                setSelectedNodeId(null);
                              }}
                              onPointerEnter={() => setHoveredEdgeId(edge.id)}
                              onPointerLeave={() => setHoveredEdgeId(null)}
                            >
                              <title>{`${edge.origen} → ${edge.destino}: ${edge.tipo_relacion} · ${edge.intensidad} (${edge.puntaje})`}</title>
                            </path>
                            {(isSelected || isHovered) && (
                              <g transform={`translate(${path.labelX}, ${path.labelY})`}>
                                <rect x="-82" y="-14" width="164" height="28" rx="8" fill="white" stroke={color} strokeOpacity="0.4" />
                                <text textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill="#0f172a">
                                  {shortText(`${edge.tipo_relacion} · ${edge.intensidad}`, 25)}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}

                      {visibleData.nodes.map((node) => {
                        const color = macroColor(node.macro_codigo);
                        const r = nodeRadius(node);
                        const isSelected = selectedNodeId === node.id;
                        const gId = `ng-${svgSafeId(node.id)}`;
                        const rel = node.total_relaciones ?? 0;
                        const nameText = shortText(node.nombre, 22);

                        const isHoveredNode = hoveredNodeId === node.id;
                        const showLabel = isSelected || isHoveredNode;
                        const dimNode = hoveredConnectedIds !== null && !hoveredConnectedIds.has(node.id);

                        return (
                          <g
                            key={node.id}
                            transform={`translate(${node.x}, ${node.y})`}
                            onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                            onPointerEnter={() => { if (!draggingId) setHoveredNodeId(node.id); }}
                            onPointerLeave={() => setHoveredNodeId(null)}
                            style={{ cursor: draggingId === node.id ? "grabbing" : "grab", opacity: dimNode ? 0.25 : 1, transition: "opacity 0.15s" }}
                          >
                            <defs>
                              <radialGradient id={gId} cx="38%" cy="30%" r="72%">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                                <stop offset="50%" stopColor={color.fill} stopOpacity="1" />
                                <stop offset="100%" stopColor={color.stroke} stopOpacity="1" />
                              </radialGradient>
                            </defs>

                            {/* Halo selección */}
                            {isSelected && (
                              <circle r={r + 12} fill={color.fill} opacity={0.15} />
                            )}

                            {/* Sombra blanca */}
                            <circle r={r + 4} fill="white" filter="url(#node-shadow)" />

                            {/* Borde de selección */}
                            {isSelected && (
                              <circle r={r + 4} fill="none" stroke={color.stroke} strokeWidth="2.5" />
                            )}

                            {/* Círculo principal */}
                            <circle r={r} fill={`url(#${gId})`} />

                            {/* Código — centrado, con contorno para máxima legibilidad */}
                            <text
                              textAnchor="middle"
                              dominantBaseline="middle"
                              y="0"
                              fontSize={r > 34 ? "15" : "14"}
                              fontWeight="900"
                              fill="white"
                              stroke={color.stroke}
                              strokeWidth="3"
                              strokeLinejoin="round"
                              paintOrder="stroke"
                              style={{ letterSpacing: "0.5px" }}
                            >
                              {node.codigo}
                            </text>

                            {/* Badge relaciones — fuera del círculo, arriba a la derecha */}
                            <g transform={`translate(${r + 2}, ${-r - 2})`}>
                              <circle r={11} fill="white" stroke={color.stroke} strokeWidth="1.5" />
                              <text textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="900" fill={color.stroke}>
                                {rel}
                              </text>
                            </g>

                            {/* Etiqueta nombre + puntaje — visible solo al pasar el cursor o al seleccionar */}
                            {showLabel && (
                              <g transform={`translate(0, ${r + 10})`}>
                                <rect x="-70" y="0" width="140" height="36" rx="8"
                                  fill="white"
                                  stroke={isSelected ? color.stroke : color.soft}
                                  strokeWidth={isSelected ? 2 : 1.2}
                                  filter="url(#node-label-shadow)"
                                />
                                <text textAnchor="middle" y="14" fontSize="10.5" fontWeight="700" fill="#0f172a">
                                  {nameText}
                                </text>
                                <text textAnchor="middle" y="28" fontSize="9.5" fontWeight="600" fill={color.stroke}>
                                  {node.macro_codigo} · {node.puntaje_total} pts
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </Paper>
                </Grid.Col>

                <Grid.Col span={{ base: 12, xl: 4 }}>
                  <Stack gap="md">

                    {/* Panel editar */}
                    <Paper withBorder radius="lg" bg="white" style={{ overflow: "hidden" }}>
                      <div style={{
                        padding: "12px 16px", background: "#faf5ff",
                        borderBottom: "1px solid #ede9fe",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <Text fw={700} size="sm" c="violet.8">Editar selección</Text>
                        {dirty && <Badge color="yellow" variant="filled" size="xs" radius="xl">Sin guardar</Badge>}
                      </div>
                      <Box p="md">
                        {!selectedNode && !selectedEdge ? (
                          <Center py="md">
                            <Stack align="center" gap={6}>
                              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <IconNetwork size={20} color="#7c3aed" opacity={0.5} />
                              </div>
                              <Text size="xs" c="dimmed" ta="center" maw={160}>Haz clic en un nodo o relación para editarlo</Text>
                            </Stack>
                          </Center>
                        ) : selectedNode ? (
                          <Stack gap="sm">
                            <Badge color="violet" variant="light" radius="xl" w="fit-content">Nodo</Badge>
                            <TextInput label="Código" value={selectedNode.codigo} disabled radius="md" size="sm" />
                            <TextInput label="Nombre" value={selectedNode.nombre} radius="md" size="sm"
                              onChange={(e) => updateNode(selectedNode.id, { nombre: e.currentTarget.value })} />
                            <TextInput label="Macroproyecto" value={selectedNode.macro_codigo} radius="md" size="sm"
                              onChange={(e) => updateNode(selectedNode.id, { macro_codigo: e.currentTarget.value })} />
                            <NumberInput label="Puntaje total" value={selectedNode.puntaje_total} min={0} radius="md" size="sm"
                              onChange={(v) => updateNode(selectedNode.id, { puntaje_total: Number(v) || 0 })} />
                            <Grid gutter="xs">
                              <Grid.Col span={6}>
                                <NumberInput label="X" value={Math.round(selectedNode.x)} radius="md" size="sm"
                                  onChange={(v) => updateNode(selectedNode.id, { x: Number(v) || selectedNode.x })} />
                              </Grid.Col>
                              <Grid.Col span={6}>
                                <NumberInput label="Y" value={Math.round(selectedNode.y)} radius="md" size="sm"
                                  onChange={(v) => updateNode(selectedNode.id, { y: Number(v) || selectedNode.y })} />
                              </Grid.Col>
                            </Grid>
                          </Stack>
                        ) : selectedEdge ? (
                          <Stack gap="sm">
                            <Group justify="space-between">
                              <Badge color="blue" variant="light" radius="xl">Relación</Badge>
                              <Tooltip label="Eliminar" withArrow>
                                <ActionIcon color="red" variant="light" radius="xl" size="sm" onClick={removeSelectedEdge}>
                                  <IconTrash size={14} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px" }}>
                              <Text size="xs" fw={700} c="dark">{selectedEdge.origen} → {selectedEdge.destino}</Text>
                            </div>
                            <Select label="Tipo de relación" data={relationTypeOptions} value={selectedEdge.tipo_relacion}
                              radius="md" size="sm"
                              onChange={(v) => updateEdge(selectedEdge.id, { tipo_relacion: v || "Habilitadora" })} />
                            <Select label="Intensidad" radius="md" size="sm"
                              data={[{ value: "Baja", label: "Baja · 1" }, { value: "Media", label: "Media · 3" }, { value: "Alta", label: "Alta · 5" }]}
                              value={selectedEdge.intensidad}
                              onChange={(v) => {
                                const intensity = (v || "Media") as PdiNodeIntensity;
                                updateEdge(selectedEdge.id, { intensidad: intensity, puntaje: SCORE_BY_INTENSITY[intensity] });
                              }} />
                            <TextInput label="Justificación" value={selectedEdge.justificacion ?? ""} radius="md" size="sm"
                              onChange={(e) => updateEdge(selectedEdge.id, { justificacion: e.currentTarget.value })} />
                            <TextInput label="Recomendación" value={selectedEdge.recomendacion ?? ""} radius="md" size="sm"
                              onChange={(e) => updateEdge(selectedEdge.id, { recomendacion: e.currentTarget.value })} />
                          </Stack>
                        ) : null}
                      </Box>
                    </Paper>

                    {/* Nueva relación */}
                    <Paper withBorder radius="lg" bg="white" style={{ overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", background: "#f0fdf4", borderBottom: "1px solid #dcfce7" }}>
                        <Text fw={700} size="sm" c="teal.8">Nueva relación</Text>
                      </div>
                      <Stack gap="sm" p="md">
                        <Select label="Origen" data={nodeOptions} value={newEdge.origen} searchable radius="md" size="sm"
                          onChange={(v) => setNewEdge((c) => ({ ...c, origen: v || "" }))} />
                        <Select label="Destino" data={nodeOptions} value={newEdge.destino} searchable radius="md" size="sm"
                          onChange={(v) => setNewEdge((c) => ({ ...c, destino: v || "" }))} />
                        <Grid gutter="xs">
                          <Grid.Col span={6}>
                            <Select label="Tipo" data={relationTypeOptions} value={newEdge.tipo_relacion} radius="md" size="sm"
                              onChange={(v) => setNewEdge((c) => ({ ...c, tipo_relacion: v || "Habilitadora" }))} />
                          </Grid.Col>
                          <Grid.Col span={6}>
                            <Select label="Intensidad" radius="md" size="sm"
                              data={[{ value: "Baja", label: "Baja · 1" }, { value: "Media", label: "Media · 3" }, { value: "Alta", label: "Alta · 5" }]}
                              value={newEdge.intensidad}
                              onChange={(v) => setNewEdge((c) => ({ ...c, intensidad: (v || "Media") as PdiNodeIntensity }))} />
                          </Grid.Col>
                        </Grid>
                        <Button leftSection={<IconPlus size={15} />} variant="light" color="teal" radius="md" size="sm"
                          onClick={addEdge}
                          disabled={!newEdge.origen || !newEdge.destino || newEdge.origen === newEdge.destino}>
                          Agregar relación
                        </Button>
                      </Stack>
                    </Paper>

                    {/* Lista relaciones */}
                    <Paper withBorder radius="lg" bg="white" style={{ overflow: "hidden" }}>
                      <div style={{
                        padding: "10px 16px", background: "#fafbff", borderBottom: "1px solid #f1f5f9",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <Text fw={700} size="sm" c="dimmed">Relaciones visibles</Text>
                        <Badge variant="light" color="gray" size="sm" radius="xl">{visibleData.edges.length}</Badge>
                      </div>
                      <ScrollArea h={260}>
                        <Table fz="xs" highlightOnHover>
                          <Table.Thead>
                            <Table.Tr style={{ background: "#fafbff" }}>
                              <Table.Th>Origen</Table.Th>
                              <Table.Th>Destino</Table.Th>
                              <Table.Th>Tipo</Table.Th>
                              <Table.Th ta="center">P</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {visibleData.edges.map((edge) => (
                              <Table.Tr key={edge.id} style={{
                                cursor: "pointer",
                                background: selectedEdgeId === edge.id ? "#f5f3ff" : undefined,
                              }} onClick={() => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}>
                                <Table.Td><Text fw={700} size="xs">{edge.origen}</Text></Table.Td>
                                <Table.Td><Text fw={700} size="xs">{edge.destino}</Text></Table.Td>
                                <Table.Td><Text size="xs" c="dimmed">{shortText(edge.tipo_relacion, 12)}</Text></Table.Td>
                                <Table.Td ta="center">
                                  <Badge size="xs" radius="xl" variant={selectedEdgeId === edge.id ? "filled" : "light"}
                                    color={edge.puntaje >= 5 ? "red" : edge.puntaje === 3 ? "blue" : "gray"}>
                                    {edge.puntaje}
                                  </Badge>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </ScrollArea>
                    </Paper>

                  </Stack>
                </Grid.Col>
              </Grid>

              <Paper withBorder radius="lg" bg="white" style={{ overflow: "hidden" }}>
                <Tabs defaultValue="metricas" color="violet">
                  <div style={{ background: "#faf5ff", borderBottom: "1px solid #ede9fe", padding: "0 20px" }}>
                    <Tabs.List style={{ border: "none" }}>
                      <Tabs.Tab value="metricas" fw={600} py="sm">Métricas de Conectividad</Tabs.Tab>
                      <Tabs.Tab value="ranking-proyectos" fw={600} py="sm">Ranking Proyectos</Tabs.Tab>
                      <Tabs.Tab value="ranking-macros" fw={600} py="sm">Ranking Macroproyectos</Tabs.Tab>
                    </Tabs.List>
                  </div>

                  <Tabs.Panel value="metricas" p="lg">
                    <div style={{ background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 8, padding: "7px 14px", marginBottom: 14 }}>
                      <Text size="xs" c="dimmed">
                        <b>Genera</b> = cuántos proyectos reciben el impacto · <b>Recibe</b> = de cuántos depende · <b>Puntaje</b> = suma ponderada (Alta=5, Media=3, Baja=1)
                      </Text>
                    </div>
                    <ScrollArea>
                      <Table striped highlightOnHover withTableBorder style={{ minWidth: 1050 }}>
                        <Table.Thead>
                          <Table.Tr style={{ background: "#faf5ff" }}>
                            <Table.Th>Código</Table.Th>
                            <Table.Th>Proyecto</Table.Th>
                            <Table.Th>Macro</Table.Th>
                            <Table.Th>Macroproyecto</Table.Th>
                            <Table.Th ta="center">Genera</Table.Th>
                            <Table.Th ta="center">Recibe</Table.Th>
                            <Table.Th ta="center">Total Rel.</Table.Th>
                            <Table.Th ta="center">Puntaje Total</Table.Th>
                            <Table.Th>Nivel Articulación</Table.Th>
                            <Table.Th>Prioridad de Gestión</Table.Th>
                            <Table.Th>Lectura Rápida</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {[...nodes].sort((a, b) => a.codigo.localeCompare(b.codigo, "es")).map((node) => (
                            <Table.Tr key={node.id}>
                              <Table.Td><Text fw={700} size="sm">{node.codigo}</Text></Table.Td>
                              <Table.Td><Text size="sm">{node.nombre}</Text></Table.Td>
                              <Table.Td>
                                <Badge variant="filled" color={macroMantineColor(node.macro_codigo)} radius="xl" size="sm">{node.macro_codigo}</Badge>
                              </Table.Td>
                              <Table.Td><Text size="sm">{node.macro_nombre}</Text></Table.Td>
                              <Table.Td ta="center"><Text fw={700} size="sm">{node.relaciones_salientes}</Text></Table.Td>
                              <Table.Td ta="center"><Text fw={700} size="sm">{node.relaciones_entrantes}</Text></Table.Td>
                              <Table.Td ta="center">
                                <Badge variant="light" color="dark" radius="xl">{node.total_relaciones}</Badge>
                              </Table.Td>
                              <Table.Td ta="center">
                                <Badge variant="filled" color="violet" radius="xl">{node.puntaje_total}</Badge>
                              </Table.Td>
                              <Table.Td>
                                <Badge variant="light" color={nivelColor(node.nivel_articulacion)} radius="xl">{node.nivel_articulacion || "—"}</Badge>
                              </Table.Td>
                              <Table.Td>
                                <Badge variant="light" color={prioridadColor(node.prioridad_gestion)} radius="xl">{node.prioridad_gestion || "—"}</Badge>
                              </Table.Td>
                              <Table.Td>
                                <Text size="xs" c="dimmed" style={{ minWidth: 210 }}>{lecturaRapida(node.prioridad_gestion)}</Text>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Tabs.Panel>

                  <Tabs.Panel value="ranking-proyectos" p="lg">
                    <div style={{ background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 8, padding: "7px 14px", marginBottom: 14 }}>
                      <Text size="xs" c="dimmed">Ordenados de mayor a menor Puntaje Total. Empates comparten posición. Fondo dorado = top 3.</Text>
                    </div>
                    <Table striped highlightOnHover withTableBorder>
                      <Table.Thead>
                        <Table.Tr style={{ background: "#eff6ff" }}>
                          <Table.Th ta="center">#</Table.Th>
                          <Table.Th>Código</Table.Th>
                          <Table.Th>Proyecto</Table.Th>
                          <Table.Th>Macro</Table.Th>
                          <Table.Th ta="center">Puntaje Total</Table.Th>
                          <Table.Th ta="center">Total Relaciones</Table.Th>
                          <Table.Th>Prioridad de Gestión</Table.Th>
                          <Table.Th>Lectura Rápida</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {rankingProyectos.map((node) => (
                          <Table.Tr key={node.id} style={{ background: node.rank <= 3 ? "#fffbeb" : undefined }}>
                            <Table.Td ta="center">
                              <Text fw={900} size="sm" c={node.rank === 1 ? "yellow.7" : node.rank <= 3 ? "orange.6" : "dimmed"}>
                                {node.rank}
                              </Text>
                            </Table.Td>
                            <Table.Td><Text fw={700} size="sm">{node.codigo}</Text></Table.Td>
                            <Table.Td><Text size="sm">{node.nombre}</Text></Table.Td>
                            <Table.Td>
                              <Badge variant="filled" color={macroMantineColor(node.macro_codigo)} radius="xl" size="sm">{node.macro_codigo}</Badge>
                            </Table.Td>
                            <Table.Td ta="center">
                              <Badge variant="filled" color="violet" radius="xl">{node.puntaje_total}</Badge>
                            </Table.Td>
                            <Table.Td ta="center">
                              <Badge variant="light" color="dark" radius="xl">{node.total_relaciones}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light" color={prioridadColor(node.prioridad_gestion)} radius="xl">{node.prioridad_gestion || "—"}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text size="xs" c="dimmed">{lecturaRapida(node.prioridad_gestion)}</Text>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Tabs.Panel>

                  <Tabs.Panel value="ranking-macros" p="lg">
                    <div style={{ background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 8, padding: "7px 14px", marginBottom: 14 }}>
                      <Text size="xs" c="dimmed">Agrega puntajes y relaciones de todos los proyectos de cada macroproyecto.</Text>
                    </div>
                    <Table striped highlightOnHover withTableBorder>
                      <Table.Thead>
                        <Table.Tr style={{ background: "#faf5ff" }}>
                          <Table.Th ta="center">#</Table.Th>
                          <Table.Th>Código</Table.Th>
                          <Table.Th>Macroproyecto</Table.Th>
                          <Table.Th ta="center">Nº Proyectos</Table.Th>
                          <Table.Th ta="center">Puntaje Ponderado Total</Table.Th>
                          <Table.Th ta="center">Total Relaciones</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {macroRanking.map((macro) => (
                          <Table.Tr key={macro.codigo} style={{ background: macro.rank <= 2 ? "#fffbeb" : undefined }}>
                            <Table.Td ta="center">
                              <Text fw={900} size="sm" c={macro.rank === 1 ? "yellow.7" : macro.rank === 2 ? "orange.6" : "dimmed"}>
                                {macro.rank}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="filled" color={macroMantineColor(macro.codigo)} radius="xl" size="sm">{macro.codigo}</Badge>
                            </Table.Td>
                            <Table.Td><Text fw={600} size="sm">{macro.nombre}</Text></Table.Td>
                            <Table.Td ta="center"><Text fw={700} size="sm">{macro.proyectos}</Text></Table.Td>
                            <Table.Td ta="center">
                              <Badge variant="filled" color="violet" radius="xl">{macro.puntaje}</Badge>
                            </Table.Td>
                            <Table.Td ta="center">
                              <Badge variant="light" color="dark" radius="xl">{macro.relaciones}</Badge>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Tabs.Panel>
                </Tabs>
              </Paper>
            </Stack>
          )}
        </Container>
      </div>
    </div>
  );
}
