'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  MessageCircle,
  CalendarDays,
  Bell,
  Users,
  Sparkles,
  Brain,
  RadioTower,
  ShieldCheck,
  ArrowRight,
  Check,
  Pill,
  Clock,
} from 'lucide-react';

/* ============================================================
   Hook: rompe el constraint mobile (max-w 430, overflow hidden)
   del root layout solo mientras esta página esté montada.
   ============================================================ */
function useEscapeMobileLayout() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector('main') as HTMLElement | null;

    const orig = {
      htmlHeight: html.style.height,
      bodyMax: body.style.maxWidth,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      bodyBg: body.style.background,
      mainHeight: main?.style.height ?? '',
      mainOverflow: main?.style.overflow ?? '',
      mainPb: main?.style.paddingBottom ?? '',
    };

    html.style.height = 'auto';
    body.style.maxWidth = 'none';
    body.style.overflow = 'visible';
    body.style.height = 'auto';
    body.style.background = '#fff';
    if (main) {
      main.style.height = 'auto';
      main.style.overflow = 'visible';
      main.style.paddingBottom = '0';
    }

    return () => {
      html.style.height = orig.htmlHeight;
      body.style.maxWidth = orig.bodyMax;
      body.style.overflow = orig.bodyOverflow;
      body.style.height = orig.bodyHeight;
      body.style.background = orig.bodyBg;
      if (main) {
        main.style.height = orig.mainHeight;
        main.style.overflow = orig.mainOverflow;
        main.style.paddingBottom = orig.mainPb;
      }
    };
  }, []);
}

/* ============================================================
   Phone frame reutilizable (mockup CSS)
   ============================================================ */
function PhoneFrame({
  children,
  className = '',
  scale = 1,
}: {
  children: React.ReactNode;
  className?: string;
  scale?: number;
}) {
  return (
    <div
      className={`relative ${className}`}
      style={{
        width: 300 * scale,
        height: 620 * scale,
        borderRadius: 44 * scale,
        background: '#111',
        padding: 8 * scale,
        boxShadow:
          '0 50px 100px -20px rgba(50, 50, 93, 0.25), 0 30px 60px -30px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0,0,0,0.06)',
      }}
    >
      <div
        className="overflow-hidden bg-white relative"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 36 * scale,
        }}
      >
        {/* notch */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{
            top: 10 * scale,
            width: 90 * scale,
            height: 24 * scale,
            background: '#111',
            borderRadius: 999,
          }}
        />
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   Mockups concretos
   ============================================================ */
function ChatMockup() {
  return (
    <div className="h-full flex flex-col bg-white" style={{ paddingTop: 44 }}>
      {/* header */}
      <div className="px-4 pb-3 flex items-center gap-3 border-b border-black/5">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: '#7C3AED' }}
        >
          <Sparkles size={16} className="text-white" />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-gray-900">Nanny</div>
          <div className="text-[11px] text-gray-500">Asistente familiar</div>
        </div>
      </div>

      {/* messages */}
      <div className="flex-1 px-3 py-4 space-y-3 overflow-hidden">
        {/* msg 1 — parent */}
        <div className="flex justify-end">
          <div
            className="text-[13px] text-white px-3 py-2"
            style={{
              background: '#7C3AED',
              borderRadius: '18px 18px 4px 18px',
              maxWidth: '78%',
            }}
          >
            Mañana lleva Pau al pediatra a las 10 y tiene fútbol los miércoles a las 18
          </div>
        </div>

        {/* nanny confirmation card */}
        <div className="flex justify-start">
          <div
            className="text-[12px] text-gray-900 px-3 py-3"
            style={{
              background: '#fff',
              border: '1px solid rgba(124, 58, 237, 0.18)',
              borderRadius: 16,
              maxWidth: '92%',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#7C3AED] mb-2">
              <CalendarDays size={11} /> Evento
            </div>
            <div className="font-semibold text-[13px] mb-0.5">Pediatra Pau</div>
            <div className="text-gray-500 text-[11px] mb-2">Mañana · 10:00 · Asignado a papá</div>
            <div
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#7C3AED] mt-3 mb-2 pt-2"
              style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}
            >
              <RadioTower size={11} /> Rutina semanal
            </div>
            <div className="font-semibold text-[13px] mb-0.5">Fútbol Pau</div>
            <div className="text-gray-500 text-[11px]">Miércoles · 18:00</div>
          </div>
        </div>

        {/* nanny reply */}
        <div className="flex justify-start">
          <div
            className="text-[13px] text-gray-900 px-3 py-2"
            style={{
              background: '#F5F5F7',
              borderRadius: '18px 18px 18px 4px',
              maxWidth: '78%',
            }}
          >
            Listo. ¿Querés que te recuerde 30 min antes del pediatra?
          </div>
        </div>
      </div>

      {/* composer */}
      <div className="px-3 py-2 border-t border-black/5 flex items-center gap-2">
        <div
          className="flex-1 text-[12px] text-gray-400 px-3 py-2"
          style={{ background: '#F5F5F7', borderRadius: 14 }}
        >
          Escribí algo…
        </div>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: '#7C3AED' }}
        >
          <ArrowRight size={14} className="text-white" />
        </div>
      </div>
    </div>
  );
}

