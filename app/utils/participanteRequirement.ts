// Plantillas SNIES que dependen de la plantilla transversal "Participante":
// SNIES rechaza a estudiantes, docentes, instructores, consultores,
// investigadores, movilidades… que no estén creados antes como participantes.
// Se detectan solas: plantillas SNIES que registran personas por número de
// documento, más Convenios (ver organigrama de Participante del SNIES).

type TemplateLike = {
  name?: string;
  is_snies?: boolean;
  fields?: { name?: string }[];
  workbook_sheets?: { fields?: { name?: string }[] }[];
};

const normalizar = (texto = "") =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+-\s+\d{4}[A-Z]?\s*$/, "") // sufijo de período: " - 2026B"
    .trim();

// No lo requieren: la propia Participante, su corrección de documento y la
// justificación de reglas de calidad (no registra personas)
const NUNCA_REQUIEREN = [/^(ACTUALIZAR_DOCUMENTO_)?PARTICIPANTES?$/, /^JUSTIFICACION_REGLA/];

// Lo requieren aunque no tengan NUM_DOCUMENTO o no estén marcadas como SNIES
const SIEMPRE_REQUIEREN = [/^CONVENIOS/, /^ESTUDIANTES_+DE_PRIMER_CURSO/];

const registraPersonas = (template: TemplateLike) =>
  [...(template.fields || []), ...(template.workbook_sheets || []).flatMap((s) => s.fields || [])]
    .some((field) => /^NUM_DOCUMENTO\b/.test(normalizar(field.name)));

export const requiereParticipante = (template?: TemplateLike | null) => {
  if (!template) return false;
  const nombre = normalizar(template.name);
  if (NUNCA_REQUIEREN.some((patron) => patron.test(nombre))) return false;
  if (SIEMPRE_REQUIEREN.some((patron) => patron.test(nombre))) return true;
  return Boolean(template.is_snies) && registraPersonas(template);
};

export const AVISO_PARTICIPANTE = {
  titulo: "Primero carga la plantilla Participante",
  texto:
    "Esta plantilla del SNIES depende de Participante. Antes de diligenciarla, asegúrate de que todas las personas que vas a reportar (estudiantes, docentes, personal administrativo, instructores, consultores, investigadores, movilidades…) ya estén cargadas en la plantilla Participante. Si no lo están, el SNIES rechazará la información.",
};
