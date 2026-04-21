/** Compara ids de Mongo/Mongoose aunque uno venga como string y otro como ObjectId serializado distinto. */
export function mismoId(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}
