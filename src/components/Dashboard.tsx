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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, X, User, LogOut, ChevronUp, List, Layers } from "lucide-react";
import { generateResponse } from "@/integrations/llm";
import { ChatMessage, Task, DatabaseTask } from "@/integrations/llm/types";

interface DashboardProps {
  user: { name: string; email: string; createdAt?: Date } | null;
  onSignOut: () => void;
}

export const Dashboard = ({ user, onSignOut }: DashboardProps) => {
  const [showChat, setShowChat] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<DatabaseTask | null>(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"timeline" | "stacked">(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dashboard-layout-mode') as "timeline" | "stacked") || "timeline";
    }
    return "timeline";
  });
  const { tasks, loading, error, getMostUrgentTask, getFutureTasks, getTaskUrgency } = useTasks();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const welcomeTaskRef = useRef<HTMLDivElement>(null);
  const [greetingCardPosition, setGreetingCardPosition] = useState<number>(0);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      content: `Hello ${user?.name?.split(' ')[0] || "there"}! Welcome back. I'm Ally, your AI compliance assistant, ready to help you stay on top of all your business requirements and keep your business compliant and stress-free. How can I assist you today?`,
      sender: "ai",
      timestamp: new Date(),
      actions: [
        { label: "Review my compliance status", instruction: "Please review my current compliance status" },
        { label: "Update Statement of Information", instruction: "Help me update my Statement of Information" },
        { label: "Review letter", instruction: "I need help reviewing a letter" },
        { label: "Ask a question", instruction: "I have a general question about compliance" }
      ]
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Store card position before expanding to maintain scroll position
  const handleChatToggle = () => {
    if (!showChat && welcomeTaskRef.current && scrollContainerRef.current) {
      const cardRect = welcomeTaskRef.current.getBoundingClientRect();
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      setGreetingCardPosition(cardRect.top - containerRect.top + scrollContainerRef.current.scrollTop);
    }
    setShowChat(!showChat);
  };

  // Maintain scroll position after state change
  useEffect(() => {
    if (showChat && welcomeTaskRef.current && scrollContainerRef.current && greetingCardPosition > 0) {
      const targetScrollPosition = greetingCardPosition;
      scrollContainerRef.current.scrollTo({
        top: targetScrollPosition,
        behavior: 'smooth'
      });
    }
  }, [showChat, greetingCardPosition]);

  const handleSendMessage = async (message: string) => {
    console.log("🚨 DASHBOARD CHAT START 🚨");
    console.log("User message:", message);
    console.log("Selected task:", selectedTask);
    console.log("Chat messages count:", chatMessages.length);
    
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      content: message,
      sender: "user",
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, newMessage]);
    setIsTyping(true);
    
    // Add a very visible indicator when using real AI vs fallback
    console.log("🤖 ATTEMPTING REAL AI CALL...");
    
    try {
      // Create RequestEnvelope with context
      const requestEnvelope = {
        user_message: message,
        task: selectedTask ? {
          id: selectedTask.id,
          title: selectedTask.title,
          description: selectedTask.description || '',
          status: selectedTask.status as 'not_started' | 'in_progress' | 'completed' | 'snoozed' | 'ignored'
        } : undefined,
        business_profile: {
          name: "Demo Business",
          type: "LLC",
          state: "California"
        },
        memory_context: chatMessages.slice(-5).map(m => `${m.sender}: ${m.content}`),
        psych_state: {
          stress_level: 'medium' as const,
          confidence_level: 'medium' as const,
          overwhelm_indicator: false,
          tone_preference: 'encouraging' as const
        },
        session_id: `session_${Date.now()}`
      };
      
      const responsePayload = await generateResponse(requestEnvelope);
      
      console.log("=== AI RESPONSE ANALYSIS ===");
      console.log("Full responsePayload:", JSON.stringify(responsePayload, null, 2));
      console.log("Message:", responsePayload.message);
      console.log("Actions array:", responsePayload.actions);
      console.log("Actions length:", responsePayload.actions?.length || 0);
      console.log("Actions type:", typeof responsePayload.actions);
      
      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: responsePayload.message,
        sender: "ai",
        timestamp: new Date(),
        actions: responsePayload.actions
      };
      
      console.log("=== CHAT MESSAGE CREATED ===");
      console.log("AI response actions:", aiResponse.actions);
      console.log("Actions will be rendered:", aiResponse.actions && aiResponse.actions.length > 0);
      
      setChatMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error('=== DASHBOARD CHAT ERROR ===');
      console.error('Error type:', typeof error);
      console.error('Error constructor:', error?.constructor?.name);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      console.error('Full error object:', error);
      
      // In dev mode, also throw to surface in dev console
      if (import.meta.env.DEV) {
        console.error('🚨 DEV MODE: Dashboard Chat Error');
        console.error('Request envelope was:', {
          user_message: message,
          task: selectedTask,
          business_profile: { name: "Demo Business", type: "LLC", state: "California" }
        });
        // Don't throw here as it would break the UI flow, but log extensively
      }
      
      console.log("🚨 FALLING BACK TO LOCAL AI RESPONSE 🚨");
      console.log("This means the real AI call failed!");
      
      const fallback: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: getAIResponse(message),
        sender: "ai",
        timestamp: new Date(),
        actions: getResponsePills(message).map(pill => ({ label: pill, instruction: pill }))
      };
      
      console.log("Fallback message created with actions:", fallback.actions);
      setChatMessages(prev => [...prev, fallback]);
    } finally {
      setIsTyping(false);
      console.log("🚨 DASHBOARD CHAT END 🚨");
    }
  };

  const handleActionClick = (instruction: string) => {
    handleSendMessage(instruction);
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
    console.log("🔍 GENERATING FALLBACK PILLS for message:", message);
    const lowerMessage = message.toLowerCase();
    
    let pills: string[] = [];
    
    if (lowerMessage.includes("options") || lowerMessage.includes("help") || lowerMessage.includes("what")) {
      pills = ["Review my compliance status", "Update Statement of Information", "Ask about deadlines", "Schedule a consultation"];
    } else if (lowerMessage.includes("compliance") || lowerMessage.includes("status")) {
      pills = ["Show me my tasks", "What's due soon?", "Schedule filing"];
    } else {
      pills = ["Tell me more", "What else can you help with?", "Show my tasks"];
    }
    
    console.log("Generated fallback pills:", pills);
    return pills;
  };

  const handleStartStatementUpdate = () => {
    setExpandedCard("statement");
    setShowChat(true);
    
    const welcomeMessage: ChatMessage = {
      id: Date.now().toString(),
      content: "Let's update your Statement of Information! I've pulled the current details on file for Smith Consulting LLC. Are there any changes to your business information?",
      sender: "ai",
      timestamp: new Date(),
      actions: [
        { label: "No changes to my business", instruction: "No changes to my business information" },
        { label: "We need to make updates", instruction: "We need to make updates to our business information" }
      ]
    };
    
    setChatMessages([welcomeMessage]);
  };

  const handleTaskClick = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setSelectedTask(task);
      setExpandedCard("task");
    }
  };

  const handleTaskAction = (taskId: string) => {
    console.log("Starting task:", taskId);
    // Handle task action (e.g., open specific task flow)
  };

  const mostUrgentTask = getMostUrgentTask();
  const futureTasks = getFutureTasks();

  // Mock archived tasks data (same as in StackedDashboard)
  const archivedTasks = [
    {
      id: 'archived-1',
      user_id: 'user-1',
      title: 'Annual Report Filed',
      description: 'Filed annual business report',
      task_type: 'annual_report',
      status: 'completed',
      priority: 1,
      due_date: '2024-11-15',
      data: { icon: '📊', color: 'primary' },
      created_at: '2024-10-01T00:00:00Z',
      updated_at: '2024-11-15T00:00:00Z',
      completed_at: '2024-11-15T00:00:00Z'
    },
    {
      id: 'archived-2',
      user_id: 'user-1',
      title: 'Business License Renewal',
      description: 'Renewed business license',
      task_type: 'license',
      status: 'completed',
      priority: 2,
      due_date: '2024-10-30',
      data: { icon: '📄', color: 'primary' },
      created_at: '2024-09-01T00:00:00Z',
      updated_at: '2024-10-28T00:00:00Z',
      completed_at: '2024-10-28T00:00:00Z'
    },
    {
      id: 'archived-3',
      user_id: 'user-1',
      title: 'Tax Payment',
      description: 'Quarterly tax payment',
      task_type: 'tax',
      status: 'completed',
      priority: 1,
      due_date: '2024-10-15',
      data: { icon: '💰', color: 'primary' },
      created_at: '2024-09-15T00:00:00Z',
      updated_at: '2024-10-15T00:00:00Z',
      completed_at: '2024-10-15T00:00:00Z'
    },
    {
      id: 'archived-4',
      user_id: 'user-1',
      title: 'Insurance Review',
      description: 'Annual insurance policy review',
      task_type: 'insurance',
      status: 'completed',
      priority: 3,
      due_date: '2024-09-30',
      data: { icon: '🛡️', color: 'primary' },
      created_at: '2024-08-01T00:00:00Z',
      updated_at: '2024-09-25T00:00:00Z',
      completed_at: '2024-09-25T00:00:00Z'
    },
    {
      id: 'archived-5',
      user_id: 'user-1',
      title: 'Compliance Audit',
      description: 'Internal compliance audit',
      task_type: 'audit',
      status: 'completed',
      priority: 1,
      due_date: '2024-09-15',
      data: { icon: '🔍', color: 'primary' },
      created_at: '2024-08-01T00:00:00Z',
      updated_at: '2024-09-10T00:00:00Z',
      completed_at: '2024-09-10T00:00:00Z'
    },
    {
      id: 'archived-6',
      user_id: 'user-1',
      title: 'Employee Handbook Update',
      description: 'Updated employee handbook',
      task_type: 'documentation',
      status: 'completed',
      priority: 2,
      due_date: '2024-08-31',
      data: { icon: '📖', color: 'primary' },
      created_at: '2024-07-01T00:00:00Z',
      updated_at: '2024-08-30T00:00:00Z',
      completed_at: '2024-08-30T00:00:00Z'
    }
  ];

  // Define overlay icons for archived tasks
  const archivedTaskOverlayIcons = {
    'archived-1': 'checkmark' as const,
    'archived-2': 'warning' as const,
    'archived-3': 'checkmark' as const,
    'archived-4': 'checkmark' as const,
    'archived-5': 'alarm' as const,
    'archived-6': 'checkmark' as const,
  };

  // Handle layout mode change
  const handleLayoutModeChange = (mode: "timeline" | "stacked") => {
    setLayoutMode(mode);
    localStorage.setItem('dashboard-layout-mode', mode);
  };

  // Scroll to home position - showing bottom portion of compact cards
  const scrollToHomePosition = () => {
    if (welcomeTaskRef.current && scrollContainerRef.current) {
      const welcomeCard = welcomeTaskRef.current;
      const welcomeCardTop = welcomeCard.offsetTop;
      
      // Calculate position to show bottom ~20px of compact cards
      // We want the welcome card to be visible but show some of the compact cards above
      const targetScrollPosition = welcomeCardTop - 75; // Show 75px of compact cards bottom
      
      scrollContainerRef.current.scrollTo({
        top: Math.max(0, targetScrollPosition),
        behavior: 'smooth'
      });
    }
  };

  // Auto-scroll to home position on load
  useEffect(() => {
    if (!loading && welcomeTaskRef.current && scrollContainerRef.current) {
      const timer = setTimeout(() => {
        scrollToHomePosition();
      }, 300); // Allow time for all elements to render

      return () => clearTimeout(timer);
    }
  }, [loading, futureTasks.length]);

  // Handle full-size task view
  if (selectedTask && expandedCard === "task") {
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
                <h1 className="text-xl font-semibold text-foreground">{selectedTask.title}</h1>
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
                  task={selectedTask as any}
                  size="full"
                  urgency={getTaskUrgency(selectedTask as any)}
                  onClick={() => {}}
                  onAction={() => handleTaskAction(selectedTask.id)}
                />
              </div>

              {/* Chat Interface */}
              <div className="h-full">
                <ChatInterface
                  messages={chatMessages}
                  onSendMessage={handleSendMessage}
                  onActionClick={handleActionClick}
                  isTyping={isTyping}
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
                onActionClick={handleActionClick}
                isTyping={isTyping}
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

  // Render stacked layout if in stacked mode
  if (layoutMode === "stacked") {
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
              {/* Dev Mode Layout Selector */}
              {import.meta.env.DEV && (
                <Select value={layoutMode} onValueChange={handleLayoutModeChange}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border shadow-lg">
                    <SelectItem value="timeline" className="text-xs">
                      <div className="flex items-center gap-2">
                        <List className="h-3 w-3" />
                        Timeline Mode
                      </div>
                    </SelectItem>
                    <SelectItem value="stacked" className="text-xs">
                      <div className="flex items-center gap-2">
                        <Layers className="h-3 w-3" />
                        Stacked Mode
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
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

        {/* Stacked Dashboard Content */}
        <StackedDashboard
          user={user}
          mostUrgentTask={mostUrgentTask}
          chatMessages={chatMessages}
          onSendMessage={handleSendMessage}
          onActionClick={handleActionClick}
          onStartStatementUpdate={handleStartStatementUpdate}
          onTaskAction={handleTaskAction}
          handleChatToggle={handleChatToggle}
        />

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
            {/* Dev Mode Layout Selector */}
            {import.meta.env.DEV && (
              <Select value={layoutMode} onValueChange={handleLayoutModeChange}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border shadow-lg">
                  <SelectItem value="timeline" className="text-xs">
                    <div className="flex items-center gap-2">
                      <List className="h-3 w-3" />
                      Timeline Mode
                    </div>
                  </SelectItem>
                  <SelectItem value="stacked" className="text-xs">
                    <div className="flex items-center gap-2">
                      <Layers className="h-3 w-3" />
                      Stacked Mode
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
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
          <div className="grid gap-6">
            {/* Greeting Task Card - Seamless Integration */}
            <div ref={welcomeTaskRef} className="flex justify-center">
              <div className="w-full max-w-2xl">
                {/* TaskCard with internal expansion - no more replacement */}
                <div className="transition-all duration-300 ease-in-out transform-gpu origin-top">
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
                    onAction={() => {}}
                    actionLabel="Chat with Ally"
                    isGreeting={true}
                  />
                </div>
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

                  {/* Priority Tasks Section */}
                  {(mostUrgentTask || true) && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-foreground">Priority Tasks</h3>
                      <div className="space-y-4">
                        {/* Most Urgent Task */}
                        {mostUrgentTask && (
                          <TaskCard
                            task={mostUrgentTask}
                            size="medium"
                            urgency={getTaskUrgency(mostUrgentTask)}
                            onClick={() => handleTaskClick(mostUrgentTask.id)}
                            onAction={() => handleTaskAction(mostUrgentTask.id)}
                          />
                        )}
                        
                        {/* Business Profile Setup Card */}
                        <SmallBizCard
                          title="Business Profile Setup"
                          description="Complete your business information"
                          variant="warning"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-foreground">Profile Completion</span>
                              <span className="text-sm font-medium text-warning">85% Complete</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div className="bg-warning h-2 rounded-full" style={{ width: '85%' }} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Add business address and contact details to complete your profile.
                            </p>
                          </div>
                        </SmallBizCard>

                        {/* Business Snapshot Card */}
                        <SmallBizCard
                          title="Business Snapshot"
                          description="Where your paperwork stands today"
                          variant="success"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-foreground">Current Status</span>
                              <span className="text-sm font-medium text-success">
                                {tasks.filter(t => t.status === 'pending').length === 0 
                                  ? "All set — 0 tasks pending"
                                  : `${tasks.filter(t => t.status === 'pending').length} items need attention`}
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div 
                                className="bg-success h-2 rounded-full" 
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
                      </div>
                    </div>
                  )}

                </div>

                {/* Chat Interface - Right Column */}
                {showChat && (
                  <div className="lg:col-span-1">
                    <ChatInterface
                      messages={chatMessages}
                      onSendMessage={handleSendMessage}
                      onActionClick={handleActionClick}
                      isTyping={isTyping}
                      placeholder="Ask me anything about your business compliance..."
                      className="sticky top-20 h-[calc(100vh-120px)]"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Extra space for scrolling wiggle room */}
          <div className="h-96"></div>
        </div>

        {/* Archived Tasks Section - Same container structure as future tasks */}
        {archivedTasks.length > 0 && (
          <div className="bg-muted/20">
            <div className="container mx-auto px-4 py-2">
              <div className="pb-2">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-foreground px-4">Archived Tasks</h3>
                </div>
                <TaskGrid 
                  tasks={archivedTasks} 
                  onTaskClick={(taskId) => console.log('Clicked archived task:', taskId)}
                  overlayIcons={archivedTaskOverlayIcons}
                  isArchived={true}
                />
              </div>
            </div>
          </div>
        )}
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
