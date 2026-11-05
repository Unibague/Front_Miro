"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon, Badge, Box, Breadcrumbs, Button, Center, Container, Divider, Drawer, Group, Loader,
  Modal, NumberInput, Paper, SegmentedControl, Select, Stack, Text, TextInput, Textarea, Title, Tooltip, Anchor,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import {
  IconArrowDown, IconArrowLeft, IconArrowUp, IconChevronDown, IconChevronRight, IconEdit, IconLink,
  IconPlus, IconSearch, IconSitemap, IconTrash, IconZoomIn, IconZoomOut, IconZoomReset, IconFocus2,
} from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const API = `${process.env.NEXT_PUBLIC_API_URL}/organigrama`;

type Relacion = "linea" | "staff";

interface Unidad {
  _id: string;
  nombre: string;
  tipo: string;
  relacion: Relacion;
  nivel: "Pregrado" | "Posgrado" | null;
  parent: string | null;
  orden: number;
  dep_code: string | null;
  descripcion: string;
  hijos: Unidad[];
}

interface Catalogos {
  tipos: string[];
  niveles: string[];
  dependencias: { dep_code: string; name: string }[];
}

type FormState = {
  _id?: string;
  nombre: string;
  tipo: string;
  relacion: Relacion;
  nivel: string | null;
  parent: string | null;
  orden: number;
  dep_code: string | null;
  descripcion: string;
};

const FORM_VACIO: FormState = {
  nombre: "", tipo: "Unidad administrativa", relacion: "linea", nivel: null,
  parent: null, orden: 0, dep_code: null, descripcion: "",
};

// Colores tomados del organigrama institucional
const COLOR_STAFF = { bg: "#b8962e", fg: "#ffffff" };
const COLOR_TIPO: Record<string, { bg: string; fg: string }> = {
  "Órgano de gobierno": { bg: "#0b2a4a", fg: "#ffffff" },
  "Rectoría": { bg: "#0b2a4a", fg: "#ffffff" },
  "Vicerrectoría": { bg: "#123b6b", fg: "#ffffff" },
  "Dirección": { bg: "#123b6b", fg: "#ffffff" },
  "Gerencia": { bg: "#123b6b", fg: "#ffffff" },
  "Facultad": { bg: "#2f5fb3", fg: "#ffffff" },
  "Escuela": { bg: "#123b6b", fg: "#ffffff" },
  "Área": { bg: "#1d4f7f", fg: "#ffffff" },
  "Programa": { bg: "#3a63b8", fg: "#ffffff" },
  "Unidad académica": { bg: "#2a9fd6", fg: "#ffffff" },
  "Unidad administrativa": { bg: "#2f5fb3", fg: "#ffffff" },
  "Otra": { bg: "#5c6b7a", fg: "#ffffff" },
};
const colorDe = (u: Unidad) => (u.relacion === "staff" ? COLOR_STAFF : COLOR_TIPO[u.tipo] ?? COLOR_TIPO.Otra);

// Programas (y unidades sueltas de un Área) se muestran en listas, como en el organigrama impreso
const esHojaListable = (u: Unidad, padre: Unidad) =>
  u.hijos.length === 0 && u.relacion === "linea" && (u.tipo === "Programa" || padre.tipo === "Área");

// ── Árbol ──────────────────────────────────────────────────────────────────
const construirArbol = (lista: Omit<Unidad, "hijos">[]): Unidad[] => {
  const porId = new Map<string, Unidad>(lista.map((u) => [u._id, { ...u, hijos: [] }]));
  const raices: Unidad[] = [];
  porId.forEach((u) => {
    const padre = u.parent ? porId.get(u.parent) : undefined;
    if (padre) padre.hijos.push(u);
    else raices.push(u);
  });
  const ordenar = (l: Unidad[]) => {
    l.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
    l.forEach((u) => ordenar(u.hijos));
  };
  ordenar(raices);
  return raices;
};

