import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nanny — La carga mental de la familia, compartida con IA',
  description:
    'Nanny es el asistente familiar que organiza la vida de tus hijos por chat. Eventos, tareas, medicación y rutinas — escritos en lenguaje natural, sincronizados entre padres.',
  openGraph: {
    title: 'Nanny — Asistente familiar inteligente',
    description:
      'Escribís cómo hablás. Nanny organiza el resto. La logística de criar, compartida en tiempo real entre padres.',
    type: 'website',
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
