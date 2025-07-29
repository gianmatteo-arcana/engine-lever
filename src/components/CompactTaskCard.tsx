import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { SmallBizCard } from "./SmallBizCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, AlertTriangle, X, Check, AlertCircle } from "lucide-react";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
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
  overlayIcon?: "checkmark" | "warning" | "alarm";
}

export const CompactTaskCard = ({ task, onClick, urgency, overlayIcon }: CompactTaskCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [expandedAt, setExpandedAt] = useState<number | null>(null);
  const { ref: intersectionRef, isVisible } = useIntersectionObserver({
    threshold: 0.3,
    rootMargin: '-10% 0px -10% 0px'
  });

  // Smart auto-collapse with debounce and user interaction respect
  useEffect(() => {
    if (!isVisible && isExpanded) {
      const now = Date.now();
      const timeSinceExpanded = expandedAt ? now - expandedAt : Infinity;
      
      // Don't auto-collapse if recently expanded (less than 2 seconds)
      if (timeSinceExpanded < 2000) return;
      
      // Show warning state first
      setIsCollapsing(true);
      
      // Debounced collapse after 500ms
      const timer = setTimeout(() => {
        setIsExpanded(false);
        setIsCollapsing(false);
        setExpandedAt(null);
      }, 500);
      
      return () => clearTimeout(timer);
    } else {
      setIsCollapsing(false);
    }
  }, [isVisible, isExpanded, expandedAt]);

  const getUrgencyStyles = () => {
    // For archived tasks, use calming blue tones regardless of original urgency
    if (overlayIcon) {
      return "bg-primary/10 border-primary/20 text-primary hover:bg-primary/15";
    }
    
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
    if (!isExpanded) {
      setExpandedAt(Date.now());
    } else {
      setExpandedAt(null);
    }
    setIsExpanded(!isExpanded);
    setIsCollapsing(false);
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  const icon = task.data?.icon || task.task_type.substring(0, 2).toUpperCase();

  if (isExpanded) {
    return (
      <div 
        ref={intersectionRef}
        className="animate-card-expand col-span-full origin-top-left" 
        style={{ 
          opacity: isCollapsing ? 0.8 : 1,
          transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <SmallBizCard
          title="Business Snapshot"
          description="Where your paperwork stands today"
          variant="success"
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

          <div className="space-y-4 pt-6 animate-content-fade-in">
            <div className="flex items-center justify-center">
              <Badge variant="default" className="text-sm bg-success/20 text-success border-success/30">
                All set — 0 tasks pending
              </Badge>
            </div>
            
            <div className="text-center">
              <p className="text-muted-foreground">
                Nice work! We'll tap you when something needs attention.
              </p>
            </div>
          </div>
        </SmallBizCard>
      </div>
    );
  }

  return (
    <div
      ref={intersectionRef}
      onClick={handleCardClick}
      className={cn(
        "w-16 h-16 rounded-lg border-2 flex items-center justify-center origin-top-left",
        "cursor-pointer transition-all duration-300 hover:scale-105",
        "text-xs font-bold shadow-sm hover:shadow-md",
        getUrgencyStyles()
      )}
      style={{ 
        transformOrigin: 'top left',
        opacity: isCollapsing ? 0.8 : 1,
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
      title={`${task.title}${task.due_date ? ` - Due: ${new Date(task.due_date).toLocaleDateString()}` : ''}`}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        {icon}
        {overlayIcon && (
          <div className="absolute -bottom-1 -right-1">
            {overlayIcon === "checkmark" && (
              <div className="w-4 h-4 bg-success rounded-full flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
            {overlayIcon === "warning" && (
              <div className="w-4 h-4 bg-warning rounded-full flex items-center justify-center">
                <AlertTriangle className="w-2.5 h-2.5 text-white" />
              </div>
            )}
            {overlayIcon === "alarm" && (
              <div className="w-4 h-4 bg-destructive rounded-full flex items-center justify-center">
                <AlertCircle className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};