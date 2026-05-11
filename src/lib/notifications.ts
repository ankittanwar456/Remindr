import { LocalNotifications, Schedule } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { NotificationTask } from '../types';

export const TASK_ACTIONS_ID = 'TASK_ACTIONS';
export const COMPLETE_ACTION_ID = 'complete';
export const SNOOZE_ACTION_ID = 'snooze';

export const getNotificationId = (taskId: string) => {
  const numericId = parseInt(taskId.replace(/\D/g, '').slice(0, 8), 10);
  if (numericId) return numericId;

  return [...taskId].reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }, 7);
};

const getSnoozeNotificationId = (taskId: string) => {
  return (getNotificationId(taskId) + 1000000000) % 2147483647;
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
  async registerActions() {
    if (Capacitor.getPlatform() === 'web') return;

    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: TASK_ACTIONS_ID,
          actions: [
            { id: SNOOZE_ACTION_ID, title: 'Snooze' },
            { id: COMPLETE_ACTION_ID, title: 'Complete' }
          ]
        }
      ]
    });
  },

  async onActionPerformed(handler: (actionId: string, taskId: string) => void) {
    if (Capacitor.getPlatform() === 'web') return undefined;

    const listener = await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const taskId = event.notification.extra?.taskId;
      if (typeof taskId === 'string') {
        handler(event.actionId, taskId);
      }
    });

    return listener;
  },

  async requestPermissions() {
    if (Capacitor.getPlatform() === 'web') return true;
    await this.registerActions();
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
          actionTypeId: TASK_ACTIONS_ID,
          extra: {
            taskId: String(id)
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
          actionTypeId: TASK_ACTIONS_ID,
          extra: {
            taskId: task.id
          }
        },
      ],
    });
  },

  async cancelTask(taskId: string) {
    await Promise.all([
      this.cancel(getNotificationId(taskId)),
      this.cancel(getSnoozeNotificationId(taskId))
    ]);
  },

  async snoozeTask(task: NotificationTask, minutes = 15) {
    if (Capacitor.getPlatform() === 'web') {
      console.log(`[Web Mock] Snoozing task: ${task.title}`);
      return;
    }

    const scheduleAt = new Date(Date.now() + minutes * 60 * 1000);
    await this.cancel(getNotificationId(task.id));
    await LocalNotifications.schedule({
      notifications: [
        {
          title: task.title,
          body: task.body,
          id: getSnoozeNotificationId(task.id),
          schedule: { at: scheduleAt },
          ongoing: true,
          actionTypeId: TASK_ACTIONS_ID,
          extra: {
            taskId: task.id
          }
        }
      ]
    });
  }
};
