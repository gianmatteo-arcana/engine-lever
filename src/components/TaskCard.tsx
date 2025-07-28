
import { cn } from "@/lib/utils";
import { SmallBizCard } from "./SmallBizCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, AlertTriangle, MessageCircle, Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";
import type { Database } from "@/integrations/supabase/types";

type TaskRow = Database['public']['Tables']['tasks']['Row'];

interface Task extends Omit<TaskRow, 'data'> {
  due_date: string | null;
  data?: {
    icon?: string;
    color?: string;
  } | null;
}

interface TaskCardProps {
  task: Task;
  size: "compact" | "medium" | "full";
  urgency: "overdue" | "urgent" | "normal";
  onClick: () => void;
  onAction?: () => void;
  actionLabel?: string;
  isGreeting?: boolean;
}

export const TaskCard = ({ task, size, urgency, onClick, onAction, actionLabel, isGreeting }: TaskCardProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  if (size === "medium") {
    return (
      <>
        {/* Backdrop for fullscreen mode */}
        {isFullscreen && (
          <div 
            className="fixed inset-0 z-40 bg-background/95 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsFullscreen(false)}
          />
        )}
        
        {/* Card container */}
        <div 
          className={cn(
            "transition-all ease-out",
            isFullscreen 
              ? "fixed top-4 left-4 right-4 bottom-20 z-50" 
              : "relative w-full h-full"
          )}
          style={{ 
            transformOrigin: 'top left',
            transitionDuration: '400ms',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {isFullscreen ? (
            // Fullscreen view
            <div className="bg-card border rounded-lg shadow-lg min-h-full overflow-hidden">
              {/* Close button */}
              <div className="absolute top-4 right-4 z-10">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFullscreen(false);
                  }}
                  className="h-8 w-8 p-0 shadow-lg"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="h-full overflow-auto">
                {(task.title || task.description) && (
                  <div className="p-6 pb-0 animate-content-fade-in">
                    <div className="flex items-start justify-between pr-12">
                      <div>
                        <h2 className="text-2xl font-bold text-foreground">{task.title}</h2>
                        {task.description && (
                          <p className="text-muted-foreground mt-2 text-base leading-relaxed">{task.description}</p>
                        )}
                      </div>
                      {!isGreeting && getUrgencyBadge()}
                    </div>
                  </div>
                )}

                {!isGreeting && (
                  <div className="animate-content-fade-in" style={{ animationDelay: '100ms' }}>
                    <div className="grid gap-6 md:grid-cols-2 p-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-muted-foreground" />
                          <span className="text-base font-medium">Due Date</span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">
                          {task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          }) : "No due date set"}
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-5 w-5 text-muted-foreground" />
                          <span className="text-base font-medium">Time Remaining</span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">
                          {getDaysUntilDue() >= 0 
                            ? `${getDaysUntilDue()} days remaining`
                            : `${Math.abs(getDaysUntilDue())} days overdue`
                          }
                        </p>
                      </div>
                    </div>

                    {urgency === "overdue" && (
                      <div className="flex items-center gap-3 p-4 mx-6 mb-6 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                        <div>
                          <p className="font-medium text-destructive">This task is overdue</p>
                          <p className="text-sm text-destructive/80 leading-relaxed">
                            Immediate action is required to maintain compliance
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 p-6 pt-0">
                      {onAction && (
                        <Button 
                          onClick={onAction}
                          className="flex-1"
                          variant={urgency === "overdue" ? "destructive" : "default"}
                          size="lg"
                        >
                          {actionLabel || (urgency === "overdue" ? "Complete Now" : "Start Task")}
                        </Button>
                      )}
                      <Button variant="outline" onClick={onClick} size="lg">
                        View Details
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Medium size view
            <SmallBizCard
              title={task.title}
              description={task.description}
              variant={getVariantFromUrgency()}
              onClick={onClick}
              expandable={true}
              className="cursor-pointer origin-top-left transition-all duration-300 ease-out"
            >
              <div className="space-y-4">
                {!isGreeting && (
                  <>
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
                  </>
                )}
                
                <div className="flex items-center gap-2">
                  {onAction && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction();
                      }}
                      className="flex items-center gap-2 w-fit transition-all duration-200 hover:scale-105"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {actionLabel || "Chat with Ally"}
                    </Button>
                  )}
                  
                  {/* Fullscreen button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFullscreen(true);
                    }}
                    className="flex items-center gap-2 w-fit transition-all duration-200 hover:scale-105"
                  >
                    <Maximize2 className="h-4 w-4" />
                    Expand
                  </Button>
                </div>
              </div>
            </SmallBizCard>
          )}
        </div>
      </>
    );
  }

  if (size === "full") {
    return (
      <div className="bg-card border rounded-lg shadow-lg overflow-hidden">
        {(task.title || task.description) && (
          <div className="p-6 pb-0">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{task.title}</h2>
                {task.description && (
                  <p className="text-muted-foreground mt-2">{task.description}</p>
                )}
              </div>
              {!isGreeting && getUrgencyBadge()}
            </div>
          </div>
        )}

        {!isGreeting && (
          <>
            <div className="grid gap-4 md:grid-cols-2 p-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Due Date</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : "No due date set"}
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
              <div className="flex items-center gap-3 p-4 mx-6 mb-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">This task is overdue</p>
                  <p className="text-sm text-destructive/80">
                    Immediate action is required to maintain compliance
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 p-6 pt-0">
              {onAction && (
                <Button 
                  onClick={onAction}
                  className="flex-1"
                  variant={urgency === "overdue" ? "destructive" : "default"}
                >
                  {actionLabel || (urgency === "overdue" ? "Complete Now" : "Start Task")}
                </Button>
              )}
              <Button variant="outline" onClick={onClick}>
                View Details
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
};
