
import { useState, useEffect, useRef } from "react";
import { StackedCard } from "./StackedCard";
import { TaskCard } from "./TaskCard";
import { StatementOfInfoCard } from "./StatementOfInfoCard";
import { SmallBizCard } from "./SmallBizCard";
import { useTasks } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

interface StackedDashboardProps {
  user: { name: string; email: string; createdAt?: Date } | null;
  onChatToggle: () => void;
  onTaskClick: (taskId: string) => void;
  onStartStatementUpdate: () => void;
}

export const StackedDashboard = ({ 
  user, 
  onChatToggle, 
  onTaskClick, 
  onStartStatementUpdate 
}: StackedDashboardProps) => {
  const { tasks, loading, error, getMostUrgentTask, getTaskUrgency } = useTasks();
  const [activeCardId, setActiveCardId] = useState<string>("greeting");
  const containerRef = useRef<HTMLDivElement>(null);

  const mostUrgentTask = getMostUrgentTask();

  // Define the cards in order
  const cards = [
    {
      id: "greeting",
      type: "greeting",
      headerHeight: 60,
      expandedHeight: 400
    },
    ...(mostUrgentTask ? [{
      id: "priority-task",
      type: "priority-task",
      headerHeight: 60,
      expandedHeight: 350
    }] : []),
    {
      id: "business-snapshot",
      type: "business-snapshot",
      headerHeight: 60,
      expandedHeight: 250
    },
    {
      id: "statement-info",
      type: "statement-info",
      headerHeight: 60,
      expandedHeight: 300
    }
  ];

  const handleCardClick = (cardId: string) => {
    setActiveCardId(cardId);
  };

  const getCardPosition = (cardIndex: number) => {
    const headerHeight = 60;
    const peekAmount = 10;
    let totalOffset = 0;

    // Calculate offset based on previous cards
    for (let i = 0; i < cardIndex; i++) {
      if (cards[i].id === activeCardId) {
        totalOffset += cards[i].expandedHeight;
      } else {
        totalOffset += headerHeight + peekAmount;
      }
    }

    return totalOffset;
  };

  const renderCardContent = (card: any, isActive: boolean) => {
    switch (card.type) {
      case "greeting":
        return (
          <TaskCard
            task={{
              id: 'greeting-task',
              user_id: 'system',
              title: `Welcome back, ${user?.name?.split(' ')[0] || "User"}!`,
              description: "Let's keep your business compliant and stress-free. I'm Ally, your AI compliance assistant, ready to help you stay on top of all your business requirements.",
              task_type: 'greeting',
              status: 'active',
              priority: 1,
              due_date: null,
              data: { icon: '👋', color: 'primary' },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              completed_at: null
            }}
            size="medium"
            urgency="normal"
            onClick={() => {}}
            onAction={onChatToggle}
            actionLabel="Chat with Ally"
            isGreeting={true}
          />
        );

      case "priority-task":
        if (!mostUrgentTask) return null;
        return (
          <TaskCard
            task={mostUrgentTask}
            size="medium"
            urgency={getTaskUrgency(mostUrgentTask)}
            onClick={() => onTaskClick(mostUrgentTask.id)}
            onAction={() => onTaskClick(mostUrgentTask.id)}
          />
        );

      case "business-snapshot":
        return (
          <SmallBizCard
            title="Business Snapshot"
            description="Where your paperwork stands today"
            variant="warning"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Current Status</span>
                <span className="text-sm font-medium text-warning">
                  {tasks.filter(t => t.status === 'pending').length === 0 
                    ? "All set — 0 tasks pending"
                    : `${tasks.filter(t => t.status === 'pending').length} items need attention`}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-warning h-2 rounded-full" 
                  style={{ 
                    width: `${Math.max(20, 100 - (tasks.filter(t => t.status === 'pending').length * 15))}%` 
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {tasks.filter(t => t.status === 'pending').length === 0 
                  ? "Nice work! We'll tap you when something needs attention." 
                  : "Complete your pending tasks to improve compliance."}
              </p>
            </div>
          </SmallBizCard>
        );

      case "statement-info":
        return (
          <StatementOfInfoCard
            status="pending"
            dueDate="October 31, 2024"
            lastFiled="January 2024"
            onStart={onStartStatementUpdate}
          />
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Loading tasks...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Error loading tasks: {error}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto min-h-[600px]">
      {cards.map((card, index) => {
        const isActive = card.id === activeCardId;
        const position = getCardPosition(index);
        const zIndex = isActive ? 50 : 40 - index;

        return (
          <StackedCard
            key={card.id}
            isActive={isActive}
            position={position}
            zIndex={zIndex}
            headerHeight={card.headerHeight}
            expandedHeight={card.expandedHeight}
            onClick={() => handleCardClick(card.id)}
          >
            {renderCardContent(card, isActive)}
          </StackedCard>
        );
      })}
    </div>
  );
};
