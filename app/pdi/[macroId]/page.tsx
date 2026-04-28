"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Text, Paper, Group, Badge, Button, Stack, Loader, Center,
  ThemeIcon, ActionIcon, Box, Title, Progress, SimpleGrid, Divider,
} from "@mantine/core";
import {
  IconArrowLeft, IconTarget, IconBulb, IconTrendingUp,
  IconEdit, IconTrash, IconPlus, IconChevronRight,
  IconChartBarPopular, IconFolderOpen,
  IconUpload, IconFileSpreadsheet,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter, useParams } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import type { Macroproyecto, Proyecto, Accion, Indicador, ImportExecutedResponse } from "../types";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import MacroproyectoModal from "../components/MacroproyectoModal";
import ProyectoModal from "../components/ProyectoModal";
import AccionModal from "../components/AccionModal";
import IndicadorModal from "../components/IndicadorModal";
import { usePdiConfig } from "../hooks/usePdiConfig";

const formatCOP = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const SEMAFORO_LABEL: Record<string, string> = {
  verde: "Cumplimiento adecuado",
  amarillo: "Requiere atención",
  rojo: "Crítico",
};
const isAdmin = (role: string) => role === "Administrador";

function getSemaforoByAvance(avance: number) {
  if (avance >= 90) return "verde";
  if (avance >= 60) return "amarillo";
  return "rojo";
}

function normalizePeso(peso: number) {
  const value = Number(peso) || 0;
  return value <= 1 ? value * 100 : value;
}

function getWeightedProgress<T extends { peso: number }>(items: T[], getValue: (item: T) => number) {
  return Math.round(
    items.reduce((acc, item) => acc + getValue(item) * normalizePeso(item.peso), 0) / 100
  );
}

function getIndicadorAvanceMostrado(ind: Indicador) {
  return ind.avance_total_real ?? ind.avance;
}

function getIndicadorAvanceTotalReal(ind: Indicador) {
  return ind.avance_total_real != null ? Number(ind.avance_total_real) : (Number(ind.avance) || 0);
}

function getIndicadorAvancePonderado(ind: Indicador) {
  return Math.min(Math.max(Number(ind.avance) || 0, 0), 100);
}

function clampProgress(avance: number) {
  return Math.min(Math.max(Number(avance) || 0, 0), 100);
}

function SemaforoBadge({ semaforo }: { semaforo: string }) {
  return (
    <Badge color={SEMAFORO_COLOR[semaforo]} variant="light" size="xs" radius="xl">
      {SEMAFORO_LABEL[semaforo]}
    </Badge>
  );
}

function AvanceBar({ avance, semaforo }: { avance: number; semaforo: string }) {
  return (
    <Group gap={8} align="center">
      <Progress value={clampProgress(avance)} color={SEMAFORO_COLOR[semaforo]} size="sm" radius="xl" style={{ flex: 1 }} />
      <Text size="xs" fw={700} w={36} ta="right">{avance}%</Text>
    </Group>
  );
}

function MetaBadge({ label, color = "gray" }: { label: string; color?: string }) {
  return (
    <Badge variant="light" color={color} radius="sm">
      {label}
    </Badge>
  );
}

