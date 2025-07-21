import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type TaskRow = Database['public']['Tables']['tasks']['Row'];

interface Task extends Omit<TaskRow, 'data'> {
  due_date: string | null;
  data?: {
    icon?: string;
    color?: string;
  } | null;
}

interface CompactTaskCardProps {
  task: Task;
  onClick: () => void;
  urgency: "overdue" | "urgent" | "normal";
}

export const CompactTaskCard = ({ task, onClick, urgency }: CompactTaskCardProps) => {
  const getUrgencyStyles = () => {
    switch (urgency) {
      case "overdue":
        return "bg-destructive/20 border-destructive/40 text-destructive hover:bg-destructive/30";
      case "urgent":
        return "bg-warning/20 border-warning/40 text-warning hover:bg-warning/30";
      default:
        return "bg-muted border-border text-muted-foreground hover:bg-accent";
    }
  };

  const icon = task.data?.icon || task.task_type.substring(0, 2).toUpperCase();

  return (
    <div
      onClick={onClick}
      className={cn(
        "w-16 h-16 rounded-lg border-2 flex items-center justify-center",
        "cursor-pointer transition-all duration-200 hover:scale-105",
        "text-xs font-bold shadow-sm hover:shadow-md",
        getUrgencyStyles()
      )}
      title={`${task.title}${task.due_date ? ` - Due: ${new Date(task.due_date).toLocaleDateString()}` : ''}`}
    >
      {icon}
    </div>
  );
};