export type TaskStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type TaskFormat = "xml" | "png" | "svg" | "emf" | "pptx";

import { cleanupDiagramFiles } from "./diagram-storage";

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
  result?: string | { url: string; size: number; format: string };
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
  cancelTask(taskId: string): boolean;
  cleanupOldTasks(maxAgeMs?: number): number;
}

class InMemoryTaskManager implements TaskManager {
  private tasks = new Map<string, Task>();
  private readonly MAX_TASKS = 1000;
  private readonly AUTO_CLEANUP_AGE_MS = 60 * 60 * 1000; // 1小时
  private lastCleanupTime = 0;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 每5分钟最多清理一次

  createTask(format: TaskFormat, description: string, options?: TaskOptions): Task {
    // 按需触发自动清理
    this.autoCleanupIfNeeded();

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

  private autoCleanupIfNeeded(): void {
    const now = Date.now();

    // 达到上限时强制清理，否则按间隔清理
    if (this.tasks.size >= this.MAX_TASKS) {
      this.cleanupOldTasks(this.AUTO_CLEANUP_AGE_MS);

      // 如果清理后仍然超限，删除最早的已完成/失败任务
      if (this.tasks.size >= this.MAX_TASKS) {
        this.evictOldestCompleted();
      }
    } else if (now - this.lastCleanupTime > this.CLEANUP_INTERVAL_MS) {
      this.cleanupOldTasks(this.AUTO_CLEANUP_AGE_MS);
    }
  }

  private evictOldestCompleted(): void {
    const completedTasks: [string, Task][] = [];
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        completedTasks.push([taskId, task]);
      }
    }
    // 按创建时间排序，删除最老的一半
    completedTasks.sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
    const deleteCount = Math.max(1, Math.floor(completedTasks.length / 2));
    for (let i = 0; i < deleteCount; i++) {
      const [taskId, task] = completedTasks[i];
      if (task.format !== "xml") {
        cleanupDiagramFiles(taskId).catch(() => {});
      }
      this.tasks.delete(taskId);
    }
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

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status === "completed" || task.status === "failed") return false;
    this.updateTask(taskId, { status: "cancelled" });
    return true;
  }

  cleanupOldTasks(maxAgeMs = 60 * 60 * 1000): number {
    const now = Date.now();
    this.lastCleanupTime = now;
    let cleaned = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      const taskAge = now - task.createdAt.getTime();
      if (taskAge > maxAgeMs && task.status !== "pending" && task.status !== "processing") {
        // 联动清理对应的存储文件（异步，不阻塞）
        if (task.format !== "xml") {
          cleanupDiagramFiles(taskId).catch(() => {});
        }
        this.tasks.delete(taskId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[task-manager] 自动清理了 ${cleaned} 个过期任务，当前剩余 ${this.tasks.size} 个`);
    }

    return cleaned;
  }
}

export const taskManager = new InMemoryTaskManager();

// 注意：不使用 setInterval 自动清理，因为在 serverless 环境中会导致问题
// 清理操作将在每次 POST 请求时按需执行
