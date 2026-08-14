export type QueueItem =
  | { kind: 'user'; text: string; turnId: string }
  | { kind: 'peer'; text: string; fromAgentId: string; fromName: string }

export class AgentQueue {
  private items: QueueItem[] = []

  get length(): number {
    return this.items.length
  }

  enqueue(item: QueueItem): void {
    this.items.push(item)
  }

  peek(): QueueItem | undefined {
    return this.items[0]
  }

  dequeue(): QueueItem | undefined {
    return this.items.shift()
  }

  clear(): void {
    this.items = []
  }

  snapshot(): QueueItem[] {
    return [...this.items]
  }
}
