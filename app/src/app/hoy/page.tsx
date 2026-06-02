import { redirect } from 'next/navigation';

// /hoy y /semana se consolidaron en /agenda. Esta ruta queda como redirect
// permanente para mantener back-compat con bookmarks o links pegados.
export default function HoyRedirect(): never {
  redirect('/agenda');
}
