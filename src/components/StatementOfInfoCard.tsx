import { SmallBizCard } from "./SmallBizCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Clock, CheckCircle } from "lucide-react";

interface StatementOfInfoProps {
  status: "pending" | "due-soon" | "completed" | "overdue";
  dueDate?: string;
  lastFiled?: string;
  onStart?: () => void;
  expanded?: boolean;
}

export const StatementOfInfoCard = ({ 
  status, 
  dueDate, 
  lastFiled, 
  onStart, 
  expanded = false 
}: StatementOfInfoProps) => {
  const getStatusInfo = (status: string) => {
    switch (status) {
      case "pending":
        return {
          color: "warning" as const,
          text: "Update Required",
          icon: Clock,
          description: "Your Statement of Information needs review"
        };
      case "due-soon":
        return {
          color: "warning" as const,
          text: "Due Soon",
          icon: Clock,
          description: "Filing deadline approaching"
        };
      case "completed":
        return {
          color: "success" as const,
          text: "Up to Date",
          icon: CheckCircle,
          description: "Statement of Information is current"
        };
      case "overdue":
        return {
          color: "destructive" as const,
          text: "Overdue",
          icon: Clock,
          description: "Filing deadline has passed"
        };
      default:
        return {
          color: "secondary" as const,
          text: "Unknown",
          icon: FileText,
          description: "Status unknown"
        };
    }
  };

  const statusInfo = getStatusInfo(status);
  const StatusIcon = statusInfo.icon;

  return (
    <SmallBizCard
      title="Statement of Information"
      description="Annual business filing requirement"
      variant={status === "completed" ? "success" : status === "overdue" ? "warning" : "task"}
      className={expanded ? "w-full" : ""}
    >
      <div className="space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{statusInfo.description}</span>
          </div>
          <Badge variant={statusInfo.color as any}>
            {statusInfo.text}
          </Badge>
        </div>

        {/* Due Date */}
        {dueDate && status !== "completed" && (
          <div className="text-sm">
            <span className="font-medium text-foreground">Due: </span>
            <span className="text-muted-foreground">{dueDate}</span>
          </div>
        )}

        {/* Last Filed */}
        {lastFiled && (
          <div className="text-sm">
            <span className="font-medium text-foreground">Last filed: </span>
            <span className="text-muted-foreground">{lastFiled}</span>
          </div>
        )}

        {/* Current Information Preview */}
        {expanded && (
          <div className="space-y-3 pt-2 border-t">
            <h4 className="font-medium text-foreground">Current Information on File</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Business Address:</span>
                <div className="text-muted-foreground">123 Business Ave, San Francisco, CA 94105</div>
              </div>
              <div>
                <span className="font-medium">Registered Agent:</span>
                <div className="text-muted-foreground">John Smith</div>
              </div>
              <div>
                <span className="font-medium">Officers:</span>
                <div className="text-muted-foreground">
                  • John Smith - CEO<br />
                  • Jane Doe - Secretary
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        {onStart && status !== "completed" && (
          <Button 
            onClick={onStart}
            className="w-full"
            variant={status === "overdue" ? "destructive" : "default"}
          >
            {status === "overdue" ? "File Now (Overdue)" : "Review & Update"}
          </Button>
        )}

        {status === "completed" && (
          <div className="text-center py-2">
            <CheckCircle className="h-6 w-6 text-success mx-auto mb-2" />
            <p className="text-sm text-success font-medium">All set! You're compliant.</p>
          </div>
        )}
      </div>
    </SmallBizCard>
  );
};