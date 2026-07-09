const BASE = () => process.env.NEXT_PUBLIC_API_URL;

export const PDI_ROUTES = {
  macroproyectos:              () => `${BASE()}/pdi/macroproyectos`,
  macroproyecto: (id: string)  => `${BASE()}/pdi/macroproyectos/${id}`,

  proyectos:                   () => `${BASE()}/pdi/proyectos`,
  proyecto: (id: string)       => `${BASE()}/pdi/proyectos/${id}`,
  importarEjecutadoProyecto:   () => `${BASE()}/pdi/proyectos/importar-ejecutado`,

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
  corteNotificarUsuarios: (id: string) => `${BASE()}/pdi/cortes/${id}/notificar-usuarios`,

  // Formularios
  formularios:                          () => `${BASE()}/pdi/formularios`,
  formulario: (id: string)              => `${BASE()}/pdi/formularios/${id}`,
  formularioRespuestas: (id: string)    => `${BASE()}/pdi/formularios/${id}/respuestas`,
  formularioRespuesta: (id: string, rId: string) => `${BASE()}/pdi/formularios/${id}/respuestas/${rId}`,
  formularioArchivo: (id: string, rId: string, cId: string) => `${BASE()}/pdi/formularios/${id}/respuestas/${rId}/archivos/${cId}`,
  formularioAvalProyecto: (id: string, rId: string) => `${BASE()}/pdi/formularios/${id}/respuestas/${rId}/aval-proyecto`,
  formularioAval: (id: string, rId: string) => `${BASE()}/pdi/formularios/${id}/respuestas/${rId}/aval`,
  formularioComentarioCampoResuelto: (id: string, rId: string, cId: string) => `${BASE()}/pdi/formularios/${id}/respuestas/${rId}/comentarios/${cId}/resuelto`,
  formularioPlaneacion: (id: string, rId: string) => `${BASE()}/pdi/formularios/${id}/respuestas/${rId}/planeacion`,
  formularioDocumentoFinal: (id: string, rId: string) => `${BASE()}/pdi/formularios/${id}/respuestas/${rId}/documento-final`,
  formularioRespuestasPendientesAvalProyecto: () => `${BASE()}/pdi/formularios/respuestas/pendientes-aval-proyecto`,
  formularioRespuestasPendientesResponsableProyecto: () => `${BASE()}/pdi/formularios/respuestas/pendientes-responsable-proyecto`,
  formularioRespuestasPendientesAval: () => `${BASE()}/pdi/formularios/respuestas/pendientes-aval`,
  formularioRespuestasPendientesLider: () => `${BASE()}/pdi/formularios/respuestas/pendientes-lider`,
  formularioRespuestasPendientesPlaneacion: () => `${BASE()}/pdi/formularios/respuestas/pendientes-planeacion`,
  formularioRespuestasPorIndicador: () => `${BASE()}/pdi/formularios/respuestas/por-indicador`,
  formularioLiderEmailIndicador: () => `${BASE()}/pdi/formularios/respuestas/lider-email-indicador`,
  formularioResponsableProyectoEmailIndicador: () => `${BASE()}/pdi/formularios/respuestas/responsable-proyecto-email-indicador`,
  formularioReportersEmailIndicador: () => `${BASE()}/pdi/formularios/respuestas/reporters-email-indicador`,


  // Razones de rechazo
  razonesRechazo:               () => `${BASE()}/pdi/razones-rechazo`,
  razonRechazo: (id: string)    => `${BASE()}/pdi/razones-rechazo/${id}`,

  // Tableros de control
  dashboardResumen:                   () => `${BASE()}/pdi/dashboard/resumen`,
  dashboardMacroproyecto: (id: string) => `${BASE()}/pdi/dashboard/macroproyecto/${id}`,
  dashboardCorte: (periodo: string)    => `${BASE()}/pdi/dashboard/corte/${encodeURIComponent(periodo)}`,
  dashboardExportarAvance:            () => `${BASE()}/pdi/dashboard/exportar-avance`,
  dashboardExportarIndicadoresMetas:   () => `${BASE()}/pdi/dashboard/exportar-indicadores-metas`,
  dashboardRedNodos:                  () => `${BASE()}/pdi/dashboard/red-nodos`,
  dashboardRedNodosReiniciar:         () => `${BASE()}/pdi/dashboard/red-nodos/reiniciar`,

  // Gestión de cambios
  cambios:                         () => `${BASE()}/pdi/cambios`,
  cambio: (id: string)             => `${BASE()}/pdi/cambios/${id}`,
  cambioRevision: (id: string)     => `${BASE()}/pdi/cambios/${id}/revision`,

  // Configuración del PDI (singleton)
  config:                          () => `${BASE()}/pdi/config`,
  configRedistribuir:              () => `${BASE()}/pdi/config/redistribuir-pesos`,

  // Presupuesto desde Google Sheets
  presupuestoData:                 (refresh?: boolean) => `${BASE()}/pdi/presupuesto/data${refresh ? "?refresh=true" : ""}`,
  presupuestoUserMacros:           (email: string)    => `${BASE()}/pdi/presupuesto/user-macros?email=${encodeURIComponent(email)}`,

  // Informes consolidados (admin)
  informesLista:                   () => `${BASE()}/pdi/informes/lista`,
  informesIsLeader:                () => `${BASE()}/pdi/informes/is-leader`,
  informesCortes:                  () => `${BASE()}/pdi/informes/cortes`,
  informeIndicador: (id: string)   => `${BASE()}/pdi/informes/indicador/${id}`,
  informeAccion:    (id: string)   => `${BASE()}/pdi/informes/accion/${id}`,
  informeProyecto: (id: string)    => `${BASE()}/pdi/informes/proyecto/${id}`,
  informeMacro:    (id: string)    => `${BASE()}/pdi/informes/macro/${id}`,
};
