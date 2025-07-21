import { useState, useMemo } from "react";
import { CompactTaskCard } from "./CompactTaskCard";
import { MonthDelineator } from "./MonthDelineator";

interface Task {
  id: string;
  title: string;
  description?: string;
  task_type: string;
  due_date: string;
  priority: number;
  status: string;
  data?: {
    icon?: string;
    color?: string;
  };
}

interface TaskGridProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  className?: string;
}

export const TaskGrid = ({ tasks, onTaskClick, className }: TaskGridProps) => {
  const [isVisible, setIsVisible] = useState(false);

  const getTaskUrgency = (task: Task): "overdue" | "urgent" | "normal" => {
    const today = new Date();
    const dueDate = new Date(task.due_date);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "overdue";
    if (diffDays <= 7) return "urgent";
    return "normal";
  };

  // Group tasks by month and year
  const groupedTasks = useMemo(() => {
    const groups: { [key: string]: Task[] } = {};
    
    tasks.forEach(task => {
      const date = new Date(task.due_date);
      const monthYear = `${date.getFullYear()}-${date.getMonth()}`;
      
      if (!groups[monthYear]) {
        groups[monthYear] = [];
      }
      groups[monthYear].push(task);
    });

    // Sort months chronologically (future months first for scrolling effect)
    const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
      const [yearA, monthA] = a.split('-').map(Number);
      const [yearB, monthB] = b.split('-').map(Number);
      
      if (yearA !== yearB) return yearB - yearA; // Future years first
      return monthB - monthA; // Future months first
    });

    return sortedGroups;
  }, [tasks]);

  return (
    <div className={className}>
      {/* Toggle button to reveal/hide compact grid */}
      <div className="text-center mb-4">
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isVisible ? "Hide upcoming tasks" : `Show ${tasks.length} upcoming tasks`}
        </button>
      </div>

      {/* Compact grid - slides down when visible */}
      <div className={`transition-all duration-500 overflow-hidden ${
        isVisible ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
      }`}>
        <div className="space-y-6 pb-6">
          {groupedTasks.map(([monthYear, monthTasks]) => {
            const [year, month] = monthYear.split('-').map(Number);
            const monthName = new Date(year, month).toLocaleDateString('en-US', { 
              month: 'long' 
            });

            return (
              <div key={monthYear}>
                <MonthDelineator 
                  month={monthName}
                  year={year}
                  taskCount={monthTasks.length}
                />
                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-3 px-4">
                  {monthTasks.map(task => (
                    <CompactTaskCard
                      key={task.id}
                      task={task}
                      urgency={getTaskUrgency(task)}
                      onClick={() => onTaskClick(task)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};