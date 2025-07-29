import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SmallBizCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  variant?: "default" | "success" | "warning" | "task";
  onClick?: () => void;
  expandable?: boolean;
}

export const SmallBizCard = ({ 
  title, 
  description, 
  children, 
  className,
  variant = "default",
  onClick,
  expandable = false
}: SmallBizCardProps) => {
  const variantStyles = {
    default: "border-border hover:shadow-md",
    success: "border-success/20 bg-success-light/50 hover:bg-success-light/70",
    warning: "border-warning/20 bg-warning-light/50 hover:bg-warning-light/70", 
    task: "border-primary/20 bg-primary-light/30 hover:bg-primary-light/50 cursor-pointer"
  };

  return (
    <Card 
      className={cn(
        "transition-all duration-300 ease-out shadow-sm hover:shadow-lg border-2",
        variantStyles[variant],
        expandable && "hover:scale-[1.02]",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-muted-foreground">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
};