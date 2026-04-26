'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Calendar, Pill, MessageCircle, ArrowRight } from 'lucide-react';

const FEATURES = [
  {
    icon: Calendar,
    title: 'Calendario familiar',
    description: 'Eventos, citas y rutinas en un solo lugar',
  },
  {
    icon: Pill,
    title: 'Control de medicamentos',
    description: 'Recordatorios para no perder ninguna dosis',
  },
  {
    icon: MessageCircle,
    title: 'Coordinación natural',
    description: 'Háblame en el chat. Yo organizo todo.',
  },
];

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <div className="min-h-[100dvh] flex flex-col px-6 pt-12 pb-8 animate-fade-in">
      <div className="flex flex-col items-center text-center mt-6">
        <div
          className="w-[88px] h-[88px] rounded-[22px] overflow-hidden mb-6"
          style={{
            background: 'var(--nanny-purple)',
            boxShadow: '0 12px 32px rgba(124, 58, 237, 0.28), 0 4px 8px rgba(124, 58, 237, 0.18)',
          }}
        >
          <Image src="/icon-192.png" alt="Nanny" width={88} height={88} priority className="w-full h-full object-cover" />
        </div>
        <h1 className="text-large-title" style={{ color: 'var(--text-primary)' }}>
          Hola, soy Nanny
        </h1>
        <p
          className="text-callout mt-2 max-w-[300px]"
          style={{ color: 'var(--text-secondary)' }}
        >
          Te voy a ayudar a organizar la vida de tu familia
        </p>
      </div>

      <div className="mt-12 space-y-3 flex-1">
        {FEATURES.map(({ icon: Icon, title, description }, i) => (
          <div
            key={title}
            className="card flex items-start gap-4 animate-slide-up"
            style={{
              animationDelay: `${100 + i * 80}ms`,
              animationFillMode: 'backwards',
            }}
          >
            <div
              className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--nanny-purple-tint)' }}
            >
              <Icon size={20} style={{ color: 'var(--nanny-purple)' }} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-headline" style={{ color: 'var(--text-primary)' }}>
                {title}
              </h3>
              <p
                className="text-footnote mt-0.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-8 animate-slide-up"
        style={{ animationDelay: '380ms', animationFillMode: 'backwards' }}
      >
        <button
          onClick={() => router.push('/chat')}
          className="btn btn-primary btn-block btn-lg"
        >
          Empezar conversación
          <ArrowRight size={18} />
        </button>
        <p
          className="text-caption text-center mt-3"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Solo te tomará un par de minutos
        </p>
      </div>
    </div>
  );
}