const contarDescendientes = (u: Unidad): number => u.hijos.reduce((acc, h) => acc + 1 + contarDescendientes(h), 0);

const idsDescendientes = (u: Unidad): string[] => u.hijos.flatMap((h) => [h._id, ...idsDescendientes(h)]);

// ── Diagrama ───────────────────────────────────────────────────────────────
const ESTILOS_DIAGRAMA = `
.org-tree, .org-tree ul { display: flex; justify-content: center; padding-top: 20px; position: relative; margin: 0; padding-left: 0; }
.org-tree li { list-style: none; text-align: center; position: relative; padding: 20px 6px 0 6px; display: flex; flex-direction: column; align-items: center; }
.org-tree li::before, .org-tree li::after { content: ""; position: absolute; top: 0; right: 50%; width: 50%; height: 20px; border-top: 2px solid var(--org-linea); }
.org-tree li::after { right: auto; left: 50%; border-left: 2px solid var(--org-linea); }
.org-tree li:only-child::after, .org-tree li:only-child::before { display: none; }
.org-tree li:only-child { padding-top: 0; }
.org-tree li:first-child::before, .org-tree li:last-child::after { border: 0 none; }
.org-tree li:last-child::before { border-right: 2px solid var(--org-linea); border-radius: 0 6px 0 0; }
.org-tree li:first-child::after { border-radius: 6px 0 0 0; }
.org-tree ul ul::before, .org-tree > li > ul::before { content: ""; position: absolute; top: 0; left: 50%; border-left: 2px solid var(--org-linea); height: 20px; }
.org-root > li { padding-top: 0; }
.org-root > li::before, .org-root > li::after { display: none; }
.org-caja { border-radius: 6px; padding: 8px 12px; font-size: 12px; font-weight: 600; line-height: 1.25; max-width: 210px; min-width: 120px; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.18); transition: transform 120ms ease, box-shadow 120ms ease; }
.org-caja:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,.22); }
.org-caja.seleccionada { outline: 3px solid #f59f00; outline-offset: 2px; }
.org-staff { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 6px; max-width: 320px; }
.org-staff .org-caja { min-width: 0; font-size: 11px; padding: 4px 8px; font-weight: 500; }
.org-lista { border-radius: 6px; padding: 8px 10px; font-size: 11px; text-align: left; min-width: 150px; max-width: 220px; }
.org-lista-item { padding: 1px 0 1px 12px; cursor: pointer; position: relative; }
.org-lista-item::before { content: "•"; position: absolute; left: 0; }
.org-nodo { position: relative; display: flex; flex-direction: column; align-items: center; }
.org-toggle { position: absolute; right: -10px; bottom: -10px; z-index: 1; }
.org-conector { width: 2px; height: 10px; background: var(--org-linea); }
.org-listas { display: flex; gap: 8px; justify-content: center; }
`;

function CajaUnidad({ u, seleccionado, onSelect }: { u: Unidad; seleccionado: string | null; onSelect: (u: Unidad) => void }) {
  const c = colorDe(u);
  return (
    <div
      className={`org-caja${seleccionado === u._id ? " seleccionada" : ""}`}
      style={{ background: c.bg, color: c.fg }}
      onClick={(e) => { e.stopPropagation(); onSelect(u); }}
      title={u.dep_code ? `${u.nombre} · Dependencia ${u.dep_code}` : u.nombre}
    >
      {u.nombre}
    </div>
  );
}

