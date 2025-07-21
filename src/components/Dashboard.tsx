import { useState, useEffect, useRef } from "react";
import { BusinessProfileCard } from "./BusinessProfileCard";
import { StatementOfInfoCard } from "./StatementOfInfoCard";
import { ChatInterface } from "./ChatInterface";
import { SmallBizCard } from "./SmallBizCard";
import { UserProfileCard } from "./UserProfileCard";
import { TaskGrid } from "./TaskGrid";
import { TaskCard } from "./TaskCard";
import { StackedDashboard } from "./StackedDashboard";
import { useTasks } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, User, LogOut, ChevronUp } from "lucide-react";

interface ChatMessage {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  pills?: string[];
}

interface DashboardProps {
  user: { name: string; email: string; createdAt?: Date } | null;
  onSignOut: () => void;
}

export const Dashboard = ({ user, onSignOut }: DashboardProps) => {
  const [showChat, setShowChat] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const { tasks, loading, error, getMostUrgentTask, getFutureTasks, getTaskUrgency } = useTasks();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      content: `Hello ${user?.name?.split(' ')[0] || "there"}! Welcome back. I'm Ally, your AI compliance assistant, ready to help you stay on top of all your business requirements and keep your business compliant and stress-free. How can I assist you today?`,
      sender: "ai",
      timestamp: new Date(),
      pills: ["Review my compliance status", "Update Statement of Information", "Review letter", "Ask a question"]
    }
  ]);

  const handleChatToggle = () => {
    setShowChat(!showChat);
  };

  const handleSendMessage = (message: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      content: message,
      sender: "user",
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, newMessage]);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: getAIResponse(message),
        sender: "ai",
        timestamp: new Date(),
        pills: getResponsePills(message)
      };
      setChatMessages(prev => [...prev, aiResponse]);
    }, 1000);
  };

  const handlePillClick = (pill: string) => {
    handleSendMessage(pill);
  };

  const getAIResponse = (message: string): string => {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes("compliance") || lowerMessage.includes("status")) {
      return "Great question! Your business is currently in good standing. Your Statement of Information is due for its annual update. Would you like me to help you review and update it?";
    }
    
    if (lowerMessage.includes("statement") || lowerMessage.includes("update")) {
      return "I'd be happy to help you update your Statement of Information! This is an annual requirement for California businesses. I can guide you through reviewing your current information and making any necessary updates. Shall we get started?";
    }

    if (lowerMessage.includes("review letter")) {
      return "I'd be happy to help you review any compliance letters or documents! Please upload the letter or document you'd like me to review, and I'll analyze it for important deadlines, requirements, and next steps.";
    }
    
    return "I'm here to help with your compliance needs. I can assist with filing requirements, deadlines, and keeping your business information up to date. What would you like to know more about?";
  };

  const getResponsePills = (message: string): string[] => {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes("statement") || lowerMessage.includes("update")) {
      return ["Yes, let's start", "What information do I need?", "Not right now"];
    }

    if (lowerMessage.includes("review letter")) {
      return ["Upload document", "Tell me about deadlines", "What should I look for?"];
    }
    
    return ["Tell me about my deadlines", "Help with filing", "What's required?"];
  };

  const handleStartStatementUpdate = () => {
    setExpandedCard("statement");
    setShowChat(true);
    
    const welcomeMessage: ChatMessage = {
      id: Date.now().toString(),
      content: "Let's update your Statement of Information! I've pulled the current details on file for Smith Consulting LLC. Are there any changes to your business information?",
      sender: "ai",
      timestamp: new Date(),
      pills: ["No changes to my business", "We need to make updates"]
    };
    
    setChatMessages([welcomeMessage]);
  };

  const handleTaskClick = (taskId: string) => {
    setSelectedTask(taskId);
    setExpandedCard("task");
  };

  const handleTaskAction = (taskId: string) => {
    console.log("Starting task:", taskId);
    // Handle task action (e.g., open specific task flow)
  };

  const mostUrgentTask = getMostUrgentTask();
  const futureTasks = getFutureTasks();

  // Handle full-size task view
  if (selectedTask && expandedCard === "task") {
    const task = tasks.find(t => t.id === selectedTask);
    if (task) {
      return (
        <div className="min-h-screen bg-background">
          {/* Header */}
          <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedTask(null);
                    setExpandedCard(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
                <h1 className="text-xl font-semibold text-foreground">{task.title}</h1>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUserProfile(true)}
                  className="flex items-center gap-2"
                >
                  <User className="h-4 w-4" />
                  <span className="text-sm text-muted-foreground">{user?.name || "User"}</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={onSignOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="container mx-auto px-4 py-6">
            <div className="grid lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
              {/* Task Details */}
              <div className="space-y-4">
                <TaskCard
                  task={task}
                  size="full"
                  urgency={getTaskUrgency(task)}
                  onClick={() => {}}
                  onAction={() => handleTaskAction(task.id)}
                />
              </div>

              {/* Chat Interface */}
              <div className="h-full">
                <ChatInterface
                  messages={chatMessages}
                  onSendMessage={handleSendMessage}
                  onPillClick={handlePillClick}
                  placeholder="Ask me anything about this task..."
                  className="h-full"
                />
              </div>
            </div>
          </div>

          {/* User Profile Card */}
          <UserProfileCard
            user={user}
            onClose={() => setShowUserProfile(false)}
            isVisible={showUserProfile}
          />
        </div>
      );
    }
  }

  if (expandedCard === "statement") {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedCard(null)}
              >
                <X className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-semibold text-foreground">Update Statement of Information</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUserProfile(true)}
                className="flex items-center gap-2"
              >
                <User className="h-4 w-4" />
                <span className="text-sm text-muted-foreground">{user?.name || "User"}</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={onSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-6">
          <div className="grid lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
            {/* Statement Details */}
            <div className="space-y-4">
              <StatementOfInfoCard
                status="pending"
                dueDate="October 31, 2024"
                lastFiled="January 2024"
                expanded={true}
              />
            </div>

            {/* Chat Interface */}
            <div className="h-full">
              <ChatInterface
                messages={chatMessages}
                onSendMessage={handleSendMessage}
                onPillClick={handlePillClick}
                placeholder="Ask me anything about your filing..."
                className="h-full"
              />
            </div>
          </div>
        </div>

        {/* User Profile Card */}
        <UserProfileCard
          user={user}
          onClose={() => setShowUserProfile(false)}
          isVisible={showUserProfile}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-primary">SmallBizAlly</h1>
            <span className="text-sm text-muted-foreground">Your AI Compliance Assistant</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowChat(!showChat)}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Chat with Ally
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUserProfile(true)}
                className="flex items-center gap-2 hover:bg-accent transition-colors"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{user?.name || "User"}</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={onSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Container */}
      <div ref={scrollContainerRef} className="h-[calc(100vh-80px)] overflow-y-auto scroll-smooth">
        {/* Future Tasks Section */}
        {futureTasks.length > 0 && (
          <div className="bg-muted/20">
            <div className="container mx-auto px-4 py-2">
              {/* Task Grid - Fully Visible */}
              <div className="pb-2">
                <TaskGrid 
                  tasks={futureTasks} 
                  onTaskClick={handleTaskClick}
                />
              </div>
            </div>
          </div>
        )}

        {/* Main Dashboard Content */}
        <div className="bg-background">
          <div className="container mx-auto px-4 py-4">
            {/* Scroll hint positioned above Welcome card */}
            {futureTasks.length > 0 && (
              <div className="py-2 flex justify-center">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronUp className="h-3 w-3" />
                  <span>{futureTasks.length} upcoming tasks - scroll to see all</span>
                  <ChevronUp className="h-3 w-3" />
                </div>
              </div>
            )}

            {/* Stacked Dashboard */}
            <div className="flex justify-center py-6">
              {showChat ? (
                <div className="w-full max-w-2xl">
                  <ChatInterface
                    messages={chatMessages}
                    onSendMessage={handleSendMessage}
                    onPillClick={handlePillClick}
                    placeholder="Ask me anything..."
                    className="h-[600px]"
                    onClose={handleChatToggle}
                    showCloseButton={true}
                  />
                </div>
              ) : (
                <StackedDashboard
                  user={user}
                  onChatToggle={handleChatToggle}
                  onTaskClick={handleTaskClick}
                  onStartStatementUpdate={handleStartStatementUpdate}
                />
              )}
            </div>

            {/* Extra space for scrolling wiggle room */}
            <div className="h-96"></div>
          </div>
        </div>
      </div>

      {/* User Profile Card */}
      <UserProfileCard
        user={user}
        onClose={() => setShowUserProfile(false)}
        isVisible={showUserProfile}
      />
    </div>
  );
};