function ExecutedImportPanel({
  macro,
  selectedFile,
  uploading,
  importResult,
  onPickFile,
  onImport,
}: {
  macro: Macroproyecto;
  selectedFile: File | null;
  uploading: boolean;
  importResult: ImportExecutedResponse | null;
  onPickFile: (file: File | null) => void;
  onImport: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Paper
      withBorder
      radius="lg"
      p="md"
      mt="md"
      style={{
        background: "linear-gradient(135deg, rgba(59,130,246,0.05), rgba(255,255,255,0.98) 58%)",
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="wrap" mb="md">
        <div>
          <Text fw={700}>Importar ejecucion presupuestal</Text>
          <Text size="sm" c="dimmed" mt={4}>
            Carga el ejecutado real del macroproyecto <b>{macro.codigo}</b>. El sistema actualiza la ejecucion del presupuesto.
          </Text>
        </div>
        <Group gap={8}>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm"
            style={{ display: "none" }}
            onChange={(event) => onPickFile(event.currentTarget.files?.[0] ?? null)}
          />
          <Button variant="default" leftSection={<IconFolderOpen size={14} />} onClick={() => inputRef.current?.click()}>
            {selectedFile ? "Cambiar archivo" : "Seleccionar Excel"}
          </Button>
          <Button color="blue" leftSection={<IconUpload size={14} />} loading={uploading} disabled={!selectedFile} onClick={onImport}>
            Importar ejecutado
          </Button>
        </Group>
      </Group>

      {selectedFile && (
        <Paper withBorder radius="lg" p="sm" mb="md" style={{ background: "var(--mantine-color-body)" }}>
          <Group justify="space-between" align="center" wrap="wrap">
            <div>
              <Text size="xs" c="dimmed">Archivo seleccionado</Text>
              <Text fw={700}>{selectedFile.name}</Text>
            </div>
            <Badge variant="light" color="blue" radius="xl">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </Badge>
          </Group>
        </Paper>
      )}

      {importResult && (
        <Stack gap="md">
          {importResult.actualizados.length > 0 && (
            <Paper withBorder radius="lg" p="md">
              <Text fw={700} mb="sm">Resultado</Text>
              <Stack gap={8}>
                {importResult.actualizados.map((item) => (
                  <Group key={item.codigo} justify="space-between" wrap="wrap">
                    <Text size="sm" fw={700}>{item.codigo}{item.nombre ? ` - ${item.nombre}` : ""}</Text>
                    <Badge color="blue" variant="light" radius="xl">{formatCOP(item.presupuesto_ejecutado)}</Badge>
                  </Group>
                ))}
              </Stack>
            </Paper>
          )}

          {importResult.no_encontrados.length > 0 && (
            <Paper withBorder radius="lg" p="md" style={{ borderColor: "var(--mantine-color-orange-4)" }}>
              <Text fw={700} mb="sm">No encontrado</Text>
              <Stack gap={8}>
                {importResult.no_encontrados.map((item) => (
                  <Group key={item.codigo} justify="space-between" wrap="wrap">
                    <Text size="sm" fw={700}>{item.codigo}</Text>
                    <Badge color="gray" variant="light" radius="xl">{formatCOP(item.presupuesto_ejecutado)}</Badge>
                  </Group>
                ))}
              </Stack>
            </Paper>
          )}
        </Stack>
      )}
    </Paper>
  );
}

function IndicadorCard({ ind, admin, aniosPdi, anioMeta, onEdit, onDelete }: {
  ind: Indicador; admin: boolean;
  aniosPdi: number[];
  anioMeta: number;
  onEdit: (i: Indicador) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [showAnios, setShowAnios] = useState(false);
  const tieneAnios = !!ind.avances_por_anio;
  const avance = getIndicadorAvanceMostrado(ind);
  const avanceVisible = clampProgress(avance);
  const avanceTotalReal = getIndicadorAvanceTotalReal(ind);

  return (
    <Paper
      withBorder
      radius="lg"
      p="md"
      shadow="xs"
      style={{
        height: "100%",
        background: hovered
          ? "linear-gradient(180deg, rgba(124, 58, 237, 0.08), rgba(255, 255, 255, 0.98) 58%)"
          : "linear-gradient(180deg, rgba(124, 58, 237, 0.03), transparent 45%)",
        cursor: "pointer",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered ? "0 14px 30px rgba(124, 58, 237, 0.12)" : "",
        borderColor: hovered ? "rgba(124, 58, 237, 0.35)" : undefined,
        transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease",
      }}
      onClick={() => router.push(`/pdi/indicadores/${ind._id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Group justify="space-between" align="flex-start" mb="xs">
        <Group gap={10} align="flex-start">
          <ThemeIcon size={34} radius="xl" color="violet" variant="light">
            <IconTarget size={17} />
          </ThemeIcon>
          <div style={{ textAlign: "center" }}>
            <Text size="xs" fw={700} c="dimmed" mb={2}>{ind.codigo}</Text>
            <Text size="sm" fw={700} lh={1.35}>{ind.nombre}</Text>
          </div>
        </Group>
        <Group gap={4}>
          <SemaforoBadge semaforo={ind.semaforo} />
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); onEdit(ind); }}><IconEdit size={13} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); onDelete(ind._id); }}><IconTrash size={13} /></ActionIcon>
          </>}
        </Group>
      </Group>

      {/* Barra de avance con botón para desplegar años */}
      <Group gap={6} align="center">
        <Progress value={avanceVisible} color={SEMAFORO_COLOR[ind.semaforo]} size="sm" radius="xl" style={{ flex: 1 }} />
        <Text size="xs" fw={700} w={36} ta="right">{avanceVisible}%</Text>
        <ActionIcon
          size="xs"
          variant="subtle"
          color="violet"
          onClick={(e) => { e.stopPropagation(); setShowAnios(v => !v); }}
          title="Ver avance por año"
        >
          <IconChevronRight size={12} style={{ transform: showAnios ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
        </ActionIcon>
      </Group>

      {/* Desglose por año (colapsable) */}
      {showAnios && (
        <>
          <Group gap={6} mt={8} wrap="wrap" onClick={(e) => e.stopPropagation()}>
            {(aniosPdi.length ? aniosPdi.map(String) : Object.keys(ind.avances_por_anio ?? {}).sort()).map((anio) => {
              const val = ind.avances_por_anio?.[anio];
              const tieneData = val != null;
              return (
                <Box
                  key={anio}
                  style={{
                    background: "rgba(124,58,237,0.07)",
                    border: "1px solid rgba(124,58,237,0.18)",
                    borderRadius: 8,
                    padding: "3px 10px",
                    textAlign: "center",
                    minWidth: 60,
                  }}
                >
                  <Text size="10px" c="dimmed" fw={700}>{anio}</Text>
                  <Text size="xs" fw={800} c={tieneData ? "violet" : "dimmed"}>
                    {tieneData ? `${Number(val).toFixed(1)}%` : "0.0%"}
                  </Text>
                </Box>
              );
            })}
          </Group>
          <Box
            mt={6}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(59,130,246,0.22)",
            }}
          >
            <Text size="10px" fw={800} c="blue">
              AVANCE TOTAL REAL
            </Text>
            <Text size="sm" fw={900} c="blue">
              {avanceTotalReal}%
            </Text>
          </Box>
        </>
      )}

      <Group gap={8} mt="sm" wrap="wrap">
        <MetaBadge label={`Peso ${ind.peso}%`} />
        {ind.meta_final_2029 != null && <MetaBadge label={`Meta final ${anioMeta}: ${ind.meta_final_2029}`} color="violet" />}
        {ind.tipo_seguimiento && <MetaBadge label={ind.tipo_seguimiento} color="blue" />}
      </Group>

      {ind.responsable && (
        <Text size="xs" c="dimmed" mt="sm">
          Responsable: <b>{ind.responsable}</b>
        </Text>
      )}
    </Paper>
  );
}

function AccionCard({ accion: accionInicial, admin, aniosPdi, onEdit, onDelete, onAvanceUpdate, onComputedProgress }: {
  accion: Accion; admin: boolean;
  aniosPdi: number[];
  onEdit: (a: Accion) => void;
  onDelete: (id: string) => void;
  onAvanceUpdate: () => void;
  onComputedProgress: (accionId: string, avance: number, semaforo: string) => void;
}) {
  const [accion, setAccion] = useState(accionInicial);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [indModal, setIndModal] = useState(false);
  const [selectedInd, setSelectedInd] = useState<Indicador | null>(null);

  useEffect(() => { setAccion(accionInicial); }, [accionInicial]);

  const cargar = async () => {
    if (loaded) {
      setOpen((value) => !value);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get(PDI_ROUTES.indicadores(), { params: { accion_id: accion._id } });
      setIndicadores(res.data);
      setLoaded(true);
      setOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const refrescarAccion = async () => {
    try {
      const res = await axios.get(PDI_ROUTES.accion(accion._id));
      setAccion(res.data);
      onAvanceUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteInd = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar indicador",
      children: <Text size="sm">¿Seguro que deseas eliminar este indicador?</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.indicador(id));
          setIndicadores((prev) => prev.filter((i) => i._id !== id));
          showNotification({ title: "Eliminado", message: "Indicador eliminado", color: "teal" });
          await refrescarAccion();
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const toggleIndicadores = () => {
    void cargar();
  };
  const avanceAccion = indicadores.length
    ? getWeightedProgress(indicadores, (ind) => getIndicadorAvancePonderado(ind))
    : accion.avance;
  const semaforoAccion = getSemaforoByAvance(avanceAccion);

  useEffect(() => {
    onComputedProgress(accion._id, avanceAccion, semaforoAccion);
  }, [accion._id, avanceAccion, semaforoAccion, onComputedProgress]);

  return (
    <Paper
      withBorder
      radius="xl"
      p="lg"
      shadow="xs"
      style={{
        background: open
          ? "linear-gradient(180deg, rgba(251, 146, 60, 0.06), transparent 38%)"
          : "var(--mantine-color-body)",
      }}
    >
      <Group justify="space-between" align="flex-start" mb="md" wrap="wrap">
        <Group
          gap={12}
          align="flex-start"
          style={{
            cursor: "pointer",
            flex: 1,
            padding: "4px 6px",
            borderRadius: 12,
            background: hovered || open ? "rgba(251, 146, 60, 0.08)" : "transparent",
            boxShadow: hovered ? "inset 0 0 0 1px rgba(251, 146, 60, 0.18)" : "none",
            transition: "background .18s ease, box-shadow .18s ease",
          }}
          onClick={toggleIndicadores}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <ThemeIcon size={40} radius="xl" color="orange" variant="light">
            <IconBulb size={20} />
          </ThemeIcon>
          <div style={{ textAlign: "left" }}>
            <Group gap={8} mb={4} wrap="wrap">
              <Text size="xs" fw={700} c="dimmed">{accion.codigo}</Text>
               <SemaforoBadge semaforo={semaforoAccion} />
              <MetaBadge label={`Peso ${accion.peso}%`} />
              {accion.presupuesto > 0 && (
                <Badge variant="light" color="green" radius="sm" size="sm">
                  {formatCOP(accion.presupuesto)}
                </Badge>
              )}
            </Group>
            <Text fw={700} size="md" lh={1.35}>{accion.nombre}</Text>
           
          </div>
        </Group>

        <Group gap={6}>
          {admin && (
            <Button
              size="xs"
              variant="light"
              color="violet"
              leftSection={<IconPlus size={12} />}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedInd(null);
                setIndModal(true);
              }}
            >
              Nuevo indicador
            </Button>
          )}
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); onEdit(accion); }}><IconEdit size={14} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); onDelete(accion._id); }}><IconTrash size={14} /></ActionIcon>
          </>}
        </Group>
      </Group>

      <AvanceBar avance={avanceAccion} semaforo={semaforoAccion} />

      {open && (
        <>
          <Divider my="md" />
          {loading ? (
            <Center py="sm"><Loader size="sm" /></Center>
          ) : indicadores.length === 0 ? (
            <Paper
              withBorder
              radius="lg"
              p="xl"
              style={{ borderStyle: "dashed", background: "var(--mantine-color-default-hover)" }}
            >
              <Stack align="center" gap={6}>
                <ThemeIcon size={40} radius="xl" color="violet" variant="light">
                  <IconTarget size={18} />
                </ThemeIcon>
                <Text fw={600}>Sin indicadores registrados</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Agrega indicadores para hacer seguimiento a esta acción estratégica.
                </Text>
                {admin && (
                  <Button
                    size="sm"
                    variant="light"
                    color="violet"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => { setSelectedInd(null); setIndModal(true); }}
                  >
                    Crear indicador
                  </Button>
                )}
              </Stack>
            </Paper>
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
              {indicadores.map((ind) => (
                <IndicadorCard
                  key={ind._id}
                  ind={ind}
                  admin={admin}
                  aniosPdi={aniosPdi}
                  anioMeta={aniosPdi.length ? aniosPdi[aniosPdi.length - 1] : new Date().getFullYear()}
                  onEdit={(i) => { setSelectedInd(i); setIndModal(true); }}
                  onDelete={handleDeleteInd}
                />
              ))}
            </SimpleGrid>
          )}
        </>
      )}

      <IndicadorModal
        opened={indModal}
        onClose={() => setIndModal(false)}
        selected={selectedInd}
        defaultAccionId={accion._id}
        onSaved={async (doc) => {
          setIndicadores((prev) => selectedInd
            ? prev.map((i) => i._id === doc._id ? doc : i)
            : [...prev, doc]
          );
          await refrescarAccion();
        }}
      />
    </Paper>
  );
}

function ProyectoSeccion({ proyecto: proyectoInicial, admin, aniosPdi, onEdit, onDelete, onAvanceUpdate, onComputedProgress }: {
  proyecto: Proyecto; admin: boolean;
  aniosPdi: number[];
  onEdit: (p: Proyecto) => void;
  onDelete: (id: string) => void;
  onAvanceUpdate: () => void;
  onComputedProgress: (proyectoId: string, avance: number, semaforo: string) => void;
}) {
  const [proyecto, setProyecto] = useState(proyectoInicial);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [accionModal, setAccionModal] = useState(false);
  const [selectedAccion, setSelectedAccion] = useState<Accion | null>(null);

  useEffect(() => { setProyecto(proyectoInicial); }, [proyectoInicial]);

  const hydrateAcciones = async (accionesBase: Accion[]) => {
    const accionesConIndicadores = await Promise.all(
      accionesBase.map(async (accionItem) => {
        try {
          const res = await axios.get(PDI_ROUTES.indicadores(), { params: { accion_id: accionItem._id } });
          const indicadoresAccion = res.data as Indicador[];
          if (!indicadoresAccion.length) return accionItem;

          const avance = getWeightedProgress(indicadoresAccion, (ind) => getIndicadorAvancePonderado(ind));
          return {
            ...accionItem,
            avance,
            semaforo: getSemaforoByAvance(avance) as any,
          };
        } catch {
          return accionItem;
        }
      })
    );

    return accionesConIndicadores;
  };

  useEffect(() => {
    if (loaded) return;
    setLoading(true);
    axios.get(PDI_ROUTES.acciones(), { params: { proyecto_id: proyecto._id } })
      .then(async (res) => {
        const accionesHydrated = await hydrateAcciones(res.data);
        setAcciones(accionesHydrated);
        setLoaded(true);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [loaded, proyecto._id]);

  const refrescarProyecto = async () => {
    try {
      const [resProyecto, resAcciones] = await Promise.all([
        axios.get(PDI_ROUTES.proyecto(proyecto._id)),
        axios.get(PDI_ROUTES.acciones(), { params: { proyecto_id: proyecto._id } }),
      ]);
      setProyecto(resProyecto.data);
      setAcciones(await hydrateAcciones(resAcciones.data));
      onAvanceUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAccion = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar acción estratégica",
      children: <Text size="sm">¿Seguro que deseas eliminar esta acción?</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.accion(id));
          setAcciones((prev) => prev.filter((a) => a._id !== id));
          showNotification({ title: "Eliminada", message: "Acción eliminada", color: "teal" });
          await refrescarProyecto();
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const handleComputedAccionProgress = useCallback((accionId: string, avance: number, semaforo: string) => {
    setAcciones((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item._id !== accionId) return item;
        if (Number(item.avance) === avance && item.semaforo === semaforo) return item;
        changed = true;
        return { ...item, avance, semaforo: semaforo as any };
      });
      return changed ? next : prev;
    });
  }, []);

  const estadoProyectoColor = proyecto.semaforo === "verde"
    ? "green"
    : proyecto.semaforo === "amarillo"
      ? "yellow"
      : "red";
  const avanceProyecto = acciones.length
    ? getWeightedProgress(acciones, (accion) => Number(accion.avance) || 0)
    : proyecto.avance;
  const presupuestoProyecto = Number(proyecto.presupuesto || 0);
  const presupuestoEjecutadoProyecto = Number(proyecto.presupuesto_ejecutado || 0);
  const semaforoProyecto = getSemaforoByAvance(avanceProyecto);
  const estadoProyectoColorReal = semaforoProyecto === "verde"
    ? "green"
    : semaforoProyecto === "amarillo"
      ? "yellow"
      : "red";

  useEffect(() => {
    onComputedProgress(proyecto._id, avanceProyecto, semaforoProyecto);
  }, [proyecto._id, avanceProyecto, semaforoProyecto, onComputedProgress]);

  return (
    <Paper withBorder radius="xl" p="xl" shadow="sm" mb="lg">
      <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap">
        <Group gap={14} align="flex-start">
          <ThemeIcon size={46} radius="xl" color="blue" variant="light">
            <IconTrendingUp size={22} />
          </ThemeIcon>
          <div>
            <Group gap={8} mb={4} wrap="wrap">
              <Text size="xs" fw={700} c="dimmed">{proyecto.codigo}</Text>
              <Badge color={estadoProyectoColorReal} variant="light" radius="xl">
                {semaforoProyecto === "verde" ? "En cumplimiento" : semaforoProyecto === "amarillo" ? "En riesgo" : "Crítico"}
              </Badge>
            </Group>
            <Title order={4}>{proyecto.nombre}</Title>
            {proyecto.responsable && (
              <Text size="sm" c="dimmed" mt={4}>
                Responsable: <b>{proyecto.responsable}</b>
              </Text>
            )}
            {proyecto.descripcion && (
              <Text size="sm" c="dimmed" mt={4}>
                Propósito: <b>{proyecto.descripcion}</b>
              </Text>
            )}
            <Group gap={12} mt={6} wrap="wrap">
              <Text size="sm" c="dimmed">Peso: <b>{proyecto.peso}%</b></Text>
              <Text size="sm" c="dimmed">Presupuesto: <b>{formatCOP(presupuestoProyecto)}</b></Text>
              <Text size="sm" c="dimmed">Ejecutado: <b>{formatCOP(presupuestoEjecutadoProyecto)}</b></Text>
              <Group gap={8} align="center">
                <Text size="sm" c="dimmed">Avance global</Text>
                <Box style={{ width: 110 }}>
                  <AvanceBar avance={avanceProyecto} semaforo={semaforoProyecto} />
                </Box>
              </Group>
            </Group>
          </div>
        </Group>

        <Group gap={8}>
          {admin && (
            <Button
              size="sm"
              variant="light"
              color="orange"
              leftSection={<IconPlus size={14} />}
              onClick={() => { setSelectedAccion(null); setAccionModal(true); }}
            >
              Nueva acción
            </Button>
          )}
          {admin && <>
            <ActionIcon size="lg" variant="subtle" color="blue" onClick={() => onEdit(proyecto)}><IconEdit size={18} /></ActionIcon>
            <ActionIcon size="lg" variant="subtle" color="red" onClick={() => onDelete(proyecto._id)}><IconTrash size={18} /></ActionIcon>
          </>}
        </Group>
      </Group>

      <Group justify="space-between" align="center" mb="md">
        <div>
          <Text fw={700}>Acciones estratégicas</Text>
        </div>
        {acciones.length > 0 && (
          <Badge variant="outline" color="orange" radius="xl">
            {acciones.length} acción{acciones.length !== 1 ? "es" : ""}
          </Badge>
        )}
      </Group>

      {loading ? (
        <Center py="lg"><Loader size="sm" /></Center>
      ) : acciones.length === 0 ? (
        <Paper
          withBorder
          radius="lg"
          p="xl"
          style={{ borderStyle: "dashed", background: "var(--mantine-color-default-hover)" }}
        >
          <Stack align="center" gap={6}>
            <ThemeIcon size={44} radius="xl" color="orange" variant="light">
              <IconBulb size={20} />
            </ThemeIcon>
            <Text fw={600}>Este proyecto aún no tiene acciones</Text>
            <Text size="sm" c="dimmed" ta="center">
              Crea la primera acción estratégica para organizar responsables, seguimiento e indicadores.
            </Text>
            {admin && (
              <Button
                size="sm"
                color="orange"
                leftSection={<IconPlus size={14} />}
                onClick={() => { setSelectedAccion(null); setAccionModal(true); }}
              >
                Crear primera acción
              </Button>
            )}
          </Stack>
        </Paper>
      ) : (
        <Stack gap="md">
          {acciones.map((accion) => (
            <AccionCard
              key={accion._id}
              accion={accion}
              admin={admin}
              aniosPdi={aniosPdi}
              onEdit={(item) => { setSelectedAccion(item); setAccionModal(true); }}
              onDelete={handleDeleteAccion}
              onAvanceUpdate={refrescarProyecto}
              onComputedProgress={handleComputedAccionProgress}
            />
          ))}
        </Stack>
      )}

      <AccionModal
        opened={accionModal}
        onClose={() => setAccionModal(false)}
        selected={selectedAccion}
        defaultProyectoId={proyecto._id}
        onSaved={async (doc) => {
          setAcciones((prev) => selectedAccion
            ? prev.map((a) => a._id === doc._id ? doc : a)
            : [...prev, doc]
          );
          await refrescarProyecto();
        }}
      />
    </Paper>
  );
}

export default function MacroproyectoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const macroId = params?.macroId as string;
  const { userRole } = useRole();
  const { config } = usePdiConfig();
  const admin = isAdmin(userRole);

  const [macro, setMacro] = useState<Macroproyecto | null>(null);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [macros, setMacros] = useState<Macroproyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [macroModal, setMacroModal] = useState(false);
  const [proyectoModal, setProyectoModal] = useState(false);
  const [selectedProyecto, setSelectedProyecto] = useState<Proyecto | null>(null);
  const [executedFile, setExecutedFile] = useState<File | null>(null);
  const [uploadingExecuted, setUploadingExecuted] = useState(false);
  const [executedImportResult, setExecutedImportResult] = useState<ImportExecutedResponse | null>(null);

  useEffect(() => {
    if (!macroId) return;
    Promise.all([
      axios.get(PDI_ROUTES.macroproyecto(macroId)),
      axios.get(PDI_ROUTES.proyectos(), { params: { macroproyecto_id: macroId } }),
      axios.get(PDI_ROUTES.macroproyectos()),
    ])
      .then(([resMacro, resProyectos, resMacros]) => {
        setMacro(resMacro.data);
        setProyectos(resProyectos.data);
        setMacros(resMacros.data);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [macroId]);

  const refrescarMacro = async () => {
    try {
      const [resMacro, resProyectos] = await Promise.all([
        axios.get(PDI_ROUTES.macroproyecto(macroId)),
        axios.get(PDI_ROUTES.proyectos(), { params: { macroproyecto_id: macroId } }),
      ]);
      setMacro(resMacro.data);
      setProyectos(resProyectos.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportExecuted = async () => {
    if (!executedFile) {
      showNotification({ title: "Archivo requerido", message: "Selecciona un Excel antes de importar", color: "orange" });
      return;
    }

    const fileName = executedFile.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xlsm")) {
      showNotification({ title: "Formato invalido", message: "Solo se permiten archivos .xlsx o .xlsm", color: "orange" });
      return;
    }

    const formData = new FormData();
    formData.append("file", executedFile);
    formData.append("macroproyecto_id", macroId);

    setUploadingExecuted(true);
    try {
      const res = await axios.post<ImportExecutedResponse>(
        PDI_ROUTES.importarEjecutadoProyecto(),
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      setExecutedImportResult(res.data);
      await refrescarMacro();
      showNotification({
        title: "Ejecucion importada",
        message: `${res.data.proyectos_actualizados} proyecto(s) actualizados desde ${executedFile.name}`,
        color: "teal",
      });
    } catch (e: any) {
      showNotification({
        title: "Error al importar",
        message: e.response?.data?.error ?? "No se pudo procesar el archivo de ejecucion",
        color: "red",
      });
    } finally {
      setUploadingExecuted(false);
    }
  };

  const handleDeleteProyecto = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar proyecto",
      children: <Text size="sm">¿Seguro que deseas eliminar este proyecto?</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.proyecto(id));
          setProyectos((prev) => prev.filter((p) => p._id !== id));
          showNotification({ title: "Eliminado", message: "Proyecto eliminado", color: "teal" });
          await refrescarMacro();
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const barColor = macro
    ? macro.avance >= 50 ? "#22c55e" : macro.avance >= 25 ? "#f59e0b" : "#ef4444"
    : "#7c3aed";
  const avanceMacro = macro
    ? macro.avance
    : 0;
  const semaforoMacro = macro?.semaforo ?? getSemaforoByAvance(avanceMacro);
  const presupuestoMacro = Number(macro?.presupuesto) || 0;
  const presupuestoEjecutadoMacro = Number(macro?.presupuesto_ejecutado) || 0;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "20px 28px",
            borderBottom: "1px solid var(--mantine-color-default-border)",
            background: "var(--mantine-color-body)",
            flexShrink: 0,
          }}
        >
          {loading || !macro ? (
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}><IconArrowLeft size={18} /></ActionIcon>
              <Loader size="sm" />
            </Group>
          ) : (
            <Group justify="space-between" align="center" wrap="wrap">
              <Group gap={12}>
                <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}><IconArrowLeft size={18} /></ActionIcon>
                <ThemeIcon size={46} radius="xl" color="violet" variant="light">
                  <IconChartBarPopular size={22} />
                </ThemeIcon>
                <div>
                  <Group gap={8} wrap="wrap">
                    <Title order={3}>{macro.nombre}</Title>
                    <Badge color={SEMAFORO_COLOR[semaforoMacro]} variant="light" radius="xl">
                      {SEMAFORO_LABEL[semaforoMacro]}
                    </Badge>
                  </Group>
                  <Group gap={12} mt={4} wrap="wrap">
                    <Text size="sm" c="dimmed">Código: <b>{macro.codigo}</b></Text>
                    <Text size="sm" c="dimmed">Peso: <b>{macro.peso}%</b></Text>
                    {macro.lider && (
                      <Text size="sm" c="dimmed">Líder: <b>{macro.lider}</b></Text>
                    )}
                    {presupuestoMacro > 0 && (
                      <Text size="sm" c="dimmed">
                        Presupuesto: <b>{formatCOP(presupuestoMacro)}</b>
                        {presupuestoEjecutadoMacro > 0 && (
                          <> · Ejecutado: <b>{formatCOP(presupuestoEjecutadoMacro)}</b></>
                        )}
                      </Text>
                    )}
                    <Group gap={8}>
                      <Text size="sm" c="dimmed">Avance global</Text>
                      <Box style={{ width: 120 }}>
                        <AvanceBar avance={avanceMacro} semaforo={semaforoMacro} />
                      </Box>
                    </Group>
                  </Group>
                </div>
              </Group>

              <Group gap={8}>
                {admin && (
                  <>
                    <Button
                      size="sm"
                      variant="light"
                      color="violet"
                      leftSection={<IconEdit size={14} />}
                      onClick={() => setMacroModal(true)}
                    >
                      Editar macro
                    </Button>
                    <Button
                      size="sm"
                      color="blue"
                      leftSection={<IconPlus size={14} />}
                      onClick={() => { setSelectedProyecto(null); setProyectoModal(true); }}
                    >
                      Nuevo proyecto
                    </Button>
                  </>
                )}
                <Badge variant="outline" color="violet" radius="xl" size="lg">
                  {proyectos.length} proyecto{proyectos.length !== 1 ? "s" : ""}
                </Badge>
              </Group>
            </Group>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "28px" }}>
          {loading ? (
            <Center style={{ height: "100%" }}><Loader /></Center>
          ) : proyectos.length === 0 ? (
            <Center style={{ height: "60vh" }}>
              <Paper withBorder radius="xl" p="xl" shadow="sm" maw={520}>
                <Stack align="center" gap="xs">
                  <ThemeIcon size={56} radius="xl" color="blue" variant="light">
                    <IconFolderOpen size={28} />
                  </ThemeIcon>
                  <Text fw={700} size="lg">Sin proyectos registrados</Text>
                  <Text size="sm" c="dimmed" ta="center">
                    Crea el primer proyecto de este macroproyecto para empezar a organizar acciones e indicadores.
                  </Text>
                  {admin && (
                    <Button
                      leftSection={<IconPlus size={14} />}
                      color="blue"
                      mt="sm"
                      onClick={() => { setSelectedProyecto(null); setProyectoModal(true); }}
                    >
                      Nuevo proyecto
                    </Button>
                  )}
                </Stack>
              </Paper>
            </Center>
          ) : (
            <Stack gap="xl">
              {admin && macro && (
                <ExecutedImportPanel
                  macro={macro}
                  selectedFile={executedFile}
                  uploading={uploadingExecuted}
                  importResult={executedImportResult}
                  onPickFile={setExecutedFile}
                  onImport={handleImportExecuted}
                />
              )}
              {proyectos.map((proyecto) => (
                <ProyectoSeccion
                  key={proyecto._id}
                  proyecto={proyecto}
                  admin={admin}
                  aniosPdi={config.anios}
                  onEdit={(item) => { setSelectedProyecto(item); setProyectoModal(true); }}
                  onDelete={handleDeleteProyecto}
                  onAvanceUpdate={refrescarMacro}
                  onComputedProgress={() => {}}
                />
              ))}
            </Stack>
          )}
        </div>
      </div>

      {macro && (
        <MacroproyectoModal
          opened={macroModal}
          onClose={() => setMacroModal(false)}
          selected={macro}
          onSaved={(doc) => { setMacro(doc); setMacroModal(false); }}
        />
      )}

      <ProyectoModal
        opened={proyectoModal}
        onClose={() => setProyectoModal(false)}
        selected={selectedProyecto}
        macroproyectos={macros}
        defaultMacroId={macroId}
        onSaved={async (doc) => {
          setProyectos((prev) => selectedProyecto
            ? prev.map((p) => p._id === doc._id ? doc : p)
            : [...prev, doc]
          );
          await refrescarMacro();
        }}
      />
    </div>
  );
}
