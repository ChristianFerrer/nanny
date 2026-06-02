/**
 * Devuelve la edad de un hijo en formato humano:
 *   "10 meses" si tiene menos de 1 año
 *   "1 año" / "5 años" si no hay meses extra
 *   "2 años y 11 meses" / "1 año y 1 mes" en cualquier otro caso
 */
export function formatAge(birthDate: string): string {
  const today = new Date();
  const birth = new Date(birthDate);

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) return '0 meses';

  if (years === 0) return `${months} ${months === 1 ? 'mes' : 'meses'}`;

  const yearsLabel = `${years} ${years === 1 ? 'año' : 'años'}`;
  if (months === 0) return yearsLabel;
  return `${yearsLabel} y ${months} ${months === 1 ? 'mes' : 'meses'}`;
}
