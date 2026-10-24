import {
  Building2,
  Users,
  BarChart3,
  FileChartColumn,
  CreditCard,
  MessageSquare,
  Power,
  Bus,
  Plug,
  UserRoundCog,
  ShieldCheck,
  LayoutDashboard,
} from 'lucide-react';
export const moduleIcons = {
  overview: LayoutDashboard,
  centers: Building2,
  users: Users,
  activity: BarChart3,
  reports: FileChartColumn,
  payments: CreditCard,
  alerts: MessageSquare,
  status: Power,
  transport: Bus,
  integrations: Plug,
  dealers: UserRoundCog,
  access: ShieldCheck,
};
export type IconName = keyof typeof moduleIcons;
