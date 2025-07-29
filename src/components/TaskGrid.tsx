
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
  overlayIcons?: { [taskId: string]: "checkmark" | "warning" | "alarm" };
  isArchived?: boolean;
}

export const TaskGrid = ({ 
  tasks, 
  onTaskClick, 
  className = '',
  overlayIcons = {},
  isArchived = false
}: TaskGridProps) => {
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
      // For archived tasks, group by completed_at; for regular tasks, group by due_date
      const dateToUse = isArchived ? task.completed_at : task.due_date;
      if (!dateToUse) return; // Skip tasks without relevant dates
      
      const date = new Date(dateToUse);
      const monthYear = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
      
      if (!groups[monthYear]) {
        groups[monthYear] = [];
      }
      groups[monthYear].push(task);
    });

    // Sort by year and month - reverse chronological for archived (latest first), chronological for regular (earliest first)
    const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
      const [yearA, monthA] = a.split('-').map(Number);
      const [yearB, monthB] = b.split('-').map(Number);
      
      if (isArchived) {
        // For archived tasks: latest first (reverse chronological)
        if (yearA !== yearB) {
          return yearB - yearA;
        }
        return monthB - monthA;
      } else {
        // For regular tasks: earliest first (chronological)
        if (yearA !== yearB) {
          return yearA - yearB;
        }
        return monthA - monthB;
      }
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
              data-month-section={monthYear}
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
              <div className={`grid gap-3 px-4 ${isArchived ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10' : 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10'}`}>
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
                      overlayIcon={overlayIcons?.[task.id]}
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
