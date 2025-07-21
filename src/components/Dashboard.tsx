
import { useState } from "react";
import { BusinessProfileCard } from "./BusinessProfileCard";
import { StatementOfInfoCard } from "./StatementOfInfoCard";
import { ChatInterface } from "./ChatInterface";
import { SmallBizCard } from "./SmallBizCard";
import { UserProfileCard } from "./UserProfileCard";
import { TaskGrid } from "./TaskGrid";
import { TaskCard } from "./TaskCard";
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      content: "Hello! I'm Ally, your AI compliance assistant. I'm here to help you stay on top of your business requirements. How can I assist you today?",
      sender: "ai",
      timestamp: new Date(),
      pills: ["Review my compliance status", "Update Statement of Information", "Ask a question"]
    }
  ]);


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
    
    return "I'm here to help with your compliance needs. I can assist with filing requirements, deadlines, and keeping your business information up to date. What would you like to know more about?";
  };

  const getResponsePills = (message: string): string[] => {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes("statement") || lowerMessage.includes("update")) {
      return ["Yes, let's start", "What information do I need?", "Not right now"];
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
      <div className="h-[calc(100vh-80px)] overflow-y-auto">
        {/* Future Tasks Section */}
        {futureTasks.length > 0 && (
          <div className="bg-muted/20">
            <div className="container mx-auto px-4">
              {/* Peek Hint at Top */}
              <div className="py-2 flex justify-center">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronUp className="h-3 w-3" />
                  <span>{futureTasks.length} upcoming tasks - scroll to see all</span>
                  <ChevronUp className="h-3 w-3" />
                </div>
              </div>
              
              {/* Show bottom portion (15px) of task cards */}
              <div className="relative overflow-hidden">
                <div className="transform translate-y-12">
                  <TaskGrid 
                    tasks={futureTasks} 
                    onTaskClick={handleTaskClick}
                    className="pb-8"
                  />
                </div>
                {/* Gradient mask to show peek effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-transparent pointer-events-none" />
              </div>
            </div>
          </div>
        )}

        {/* Main Dashboard Content */}
        <div className="bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="grid gap-6">
            {/* Greeting Task Card - Always Present */}
            <div className="flex justify-center">
              <div className="w-full max-w-2xl">
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
                  size={showChat ? "full" : "medium"}
                  urgency="normal"
                  onClick={() => {}}
                  onAction={() => setShowChat(true)}
                  actionLabel="Chat with Ally"
                  isGreeting={true}
                />
                {/* Chat Interface for expanded greeting task */}
                {showChat && (
                  <div className="mt-6 h-[600px]">
                    <ChatInterface
                      messages={chatMessages}
                      onSendMessage={handleSendMessage}
                      onPillClick={handlePillClick}
                      placeholder="Ask me anything..."
                      className="h-full"
                    />
                  </div>
                )}
              </div>
            </div>

              {/* Dashboard Grid */}
              <div className={`grid gap-6 ${showChat ? 'lg:grid-cols-1' : 'lg:grid-cols-2'}`}>
                {/* Left Column - Task Cards */}
                <div className="space-y-6">
                  {loading && (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">Loading tasks...</p>
                    </div>
                  )}
                  
                  {error && (
                    <div className="text-center py-8">
                      <p className="text-destructive">Error loading tasks: {error}</p>
                    </div>
                  )}

                  {/* Most Urgent Task - Medium Size */}
                  {mostUrgentTask && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-foreground">Priority Task</h3>
                      <TaskCard
                        task={mostUrgentTask}
                        size="medium"
                        urgency={getTaskUrgency(mostUrgentTask)}
                        onClick={() => handleTaskClick(mostUrgentTask.id)}
                        onAction={() => handleTaskAction(mostUrgentTask.id)}
                      />
                    </div>
                  )}

                  {/* Compliance Status */}
                  <SmallBizCard
                    title="Compliance Health"
                    description="Overall business compliance status"
                    variant="warning"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground">Current Status</span>
                        <span className="text-sm font-medium text-warning">
                          {tasks.filter(t => t.status === 'pending').length} items need attention
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
                          ? "You're fully compliant! Great work." 
                          : "Complete your pending tasks to improve compliance."}
                      </p>
                    </div>
                  </SmallBizCard>
                </div>

              </div>
            </div>
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
