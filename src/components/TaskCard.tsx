
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
              ? "relative z-50 w-full min-h-[80vh]" 
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
            <div className="bg-card border rounded-lg shadow-lg h-full overflow-hidden flex flex-col">
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

              <div className="flex-1 overflow-auto flex flex-col">
                {/* Ally AI Assistant Header */}
                <div className="p-6 pb-0 animate-content-fade-in">
                  <div className="flex items-center gap-3 pr-12">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      <MessageCircle className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">Ally - Your AI Assistant</h2>
                      <p className="text-muted-foreground text-base">Ready to help you with your business tasks</p>
                    </div>
                  </div>
                </div>

                {/* Chat Interface Content */}
                <div className="flex-1 p-6 animate-content-fade-in" style={{ animationDelay: '100ms' }}>
                  <div className="h-full flex flex-col">
                    {/* Task Context */}
                    <div className="bg-muted/50 rounded-lg p-4 mb-4">
                      <h3 className="font-medium text-foreground mb-2">Current Task</h3>
                      <p className="text-sm text-muted-foreground">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                      )}
                    </div>

                    {/* Chat Area Placeholder */}
                    <div className="flex-1 bg-background border rounded-lg p-4 flex flex-col justify-center items-center">
                      <MessageCircle className="h-16 w-16 text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">Chat with Ally</h3>
                      <p className="text-sm text-muted-foreground text-center max-w-md">
                        Start a conversation about your task. Ally can help you understand requirements, 
                        plan next steps, or answer any questions you might have.
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 mt-4">
                      {onAction && (
                        <Button 
                          onClick={onAction}
                          className="flex-1"
                          size="lg"
                        >
                          Start Chat
                        </Button>
                      )}
                      <Button variant="outline" onClick={onClick} size="lg">
                        View Task Details
                      </Button>
                    </div>
                  </div>
                </div>
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
