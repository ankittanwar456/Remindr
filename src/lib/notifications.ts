import { LocalNotifications, Schedule } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { NotificationTask } from '../types';

const getNotificationId = (taskId: string) => {
  const numericId = parseInt(taskId.replace(/\D/g, '').slice(0, 8), 10);
  if (numericId) return numericId;

  return [...taskId].reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }, 7);
};

const getTaskSchedule = (task: NotificationTask): Schedule => {
  const [hour, minute] = task.time.split(':').map(Number);
  const startDate = new Date(task.startDate);

  switch (task.repeatType) {
    case 'daily':
      return { on: { hour, minute }, allowWhileIdle: true };
    case 'weekly':
      return { on: { weekday: startDate.getDay() + 1, hour, minute }, allowWhileIdle: true };
    case 'monthly':
      return { on: { day: startDate.getDate(), hour, minute }, allowWhileIdle: true };
    case 'yearly':
      return { on: { month: startDate.getMonth() + 1, day: startDate.getDate(), hour, minute }, allowWhileIdle: true };
    case 'customDays':
      return { every: 'day', count: task.repeatValue || 1, allowWhileIdle: true };
  }
};

export const NotificationService = {
  async requestPermissions() {
    if (Capacitor.getPlatform() === 'web') return true;
    const permissions = await LocalNotifications.requestPermissions();

    if (Capacitor.getPlatform() === 'android') {
      const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
      if (exact_alarm !== 'granted') {
        await LocalNotifications.changeExactNotificationSetting();
      }
    }

    return permissions.display === 'granted';
  },

  async schedule(title: string, body: string, id: number, scheduleAt: Date, ongoing = true) {
    if (Capacitor.getPlatform() === 'web') {
      console.log(`[Web Mock] Scheduling: ${title} at ${scheduleAt}`);
      return;
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id,
          schedule: { at: scheduleAt },
          ongoing, // Sticky on Android
          actionTypeId: 'TASK_ACTIONS',
          extra: {
            taskId: id
          }
        },
      ],
    });
  },

  async cancel(id: number) {
    if (Capacitor.getPlatform() === 'web') return;
    await LocalNotifications.cancel({ notifications: [{ id }] });
  },

  async scheduleTask(task: NotificationTask) {
    const id = getNotificationId(task.id);

    if (!task.isEnabled) {
      await this.cancel(id);
      return;
    }

    if (Capacitor.getPlatform() === 'web') {
      console.log(`[Web Mock] Scheduling repeating task: ${task.title}`);
      return;
    }

    await this.cancel(id);
    await LocalNotifications.schedule({
      notifications: [
        {
          title: task.title,
          body: task.body,
          id,
          schedule: getTaskSchedule(task),
          ongoing: true,
          extra: {
            taskId: task.id
          }
        },
      ],
    });
  },

  async cancelTask(taskId: string) {
    await this.cancel(getNotificationId(taskId));
  }
};