function ListasHojas({ hojas, seleccionado, onSelect }: { hojas: Unidad[]; seleccionado: string | null; onSelect: (u: Unidad) => void }) {
  const grupos = [
    { clave: "pre", items: hojas.filter((h) => h.tipo === "Programa" && h.nivel !== "Posgrado") },
    { clave: "pos", items: hojas.filter((h) => h.tipo === "Programa" && h.nivel === "Posgrado") },
    { clave: "uni", items: hojas.filter((h) => h.tipo !== "Programa") },
  ].filter((g) => g.items.length > 0);
  return (
    <div className="org-listas">
      {grupos.map((g) => (
        <div key={g.clave} className="org-lista" style={{ background: g.clave === "uni" ? COLOR_TIPO["Unidad académica"].bg : COLOR_TIPO.Programa.bg, color: "#fff" }}>
          {g.items.map((h) => (
            <div
              key={h._id}
              className="org-lista-item"
              onClick={(e) => { e.stopPropagation(); onSelect(h); }}
              style={{ fontWeight: seleccionado === h._id ? 800 : 500, textDecoration: seleccionado === h._id ? "underline" : "none" }}
            >
              {h.nombre}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function NodoDiagrama({ u, seleccionado, colapsados, onSelect, onToggle }: {
  u: Unidad; seleccionado: string | null; colapsados: Set<string>;
  onSelect: (u: Unidad) => void; onToggle: (id: string) => void;
}) {
  const staff = u.hijos.filter((h) => h.relacion === "staff");
  const linea = u.hijos.filter((h) => h.relacion !== "staff");
  const hojas = linea.filter((h) => esHojaListable(h, u));
  const ramas = linea.filter((h) => !esHojaListable(h, u));
  const colapsado = colapsados.has(u._id);
  const tieneHijos = u.hijos.length > 0;

  return (
    <li>
      <div className="org-nodo">
        <CajaUnidad u={u} seleccionado={seleccionado} onSelect={onSelect} />
        {tieneHijos && (
          <ActionIcon className="org-toggle" size="xs" radius="xl" variant="default" onClick={() => onToggle(u._id)}
            aria-label={colapsado ? "Expandir" : "Contraer"}>
            {colapsado ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
          </ActionIcon>
        )}
      </div>
      {!colapsado && staff.length > 0 && (
        <>
          <div className="org-conector" />
          <div className="org-staff">
            {staff.map((s) => <CajaUnidad key={s._id} u={s} seleccionado={seleccionado} onSelect={onSelect} />)}
          </div>
          {(ramas.length > 0 || hojas.length > 0) && <div className="org-conector" />}
        </>
      )}
      {!colapsado && (ramas.length > 0 || hojas.length > 0) && (
        <ul>
          {ramas.map((h) => (
            <NodoDiagrama key={h._id} u={h} seleccionado={seleccionado} colapsados={colapsados} onSelect={onSelect} onToggle={onToggle} />
          ))}
          {hojas.length > 0 && (
            <li>
              <ListasHojas hojas={hojas} seleccionado={seleccionado} onSelect={onSelect} />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

// ── Vista de estructura (lista editable) ───────────────────────────────────
function FilaEstructura({ u, nivel, hermanos, abiertos, filtro, onToggle, onSelect, onAgregar, onEditar, onEliminar, onMover }: {
  u: Unidad; nivel: number; hermanos: Unidad[]; abiertos: Set<string>; filtro: string;
  onToggle: (id: string) => void; onSelect: (u: Unidad) => void; onAgregar: (padre: Unidad) => void;
  onEditar: (u: Unidad) => void; onEliminar: (u: Unidad) => void; onMover: (u: Unidad, hermanos: Unidad[], dir: -1 | 1) => void;
}) {
  const coincide = (x: Unidad): boolean =>
    x.nombre.toLowerCase().includes(filtro) || x.hijos.some(coincide);
  if (filtro && !coincide(u)) return null;
  const abierto = filtro ? true : abiertos.has(u._id);
  const idx = hermanos.findIndex((h) => h._id === u._id);
  const c = colorDe(u);

  return (
    <>
      <Group gap={6} wrap="nowrap" py={4} pl={nivel * 22} pr="xs"
        style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => onToggle(u._id)}
          style={{ visibility: u.hijos.length ? "visible" : "hidden" }} aria-label="Expandir">
          {abierto ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </ActionIcon>
        <Box w={10} h={10} style={{ borderRadius: 3, background: c.bg, flexShrink: 0 }} />
        <Text size="sm" fw={u.hijos.length ? 600 : 400} style={{ flex: 1, cursor: "pointer" }} onClick={() => onSelect(u)} lineClamp={1}>
          {u.nombre}
        </Text>
        <Badge size="xs" variant="light" color={u.relacion === "staff" ? "yellow" : "blue"}>
          {u.relacion === "staff" ? `${u.tipo} · apoyo` : u.tipo}
        </Badge>
        {u.nivel && <Badge size="xs" variant="outline" color="gray">{u.nivel}</Badge>}
        {u.dep_code
          ? <Tooltip label={`Vinculada a la dependencia ${u.dep_code}`}><Badge size="xs" color="teal" variant="light" leftSection={<IconLink size={10} />}>{u.dep_code}</Badge></Tooltip>
          : null}
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Subir"><ActionIcon size="sm" variant="subtle" disabled={idx <= 0} onClick={() => onMover(u, hermanos, -1)}><IconArrowUp size={14} /></ActionIcon></Tooltip>
          <Tooltip label="Bajar"><ActionIcon size="sm" variant="subtle" disabled={idx === hermanos.length - 1} onClick={() => onMover(u, hermanos, 1)}><IconArrowDown size={14} /></ActionIcon></Tooltip>
          <Tooltip label="Agregar subunidad"><ActionIcon size="sm" variant="subtle" color="teal" onClick={() => onAgregar(u)}><IconPlus size={14} /></ActionIcon></Tooltip>
          <Tooltip label="Editar"><ActionIcon size="sm" variant="subtle" color="blue" onClick={() => onEditar(u)}><IconEdit size={14} /></ActionIcon></Tooltip>
          <Tooltip label="Eliminar"><ActionIcon size="sm" variant="subtle" color="red" onClick={() => onEliminar(u)}><IconTrash size={14} /></ActionIcon></Tooltip>
        </Group>
      </Group>
      {abierto && u.hijos.map((h) => (
        <FilaEstructura key={h._id} u={h} nivel={nivel + 1} hermanos={u.hijos} abiertos={abiertos} filtro={filtro}
          onToggle={onToggle} onSelect={onSelect} onAgregar={onAgregar} onEditar={onEditar} onEliminar={onEliminar} onMover={onMover} />
      ))}
    </>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────
export default function OrganigramaPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";

  const [lista, setLista] = useState<Omit<Unidad, "hijos">[]>([]);
  const [catalogos, setCatalogos] = useState<Catalogos>({ tipos: [], niveles: [], dependencias: [] });
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<"diagrama" | "estructura">("diagrama");
  const [focoId, setFocoId] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<Unidad | null>(null);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(0.9);
  const [filtro, setFiltro] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [guardando, setGuardando] = useState(false);

  const arbol = useMemo(() => construirArbol(lista), [lista]);
  const porId = useMemo(() => {
    const m = new Map<string, Unidad>();
    const recorrer = (l: Unidad[]) => l.forEach((u) => { m.set(u._id, u); recorrer(u.hijos); });
    recorrer(arbol);
    return m;
  }, [arbol]);

  const cargar = useCallback(async () => {
    try {
      const [resNodos, resCat] = await Promise.all([axios.get(API), axios.get(`${API}/catalogos`)]);
      setLista(resNodos.data);
      setCatalogos(resCat.data);
    } catch {
      showNotification({ title: "Error", message: "No se pudo cargar el organigrama", color: "red" });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Al cargar por primera vez: las facultades y unidades profundas inician contraídas
  useEffect(() => {
    if (!arbol.length || colapsados.size || abiertos.size) return;
    const iniciales = new Set<string>();
    porId.forEach((u) => { if (u.tipo === "Facultad" || u.tipo === "Escuela") iniciales.add(u._id); });
    setColapsados(iniciales);
    setAbiertos(new Set(arbol.map((u) => u._id)));
  }, [arbol, porId, colapsados.size, abiertos.size]);

  const raicesVisibles = focoId && porId.get(focoId) ? [porId.get(focoId)!] : arbol;

  const ancestros = useMemo(() => {
    const out: Unidad[] = [];
    let actual = focoId ? porId.get(focoId) : undefined;
    while (actual?.parent) {
      const padre = porId.get(actual.parent);
      if (!padre) break;
      out.unshift(padre);
      actual = padre;
    }
    return out;
  }, [focoId, porId]);

  const opcionesNodos = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const recorrer = (l: Unidad[], prof: number) => l.forEach((u) => {
      out.push({ value: u._id, label: `${"— ".repeat(prof)}${u.nombre}` });
      recorrer(u.hijos, prof + 1);
    });
    recorrer(arbol, 0);
    return out;
  }, [arbol]);

  const opcionesDependencias = useMemo(
    () => catalogos.dependencias.map((d) => ({ value: d.dep_code, label: `${d.name} (${d.dep_code})` })),
    [catalogos.dependencias]
  );
  const nombreDependencia = (code: string | null) =>
    catalogos.dependencias.find((d) => d.dep_code === code)?.name ?? code ?? "";

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  };

  const verRama = (u: Unidad) => {
    setFocoId(u._id);
    setColapsados((prev) => {
      const n = new Set(prev);
      n.delete(u._id);
      u.hijos.forEach((h) => n.delete(h._id));
      return n;
    });
    setSeleccionado(null);
    setVista("diagrama");
  };

  const abrirNuevo = (padre: Unidad | null) => {
    setForm({ ...FORM_VACIO, parent: padre?._id ?? null, orden: padre ? padre.hijos.length : arbol.length });
  };

  const abrirEdicion = (u: Unidad) => {
    setForm({
      _id: u._id, nombre: u.nombre, tipo: u.tipo, relacion: u.relacion, nivel: u.nivel,
      parent: u.parent, orden: u.orden, dep_code: u.dep_code, descripcion: u.descripcion ?? "",
    });
  };

  const guardar = async () => {
    if (!form) return;
    if (!form.nombre.trim()) {
      showNotification({ title: "Falta el nombre", message: "Escribe el nombre de la unidad", color: "red" });
      return;
    }
    setGuardando(true);
    try {
      const payload = { ...form, nombre: form.nombre.trim(), nivel: form.tipo === "Programa" ? form.nivel : null, email };
      if (form._id) await axios.put(`${API}/${form._id}`, payload);
      else await axios.post(API, payload);
      showNotification({ title: "Guardado", message: "El organigrama se actualizó", color: "teal" });
      setForm(null);
      setSeleccionado(null);
      await cargar();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "No se pudo guardar", color: "red" });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = (u: Unidad) => {
    const total = contarDescendientes(u);
    modals.openConfirmModal({
      title: "Eliminar unidad",
      centered: true,
      children: (
        <Text size="sm">
          ¿Eliminar <b>{u.nombre}</b>?
          {total > 0 && <> También se eliminarán sus <b>{total}</b> subunidades. Si quieres conservarlas, muévelas antes a otra unidad.</>}
        </Text>
      ),
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/${u._id}`, { params: { email, cascada: total > 0 } });
          showNotification({ title: "Eliminada", message: "La unidad se eliminó del organigrama", color: "teal" });
          if (focoId && (focoId === u._id || idsDescendientes(u).includes(focoId))) setFocoId(null);
          setSeleccionado(null);
          await cargar();
        } catch (e: any) {
          showNotification({ title: "Error", message: e.response?.data?.error ?? "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const mover = async (u: Unidad, hermanos: Unidad[], dir: -1 | 1) => {
    const ids = hermanos.map((h) => h._id);
    const i = ids.indexOf(u._id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setLista((prev) => prev.map((x) => (ids.includes(x._id) ? { ...x, orden: ids.indexOf(x._id) } : x)));
    try {
      await axios.put(`${API}/reordenar`, { parent: u.parent, ids, email });
    } catch {
      showNotification({ title: "Error", message: "No se pudo cambiar el orden", color: "red" });
      await cargar();
    }
  };

  const cargarBase = async () => {
    try {
      const res = await axios.post(`${API}/estructura-base`, { email });
      showNotification({
        title: "Estructura cargada",
        message: `Se crearon ${res.data.creados} unidades; ${res.data.vinculados} quedaron vinculadas a dependencias existentes.`,
        color: "teal",
      });
      await cargar();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "No se pudo cargar la estructura", color: "red" });
    }
  };

  const vincular = async () => {
    try {
      const res = await axios.post(`${API}/vincular`, { email });
      showNotification({
        title: "Vinculación por nombre",
        message: `${res.data.vinculados} unidades vinculadas. ${res.data.sin_vincular} siguen sin dependencia; puedes vincularlas al editarlas.`,
        color: "teal",
      });
      await cargar();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "No se pudo vincular", color: "red" });
    }
  };

  // Padres válidos: todos menos la unidad misma y sus descendientes
  const opcionesPadre = useMemo(() => {
    if (!form?._id) return opcionesNodos;
    const u = porId.get(form._id);
    const excluir = new Set([form._id, ...(u ? idsDescendientes(u) : [])]);
    return opcionesNodos.filter((o) => !excluir.has(o.value));
  }, [form?._id, opcionesNodos, porId]);

  const sinVincular = lista.filter((u) => !u.dep_code).length;

  return (
    <Container size="xl" py="md">
      <style>{ESTILOS_DIAGRAMA}</style>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={() => router.push("/configuracion")} aria-label="Volver a Configuración">
            <IconArrowLeft size={20} />
          </ActionIcon>
          <IconSitemap size={28} />
          <div>
            <Title order={2}>Organigrama institucional</Title>
            <Text size="sm" c="dimmed">Estructura de la Universidad y sus unidades. Otros módulos usarán estas ramas para agrupar la información.</Text>
          </div>
        </Group>
        {lista.length > 0 && (
          <Group gap="xs">
            <Tooltip label={`${sinVincular} unidades sin dependencia vinculada`}>
              <Button variant="default" leftSection={<IconLink size={16} />} onClick={vincular}>Vincular por nombre</Button>
            </Tooltip>
            <Button leftSection={<IconPlus size={16} />} onClick={() => abrirNuevo(null)}>Nueva unidad raíz</Button>
          </Group>
        )}
      </Group>

      {cargando ? (
        <Center py="xl"><Loader /></Center>
      ) : lista.length === 0 ? (
        <Paper withBorder radius="md" p="xl">
          <Stack align="center" gap="sm">
            <IconSitemap size={56} />
            <Text fw={600}>El organigrama está vacío</Text>
            <Text size="sm" c="dimmed" ta="center" maw={520}>
              Puedes cargar la estructura institucional base (Consejo de Fundadores, Rectoría, Vicerrectoría, facultades,
              escuelas, áreas y programas) y luego ajustarla, o crear las unidades una por una.
            </Text>
            <Group>
              <Button onClick={cargarBase}>Cargar estructura base</Button>
              <Button variant="default" onClick={() => abrirNuevo(null)}>Crear la primera unidad</Button>
            </Group>
          </Stack>
        </Paper>
      ) : (
        <>
          <Group justify="space-between" mb="sm" wrap="wrap">
            <SegmentedControl
              value={vista}
              onChange={(v) => setVista(v as "diagrama" | "estructura")}
              data={[{ value: "diagrama", label: "Diagrama" }, { value: "estructura", label: "Estructura" }]}
            />
            {vista === "diagrama" ? (
              <Group gap="xs">
                <Select
                  placeholder="Ver una rama..."
                  searchable
                  clearable
                  data={opcionesNodos}
                  value={focoId}
                  onChange={(v) => { if (v && porId.get(v)) verRama(porId.get(v)!); else setFocoId(null); }}
                  w={320}
                  leftSection={<IconFocus2 size={16} />}
                />
                <ActionIcon variant="default" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} aria-label="Alejar"><IconZoomOut size={16} /></ActionIcon>
                <ActionIcon variant="default" onClick={() => setZoom(0.9)} aria-label="Restablecer zoom"><IconZoomReset size={16} /></ActionIcon>
                <ActionIcon variant="default" onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))} aria-label="Acercar"><IconZoomIn size={16} /></ActionIcon>
              </Group>
            ) : (
              <TextInput placeholder="Buscar unidad..." leftSection={<IconSearch size={16} />} value={filtro}
                onChange={(e) => setFiltro(e.currentTarget.value)} w={320} />
            )}
          </Group>

          {vista === "diagrama" ? (
            <Paper withBorder radius="md" p="md">
              {focoId && (
                <Breadcrumbs mb="sm" separator="›">
                  <Anchor size="sm" onClick={() => setFocoId(null)}>Organigrama completo</Anchor>
                  {ancestros.map((a) => (
                    <Anchor key={a._id} size="sm" onClick={() => verRama(a)}>{a.nombre}</Anchor>
                  ))}
                  <Text size="sm" fw={600}>{porId.get(focoId)?.nombre}</Text>
                </Breadcrumbs>
              )}
              <Text size="xs" c="dimmed" mb="xs">
                Haz clic en una unidad para ver su detalle. Usa el botón redondo de cada caja para expandir o contraer su rama.
              </Text>
              <Box style={{ overflow: "auto", ["--org-linea" as any]: "var(--mantine-color-gray-5)" }} py="sm">
                <div style={{ zoom, width: "max-content", minWidth: "100%", margin: "0 auto" }}>
                  <ul className="org-tree org-root">
                    {raicesVisibles.map((u) => (
                      <NodoDiagrama key={u._id} u={u} seleccionado={seleccionado?._id ?? null} colapsados={colapsados}
                        onSelect={setSeleccionado} onToggle={(id) => setColapsados((c) => toggle(c, id))} />
                    ))}
                  </ul>
                </div>
              </Box>
              <Divider my="sm" />
              <Group gap="md">
                {[["Gobierno / dirección", COLOR_TIPO.Rectoría.bg], ["Facultad / unidad", COLOR_TIPO.Facultad.bg],
                  ["Área", COLOR_TIPO["Área"].bg], ["Programas", COLOR_TIPO.Programa.bg],
                  ["Unidad académica", COLOR_TIPO["Unidad académica"].bg], ["Apoyo / staff", COLOR_STAFF.bg]].map(([label, color]) => (
                  <Group key={label} gap={6}>
                    <Box w={12} h={12} style={{ borderRadius: 3, background: color }} />
                    <Text size="xs" c="dimmed">{label}</Text>
                  </Group>
                ))}
              </Group>
            </Paper>
          ) : (
            <Paper withBorder radius="md">
              {arbol.map((u) => (
                <FilaEstructura key={u._id} u={u} nivel={0} hermanos={arbol} abiertos={abiertos} filtro={filtro.trim().toLowerCase()}
                  onToggle={(id) => setAbiertos((a) => toggle(a, id))} onSelect={setSeleccionado}
                  onAgregar={abrirNuevo} onEditar={abrirEdicion} onEliminar={eliminar} onMover={mover} />
              ))}
            </Paper>
          )}
        </>
      )}

      {/* Detalle de la unidad seleccionada */}
      <Drawer opened={!!seleccionado} onClose={() => setSeleccionado(null)} position="right" title="Detalle de la unidad" size="md">
        {seleccionado && (
          <Stack gap="sm">
            <Box p="sm" style={{ borderRadius: 6, background: colorDe(seleccionado).bg, color: colorDe(seleccionado).fg }}>
              <Text fw={700}>{seleccionado.nombre}</Text>
            </Box>
            <Group gap="xs">
              <Badge variant="light">{seleccionado.tipo}</Badge>
              <Badge variant="light" color={seleccionado.relacion === "staff" ? "yellow" : "blue"}>
                {seleccionado.relacion === "staff" ? "Apoyo / staff" : "Línea de mando"}
              </Badge>
              {seleccionado.nivel && <Badge variant="outline" color="gray">{seleccionado.nivel}</Badge>}
            </Group>
            <Text size="sm"><b>Depende de:</b> {seleccionado.parent ? porId.get(seleccionado.parent)?.nombre : "— (unidad raíz)"}</Text>
            <Text size="sm">
              <b>Dependencia vinculada:</b>{" "}
              {seleccionado.dep_code ? `${nombreDependencia(seleccionado.dep_code)} (${seleccionado.dep_code})` : "Sin vincular"}
            </Text>
            <Text size="sm"><b>Subunidades:</b> {contarDescendientes(seleccionado)}</Text>
            {seleccionado.descripcion && <Text size="sm" c="dimmed">{seleccionado.descripcion}</Text>}
            <Divider />
            <Group gap="xs">
              <Button size="xs" leftSection={<IconEdit size={14} />} onClick={() => abrirEdicion(seleccionado)}>Editar</Button>
              <Button size="xs" variant="light" color="teal" leftSection={<IconPlus size={14} />} onClick={() => abrirNuevo(seleccionado)}>Agregar subunidad</Button>
              {seleccionado.hijos.length > 0 && (
                <Button size="xs" variant="light" leftSection={<IconFocus2 size={14} />} onClick={() => verRama(seleccionado)}>Ver esta rama</Button>
              )}
              <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={14} />} onClick={() => eliminar(seleccionado)}>Eliminar</Button>
            </Group>
          </Stack>
        )}
      </Drawer>

      {/* Crear / editar */}
      <Modal opened={!!form} onClose={() => setForm(null)} title={form?._id ? "Editar unidad" : "Nueva unidad"} centered size="lg">
        {form && (
          <Stack gap="sm">
            <TextInput label="Nombre" required value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.currentTarget.value })} placeholder="Ej: Facultad de Ciencias, Ingeniería e Innovación" />
            <Group grow>
              <Select label="Tipo" data={catalogos.tipos} value={form.tipo} allowDeselect={false}
                onChange={(v) => setForm({ ...form, tipo: v ?? "Otra", nivel: v === "Programa" ? form.nivel ?? "Pregrado" : null })} />
              <Select label="Relación con su padre" allowDeselect={false}
                data={[{ value: "linea", label: "Línea de mando" }, { value: "staff", label: "Apoyo / staff (al lado)" }]}
                value={form.relacion} onChange={(v) => setForm({ ...form, relacion: (v as Relacion) ?? "linea" })} />
            </Group>
            {form.tipo === "Programa" && (
              <Select label="Nivel del programa" data={catalogos.niveles} value={form.nivel}
                onChange={(v) => setForm({ ...form, nivel: v })} />
            )}
            <Select label="Depende de" placeholder="Sin padre (unidad raíz)" searchable clearable data={opcionesPadre}
              value={form.parent} onChange={(v) => setForm({ ...form, parent: v })} />
            <Select label="Dependencia vinculada" description="Dependencia del sistema a la que corresponde esta unidad (opcional)"
              placeholder="Buscar dependencia..." searchable clearable data={opcionesDependencias} limit={50}
              value={form.dep_code} onChange={(v) => setForm({ ...form, dep_code: v })} />
            <NumberInput label="Orden" description="Posición entre las unidades del mismo padre" min={0} allowDecimal={false}
              value={form.orden} onChange={(v) => setForm({ ...form, orden: Number(v) || 0 })} />
            <Textarea label="Descripción" autosize minRows={2} value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.currentTarget.value })} />
            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={() => setForm(null)}>Cancelar</Button>
              <Button loading={guardando} onClick={guardar}>Guardar</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
