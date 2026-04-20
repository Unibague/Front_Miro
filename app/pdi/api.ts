const BASE = () => process.env.NEXT_PUBLIC_API_URL;

export const PDI_ROUTES = {
  macroproyectos:              () => `${BASE()}/pdi/macroproyectos`,
  macroproyecto: (id: string)  => `${BASE()}/pdi/macroproyectos/${id}`,

  proyectos:                   () => `${BASE()}/pdi/proyectos`,
  proyecto: (id: string)       => `${BASE()}/pdi/proyectos/${id}`,

  acciones:                    () => `${BASE()}/pdi/acciones`,
  accion: (id: string)         => `${BASE()}/pdi/acciones/${id}`,

  indicadores:                 () => `${BASE()}/pdi/indicadores`,
  indicador: (id: string)      => `${BASE()}/pdi/indicadores/${id}`,
  indicadorPeriodo: (id: string) => `${BASE()}/pdi/indicadores/${id}/periodo`,

  evidencias:              (id: string) => `${BASE()}/pdi/indicadores/${id}/evidencias`,
  evidencia: (id: string, evId: string) => `${BASE()}/pdi/indicadores/${id}/evidencias/${evId}`,
  evidenciaEstado: (id: string, evId: string) => `${BASE()}/pdi/indicadores/${id}/evidencias/${evId}/estado`,

  historial:               () => `${BASE()}/pdi/historial`,

  cortes:                  () => `${BASE()}/pdi/cortes`,
  cortesActivos:           () => `${BASE()}/pdi/cortes/activos`,
  cortesVigentes:          () => `${BASE()}/pdi/cortes/vigentes`,
  corte: (id: string)      => `${BASE()}/pdi/cortes/${id}`,
  corteResumen: (id: string) => `${BASE()}/pdi/cortes/${id}/resumen`,

  // Formularios
  formularios:                          () => `${BASE()}/pdi/formularios`,
  formulario: (id: string)              => `${BASE()}/pdi/formularios/${id}`,
  formularioRespuestas: (id: string)    => `${BASE()}/pdi/formularios/${id}/respuestas`,
  formularioRespuesta: (id: string, rId: string) => `${BASE()}/pdi/formularios/${id}/respuestas/${rId}`,
  formularioArchivo: (id: string, rId: string, cId: string) => `${BASE()}/pdi/formularios/${id}/respuestas/${rId}/archivos/${cId}`,


  // Tableros de control
  dashboardResumen:                   () => `${BASE()}/pdi/dashboard/resumen`,
  dashboardMacroproyecto: (id: string) => `${BASE()}/pdi/dashboard/macroproyecto/${id}`,
  dashboardCorte: (periodo: string)    => `${BASE()}/pdi/dashboard/corte/${encodeURIComponent(periodo)}`,

  // Gestión de cambios
  cambios:                         () => `${BASE()}/pdi/cambios`,
  cambio: (id: string)             => `${BASE()}/pdi/cambios/${id}`,
  cambioRevision: (id: string)     => `${BASE()}/pdi/cambios/${id}/revision`,

  // Configuración del PDI (singleton)
  config:                          () => `${BASE()}/pdi/config`,
};
