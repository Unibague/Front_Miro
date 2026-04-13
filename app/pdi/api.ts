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

  historial:               () => `${BASE()}/pdi/historial`,

  cortes:                  () => `${BASE()}/pdi/cortes`,
  cortesActivos:           () => `${BASE()}/pdi/cortes/activos`,
  cortesVigentes:          () => `${BASE()}/pdi/cortes/vigentes`,
  corte: (id: string)      => `${BASE()}/pdi/cortes/${id}`,
};
