import { redirect } from 'next/navigation';

// /semana ahora es /agenda — back-compat para bookmarks o links existentes.
export default function SemanaRedirect(): never {
  redirect('/agenda');
}
