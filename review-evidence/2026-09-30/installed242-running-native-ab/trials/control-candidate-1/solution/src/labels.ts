export function taskLabel(name: string, completed: boolean): string {
  return (completed ? '[x] ' : '[ ] ') + name;
}
