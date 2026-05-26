"use client";

import { useState, useRef } from "react";
import {
  Container, Text, Paper, Group, Button, Stack, Box, Badge,
} from "@mantine/core";
import { IconFolderOpen, IconUpload } from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRole } from "@/app/context/RoleContext";
import type { ImportExecutedResponse } from "../types";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import PdiPresupuesto from "../components/PdiPresupuesto";

const formatCOP = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);

const isAdmin = (role: string) => role === "Administrador";

export default function PresupuestoPage() {
  const { userRole } = useRole();
  const admin = isAdmin(userRole);

  const [executedFile, setExecutedFile] = useState<File | null>(null);
  const [uploadingExecuted, setUploadingExecuted] = useState(false);
  const [budgetRefreshSignal, setBudgetRefreshSignal] = useState(0);
  const [executedImportResult, setExecutedImportResultState] = useState<ImportExecutedResponse | null>(() => {
    try { const s = localStorage.getItem("pdi_executed_import_result"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const setExecutedImportResult = (val: ImportExecutedResponse | null) => {
    setExecutedImportResultState(val);
    try {
      if (val) localStorage.setItem("pdi_executed_import_result", JSON.stringify(val));
      else localStorage.removeItem("pdi_executed_import_result");
    } catch {}
  };

  const handleImportExecuted = async () => {
    if (!executedFile) {
      showNotification({ title: "Archivo requerido", message: "Selecciona un archivo Excel antes de importar", color: "orange" });
      return;
    }
    const fileName = executedFile.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xlsm")) {
      showNotification({ title: "Formato inválido", message: "Solo se permiten archivos .xlsx o .xlsm", color: "orange" });
      return;
    }
    const formData = new FormData();
    formData.append("file", executedFile);
    setUploadingExecuted(true);
    try {
      const res = await axios.post<ImportExecutedResponse>(
        PDI_ROUTES.importarEjecutadoProyecto(),
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setExecutedImportResult(res.data);
      if (res.data.acciones_actualizadas === 0) {
        showNotification({
          title: "Sin coincidencias",
          message: res.data.observacion ?? "Ninguna acción del archivo coincidió con el sistema.",
          color: "orange",
        });
      } else {
        setBudgetRefreshSignal((value) => value + 1);
        showNotification({
          title: "Causado importado",
          message: `${res.data.acciones_actualizadas} acción(es) actualizadas — ${res.data.macro_detectado?.nombre ?? "búsqueda global"}`,
          color: "teal",
        });
      }
    } catch (e: any) {
      const errData = e.response?.data;
      const macrosDisponibles: { codigo: string; nombre: string; similitud: number }[] = errData?.macros_disponibles ?? [];
      const extra = macrosDisponibles.length
        ? `\nMacros en sistema: ${macrosDisponibles.map((m) => `${m.codigo} (${m.similitud}%)`).join(", ")}`
        : "";
      showNotification({
        title: "Error al importar",
        message: (errData?.error ?? "No se pudo procesar el archivo de causado") + extra,
        color: "red",
        autoClose: 12000,
      });
    } finally {
      setUploadingExecuted(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="xl" py="xl">

          <Paper withBorder radius="lg" p="md"
            style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.05), rgba(255,255,255,0.98) 58%)" }}>
            <Group gap={8} mb={4}>
              <Text fw={700}>Presupuesto PDI</Text>
              <Badge color="violet" variant="light" radius="sm">{new Date().getFullYear()}</Badge>
            </Group>
            <Text size="sm" c="dimmed" mb="md">
              Presupuesto asignado y comprometido por proyectos.
            </Text>
            <PdiPresupuesto refreshSignal={budgetRefreshSignal} />
          </Paper>

          {admin && (
            <Paper withBorder radius="lg" p="md" mt="md"
              style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.05), rgba(255,255,255,0.98) 58%)" }}>
              <Group justify="space-between" align="center" wrap="nowrap" gap="md">
                <div style={{ minWidth: 0 }}>
                  <Text fw={700}>Importar causado presupuestal</Text>
                  <Text size="sm" c="dimmed" mt={2}>
                    El macroproyecto se identifica automáticamente desde el archivo Excel.
                  </Text>
                </div>
                <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xlsx,.xlsm"
                    style={{ display: "none" }}
                    onChange={(e) => { setExecutedFile(e.currentTarget.files?.[0] ?? null); }}
                  />
                  <Button variant="default" leftSection={<IconFolderOpen size={14} />}
                    onClick={() => importInputRef.current?.click()}>
                    {executedFile ? executedFile.name.slice(0, 20) + (executedFile.name.length > 20 ? "…" : "") : "Seleccionar Excel"}
                  </Button>
                  <Button color="blue" leftSection={<IconUpload size={14} />}
                    loading={uploadingExecuted}
                    disabled={!executedFile}
                    onClick={handleImportExecuted}>
                    Importar causado
                  </Button>
                </Group>
              </Group>

              {executedImportResult && (() => {
                const r = executedImportResult;
                const detalle = r.acciones_actualizadas_detalle ?? [];
                const byProyecto = new Map<string, { nombre: string; acciones: typeof detalle }>();
                for (const a of detalle) {
                  const key = a.codigo_proyecto ?? a.nombre_proyecto ?? "Sin proyecto";
                  if (!byProyecto.has(key)) byProyecto.set(key, { nombre: a.nombre_proyecto ?? key, acciones: [] });
                  byProyecto.get(key)!.acciones.push(a);
                }
                const noEncontradosAcciones = r.no_encontrados?.acciones ?? [];
                const noEncontradosProyectos = r.no_encontrados?.proyectos ?? [];

                return (
                  <Stack gap="md" mt="md">
                    {r.acciones_actualizadas === 0 && r.observacion && (
                      <Paper withBorder radius="lg" p="sm" style={{ background: "#fffbeb", borderColor: "#fbbf24" }}>
                        <Group gap={8}>
                          <Badge color="orange" variant="light" size="sm">Sin coincidencias</Badge>
                          <Text size="sm">{r.observacion}</Text>
                        </Group>
                      </Paper>
                    )}
                    {r.macro_detectado && (
                      <Paper withBorder radius="lg" p="sm" style={{ background: "#f0fdf4", borderColor: "#86efac" }}>
                        <Group gap={8} align="center">
                          <Badge color="green" variant="filled" size="sm">Macro detectado</Badge>
                          <Text size="sm" fw={700}>{r.macro_detectado.codigo} — {r.macro_detectado.nombre}</Text>
                          <Text size="xs" c="dimmed" ml="auto">{r.acciones_actualizadas} acción(es) actualizada(s) · {r.proyectos_actualizados} proyecto(s)</Text>
                        </Group>
                      </Paper>
                    )}

                    {byProyecto.size > 0 && (
                      <Box style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #e9ecef", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: "#f1f3f5" }}>
                              <th style={{ padding: "10px 14px", textAlign: "left",  borderBottom: "2px solid #dee2e6", fontWeight: 700, color: "#495057", minWidth: 160, whiteSpace: "nowrap" }}>Proyecto</th>
                              <th style={{ padding: "10px 14px", textAlign: "left",  borderBottom: "2px solid #dee2e6", fontWeight: 700, color: "#495057", minWidth: 110, whiteSpace: "nowrap" }}>Acción</th>
                              <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "2px solid #dee2e6", fontWeight: 700, color: "#2563eb", minWidth: 130, whiteSpace: "nowrap" }}>Gasto</th>
                              <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "2px solid #dee2e6", fontWeight: 700, color: "#7c3aed", minWidth: 130, whiteSpace: "nowrap" }}>Inversión</th>
                              <th style={{ padding: "10px 14px", textAlign: "right", borderBottom: "2px solid #dee2e6", fontWeight: 700, color: "#374151", minWidth: 130, whiteSpace: "nowrap" }}>Total causado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from(byProyecto.entries()).flatMap(([key, { nombre, acciones: accs }]) => {
                              const totalGasto     = accs.reduce((s, a) => s + (a.gasto ?? 0), 0);
                              const totalInversion = accs.reduce((s, a) => s + (a.inversion ?? 0), 0);
                              const totalEjec      = accs.reduce((s, a) => s + a.presupuesto_ejecutado, 0);
                              return [
                                <tr key={`hdr-${key}`} style={{ background: "#eef1f5", borderTop: "2px solid #dee2e6" }}>
                                  <td colSpan={2} style={{ padding: "9px 14px", fontWeight: 800 }}>
                                    <Group gap={8} wrap="nowrap">
                                      <Badge color="blue" variant="filled" size="sm" radius="sm">{key}</Badge>
                                      <Text size="sm" fw={800}>{nombre}</Text>
                                    </Group>
                                  </td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", color: "#2563eb", fontWeight: 800, whiteSpace: "nowrap" }}>{formatCOP(totalGasto)}</td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", color: "#7c3aed", fontWeight: 800, whiteSpace: "nowrap" }}>{formatCOP(totalInversion)}</td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>{formatCOP(totalEjec)}</td>
                                </tr>,
                                ...accs.map((a, idx) => (
                                  <tr key={`${key}-${idx}`} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                                    <td style={{ padding: "7px 14px 7px 28px", color: "#868e96", fontSize: 12 }}>
                                      <Text size="xs" c="dimmed">{key}</Text>
                                    </td>
                                    <td style={{ padding: "7px 14px", verticalAlign: "middle" }}>
                                      <Group gap={6} wrap="nowrap">
                                        {a.tipo === "gasto"    && <Badge color="blue"   variant="light" size="xs">G</Badge>}
                                        {a.tipo === "inversion"&& <Badge color="violet" variant="light" size="xs">I</Badge>}
                                        {a.tipo === "mixto"    && <Badge color="grape"  variant="light" size="xs">G+I</Badge>}
                                        <Text size="xs" fw={700}>{a.codigo_accion ?? a.codigo ?? a.nombre ?? a.nombre_accion}</Text>
                                      </Group>
                                    </td>
                                    <td style={{ padding: "7px 14px", textAlign: "right", color: "#2563eb", fontWeight: (a.gasto ?? 0) > 0 ? 700 : 400, whiteSpace: "nowrap" }}>
                                      {(a.gasto ?? 0) > 0 ? formatCOP(a.gasto!) : "—"}
                                    </td>
                                    <td style={{ padding: "7px 14px", textAlign: "right", color: "#7c3aed", fontWeight: (a.inversion ?? 0) > 0 ? 700 : 400, whiteSpace: "nowrap" }}>
                                      {(a.inversion ?? 0) > 0 ? formatCOP(a.inversion!) : "—"}
                                    </td>
                                    <td style={{ padding: "7px 14px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                                      {formatCOP(a.presupuesto_ejecutado)}
                                    </td>
                                  </tr>
                                )),
                              ];
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "#e9ecef", borderTop: "2px solid #ced4da" }}>
                              <td colSpan={2} style={{ padding: "9px 14px", fontWeight: 800, fontSize: 13 }}>TOTAL IMPORTADO</td>
                              <td style={{ padding: "9px 14px", textAlign: "right", color: "#2563eb", fontWeight: 800, whiteSpace: "nowrap" }}>
                                {formatCOP(Array.from(byProyecto.values()).flatMap(p => p.acciones).reduce((s, a) => s + (a.gasto ?? 0), 0))}
                              </td>
                              <td style={{ padding: "9px 14px", textAlign: "right", color: "#7c3aed", fontWeight: 800, whiteSpace: "nowrap" }}>
                                {formatCOP(Array.from(byProyecto.values()).flatMap(p => p.acciones).reduce((s, a) => s + (a.inversion ?? 0), 0))}
                              </td>
                              <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>
                                {formatCOP(Array.from(byProyecto.values()).flatMap(p => p.acciones).reduce((s, a) => s + a.presupuesto_ejecutado, 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </Box>
                    )}

                    {detalle.length > 0 && (
                      <Paper withBorder radius="lg" p="sm" style={{ background: "#eff6ff", borderColor: "#93c5fd" }}>
                        <Group gap={24} wrap="wrap">
                          <Text size="sm" fw={700} c="blue">Totales importados</Text>
                          <Text size="sm" c="dimmed">Gasto: <b style={{ color: "#2563eb" }}>{formatCOP(r.totales_importados.gasto ?? 0)}</b></Text>
                          <Text size="sm" c="dimmed">Inversión: <b style={{ color: "#7c3aed" }}>{formatCOP(r.totales_importados.inversion ?? 0)}</b></Text>
                          <Text size="sm" fw={700}>Total causado: {formatCOP(r.totales_importados.presupuesto_ejecutado)}</Text>
                        </Group>
                      </Paper>
                    )}

                    {noEncontradosAcciones.length > 0 && (
                      <Paper withBorder radius="lg" p="sm" style={{ background: "#fff7ed", borderColor: "#fed7aa" }}>
                        <Text size="sm" fw={700} c="orange" mb={4}>No encontrados ({noEncontradosAcciones.length})</Text>
                        <Text size="xs" c="dimmed">{noEncontradosAcciones.slice(0, 10).join(", ")}{noEncontradosAcciones.length > 10 ? ` y ${noEncontradosAcciones.length - 10} más…` : ""}</Text>
                      </Paper>
                    )}
                  </Stack>
                );
              })()}
            </Paper>
          )}

        </Container>
      </div>
    </div>
  );
}
