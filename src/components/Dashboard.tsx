import { useState } from "react";
import { BusinessProfileCard } from "./BusinessProfileCard";
import { StatementOfInfoCard } from "./StatementOfInfoCard";
import { ChatInterface } from "./ChatInterface";
import { SmallBizCard } from "./SmallBizCard";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, User, LogOut } from "lucide-react";

interface ChatMessage {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  pills?: string[];
}

interface DashboardProps {
  user: { name: string; email: string };
  onSignOut: () => void;
}

export const Dashboard = ({ user, onSignOut }: DashboardProps) => {
  const [showChat, setShowChat] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      content: "Hello! I'm Ally, your AI compliance assistant. I'm here to help you stay on top of your business requirements. How can I assist you today?",
      sender: "ai",
      timestamp: new Date(),
      pills: ["Review my compliance status", "Update Statement of Information", "Ask a question"]
    }
  ]);

  // Mock business profile
  const businessProfile = {
    name: "Smith Consulting LLC",
    entityType: "Limited Liability Company",
    address: "123 Business Ave, San Francisco, CA 94105",
    lastFiled: "January 2024",
    officers: ["John Smith - Managing Member", "Jane Smith - Member"],
    status: "active" as const
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
              <span className="text-sm text-muted-foreground">{user.name}</span>
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
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
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{user.name}</span>
              <Button variant="ghost" size="sm" onClick={onSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6">
          {/* Welcome Section */}
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-3xl font-bold text-foreground">Welcome back, {user.name.split(' ')[0]}!</h2>
            <p className="text-muted-foreground">Let's keep your business compliant and stress-free.</p>
          </div>

          {/* Dashboard Grid */}
          <div className={`grid gap-6 ${showChat ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
            {/* Left Column - Business Cards */}
            <div className={`space-y-6 ${showChat ? 'lg:col-span-2' : ''}`}>
              {/* Business Profile */}
              <BusinessProfileCard
                profile={businessProfile}
                onClick={() => setExpandedCard("profile")}
              />

              {/* Statement of Information */}
              <StatementOfInfoCard
                status="pending"
                dueDate="October 31, 2024"
                lastFiled="January 2024"
                onStart={handleStartStatementUpdate}
              />

              {/* Compliance Status */}
              <SmallBizCard
                title="Compliance Health"
                description="Overall business compliance status"
                variant="warning"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">Current Status</span>
                    <span className="text-sm font-medium text-warning">1 item needs attention</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-warning h-2 rounded-full" style={{ width: '75%' }}></div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You're mostly up to date! Complete your Statement of Information to be 100% compliant.
                  </p>
                </div>
              </SmallBizCard>
            </div>

            {/* Chat Interface */}
            {showChat && (
              <div className="h-[600px]">
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
      </div>
    </div>
  );
};