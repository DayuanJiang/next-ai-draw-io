export type TaskStatus = "pending" | "processing" | "completed" | "failed";
export type TaskFormat = "xml" | "png" | "svg";

export interface TaskOptions {
  width?: number;
  height?: number;
}

export interface Task {
  taskId: string;
  status: TaskStatus;
  format: TaskFormat;
  description: string;
  options?: TaskOptions;
  result?: string;
  error?: string;
  progress?: number;
  createdAt: Date;
  completedAt?: Date;
  failedAt?: Date;
}

export interface TaskManager {
  createTask(format: TaskFormat, description: string, options?: TaskOptions): Task;
  getTask(taskId: string): Task | undefined;
  updateTask(taskId: string, updates: Partial<Task>): Task | undefined;
  deleteTask(taskId: string): boolean;
  cleanupOldTasks(maxAgeMs?: number): number;
}

class InMemoryTaskManager implements TaskManager {
  private tasks = new Map<string, Task>();

  createTask(format: TaskFormat, description: string, options?: TaskOptions): Task {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const task: Task = {
      taskId,
      status: "pending",
      format,
      description,
      options,
      createdAt: new Date(),
    };
    this.tasks.set(taskId, task);
    return task;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  updateTask(taskId: string, updates: Partial<Task>): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const updatedTask = { ...task, ...updates };
    this.tasks.set(taskId, updatedTask);
    return updatedTask;
  }

  deleteTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  cleanupOldTasks(maxAgeMs = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      const taskAge = now - task.createdAt.getTime();
      if (taskAge > maxAgeMs) {
        this.tasks.delete(taskId);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const taskManager = new InMemoryTaskManager();

// 注意：不使用 setInterval 自动清理，因为在 serverless 环境中会导致问题
// 清理操作将在每次 POST 请求时按需执行
