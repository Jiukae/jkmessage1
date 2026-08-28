import React from 'react';
import { Shield, Sparkles, UserCheck, ShieldAlert } from 'lucide-react';
import { AdminLevel, User } from '../types';

export function getAdminLevel(user?: User | null): AdminLevel {
  if (!user) return 1;
  if (user.username?.toLowerCase() === 'jiukhan0215') return 5;
  if (user.adminLevel && user.adminLevel >= 1 && user.adminLevel <= 5) {
    return user.adminLevel as AdminLevel;
  }
  if (user.role === 'superadmin') return 5;
  if (user.role === 'admin') return 3;
  return 1;
}

export function getAdminRoleInfo(level: AdminLevel) {
  switch (level) {
    case 5:
      return {
        level: 5,
        title: 'Level 5 (Owner)',
        shortTitle: 'Owner',
        badgeClass: 'bg-gradient-to-r from-amber-500/20 to-red-500/20 text-amber-300 border-amber-500/40',
        icon: '👑',
      };
    case 4:
      return {
        level: 4,
        title: 'Level 4 (Head Admin)',
        shortTitle: 'Head Admin',
        badgeClass: 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-pink-300 border-pink-500/40',
        icon: '💎',
      };
    case 3:
      return {
        level: 3,
        title: 'Level 3 (Admin)',
        shortTitle: 'Admin',
        badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        icon: '🛡️',
      };
    case 2:
      return {
        level: 2,
        title: 'Level 2 (Moder)',
        shortTitle: 'Moder',
        badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        icon: '🔰',
      };
    case 1:
    default:
      return {
        level: 1,
        title: 'Level 1 (Guest)',
        shortTitle: 'Guest',
        badgeClass: 'bg-white/10 text-white/60 border-white/15',
        icon: '💬',
      };
  }
}

interface RoleBadgeProps {
  user?: User | null;
  size?: 'sm' | 'md';
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ user, size = 'sm' }) => {
  if (!user) return null;
  const lvl = getAdminLevel(user);
  if (lvl === 1) return null; // Normal users don't need a heavy badge

  const info = getAdminRoleInfo(lvl);

  if (size === 'md') {
    return (
      <span className={`px-2.5 py-0.5 text-xs font-bold border rounded-xl flex items-center gap-1.5 shadow-sm ${info.badgeClass}`}>
        <span>{info.icon}</span>
        <span>{info.title}</span>
      </span>
    );
  }

  return (
    <span className={`px-1.5 py-0.2 text-[10px] font-bold border rounded-md flex items-center gap-1 shrink-0 ${info.badgeClass}`}>
      <span>{info.icon}</span>
      <span>{info.shortTitle}</span>
    </span>
  );
};
