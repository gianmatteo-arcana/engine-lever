import { useState } from "react";
import { StackedCard } from "./StackedCard";
import { SmallBizCard } from "./SmallBizCard";
import { BusinessProfileCard } from "./BusinessProfileCard";
import { StatementOfInfoCard } from "./StatementOfInfoCard";
import { TaskCard } from "./TaskCard";
import { TaskGrid } from "./TaskGrid";
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
  onActionClick: (instruction: string) => void;
  onStartStatementUpdate: () => void;
  onTaskAction: (taskId: string) => void;
  handleChatToggle: () => void;
}

export const StackedDashboard = ({
  user,
  mostUrgentTask,
  chatMessages,
  onSendMessage,
  onActionClick,
  onStartStatementUpdate,
  onTaskAction,
  handleChatToggle
}: StackedDashboardProps) => {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Archived tasks data with literals and completed task information
  const archivedTasks = [
    {
      id: 'archived-1',
      user_id: 'user-1',
      title: 'BOI Report Filing',
      description: 'Successfully filed Beneficial Ownership Information report',
      task_type: 'boi_report',
      status: 'completed',
      priority: 1,
      due_date: '2024-11-15',
      data: { icon: 'BI', color: 'primary' },
      created_at: '2024-10-01T00:00:00Z',
      updated_at: '2024-11-15T00:00:00Z',
      completed_at: '2024-11-15T00:00:00Z'
    },
    {
      id: 'archived-2',
      user_id: 'user-1',
      title: 'Operating Agreement Review',
      description: 'Completed review and update of operating agreement',
      task_type: 'operating_agreement',
      status: 'completed',
      priority: 2,
      due_date: '2024-10-30',
      data: { icon: 'OA', color: 'primary' },
      created_at: '2024-09-01T00:00:00Z',
      updated_at: '2024-10-28T00:00:00Z',
      completed_at: '2024-10-28T00:00:00Z'
    },
    {
      id: 'archived-3',
      user_id: 'user-1',
      title: 'Franchise Tax Payment',
      description: 'Submitted annual franchise tax payment',
      task_type: 'franchise_tax',
      status: 'completed',
      priority: 1,
      due_date: '2024-10-15',
      data: { icon: 'FT', color: 'primary' },
      created_at: '2024-09-15T00:00:00Z',
      updated_at: '2024-10-15T00:00:00Z',
      completed_at: '2024-10-15T00:00:00Z'
    },
    {
      id: 'archived-4',
      user_id: 'user-1',
      title: 'Registered Agent Update',
      description: 'Updated registered agent information',
      task_type: 'registered_agent',
      status: 'completed',
      priority: 3,
      due_date: '2024-09-30',
      data: { icon: 'RA', color: 'primary' },
      created_at: '2024-08-01T00:00:00Z',
      updated_at: '2024-09-25T00:00:00Z',
      completed_at: '2024-09-25T00:00:00Z'
    },
    {
      id: 'archived-5',
      user_id: 'user-1',
      title: 'Business Bank Account Review',
      description: 'Completed review of business banking requirements',
      task_type: 'banking',
      status: 'completed',
      priority: 1,
      due_date: '2024-09-15',
      data: { icon: 'BA', color: 'primary' },
      created_at: '2024-08-01T00:00:00Z',
      updated_at: '2024-09-10T00:00:00Z',
      completed_at: '2024-09-10T00:00:00Z'
    },
    {
      id: 'archived-6',
      user_id: 'user-1',
      title: 'EIN Verification',
      description: 'Verified Employer Identification Number status',
      task_type: 'ein_verification',
      status: 'completed',
      priority: 2,
      due_date: '2024-08-31',
      data: { icon: 'EV', color: 'primary' },
      created_at: '2024-07-01T00:00:00Z',
      updated_at: '2024-08-30T00:00:00Z',
      completed_at: '2024-08-30T00:00:00Z'
    },
    {
      id: 'archived-7',
      user_id: 'user-1',
      title: 'Sales Tax Permit',
      description: 'Successfully applied for sales tax permit',
      task_type: 'sales_tax',
      status: 'completed',
      priority: 2,
      due_date: '2024-08-15',
      data: { icon: 'ST', color: 'primary' },
      created_at: '2024-07-01T00:00:00Z',
      updated_at: '2024-08-12T00:00:00Z',
      completed_at: '2024-08-12T00:00:00Z'
    },
    {
      id: 'archived-8',
      user_id: 'user-1',
      title: 'Payroll Tax Setup',
      description: 'Completed payroll tax requirements setup',
      task_type: 'payroll_tax',
      status: 'completed',
      priority: 1,
      due_date: '2024-07-31',
      data: { icon: 'PT', color: 'primary' },
      created_at: '2024-06-01T00:00:00Z',
      updated_at: '2024-07-28T00:00:00Z',
      completed_at: '2024-07-28T00:00:00Z'
    },
    {
      id: 'archived-9',
      user_id: 'user-1',
      title: 'Workers Comp Insurance',
      description: 'Renewed workers compensation insurance',
      task_type: 'insurance',
      status: 'completed',
      priority: 2,
      due_date: '2024-07-15',
      data: { icon: 'WC', color: 'primary' },
      created_at: '2024-06-01T00:00:00Z',
      updated_at: '2024-07-10T00:00:00Z',
      completed_at: '2024-07-10T00:00:00Z'
    },
    {
      id: 'archived-10',
      user_id: 'user-1',
      title: 'Business License Renewal',
      description: 'Renewed annual business license',
      task_type: 'license_renewal',
      status: 'completed',
      priority: 1,
      due_date: '2024-06-30',
      data: { icon: 'LR', color: 'primary' },
      created_at: '2024-05-01T00:00:00Z',
      updated_at: '2024-06-25T00:00:00Z',
      completed_at: '2024-06-25T00:00:00Z'
    }
  ];

  // Define overlay icons for specific tasks
  const overlayIcons = {
    'archived-1': 'checkmark' as const, // BOI Report
    'archived-2': 'checkmark' as const, // Operating Agreement
    'archived-3': 'checkmark' as const, // Franchise Tax
    'archived-4': 'warning' as const,   // Registered Agent has warning
    'archived-5': 'checkmark' as const, // Business Bank Account
    'archived-6': 'checkmark' as const, // EIN Verification
    'archived-7': 'checkmark' as const, // Sales Tax Permit
    'archived-8': 'alarm' as const,     // Payroll Tax has alarm
    'archived-9': 'checkmark' as const, // Workers Comp
    'archived-10': 'checkmark' as const, // Business License
  };

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
            onActionClick={onActionClick}
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
              
              {/* Archived Tasks Section */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">Archived Tasks</h3>
                <TaskGrid 
                  tasks={archivedTasks}
                  onTaskClick={(taskId) => console.log('Clicked archived task:', taskId)}
                  overlayIcons={overlayIcons}
                  className="bg-muted/30 rounded-lg p-4"
                  isArchived={true}
                />
              </div>
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
        
        {/* Archived Tasks Section - Always visible at bottom */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-foreground mb-4">Archived Tasks</h3>
          <TaskGrid 
            tasks={archivedTasks}
            onTaskClick={(taskId) => console.log('Clicked archived task:', taskId)}
            overlayIcons={overlayIcons}
            className="bg-muted/30 rounded-lg p-4"
            isArchived={true}
          />
        </div>
      </div>
    </div>
  );
};
