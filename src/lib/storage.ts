import { NotificationTask, Group } from '../types';

const TASKS_KEY = 'noteify_tasks';
const GROUPS_KEY = 'noteify_groups';

export const Storage = {
  getTasks(): NotificationTask[] {
    const data = localStorage.getItem(TASKS_KEY);
    return data ? JSON.parse(data) : [];
  },
  saveTasks(tasks: NotificationTask[]) {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  },
  getGroups(): Group[] {
    const data = localStorage.getItem(GROUPS_KEY);
    return data ? JSON.parse(data) : [
      { id: 'default', name: 'General', color: '#3b82f6' },
      { id: 'work', name: 'Work', color: '#ef4444' },
      { id: 'personal', name: 'Personal', color: '#10b981' }
    ];
  },
  saveGroups(groups: Group[]) {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  }
};
