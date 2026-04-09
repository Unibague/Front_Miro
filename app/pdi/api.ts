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
};
