
import { useMemo } from "react";
import { CompactTaskCard } from "./CompactTaskCard";
import { MonthDelineator } from "./MonthDelineator";
import type { Database } from "@/integrations/supabase/types";

type TaskRow = Database['public']['Tables']['tasks']['Row'];

interface Task extends Omit<TaskRow, 'data'> {
  due_date: string | null;
  data?: {
    icon?: string;
    color?: string;
  } | null;
}

interface TaskGridProps {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
  className?: string;
}

export const TaskGrid = ({ tasks, onTaskClick, className }: TaskGridProps) => {
  const getTaskUrgency = (task: Task): "overdue" | "urgent" | "normal" => {
    if (!task.due_date) return "normal";
    
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
      if (!task.due_date) return; // Skip tasks without due dates
      
      const date = new Date(task.due_date);
      const monthYear = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
      
      if (!groups[monthYear]) {
        groups[monthYear] = [];
      }
      groups[monthYear].push(task);
    });

    // Sort months chronologically (earliest first)
    const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
      const [yearA, monthA] = a.split('-').map(Number);
      const [yearB, monthB] = b.split('-').map(Number);
      
      if (yearA !== yearB) return yearA - yearB;
      return monthA - monthB;
    });

    return sortedGroups;
  }, [tasks]);

  if (groupedTasks.length === 0) return null;

  return (
    <div className={`w-full ${className}`}>
      <div className="space-y-8">
        {groupedTasks.map(([monthYear, monthTasks], index) => {
          const [year, month] = monthYear.split('-').map(Number);
          const monthName = new Date(year, month).toLocaleDateString('en-US', { 
            month: 'long' 
          });

          return (
            <div 
              key={monthYear}
              className="animate-fade-in"
              style={{ 
                animationDelay: `${index * 0.1}s`,
                animationFillMode: 'both'
              }}
            >
              <MonthDelineator 
                month={monthName}
                year={year}
                taskCount={monthTasks.length}
              />
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-3 px-4">
                {monthTasks.map((task, taskIndex) => (
                  <div
                    key={task.id}
                    className="animate-scale-in"
                    style={{ 
                      animationDelay: `${(index * 0.1) + (taskIndex * 0.05)}s`,
                      animationFillMode: 'both'
                    }}
                  >
                    <CompactTaskCard
                      task={task}
                      urgency={getTaskUrgency(task)}
                      onClick={() => onTaskClick(task.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
