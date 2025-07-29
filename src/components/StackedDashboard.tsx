import { useState } from "react";
import { StackedCard } from "./StackedCard";
import { SmallBizCard } from "./SmallBizCard";
import { BusinessProfileCard } from "./BusinessProfileCard";
import { StatementOfInfoCard } from "./StatementOfInfoCard";
import { TaskCard } from "./TaskCard";
import { ChatInterface } from "./ChatInterface";

interface ChatMessage {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  pills?: string[];
}

interface StackedDashboardProps {
  user: { name: string; email: string; createdAt?: Date } | null;
  mostUrgentTask: any;
  chatMessages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onPillClick: (pill: string) => void;
  onStartStatementUpdate: () => void;
  onTaskAction: (taskId: string) => void;
  handleChatToggle: () => void;
}

export const StackedDashboard = ({
  user,
  mostUrgentTask,
  chatMessages,
  onSendMessage,
  onPillClick,
  onStartStatementUpdate,
  onTaskAction,
  handleChatToggle
}: StackedDashboardProps) => {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const cards = [
    {
      id: "welcome",
      title: `Welcome back, ${user?.name?.split(' ')[0] || "User"}!`,
      content: (
        <TaskCard
          task={{
            id: 'greeting-task',
            user_id: 'system',
            title: `Welcome back, ${user?.name?.split(' ')[0] || "User"}!`,
            description: "Let's keep your business compliant and stress-free. I'm Ally, your AI compliance assistant.",
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
          onAction={handleChatToggle}
          actionLabel="Chat with Ally"
          isGreeting={true}
        />
      ),
      expandedContent: (
        <div className="h-[600px]">
          <ChatInterface
            messages={chatMessages}
            onSendMessage={onSendMessage}
            onPillClick={onPillClick}
            placeholder="Ask me anything..."
            className="h-full"
            onClose={() => setExpandedCard(null)}
            showCloseButton={true}
          />
        </div>
      )
    },
    {
      id: "priority-task",
      title: "Priority Task",
      content: mostUrgentTask ? (
        <TaskCard
          task={mostUrgentTask}
          size="medium"
          urgency="urgent"
          onClick={() => {}}
          onAction={() => onTaskAction(mostUrgentTask.id)}
        />
      ) : (
        <SmallBizCard title="No urgent tasks" variant="success">
          <p className="text-muted-foreground">You're all caught up! 🎉</p>
        </SmallBizCard>
      )
    },
    {
      id: "business-snapshot",
      title: "Business Snapshot",
      content: (
        <BusinessProfileCard
          isExpanded={false}
          onToggle={() => {}}
        />
      )
    },
    {
      id: "statement-info",
      title: "Statement of Information",
      content: (
        <StatementOfInfoCard
          status="pending"
          dueDate="October 31, 2024"
          lastFiled="January 2024"
          onStart={onStartStatementUpdate}
        />
      )
    }
  ];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        {expandedCard === "welcome" ? (
          <div>
            <StackedCard
              key="welcome"
              id="welcome"
              title={cards[0].title}
              index={0}
              isExpanded={true}
              onToggle={(cardId) => 
                setExpandedCard(expandedCard === cardId ? null : cardId)
              }
              content={cards[0].content}
              expandedContent={cards[0].expandedContent}
            />
            <div className="mt-6">
              {cards.slice(1).map((card, originalIndex) => (
                <div key={card.id} className="mb-4">
                  <h3 className="text-lg font-semibold text-foreground mb-2">{card.title}</h3>
                  {card.content}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative h-[600px]">
            {cards.map((card, index) => (
              <StackedCard
                key={card.id}
                id={card.id}
                title={card.title}
                index={index}
                isExpanded={expandedCard === card.id}
                onToggle={(cardId) => 
                  setExpandedCard(expandedCard === cardId ? null : cardId)
                }
                content={card.content}
                expandedContent={card.expandedContent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};