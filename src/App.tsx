import React, { useState, useEffect } from 'react';
import { format, addDays, startOfToday, isSameDay, isAfter, subDays, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Settings, Filter, X, Check, Bell, Trash2, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NotificationTask, Group, RepeatType, ViewType } from './types';
import { Storage } from './lib/storage';
import { cn } from './lib/utils';
import { COMPLETE_ACTION_ID, NotificationService, SNOOZE_ACTION_ID } from './lib/notifications';

const getDateKey = (date: Date) => format(date, 'yyyy-MM-dd');

const getCompletedDates = (task: NotificationTask) => {
  const completedDates = task.completedDates || [];
  if (!task.lastCompletedAt) return completedDates;

  const legacyDate = getDateKey(parseISO(task.lastCompletedAt));
  return completedDates.includes(legacyDate) ? completedDates : [...completedDates, legacyDate];
};

const isTaskCompletedOnDate = (task: NotificationTask, date: Date) => {
  return getCompletedDates(task).includes(getDateKey(date));
};

// Helper to check if a task should appear on a specific date
const isTaskDueOnDate = (task: NotificationTask, date: Date): boolean => {
  const startDate = parseISO(task.startDate);
  if (date < startDate && !isSameDay(date, startDate)) return false;

  // Keep a just-completed limited task visible for the day so the action has visible feedback.
  if (task.count !== null && task.completedCount >= task.count) {
    return isTaskCompletedOnDate(task, date);
  }

  switch (task.repeatType) {
    case 'daily':
      return true;
    case 'weekly':
      return date.getDay() === startDate.getDay();
    case 'monthly':
      return date.getDate() === startDate.getDate();
    case 'yearly':
      return date.getMonth() === startDate.getMonth() && date.getDate() === startDate.getDate();
    case 'customDays':
      const diff = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff % (task.repeatValue || 1) === 0;
    default:
      return false;
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewType>('home');
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [tasks, setTasks] = useState<NotificationTask[]>(() => Storage.getTasks());
  const [groups, setGroups] = useState<Group[]>(() => Storage.getGroups());
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<NotificationTask | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    NotificationService.requestPermissions();
    let removeNotificationActionListener: (() => void) | undefined;

    NotificationService.onActionPerformed((actionId, taskId) => {
      if (actionId === COMPLETE_ACTION_ID) {
        completeTask(taskId, 'notification');
      }

      if (actionId === SNOOZE_ACTION_ID) {
        snoozeTask(taskId);
      }
    }).then(listener => {
      removeNotificationActionListener = () => listener?.remove();
    });

    return () => removeNotificationActionListener?.();
  }, []);

  useEffect(() => {
    // Safety check: ensure all tasks have a valid group
    const groupIds = groups.map(g => g.id);
    const orphanTasks = tasks.filter(t => !groupIds.includes(t.groupId));
    if (orphanTasks.length > 0) {
      const fixedTasks = tasks.map(t => groupIds.includes(t.groupId) ? t : { ...t, groupId: 'default' });
      saveTasks(fixedTasks);
    }
  }, [groups]);

  const saveTasks = (newTasks: NotificationTask[]) => {
    setTasks(newTasks);
    Storage.saveTasks(newTasks);
  };

  const saveGroups = (newGroups: Group[]) => {
    setGroups(newGroups);
    Storage.saveGroups(newGroups);
  };

  const showStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 3000);
  };

  const addGroup = (name: string, color: string) => {
    const newGroup: Group = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      color
    };
    saveGroups([...groups, newGroup]);
  };

  const deleteGroup = (id: string) => {
    if (id === 'default') return;
    const nextTasks = tasks.map(t => t.groupId === id ? { ...t, groupId: 'default' } : t);
    saveTasks(nextTasks);
    saveGroups(groups.filter(g => g.id !== id));
  };

  const completeTask = (taskId: string, source: 'app' | 'notification' = 'app') => {
    const sourceTasks = Storage.getTasks().length ? Storage.getTasks() : tasks;
    const completionDate = source === 'notification' ? startOfToday() : selectedDate;
    const completionDateKey = getDateKey(completionDate);
    let completedTask: NotificationTask | undefined;

    const newTasks = sourceTasks.map(t => {
      if (t.id === taskId) {
        const completedDates = getCompletedDates(t);
        if (completedDates.includes(completionDateKey)) {
          completedTask = t;
          return t;
        }

        completedTask = {
          ...t,
          completedCount: t.completedCount + 1,
          completedDates: [...completedDates, completionDateKey],
          lastCompletedAt: new Date().toISOString()
        };
        return completedTask;
      }
      return t;
    });

    if (!completedTask) return;

    saveTasks(newTasks);
    NotificationService.cancelTask(taskId);

    if (completedTask.count === null || completedTask.completedCount < completedTask.count) {
      NotificationService.scheduleTask(completedTask);
    }

    showStatus(source === 'notification' ? `${completedTask.title} marked complete from notification` : `${completedTask.title} marked complete`);
  };

  const markTaskIncomplete = (taskId: string, date: Date) => {
    const sourceTasks = Storage.getTasks().length ? Storage.getTasks() : tasks;
    const completionDateKey = getDateKey(date);
    let restoredTask: NotificationTask | undefined;

    const newTasks = sourceTasks.map(t => {
      if (t.id === taskId) {
        const completedDates = getCompletedDates(t);
        if (!completedDates.includes(completionDateKey)) {
          restoredTask = t;
          return t;
        }

        const nextCompletedDates = completedDates.filter(dateKey => dateKey !== completionDateKey);
        restoredTask = {
          ...t,
          completedCount: Math.max(0, t.completedCount - 1),
          completedDates: nextCompletedDates,
          lastCompletedAt: nextCompletedDates.length > 0 ? t.lastCompletedAt : undefined
        };
        return restoredTask;
      }
      return t;
    });

    if (!restoredTask) return;

    saveTasks(newTasks);
    NotificationService.scheduleTask(restoredTask);
    showStatus(`${restoredTask.title} marked incomplete`);
  };

  const toggleTaskCompletion = (taskId: string, isCompleted: boolean, date: Date) => {
    if (isAfter(date, startOfToday())) {
      showStatus('Future reminders are read-only');
      return;
    }

    if (isCompleted) {
      markTaskIncomplete(taskId, date);
      return;
    }

    completeTask(taskId);
  };

  const snoozeTask = (taskId: string) => {
    const sourceTasks = Storage.getTasks().length ? Storage.getTasks() : tasks;
    let snoozedTask: NotificationTask | undefined;

    const newTasks = sourceTasks.map(t => {
      if (t.id === taskId) {
        snoozedTask = { ...t, lastSnoozedAt: new Date().toISOString() };
        return snoozedTask;
      }
      return t;
    });

    if (!snoozedTask) return;

    saveTasks(newTasks);
    NotificationService.snoozeTask(snoozedTask);
    showStatus(`${snoozedTask.title} snoozed for 15 minutes`);
  };

  const tasksForDay = tasks.filter(t => isTaskDueOnDate(t, selectedDate));
  const deleteTask = (taskId: string) => {
    NotificationService.cancelTask(taskId);
    saveTasks(tasks.filter(t => t.id !== taskId));
  };

  const moveTaskToGroup = (taskId: string, groupId: string) => {
    const taskToMove = tasks.find(t => t.id === taskId);
    if (!taskToMove || taskToMove.groupId === groupId) return;

    const updatedTask = { ...taskToMove, groupId };
    saveTasks(tasks.map(t => t.id === taskId ? updatedTask : t));
    NotificationService.scheduleTask(updatedTask);
    showStatus(`${updatedTask.title} moved`);
  };

  return (
    <div className="min-h-screen bg-surface font-sans text-text-main flex overflow-hidden h-screen">
      {/* Sidebar - Desktop & Tablet */}
      <nav className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform md:relative md:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col shadow-xl md:shadow-none",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center shadow-sm">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-gray-900 uppercase">Noteify</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 px-4 py-8 space-y-2">
          <SidebarLink 
            icon={<CalendarIcon className="w-5 h-5" />} 
            label="Home" 
            active={activeTab === 'home'} 
            onClick={() => { setActiveTab('home'); setIsSidebarOpen(false); }}
          />
          <SidebarLink 
            icon={<Filter className="w-5 h-5" />} 
            label="Groups" 
            active={activeTab === 'groups'} 
            onClick={() => { setActiveTab('groups'); setIsSidebarOpen(false); }}
          />
          <SidebarLink 
            icon={<Settings className="w-5 h-5" />} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
          />
        </div>

        <div className="p-6 border-t border-gray-100">
          <div className="bg-indigo-50 p-4 rounded-2xl">
             <p className="text-[10px] font-bold text-brand uppercase tracking-widest leading-loose">Device Sync</p>
             <p className="text-[9px] text-indigo-400 font-medium">Automatic background updates enabled</p>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-30 px-4 md:px-8 py-4 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 md:hidden hover:bg-gray-50 rounded-lg transition-colors text-gray-600"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 uppercase">
              {activeTab === 'home' ? 'My Schedule' : activeTab === 'groups' ? 'Management Groups' : 'Settings'}
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
             {activeTab === 'home' && (
               <button 
                onClick={() => setIsAddingTask(true)}
                className="btn-primary"
              >
                + <span className="hidden sm:inline">New Sticky</span>
              </button>
             )}
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide bg-surface">
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 md:p-8 space-y-8"
              >
                {/* Date Selector moved into Home view */}
                <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 md:gap-6 pb-6 pt-2">
                  <div className="flex items-center justify-between w-full max-w-sm md:max-w-none md:w-auto gap-2 md:gap-6">
                    <button 
                      onClick={() => setSelectedDate(subDays(selectedDate, 1))}
                      className="p-3 hover:bg-white rounded-xl border border-gray-100 transition-all shadow-sm bg-white active:scale-90 shrink-0"
                    >
                      <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    
                    <div className="relative group cursor-pointer transition-transform active:scale-95 text-center min-w-0 flex-1 md:min-w-[240px] px-2 md:px-4 py-2 hover:bg-gray-50 rounded-2xl">
                      <input 
                        type="date" 
                        className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full"
                        onChange={(e) => {
                          if (e.target.value) {
                            const [year, month, day] = e.target.value.split('-').map(Number);
                            setSelectedDate(new Date(year, month - 1, day));
                          }
                        }}
                      />
                      <h2 className="text-xl md:text-3xl font-light text-gray-800 group-hover:text-brand transition-colors whitespace-nowrap overflow-hidden text-ellipsis">
                        {format(selectedDate, 'EEEE, ')}
                        <span className="font-semibold">{format(selectedDate, 'MMMM d')}</span>
                      </h2>
                      <p className="label-caps mt-1 flex items-center justify-center gap-2">
                        {isSameDay(selectedDate, startOfToday()) ? (
                          <span className="text-brand">Today</span>
                        ) : (
                          <span>Go to date</span>
                        )}
                        <CalendarIcon className="w-3 h-3 opacity-40" />
                      </p>
                    </div>

                    <button 
                      onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                      className="p-3 hover:bg-white rounded-xl border border-gray-100 transition-all shadow-sm bg-white active:scale-90 shrink-0"
                    >
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                </div>

                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="space-y-4">
                    <h3 className="label-caps opacity-60">Stickies for this day</h3>
                    {tasksForDay.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-24 text-gray-400 bg-white border border-gray-100 rounded-3xl shadow-sm">
                        <Bell className="w-12 h-12 mb-4 opacity-5" />
                        <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-40">Zero notifications scheduled</p>
                      </div>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {tasksForDay.map((task) => {
                          const isFutureDate = isAfter(selectedDate, startOfToday());
                          const completedOnSelectedDate = isTaskCompletedOnDate(task, selectedDate);
                          const completedToday = isTaskCompletedOnDate(task, startOfToday());
                          const snoozedToday = task.lastSnoozedAt && isSameDay(parseISO(task.lastSnoozedAt), startOfToday());
                          const isCompleted = Boolean(completedOnSelectedDate);
                          return (
                            <motion.div
                              key={task.id}
                              layout
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className={cn(
                                "bg-white border border-gray-200 p-5 rounded-2xl shadow-sm transition-all relative overflow-hidden group",
                                "border-l-4 border-l-brand",
                                isCompleted && "border-l-emerald-500 bg-emerald-50/30"
                              )}
                            >
                              <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                                <div className="flex-1">
                                  <div className="flex items-start gap-3 mb-3 pr-10">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-[10px] font-extrabold text-gray-700 flex items-center gap-1.5 uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-lg">
                                        <Bell className="w-3.5 h-3.5" />
                                        {task.time}
                                      </p>
                                      {snoozedToday && !completedToday && (
                                        <span className="text-[9px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded tracking-wide uppercase">Snoozed</span>
                                      )}
                                    </div>
                                  </div>
                                  <h4 className={cn(
                                    "text-lg font-extrabold leading-tight transition-all",
                                    isCompleted ? "text-gray-500" : "text-gray-900"
                                  )}>{task.title}</h4>
                                  <p className={cn(
                                    "text-sm mt-2 line-clamp-2 transition-all",
                                    isCompleted ? "text-gray-400" : "text-gray-500"
                                  )}>{task.body}</p>
                                </div>
                                <button 
                                  onClick={() => setEditingTask(task)}
                                  aria-label="Edit notification details"
                                  title="Edit notification details"
                                  className="absolute right-4 top-4 p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-900 rounded-xl transition-all"
                                >
                                  <Settings className="w-4 h-4" />
                                </button>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                  <button
                                    onClick={() => toggleTaskCompletion(task.id, isCompleted, selectedDate)}
                                    disabled={isFutureDate}
                                    aria-pressed={isCompleted}
                                    title={isFutureDate ? 'Future reminders are read-only' : isCompleted ? 'Mark incomplete' : 'Mark done'}
                                    className={cn(
                                      "flex h-7 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[9px] font-bold uppercase tracking-widest transition-all",
                                      isFutureDate
                                        ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                                        : isCompleted
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-white active:scale-95"
                                          : "border-gray-200 bg-white text-gray-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95"
                                    )}
                                  >
                                    <span className={cn(
                                      "flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all",
                                      isFutureDate ? "border-gray-200" : isCompleted ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300"
                                    )}>
                                      {isCompleted && <Check className="h-3 w-3" />}
                                    </span>
                                    {isCompleted ? 'Done' : 'Done'}
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    )}
                    
                    <button 
                      onClick={() => setIsAddingTask(true)}
                      className="w-full bg-white/40 border border-gray-200 p-8 rounded-2xl border-dashed flex items-center justify-center min-h-[100px] hover:border-brand hover:bg-white group transition-all"
                    >
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] group-hover:text-brand">+ Add new reminder</p>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'groups' && (
              <GroupsView 
                groups={groups} 
                tasks={tasks} 
                onAddGroup={addGroup} 
                onDeleteGroup={deleteGroup} 
                onEditTask={setEditingTask}
                onDeleteTask={deleteTask}
                onMoveTask={moveTaskToGroup}
              />
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-4 md:p-8 max-w-4xl mx-auto"
              >
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-12">
                   <div className="space-y-8">
                     <h3 className="label-caps">Preferences</h3>
                     <div className="space-y-4">
                        <SettingsItem title="Persistent Notifications" description="Sticky reminders will stay in tray until manually dismissed" active />
                        <SettingsItem title="High Priority Alerts" description="Play sounds even when phone is in focus mode" />
                        <SettingsItem title="Auto-Snooze Defaults" description="Set default snooze duration to 15 minutes" />
                     </div>
                   </div>

                   <div className="space-y-4">
                     <h3 className="label-caps">System</h3>
                     <div className="bg-red-50/50 p-6 rounded-2xl border border-red-100 flex items-center justify-between">
                        <div>
                           <p className="font-bold text-red-900">Clear All Reminders</p>
                           <p className="text-xs text-red-700/60 mt-1">This action cannot be undone. All tasks will be permanently removed.</p>
                        </div>
                        <button 
                          onClick={() => {
                            if (confirm('Clear all tasks?')) {
                              tasks.forEach(task => NotificationService.cancelTask(task.id));
                              saveTasks([]);
                            }
                          }}
                          className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm"
                        >
                          Clear Data
                        </button>
                     </div>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Status toast */}
      <AnimatePresence>
        {statusMessage && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed left-1/2 bottom-6 z-[60] -translate-x-1/2 rounded-2xl bg-gray-950 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-2xl"
          >
            {statusMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {(isAddingTask || editingTask) && (
          <NotificationForm 
            onClose={() => {
              setIsAddingTask(false);
              setEditingTask(null);
            }}
            groups={groups}
            taskToEdit={editingTask || undefined}
            onSave={(task) => {
              NotificationService.scheduleTask(task);
              if (editingTask) {
                saveTasks(tasks.map(t => t.id === task.id ? task : t));
              } else {
                saveTasks([...tasks, task]);
              }
              setIsAddingTask(false);
              setEditingTask(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupsView({ groups, tasks, onAddGroup, onDeleteGroup, onEditTask, onDeleteTask, onMoveTask }: { 
  groups: Group[], 
  tasks: NotificationTask[], 
  onAddGroup: (name: string, color: string) => void,
  onDeleteGroup: (id: string) => void,
  onEditTask: (task: NotificationTask) => void,
  onDeleteTask: (id: string) => void,
  onMoveTask: (taskId: string, groupId: string) => void
}) {
  const [newGroupColor, setNewGroupColor] = useState('#6366f1');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const selectedGroup = selectedGroupId ? groups.find(group => group.id === selectedGroupId) : null;
  const selectedGroupTasks = selectedGroup ? tasks.filter(task => task.groupId === selectedGroup.id) : [];

  return (
    <motion.div 
      key="groups"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 md:p-8 max-w-4xl mx-auto"
    >
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 space-y-10">
        <div className="space-y-6">
          <h3 className="label-caps">Create New Category</h3>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 bg-surface p-4 md:p-6 rounded-2xl border border-gray-100 items-end">
            <div className="space-y-3 w-full min-w-0">
               <div className="flex items-center gap-3 w-full">
                  <div
                    className="relative w-12 h-12 shrink-0 overflow-hidden rounded-xl border-2 border-white shadow-xl ring-1 ring-gray-100"
                    style={{ backgroundColor: newGroupColor }}
                  >
                    <input 
                      type="color"
                      value={newGroupColor}
                      onChange={e => setNewGroupColor(e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="Choose group color"
                    />
                  </div>
                  <input 
                    placeholder="e.g., Fitness, Finances"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    className="flex-1 w-full bg-white border border-gray-100 rounded-xl px-4 h-12 font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-brand min-w-0"
                  />
               </div>
            </div>
            <button 
              onClick={() => {
                if (newGroupName) {
                  onAddGroup(newGroupName, newGroupColor);
                  setNewGroupName('');
                }
              }}
              className="btn-primary w-full md:w-auto h-12 px-8 shadow-lg shadow-indigo-100"
            >
              Create Group
            </button>
          </div>
        </div>

        {selectedGroup ? (
          <div className="space-y-5">
            <button
              onClick={() => setSelectedGroupId(null)}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-brand transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to groups
            </button>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl shadow-inner flex items-center justify-center shrink-0" style={{ backgroundColor: selectedGroup.color + '20' }}>
                  <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: selectedGroup.color }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-extrabold text-gray-900 truncate">{selectedGroup.name}</h3>
                  <p className="label-caps">{selectedGroupTasks.length} reminders in this group</p>
                </div>
              </div>
              {selectedGroup.id !== 'default' && (
                <button
                  onClick={() => {
                    onDeleteGroup(selectedGroup.id);
                    setSelectedGroupId(null);
                  }}
                  className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  aria-label={`Delete ${selectedGroup.name} group`}
                  title={`Delete ${selectedGroup.name} group`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {selectedGroupTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-surface border border-gray-100 rounded-3xl">
                <Bell className="w-10 h-10 mb-4 opacity-10" />
                <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-50">No notifications in this group</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedGroupTasks.map(task => (
                  <div key={task.id} className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-[9px] font-bold bg-indigo-50 text-brand px-2 py-0.5 rounded tracking-wide uppercase">
                            {task.repeatType === 'customDays' ? `Every ${task.repeatValue || 1} days` : task.repeatType}
                          </span>
                        </div>
                        <h4 className="font-extrabold text-gray-900 truncate">{task.title}</h4>
                        {task.body && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{task.body}</p>}
                        <p className="text-[10px] font-extrabold text-gray-700 flex items-center gap-1.5 uppercase tracking-widest mt-3">
                          <Bell className="w-3.5 h-3.5" />
                          {task.time}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onEditTask(task)}
                          className="p-2.5 text-gray-400 hover:bg-gray-50 hover:text-gray-900 rounded-xl transition-all"
                          aria-label={`Edit ${task.title}`}
                          title={`Edit ${task.title}`}
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteTask(task.id)}
                          className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          aria-label={`Delete ${task.title}`}
                          title={`Delete ${task.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 sm:items-center">
                      <label className="label-caps px-1">Move to group</label>
                      <select
                        value={task.groupId}
                        onChange={e => onMoveTask(task.id, e.target.value)}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-bold text-gray-900 outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-brand transition-all"
                      >
                        {groups.map(group => (
                          <option key={group.id} value={group.id}>{group.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="label-caps">Your Management Groups</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map(group => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className="group bg-white border border-gray-100 p-5 rounded-2xl shadow-sm hover:shadow-md hover:border-gray-200 transition-all text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl shadow-inner flex items-center justify-center shrink-0" style={{ backgroundColor: group.color + '20' }}>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-gray-900 truncate">{group.name}</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                          {tasks.filter(t => t.groupId === group.id).length} reminders
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand transition-colors shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SidebarLink({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-4 py-3 rounded-2xl font-bold text-sm tracking-wide transition-all uppercase tracking-widest",
        active ? "bg-brand text-white shadow-lg shadow-indigo-100" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      <span className={cn(active ? "text-white" : "text-gray-400 group-hover:text-gray-900")}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function SettingsItem({ title, description, active = false }: { title: string, description: string, active?: boolean }) {
  return (
    <div className="flex items-center justify-between p-5 bg-white border border-gray-100 rounded-2xl hover:border-gray-200 transition-all">
      <div className="space-y-1">
        <p className="font-bold text-gray-900">{title}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <div className={cn(
        "w-12 h-6 rounded-full p-1 cursor-pointer transition-colors",
        active ? "bg-brand" : "bg-gray-200"
      )}>
        <div className={cn(
          "w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform",
          active ? "translate-x-6" : "translate-x-0"
        )} />
      </div>
    </div>
  );
}

function NotificationForm({ onClose, groups, onSave, taskToEdit }: { 
  onClose: () => void, 
  groups: Group[], 
  onSave: (t: NotificationTask) => void,
  taskToEdit?: NotificationTask
}) {
  const [title, setTitle] = useState(taskToEdit?.title || '');
  const [body, setBody] = useState(taskToEdit?.body || '');
  const [time, setTime] = useState(taskToEdit?.time || '09:00');
  const [repeatType, setRepeatType] = useState<RepeatType>(taskToEdit?.repeatType || 'daily');
  const [repeatValue, setRepeatValue] = useState(taskToEdit?.repeatValue || 1);
  const [groupId, setGroupId] = useState(taskToEdit?.groupId || groups[0]?.id);
  const [count, setCount] = useState<number | string>(taskToEdit?.count === null ? 'infinite' : (taskToEdit?.count || 'infinite'));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const task: NotificationTask = {
      id: taskToEdit?.id || Math.random().toString(36).substr(2, 9),
      title,
      body,
      time,
      repeatType,
      repeatValue: repeatType === 'customDays' ? repeatValue : undefined,
      groupId,
      count: count === 'infinite' ? null : Number(count),
      completedCount: taskToEdit?.completedCount || 0,
      completedDates: taskToEdit ? getCompletedDates(taskToEdit) : [],
      lastCompletedAt: taskToEdit?.lastCompletedAt,
      lastSnoozedAt: taskToEdit?.lastSnoozedAt,
      startDate: taskToEdit?.startDate || format(startOfToday(), 'yyyy-MM-dd'),
      isEnabled: true
    };
    onSave(task);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#1A1C1E]/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[90vh] scrollbar-hide"
      >
        <div className="flex justify-between items-center mb-8">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 uppercase">
              {taskToEdit ? 'Edit Reminder' : 'New Reminder'}
            </h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">
              {taskToEdit ? 'Update details' : 'Add to your tray'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-3">
            <label className="label-caps px-1">What to remind?</label>
            <input 
              required
              placeholder="e.g., Take medications"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-semibold text-gray-900 focus:ring-2 focus:ring-brand focus:bg-white outline-none transition-all placeholder:text-gray-300"
            />
            <textarea 
              placeholder="Extra details..."
              value={body}
              onChange={e => setBody(e.target.value)}
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-medium text-gray-600 focus:ring-2 focus:ring-brand focus:bg-white outline-none resize-none h-24 transition-all placeholder:text-gray-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label-caps px-1">At What Time?</label>
              <input 
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold text-gray-900 outline-none focus:ring-2 focus:ring-brand transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="label-caps px-1">Which Group?</label>
              <select 
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold text-gray-900 outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-brand transition-all"
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <label className="label-caps px-1">Repeating Pattern</label>
            <div className="grid grid-cols-3 gap-2">
              {(['daily', 'weekly', 'monthly', 'yearly', 'customDays'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setRepeatType(type)}
                  className={cn(
                    "py-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all",
                    repeatType === type ? "bg-brand text-white border-brand shadow-lg shadow-indigo-100" : "bg-white text-gray-400 border-gray-100 hover:border-gray-200"
                  )}
                >
                  {type === 'customDays' ? 'Custom' : type}
                </button>
              ))}
            </div>

            {repeatType === 'customDays' && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100"
              >
                <span className="text-xs font-bold uppercase text-gray-400">Every</span>
                <input 
                  type="number"
                  min="1"
                  value={repeatValue}
                  onChange={e => setRepeatValue(Number(e.target.value))}
                  className="w-20 bg-white border border-gray-200 rounded-xl p-2 text-center font-bold outline-none focus:ring-2 focus:ring-brand"
                />
                <span className="text-xs font-bold uppercase text-gray-400">days</span>
              </motion.div>
            )}
          </div>

          <div className="space-y-3">
             <label className="label-caps px-1">Total Occurrences</label>
             <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCount('infinite')}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all border",
                    count === 'infinite' ? "bg-brand text-white border-brand shadow-lg shadow-indigo-100" : "bg-white text-gray-400 border-gray-100"
                  )}
                >
                  Infinite
                </button>
                <div className="flex-1 relative">
                  <input 
                    type="number"
                    placeholder="Enter limit"
                    value={count === 'infinite' ? '' : count}
                    onChange={e => setCount(e.target.value)}
                    className={cn(
                      "w-full py-3 px-4 rounded-xl font-bold text-xs border outline-none transition-all uppercase tracking-widest",
                      count !== 'infinite' ? "border-brand bg-white text-brand" : "border-gray-100 bg-gray-50 text-gray-400"
                    )}
                  />
                </div>
             </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-brand text-white py-5 rounded-2xl font-bold uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:scale-[1.02] active:scale-[0.98] transition-all mt-4"
          >
            {taskToEdit ? 'Update Sticky' : 'Create Sticky'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
