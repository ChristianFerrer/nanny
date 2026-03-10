'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, CalendarDays, Users, Calendar } from 'lucide-react';

const tabs = [
  { href: '/chat', icon: MessageCircle, label: 'Chat' },
  { href: '/hoy', icon: CalendarDays, label: 'Hoy' },
  { href: '/semana', icon: Calendar, label: 'Semana' },
  { href: '/hijo', icon: Users, label: 'Hijos' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      <div className="flex justify-around items-center">
        {tabs.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                active
                  ? 'text-[var(--nanny-purple)]'
                  : 'text-[var(--nanny-gray)] hover:text-[var(--nanny-purple-light)]'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              <span className={`text-[10px] ${active ? 'font-semibold' : 'font-normal'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
