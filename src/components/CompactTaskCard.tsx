import { cn } from "@/lib/utils";
import { useState } from "react";
import { SmallBizCard } from "./SmallBizCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, AlertTriangle, X } from "lucide-react";
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
  const [isExpanded, setIsExpanded] = useState(false);

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

  const getDaysUntilDue = () => {
    if (!task.due_date) return 0;
    
    const today = new Date();
    const dueDate = new Date(task.due_date);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getUrgencyBadge = () => {
    if (!task.due_date) return <Badge variant="secondary" className="text-xs">No Due Date</Badge>;
    
    const daysUntil = getDaysUntilDue();
    
    if (daysUntil < 0) {
      return <Badge variant="destructive" className="text-xs">Overdue</Badge>;
    } else if (daysUntil <= 7) {
      return <Badge variant="outline" className="text-xs border-warning text-warning">Due Soon</Badge>;
    } else if (daysUntil <= 30) {
      return <Badge variant="outline" className="text-xs border-primary text-primary">Upcoming</Badge>;
    }
    return <Badge variant="secondary" className="text-xs">Future</Badge>;
  };

  const getVariantFromUrgency = () => {
    switch (urgency) {
      case "overdue":
        return "warning" as const;
      case "urgent":
        return "warning" as const;
      default:
        return "default" as const;
    }
  };

  const handleCardClick = () => {
    setIsExpanded(!isExpanded);
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  const icon = task.data?.icon || task.task_type.substring(0, 2).toUpperCase();

  if (isExpanded) {
    return (
      <div className="animate-scale-in col-span-full" style={{ animationDuration: '0.15s' }}>
        <SmallBizCard
          title={task.title}
          description={task.description}
          variant={getVariantFromUrgency()}
          onClick={handleCardClick}
          expandable={true}
          className="cursor-pointer relative"
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(false);
            }}
          >
            <X className="h-3 w-3" />
          </Button>

          <div className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Due: {task.due_date ? new Date(task.due_date).toLocaleDateString() : "No due date"}
                </span>
              </div>
              {getUrgencyBadge()}
            </div>
            
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {getDaysUntilDue() >= 0 
                  ? `${getDaysUntilDue()} days remaining`
                  : `${Math.abs(getDaysUntilDue())} days overdue`
                }
              </span>
            </div>

            {urgency === "overdue" && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive font-medium">
                  Action Required
                </span>
              </div>
            )}
            
            <Button 
              onClick={handleActionClick}
              className="w-full"
              variant={urgency === "overdue" ? "destructive" : "default"}
            >
              {urgency === "overdue" ? "Complete Now" : "Start Task"}
            </Button>
          </div>
        </SmallBizCard>
      </div>
    );
  }

  return (
    <div
      onClick={handleCardClick}
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