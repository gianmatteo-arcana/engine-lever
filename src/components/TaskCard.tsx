
import { cn } from "@/lib/utils";
import { SmallBizCard } from "./SmallBizCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, AlertTriangle, MessageCircle, Maximize2, Minimize2, Send } from "lucide-react";
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
        {/* Card container */}
        <div 
          className={cn(
            "transition-all ease-out w-full",
            isFullscreen 
              ? "relative min-h-[600px] mb-4" 
              : "relative h-full"
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
                <div className="p-6 pb-4 animate-content-fade-in">
                  <div className="flex items-center gap-3 pr-12">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      <MessageCircle className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">Ally - Your AI Assistant</h2>
                      <p className="text-muted-foreground text-base">I'm here to help with your compliance needs</p>
                    </div>
                  </div>
                </div>

                {/* Chat Interface Content */}
                <div className="flex-1 p-6 pt-0 animate-content-fade-in" style={{ animationDelay: '100ms' }}>
                  <div className="h-full flex flex-col">
                    {/* Welcome Message */}
                    <div className="flex items-start gap-3 mb-6">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <MessageCircle className="h-5 w-5 text-primary" />
                      </div>
                      <div className="bg-muted/50 rounded-lg p-4 flex-1">
                        <p className="text-sm text-foreground">
                          Hello! Welcome back. I'm Ally, your AI compliance assistant, ready to help you stay on top of all your business requirements and keep your business compliant and stress-free. How can I assist you today?
                        </p>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <Button variant="outline" className="justify-start h-auto py-3 px-4">
                        <span className="text-sm">Review my compliance status</span>
                      </Button>
                      <Button variant="outline" className="justify-start h-auto py-3 px-4">
                        <span className="text-sm">Update Statement of Information</span>
                      </Button>
                      <Button variant="outline" className="justify-start h-auto py-3 px-4 flex items-center gap-2">
                        <div className="w-4 h-4 border border-current rounded flex items-center justify-center">
                          <div className="w-2 h-2 border-l border-b border-current transform rotate-45 scale-75"></div>
                        </div>
                        <span className="text-sm">Review letter</span>
                      </Button>
                      <Button variant="outline" className="justify-start h-auto py-3 px-4">
                        <span className="text-sm">Ask a question</span>
                      </Button>
                    </div>

                    {/* Chat Input Area */}
                    <div className="mt-auto">
                      <div className="flex gap-2 p-4 bg-background border rounded-lg">
                        <input 
                          type="text" 
                          placeholder="Ask me anything..."
                          className="flex-1 px-0 py-0 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground"
                        />
                        <Button size="sm" className="px-3">
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
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
                        setIsFullscreen(true);
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

                {/* Expanded Chat Interface - appears below existing content with animation */}
                {isFullscreen && (
                  <div className="animate-fade-in pt-4 border-t border-border">
                    {/* Ally AI Assistant Header */}
                    <div className="mb-4 animate-content-fade-in">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <MessageCircle className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">Ally - Your AI Assistant</h3>
                          <p className="text-sm text-muted-foreground">I'm here to help with your compliance needs</p>
                        </div>
                      </div>
                    </div>

                    {/* Welcome Message */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <MessageCircle className="h-4 w-4 text-primary" />
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 flex-1">
                        <p className="text-sm text-foreground">
                          Hello! Welcome back. I'm Ally, your AI compliance assistant, ready to help you stay on top of all your business requirements and keep your business compliant and stress-free. How can I assist you today?
                        </p>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <Button variant="outline" size="sm" className="justify-start h-auto py-2 px-3 text-xs">
                        Review my compliance status
                      </Button>
                      <Button variant="outline" size="sm" className="justify-start h-auto py-2 px-3 text-xs">
                        Update Statement of Information
                      </Button>
                      <Button variant="outline" size="sm" className="justify-start h-auto py-2 px-3 text-xs flex items-center gap-2">
                        <div className="w-3 h-3 border border-current rounded flex items-center justify-center">
                          <div className="w-1.5 h-1.5 border-l border-b border-current transform rotate-45 scale-75"></div>
                        </div>
                        Review letter
                      </Button>
                      <Button variant="outline" size="sm" className="justify-start h-auto py-2 px-3 text-xs">
                        Ask a question
                      </Button>
                    </div>

                    {/* Chat Input Area */}
                    <div className="flex gap-2 p-3 bg-background border rounded-lg">
                      <input 
                        type="text" 
                        placeholder="Ask me anything..."
                        className="flex-1 px-0 py-0 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground"
                      />
                      <Button size="sm" className="px-2">
                        <Send className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
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
