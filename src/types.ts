export type ViewType = 'home' | 'groups' | 'settings';

export type RepeatType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'customDays';

export interface Group {
  id: string;
  name: string;
  color: string;
}

export interface NotificationTask {
  id: string;
  title: string;
  body: string;
  time: string; // HH:mm
  repeatType: RepeatType;
  repeatValue?: number; // For customDays or day of week
  groupId: string;
  count: number | null; // null for infinite
  completedCount: number;
  startDate: string; // ISO Date
  lastNotifiedDate?: string; // ISO Date
  isEnabled: boolean;
}

export interface NotificationLog {
  id: string;
  taskId: string;
  date: string; // ISO Date
  status: 'pending' | 'completed' | 'snoozed' | 'cancelled';
  scheduledId: number;
}
