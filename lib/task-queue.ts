class TaskQueue {
  private queue: Array<() => Promise<void>> = []
  private running = 0
  private readonly maxConcurrent = 3
  private readonly maxQueueSize = 100
  private readonly taskTimeoutMs = 120_000 // 2分钟超时

  async add<T>(task: () => Promise<T>): Promise<T> {
    // 队列满时拒绝新任务，防止 OOM
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error("Task queue is full, please try again later")
    }

    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.withTimeout(task(), this.taskTimeoutMs)
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
      this.process()
    })
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task timed out after ${ms}ms`))
      }, ms)

      promise.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        }
      )
    })
  }

  get pendingCount(): number {
    return this.queue.length
  }

  get runningCount(): number {
    return this.running
  }

  private async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return

    const task = this.queue.shift()
    if (!task) return

    this.running++
    try {
      await task()
    } finally {
      this.running--
      this.process()
    }
  }
}

export const taskQueue = new TaskQueue()
