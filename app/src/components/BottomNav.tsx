'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, CalendarDays, Users, CheckSquare, Menu } from 'lucide-react';
import { getMessages, getTasks, getCurrentParentId } from '@/lib/store';

const tabs = [
  { href: '/chat', icon: MessageCircle, label: 'Chat' },
  { href: '/hoy', icon: CalendarDays, label: 'Hoy' },
  { href: '/hijo', icon: Users, label: 'Hijos' },
  { href: '/tareas', icon: CheckSquare, label: 'Tareas' },
  { href: '/mas', icon: Menu, label: 'Más' },
];

// Routes inside the "Más" submenu — they highlight the Más tab
const MAS_ROUTES = ['/mas', '/semana', '/red-apoyo', '/insights', '/configuracion', '/perfil'];

const HIDE_ON = new Set(['/login', '/onboarding', '/', '/chat']);

export default function BottomNav() {
  const pathname = usePathname();
  const [unreadChat, setUnreadChat] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);

  const checkBadges = useCallback(async () => {
    try {
      const [msgs, tasks] = await Promise.all([getMessages(), getTasks()]);
      const myId = getCurrentParentId();

      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      if (pathname !== '/chat') {
        const recentOthers = msgs.filter(m =>
          m.created_at > fiveMinAgo && m.sender_id !== myId
        );
        setUnreadChat(recentOthers.length);
      } else {
        setUnreadChat(0);
      }

      const now = new Date();
      const overdue = tasks.filter(t =>
        t.status !== 'done' && t.due_date && new Date(t.due_date) < now
      );
      setOverdueTasks(overdue.length);
    } catch {
      // badges non-critical
    }
  }, [pathname]);

  useEffect(() => {
    checkBadges();
    const interval = setInterval(checkBadges, 10000);
    return () => clearInterval(interval);
  }, [checkBadges]);

  if (HIDE_ON.has(pathname) || pathname.startsWith('/admin')) return null;

  const isActive = (href: string) => {
    if (href === '/mas') {
      return MAS_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <div className="flex justify-around items-stretch px-2">
        {tabs.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          const badge = href === '/chat' ? unreadChat
            : href === '/tareas' ? overdueTasks
            : 0;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="tap-highlight focus-ring flex-1 flex flex-col items-center justify-center gap-[3px] py-1.5 rounded-lg"
              style={{
                color: active ? 'var(--nanny-purple)' : 'var(--text-tertiary)',
              }}
            >
              <div className="relative">
                <Icon
                  size={26}
                  strokeWidth={active ? 2.4 : 1.8}
                  style={{ transition: 'stroke-width 200ms var(--ease-out)' }}
                />
                {badge > 0 && (
                  <span
                    aria-label={`${badge} nuevos`}
                    className="absolute -top-1 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1 animate-scale-in"
                    style={{
                      background: href === '/chat' ? 'var(--nanny-purple)' : 'var(--warning)',
                      boxShadow: '0 0 0 2px var(--bg-canvas)',
                    }}
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span
                className="text-caption-2"
                style={{ fontWeight: active ? 600 : 500 }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
