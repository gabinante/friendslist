import React, { useState } from 'react';
import type { TaskInfo, TaskPhase } from '../../shared/types.js';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '../hooks/useTasks.js';

const PHASES: TaskPhase[] = ['backlog', 'in_progress', 'testing', 'completed'];

const PHASE_LABELS: Record<TaskPhase, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  testing: 'Testing',
  completed: 'Completed',
};

const PHASE_COLORS: Record<TaskPhase, string> = {
  backlog: 'border-gray-600',
  in_progress: 'border-blue-500',
  testing: 'border-yellow-500',
  completed: 'border-green-500',
};

export default function TaskBoard() {
  const { data: tasks = [] } = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = () => {
    if (!title || !description) return;
    createTask.mutate({ title, description }, {
      onSuccess: () => { setShowCreate(false); setTitle(''); setDescription(''); },
    });
  };

  const tasksByPhase = (phase: TaskPhase) =>
    tasks.filter((t) => t.phase === phase).sort((a, b) => a.priority - b.priority);

  const moveTask = (task: TaskInfo, direction: 'forward' | 'back') => {
    const idx = PHASES.indexOf(task.phase);
    const newIdx = direction === 'forward' ? idx + 1 : idx - 1;
    if (newIdx >= 0 && newIdx < PHASES.length) {
      updateTask.mutate({ id: task.id, phase: PHASES[newIdx] });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-white font-medium">Task Board</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded"
        >
          + New Task
        </button>
      </div>

      {showCreate && (
        <div className="px-4 py-3 border-b border-gray-800 space-y-2">
          <input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-gray-800 text-sm text-white px-2 py-1 rounded border border-gray-700 outline-none"
          />
          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-gray-800 text-sm text-white px-2 py-1 rounded border border-gray-700 outline-none resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!title || !description}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-sm px-3 py-1 rounded">
              Create
            </button>
            <button onClick={() => setShowCreate(false)}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1 rounded">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {PHASES.map((phase) => (
            <div key={phase} className={`w-72 flex flex-col border-t-2 ${PHASE_COLORS[phase]} bg-gray-900 rounded`}>
              <div className="px-3 py-2 text-sm font-medium text-gray-300 flex items-center justify-between">
                <span>{PHASE_LABELS[phase]}</span>
                <span className="text-xs text-gray-600">{tasksByPhase(phase).length}</span>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2">
                {tasksByPhase(phase).map((task) => (
                  <div key={task.id} className="bg-gray-800 rounded p-3 group">
                    <div className="flex items-start justify-between">
                      <h3 className="text-sm text-white font-medium">{task.title}</h3>
                      <button
                        onClick={() => deleteTask.mutate(task.id)}
                        className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs ml-2"
                      >
                        x
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
                    {task.assignedSessionId && (
                      <span className="inline-block mt-2 text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">
                        assigned
                      </span>
                    )}
                    <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100">
                      {PHASES.indexOf(phase) > 0 && (
                        <button
                          onClick={() => moveTask(task, 'back')}
                          className="text-xs text-gray-500 hover:text-white bg-gray-700 px-2 py-0.5 rounded"
                        >
                          &larr;
                        </button>
                      )}
                      {PHASES.indexOf(phase) < PHASES.length - 1 && (
                        <button
                          onClick={() => moveTask(task, 'forward')}
                          className="text-xs text-gray-500 hover:text-white bg-gray-700 px-2 py-0.5 rounded"
                        >
                          &rarr;
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
