import { cn } from "@/lib/utils";
import { SmallBizCard } from "./SmallBizCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, AlertTriangle } from "lucide-react";

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

interface TaskCardProps {
  task: Task;
  size: "compact" | "medium" | "full";
  urgency: "overdue" | "urgent" | "normal";
  onClick: () => void;
  onAction?: () => void;
}

export const TaskCard = ({ task, size, urgency, onClick, onAction }: TaskCardProps) => {
  const getDaysUntilDue = () => {
    const today = new Date();
    const dueDate = new Date(task.due_date);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getUrgencyBadge = () => {
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

  if (size === "medium") {
    return (
      <SmallBizCard
        title={task.title}
        description={task.description}
        variant={getVariantFromUrgency()}
        onClick={onClick}
        expandable={true}
        className="cursor-pointer"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Due: {new Date(task.due_date).toLocaleDateString()}
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
          
          {onAction && (
            <Button 
              onClick={(e) => {
                e.stopPropagation();
                onAction();
              }}
              className="w-full"
              variant={urgency === "overdue" ? "destructive" : "default"}
            >
              {urgency === "overdue" ? "Complete Now" : "Start Task"}
            </Button>
          )}
        </div>
      </SmallBizCard>
    );
  }

  if (size === "full") {
    return (
      <div className="bg-card border rounded-lg p-6 space-y-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{task.title}</h2>
            {task.description && (
              <p className="text-muted-foreground mt-2">{task.description}</p>
            )}
          </div>
          {getUrgencyBadge()}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Due Date</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {new Date(task.due_date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Time Remaining</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {getDaysUntilDue() >= 0 
                ? `${getDaysUntilDue()} days remaining`
                : `${Math.abs(getDaysUntilDue())} days overdue`
              }
            </p>
          </div>
        </div>

        {urgency === "overdue" && (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">This task is overdue</p>
              <p className="text-sm text-destructive/80">
                Immediate action is required to maintain compliance
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {onAction && (
            <Button 
              onClick={onAction}
              className="flex-1"
              variant={urgency === "overdue" ? "destructive" : "default"}
            >
              {urgency === "overdue" ? "Complete Now" : "Start Task"}
            </Button>
          )}
          <Button variant="outline" onClick={onClick}>
            View Details
          </Button>
        </div>
      </div>
    );
  }

  return null;
};