function AgendaMockup() {
  return (
    <div className="h-full flex flex-col bg-white" style={{ paddingTop: 44 }}>
      <div className="px-5 pb-2">
        <div className="text-[26px] font-bold text-gray-900 tracking-tight leading-tight">Agenda</div>
        <div className="text-[12px] text-gray-500">Jueves 14 de mayo</div>
      </div>

      <div className="flex-1 px-4 pt-3 space-y-2.5 overflow-hidden">
        {/* event 1 */}
        <div
          className="flex items-start gap-3 p-3"
          style={{
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 14,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-semibold shrink-0"
            style={{ background: '#7C3AED' }}
          >
            P
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-gray-900 truncate">Pediatra</div>
            <div className="text-[11px] text-gray-500">Pau · papá</div>
          </div>
          <div className="text-[11px] font-semibold text-[#7C3AED] shrink-0">10:00</div>
        </div>

        {/* event 2 — routine */}
        <div
          className="flex items-start gap-3 p-3"
          style={{
            background: '#fff',
            border: '1px dashed rgba(124, 58, 237, 0.4)',
            borderRadius: 14,
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-semibold shrink-0"
            style={{ background: '#F59E0B' }}
          >
            E
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="text-[13px] font-semibold text-gray-900 truncate">Guardería</div>
              <span
                className="text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded uppercase"
                style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7C3AED' }}
              >
                Rutina
              </span>
            </div>
            <div className="text-[11px] text-gray-500">Emi · mamá lleva</div>
          </div>
          <div className="text-[11px] font-semibold text-gray-500 shrink-0">8:30–17</div>
        </div>

        {/* medication */}
        <div
          className="flex items-start gap-3 p-3"
          style={{
            background: 'rgba(52, 199, 89, 0.06)',
            border: '1px solid rgba(52, 199, 89, 0.2)',
            borderRadius: 14,
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(52, 199, 89, 0.15)' }}
          >
            <Pill size={16} style={{ color: '#1F8F3F' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-gray-900 truncate">Amoxicilina</div>
            <div className="text-[11px] text-gray-500">Pau · 5ml · día 3 de 7</div>
          </div>
          <div className="text-[11px] font-semibold shrink-0" style={{ color: '#1F8F3F' }}>14:00</div>
        </div>

        {/* event 3 */}
        <div
          className="flex items-start gap-3 p-3"
          style={{
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 14,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-semibold shrink-0"
            style={{ background: '#7C3AED' }}
          >
            P
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-gray-900 truncate">Fútbol</div>
            <div className="text-[11px] text-gray-500">Pau · papá lleva</div>
          </div>
          <div className="text-[11px] font-semibold text-[#7C3AED] shrink-0">18:00</div>
        </div>

        {/* task */}
        <div
          className="flex items-start gap-3 p-3"
          style={{
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 14,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <div
            className="w-10 h-10 rounded-md flex items-center justify-center shrink-0"
            style={{ background: '#F5F5F7' }}
          >
            <Check size={16} className="text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-gray-900 truncate">Pagar cuota colegio</div>
            <div className="text-[11px] text-gray-500">Pau · vence hoy</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PushMockup() {
  return (
    <div
      className="h-full flex flex-col items-center justify-start"
      style={{
        background:
          'linear-gradient(160deg, #1a1a2e 0%, #2d1b4e 50%, #6D28D9 100%)',
        paddingTop: 70,
      }}
    >
      {/* clock */}
      <div className="text-center mb-1">
        <div
          className="text-white font-light tracking-tighter"
          style={{ fontSize: 70, lineHeight: 1, letterSpacing: '-0.04em' }}
        >
          9:30
        </div>
        <div className="text-white/80 text-[12px] mt-1 font-medium">Jueves 14 de mayo</div>
      </div>

      {/* notification */}
      <div className="px-3 w-full mt-8">
        <div
          className="px-3 py-3"
          style={{
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(20px)',
            borderRadius: 16,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-5 h-5 rounded flex items-center justify-center"
              style={{ background: '#7C3AED' }}
            >
              <Sparkles size={11} className="text-white" />
            </div>
            <div className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider">
              Nanny
            </div>
            <div className="text-[10px] text-gray-500 ml-auto">ahora</div>
          </div>
          <div className="text-[13px] font-semibold text-gray-900 leading-tight">
            Pediatra de Pau en 30 min
          </div>
          <div className="text-[11px] text-gray-600 mt-1 leading-snug">
            10:00 · papá lleva · Consultorio Dra. López
          </div>
        </div>

        {/* second notification stacked */}
        <div
          className="px-3 py-2.5 mt-2 mx-2 opacity-80"
          style={{
            background: 'rgba(255, 255, 255, 0.78)',
            backdropFilter: 'blur(20px)',
            borderRadius: 14,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-4 h-4 rounded flex items-center justify-center"
              style={{ background: '#7C3AED' }}
            >
              <Pill size={9} className="text-white" />
            </div>
            <div className="text-[9px] font-semibold text-gray-700 uppercase tracking-wider">
              Nanny
            </div>
            <div className="text-[9px] text-gray-500 ml-auto">hace 5 min</div>
          </div>
          <div className="text-[11px] font-semibold text-gray-900 leading-tight">
            Toma de amoxicilina en 15 min
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Página
   ============================================================ */
export default function LandingPage() {
  useEscapeMobileLayout();

  return (
    <div className="w-full bg-white" style={{ color: 'var(--text-primary)' }}>
      {/* ───────── NAV ───────── */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-black/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/landing" className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center"
              style={{ background: '#7C3AED' }}
            >
              <Image src="/icon-192.png" alt="Nanny" width={28} height={28} />
            </div>
            <span className="font-semibold tracking-tight text-[17px]">Nanny</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="hidden sm:inline-flex text-[14px] font-medium text-gray-600 hover:text-gray-900 transition px-3 py-2"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-white px-4 py-2 rounded-full transition hover:opacity-90"
              style={{ background: '#7C3AED' }}
            >
              Comenzar gratis
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ───────── HERO ───────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124, 58, 237, 0.10), transparent 70%), #fff',
        }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-10 sm:pb-20 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div className="text-center lg:text-left">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase"
              style={{
                background: 'rgba(124, 58, 237, 0.10)',
                color: '#7C3AED',
              }}
            >
              <Sparkles size={11} /> Asistente familiar con IA
            </div>
            <h1
              className="mt-5 font-bold tracking-tight"
              style={{
                fontSize: 'clamp(36px, 6vw, 64px)',
                lineHeight: 1.05,
                letterSpacing: '-0.025em',
              }}
            >
              La carga mental de la familia,
              <br />
              <span style={{ color: '#7C3AED' }}>compartida.</span>
            </h1>
            <p
              className="mt-5 text-gray-600 max-w-xl mx-auto lg:mx-0"
              style={{ fontSize: 'clamp(16px, 1.3vw, 19px)', lineHeight: 1.5 }}
            >
              Nanny organiza la vida de tus hijos por chat. Escribís cómo hablás —
              citas, cumpleaños, medicación, rutinas — y aparece todo ordenado,
              sincronizado entre padres, sin formularios.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 text-white px-6 py-3.5 rounded-full font-semibold text-[15px] transition hover:opacity-90"
                style={{
                  background: '#7C3AED',
                  boxShadow: '0 10px 24px -8px rgba(124, 58, 237, 0.5)',
                }}
              >
                Comenzar gratis
                <ArrowRight size={16} />
              </Link>
              <a
                href="#como-funciona"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-semibold text-[15px] text-gray-700 hover:bg-gray-50 transition"
                style={{ border: '1px solid rgba(0,0,0,0.08)' }}
              >
                Ver cómo funciona
              </a>
            </div>
            <div className="mt-6 text-[12px] text-gray-500 flex flex-wrap gap-x-4 gap-y-1 justify-center lg:justify-start">
              <span className="inline-flex items-center gap-1">
                <Check size={12} style={{ color: '#34C759' }} /> Gratis para empezar
              </span>
              <span className="inline-flex items-center gap-1">
                <Check size={12} style={{ color: '#34C759' }} /> Sin tarjeta
              </span>
              <span className="inline-flex items-center gap-1">
                <Check size={12} style={{ color: '#34C759' }} /> En español
              </span>
            </div>
          </div>

          {/* hero phone */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative">
              <div
                className="absolute -inset-12 rounded-full opacity-50 blur-3xl"
                style={{
                  background:
                    'radial-gradient(circle, rgba(124, 58, 237, 0.25) 0%, transparent 70%)',
                  zIndex: 0,
                }}
              />
              <div className="relative z-10">
                <PhoneFrame>
                  <ChatMockup />
                </PhoneFrame>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── PROBLEMA ───────── */}
      <section className="py-20 sm:py-28" style={{ background: '#FAFAFA' }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8 text-center">
          <div
            className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase text-gray-500"
            style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}
          >
            El problema
          </div>
          <h2
            className="mt-5 font-bold tracking-tight"
            style={{
              fontSize: 'clamp(28px, 4vw, 44px)',
              lineHeight: 1.12,
              letterSpacing: '-0.022em',
            }}
          >
            Cada familia carga con un calendario invisible.
          </h2>
          <p className="mt-5 text-gray-600 max-w-2xl mx-auto" style={{ fontSize: 17, lineHeight: 1.5 }}>
            Vacunas, cuotas, cumpleaños, controles médicos, fútbol del miércoles,
            tarea del jueves. Y solo uno de los dos padres suele tenerlo todo en la cabeza.
          </p>

          <div className="mt-14 grid md:grid-cols-3 gap-5 text-left">
            {[
              {
                title: 'Demasiado para una sola cabeza',
                body:
                  'Las apps tradicionales asumen que tenés tiempo de llenar formularios. La realidad es que entre la rutina, el trabajo y los chicos, no hay margen.',
              },
              {
                title: 'Información perdida entre padres',
                body:
                  'Lo que vio mamá en el grupo del cole no llega a papá hasta que es tarde. Y al revés. WhatsApp no es un calendario familiar.',
              },
              {
                title: 'Apps que piden más de lo que dan',
                body:
                  'Si organizar la familia te exige más trabajo que el caos que querés evitar, la app no es la solución — es otra carga.',
              },
            ].map(item => (
              <div
                key={item.title}
                className="p-6 rounded-2xl bg-white"
                style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
              >
                <h3 className="font-semibold text-[17px] tracking-tight">{item.title}</h3>
                <p className="mt-2 text-[14px] text-gray-600 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── SOLUCIÓN / FEATURES ───────── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="text-center mb-16">
            <div
              className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase"
              style={{ background: 'rgba(124, 58, 237, 0.10)', color: '#7C3AED' }}
            >
              La solución
            </div>
            <h2
              className="mt-5 font-bold tracking-tight mx-auto max-w-3xl"
              style={{
                fontSize: 'clamp(28px, 4vw, 44px)',
                lineHeight: 1.12,
                letterSpacing: '-0.022em',
              }}
            >
              Escribís cómo hablás.
              <br />
              <span className="text-gray-400">Nanny organiza el resto.</span>
            </h2>
          </div>

          {/* Feature row 1 — chat */}
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-24">
            <div>
              <FeatureBadge icon={<MessageCircle size={14} />}>Chat natural</FeatureBadge>
              <h3
                className="mt-4 font-bold tracking-tight"
                style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.12, letterSpacing: '-0.02em' }}
              >
                Le hablás como a tu pareja. Nanny entiende.
              </h3>
              <p className="mt-4 text-gray-600" style={{ fontSize: 16, lineHeight: 1.55 }}>
                <em>“Mañana lleva Pau al pediatra a las 10 y tiene fútbol los miércoles a las 18.”</em>
                <br />
                Nanny detecta el evento puntual, la rutina semanal, quién está asignado, y arma la
                tarjeta para que confirmes con un toque. Sin formularios. Sin clics extra.
              </p>
              <ul className="mt-6 space-y-3">
                <FeatureCheck>Detecta eventos, tareas, medicación y rutinas semanales en un solo mensaje</FeatureCheck>
                <FeatureCheck>Asigna automáticamente al padre correcto según contexto</FeatureCheck>
                <FeatureCheck>Te pregunta solo lo que falta — sin interrogatorios</FeatureCheck>
              </ul>
            </div>
            <div className="flex justify-center">
              <PhoneFrame scale={0.9}>
                <ChatMockup />
              </PhoneFrame>
            </div>
          </div>

          {/* Feature row 2 — agenda + sync */}
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-24">
            <div className="lg:order-2">
              <FeatureBadge icon={<RadioTower size={14} />}>Sincronización en tiempo real</FeatureBadge>
              <h3
                className="mt-4 font-bold tracking-tight"
                style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.12, letterSpacing: '-0.02em' }}
              >
                Lo que vos cargás, tu pareja lo ve al instante.
              </h3>
              <p className="mt-4 text-gray-600" style={{ fontSize: 16, lineHeight: 1.55 }}>
                Agenda compartida en vivo entre dispositivos. Si mamá agrega el pediatra desde su
                teléfono, papá lo ve aparecer en su pantalla en menos de dos segundos. Sin refrescar.
                Sin &ldquo;te avisé por WhatsApp&rdquo;.
              </p>
              <ul className="mt-6 space-y-3">
                <FeatureCheck>WebSocket persistente — actualización &lt; 2 segundos</FeatureCheck>
                <FeatureCheck>Vista unificada: eventos, rutinas, medicación, tareas</FeatureCheck>
                <FeatureCheck>Funciona en cualquier dispositivo con browser</FeatureCheck>
              </ul>
            </div>
            <div className="flex justify-center lg:order-1">
              <PhoneFrame scale={0.9}>
                <AgendaMockup />
              </PhoneFrame>
            </div>
          </div>

          {/* Feature row 3 — push */}
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <FeatureBadge icon={<Bell size={14} />}>Recordatorios proactivos</FeatureBadge>
              <h3
                className="mt-4 font-bold tracking-tight"
                style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.12, letterSpacing: '-0.02em' }}
              >
                Te avisa antes. No después.
              </h3>
              <p className="mt-4 text-gray-600" style={{ fontSize: 16, lineHeight: 1.55 }}>
                Push 30 minutos antes de cada evento y 15 minutos antes de cada toma de medicación.
                Y un brief matutino con lo importante del día. Apagás el ruido y prendés lo que
                realmente cuenta.
              </p>
              <ul className="mt-6 space-y-3">
                <FeatureCheck>30 min antes de eventos · 15 min antes de medicación</FeatureCheck>
                <FeatureCheck>Brief diario a las 8 AM con el resumen del día</FeatureCheck>
                <FeatureCheck>Cero ruido: solo notificaciones que mueven la aguja</FeatureCheck>
              </ul>
            </div>
            <div className="flex justify-center">
              <PhoneFrame scale={0.9}>
                <PushMockup />
              </PhoneFrame>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── CÓMO FUNCIONA ───────── */}
      <section
        id="como-funciona"
        className="py-20 sm:py-28"
        style={{ background: '#FAFAFA' }}
      >
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="text-center mb-14">
            <div
              className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase text-gray-500"
              style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}
            >
              Cómo funciona
            </div>
            <h2
              className="mt-5 font-bold tracking-tight"
              style={{
                fontSize: 'clamp(28px, 4vw, 44px)',
                lineHeight: 1.12,
                letterSpacing: '-0.022em',
              }}
            >
              De WhatsApp caótico a familia organizada
              <br />
              <span className="text-gray-400">en menos de 3 minutos.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                n: '1',
                title: 'Creás tu familia',
                body: 'Nombre, hijos, zona horaria. 30 segundos. Sin instalar nada.',
              },
              {
                n: '2',
                title: 'Invitás a tu pareja',
                body: 'Un link por WhatsApp. Los dos ven la misma agenda en vivo.',
              },
              {
                n: '3',
                title: 'Escribís a Nanny',
                body: 'En lenguaje natural. Eventos, tareas, medicación, rutinas — todo desde el chat.',
              },
            ].map(step => (
              <div
                key={step.n}
                className="p-6 rounded-2xl bg-white relative"
                style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[15px] mb-4"
                  style={{ background: '#7C3AED' }}
                >
                  {step.n}
                </div>
                <h3 className="font-semibold text-[18px] tracking-tight">{step.title}</h3>
                <p className="mt-2 text-[14px] text-gray-600 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── DIFERENCIADORES ───────── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="text-center mb-14">
            <div
              className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase"
              style={{ background: 'rgba(124, 58, 237, 0.10)', color: '#7C3AED' }}
            >
              Por qué Nanny
            </div>
            <h2
              className="mt-5 font-bold tracking-tight"
              style={{
                fontSize: 'clamp(28px, 4vw, 44px)',
                lineHeight: 1.12,
                letterSpacing: '-0.022em',
              }}
            >
              Diseñado para padres reales,
              <br />
              no para usuarios poweruser.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: <Brain size={22} style={{ color: '#7C3AED' }} />,
                title: 'IA que entiende contexto',
                body: 'Detecta hijos, asignaciones y rutinas en lenguaje natural argentino, mexicano, español.',
              },
              {
                icon: <Users size={22} style={{ color: '#7C3AED' }} />,
                title: 'Pensado para parejas',
                body: 'No es una app individual con "modo familia". Es una familia desde el día uno.',
              },
              {
                icon: <Clock size={22} style={{ color: '#7C3AED' }} />,
                title: 'Cero fricción',
                body: 'Sin formularios, sin instalar. Funciona en cualquier browser, desde cualquier teléfono.',
              },
              {
                icon: <ShieldCheck size={22} style={{ color: '#7C3AED' }} />,
                title: 'Tus datos, tuyos',
                body: 'Hosting en Vercel + Supabase. Encriptación en tránsito y reposo. Solo tu familia ve sus datos.',
              },
            ].map(item => (
              <div
                key={item.title}
                className="p-5 rounded-2xl"
                style={{
                  background: '#FAFAFA',
                  border: '1px solid rgba(0,0,0,0.04)',
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(124, 58, 237, 0.10)' }}
                >
                  {item.icon}
                </div>
                <h3 className="font-semibold text-[15px] tracking-tight">{item.title}</h3>
                <p className="mt-1.5 text-[13px] text-gray-600 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── CTA FINAL ───────── */}
      <section
        className="py-24 sm:py-32"
        style={{
          background:
            'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
        }}
      >
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center text-white">
          <h2
            className="font-bold tracking-tight"
            style={{
              fontSize: 'clamp(30px, 5vw, 52px)',
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
            }}
          >
            Listo para sentir el alivio.
          </h2>
          <p className="mt-5 text-white/85 max-w-xl mx-auto" style={{ fontSize: 17, lineHeight: 1.5 }}>
            Empezá gratis. Sin tarjeta. Sin instalar nada. En 3 minutos tu familia
            está organizada.
          </p>
          <div className="mt-9">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-white text-[#5B21B6] px-7 py-4 rounded-full font-semibold text-[16px] transition hover:bg-white/95 hover:scale-[1.02]"
              style={{ boxShadow: '0 12px 32px -8px rgba(0,0,0,0.3)' }}
            >
              Comenzar ahora
              <ArrowRight size={18} />
            </Link>
          </div>
          <div className="mt-6 text-[13px] text-white/70 flex flex-wrap gap-x-4 gap-y-1 justify-center">
            <span className="inline-flex items-center gap-1">
              <Check size={12} /> Gratis para empezar
            </span>
            <span className="inline-flex items-center gap-1">
              <Check size={12} /> Sin tarjeta
            </span>
            <span className="inline-flex items-center gap-1">
              <Check size={12} /> Funciona en cualquier teléfono
            </span>
          </div>
        </div>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="py-12 bg-white border-t border-black/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center"
              style={{ background: '#7C3AED' }}
            >
              <Image src="/icon-192.png" alt="Nanny" width={28} height={28} />
            </div>
            <span className="font-semibold tracking-tight text-[15px]">Nanny</span>
            <span className="text-[13px] text-gray-500 ml-2">
              · Asistente familiar inteligente
            </span>
          </div>
          <div className="text-[13px] text-gray-500">
            © {new Date().getFullYear()} Nanny · Hecho con cuidado para familias
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ============================================================
   Helpers visuales
   ============================================================ */
function FeatureBadge({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase"
      style={{ background: 'rgba(124, 58, 237, 0.10)', color: '#7C3AED' }}
    >
      {icon} {children}
    </div>
  );
}

function FeatureCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[14px] text-gray-700 leading-snug">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: 'rgba(52, 199, 89, 0.15)' }}
      >
        <Check size={12} style={{ color: '#1F8F3F' }} strokeWidth={3} />
      </div>
      <span>{children}</span>
    </li>
  );
}
