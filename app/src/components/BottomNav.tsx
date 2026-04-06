'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, CalendarDays, Users, Calendar, User } from 'lucide-react';
import { getMessages, getTasks, getCurrentParentId } from '@/lib/store';

const tabs = [
  { href: '/chat', icon: MessageCircle, label: 'Chat' },
  { href: '/hoy', icon: CalendarDays, label: 'Hoy' },
  { href: '/semana', icon: Calendar, label: 'Semana' },
  { href: '/hijo', icon: Users, label: 'Hijos' },
  { href: '/perfil', icon: User, label: 'Perfil' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [unreadChat, setUnreadChat] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);

  // Track badges
  const checkBadges = useCallback(async () => {
    try {
      const [msgs, tasks] = await Promise.all([getMessages(), getTasks()]);
      const myId = getCurrentParentId();

      // Unread: messages from other parent or nanny since last visit
      // Simple heuristic: messages in the last 5 minutes not from current user
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      if (pathname !== '/chat') {
        const recentOthers = msgs.filter(m =>
          m.created_at > fiveMinAgo && m.sender_id !== myId
        );
        setUnreadChat(recentOthers.length);
      } else {
        setUnreadChat(0);
      }

      // Overdue tasks
      const now = new Date();
      const overdue = tasks.filter(t =>
        t.status !== 'done' && t.due_date && new Date(t.due_date) < now
      );
      setOverdueTasks(overdue.length);
    } catch {
      // Silently ignore — badges are non-critical
    }
  }, [pathname]);

  useEffect(() => {
    checkBadges();
    const interval = setInterval(checkBadges, 10000);
    return () => clearInterval(interval);
  }, [checkBadges]);

  // Hide nav on auth, onboarding, and chat pages
  if (pathname === '/login' || pathname === '/onboarding' || pathname === '/' || pathname === '/chat') {
    return null;
  }

  return (
    <nav className="bottom-nav">
      <div className="flex justify-around items-center">
        {tabs.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          const badge = href === '/chat' ? unreadChat
            : href === '/hoy' ? overdueTasks
            : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-colors relative ${
                active
                  ? 'text-[var(--nanny-purple)]'
                  : 'text-[var(--nanny-gray)] hover:text-[var(--nanny-purple-light)]'
              }`}
            >
              <div className="relative">
                <Icon size={24} strokeWidth={active ? 2.5 : 1.5} />
                {badge > 0 && (
                  <span className={`absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-white px-1 ${
                    href === '/chat' ? 'bg-[var(--nanny-purple)]' : 'bg-[var(--nanny-orange)]'
                  }`}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className={`text-[11px] ${active ? 'font-semibold' : 'font-normal'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
