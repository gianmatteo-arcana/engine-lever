import { cn } from "@/lib/utils";
import { SmallBizCard } from "./SmallBizCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, AlertTriangle, MessageCircle, Maximize2, Minimize2, Send } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TaskRow = Database['public']['Tables']['tasks']['Row'];

interface Task extends Omit<TaskRow, 'data'> {
  due_date: string | null;
  data?: {
    icon?: string;
    color?: string;
  } | null;
}

interface TaskCardProps {
  task: Task;
  size: "compact" | "medium" | "full";
  urgency: "overdue" | "urgent" | "normal";
  onClick: () => void;
  onAction?: () => void;
  actionLabel?: string;
  isGreeting?: boolean;
}

export const TaskCard = ({ task, size, urgency, onClick, onAction, actionLabel, isGreeting }: TaskCardProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  
  const handleChatSubmit = async () => {
    if (!chatInput.trim() || isLoading) return;
    
    const userMessage = chatInput.trim();
    console.log("=== CHAT SUBMIT START ===");
    console.log("User message:", userMessage);
    
    // Add user message to chat
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput("");
    setIsLoading(true);
    
    try {
      console.log("About to call supabase.functions.invoke...");
      console.log("Supabase client:", !!supabase);
      
      const functionCall = supabase.functions.invoke('chat-completion', {
        body: {
          messages: [{ role: 'user', content: userMessage }],
          masterPrompt: `You are Ally, an AI compliance assistant helping with the task: "${task.title}". ${task.description ? `Task description: ${task.description}` : ''} Be helpful, friendly, and provide actionable advice about business compliance and requirements.`
        }
      });
      
      console.log("Function call created, awaiting response...");
      const { data, error } = await functionCall;
      
      console.log("=== SUPABASE RESPONSE ===");
      console.log("Data:", data);
      console.log("Error:", error);
      console.log("Data type:", typeof data);
      console.log("Error type:", typeof error);

      if (error) {
        console.error('=== SUPABASE FUNCTION ERROR ===');
        console.error('Error object:', error);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        console.error('Error code:', error.code);
        throw new Error(error.message || 'Supabase function error');
      }

      console.log("=== CHECKING RESPONSE DATA ===");
      if (data?.content) {
        console.log("✅ AI response received:", data.content);
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      } else {
        console.error("❌ No content in response");
        console.log("Full data object:", JSON.stringify(data, null, 2));
        throw new Error('No response content received');
      }
    } catch (error) {
      console.error("=== CHAT ERROR CAUGHT ===");
      console.error("Error type:", typeof error);
      console.error("Error constructor:", error.constructor.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      console.error("Full error object:", error);
      
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setIsLoading(false);
      console.log("=== CHAT SUBMIT END ===");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
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

  if (size === "medium") {
    return (
      <>
        {/* Card container */}
        <div 
          className={cn(
            "transition-all ease-out w-full",
            isFullscreen 
              ? "relative min-h-[600px] mb-4" 
              : "relative h-full"
          )}
          style={{ 
            transformOrigin: 'top left',
            transitionDuration: '400ms',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Fullscreen view - always rendered but conditionally visible */}
          <div 
            className={cn(
              "bg-card border rounded-lg shadow-lg overflow-hidden flex flex-col transition-all duration-400",
              isFullscreen ? "opacity-100 visible" : "opacity-0 invisible absolute inset-0 pointer-events-none"
            )} 
            style={{ height: isFullscreen ? 'calc(100vh - 200px)' : 'auto' }}
          >
            {/* Close button */}
            <div className="absolute top-4 right-4 z-10">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFullscreen(false);
                }}
                className="h-8 w-8 p-0 shadow-lg"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-auto flex flex-col">
              {/* Task Header - consistent with SmallBizCard */}
              <div className="p-6 pb-3 animate-content-fade-in">
                <div className="flex items-center gap-3 pr-12">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">{task.title}</h2>
                    {task.description && (
                      <p className="text-muted-foreground">{task.description}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Ally AI Assistant Header */}
              <div className="px-6 pb-4 animate-content-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <MessageCircle className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">Ally - Your AI Assistant</h3>
                    <p className="text-muted-foreground text-base">I'm here to help with your compliance needs</p>
                  </div>
                </div>
              </div>

              {/* Chat Interface Content */}
              <div className="flex-1 p-6 pt-0 animate-content-fade-in" style={{ animationDelay: '100ms' }}>
                <div className="h-full flex flex-col">
                  {/* Welcome Message - only show when no messages */}
                  {chatMessages.length === 0 && (
                    <>
                      <div className="flex items-start gap-3 mb-6">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <MessageCircle className="h-5 w-5 text-primary" />
                        </div>
                        <div className="bg-muted/50 rounded-lg p-4 flex-1">
                          <p className="text-sm text-foreground">
                            Hello! Welcome back. I'm Ally, your AI compliance assistant, ready to help you stay on top of all your business requirements and keep your business compliant and stress-free. How can I assist you today?
                          </p>
                        </div>
                      </div>

                      {/* Quick Action Buttons */}
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        <Button 
                          variant="outline" 
                          className="justify-start h-auto py-3 px-4"
                          onClick={() => setChatInput("What's my current compliance status?")}
                        >
                          <span className="text-sm">Review my compliance status</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          className="justify-start h-auto py-3 px-4"
                          onClick={() => setChatInput("How do I update my Statement of Information?")}
                        >
                          <span className="text-sm">Update Statement of Information</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          className="justify-start h-auto py-3 px-4 flex items-center gap-2"
                          onClick={() => setChatInput("Can you help me review a letter?")}
                        >
                          <div className="w-4 h-4 border border-current rounded flex items-center justify-center">
                            <div className="w-2 h-2 border-l border-b border-current transform rotate-45 scale-75"></div>
                          </div>
                          <span className="text-sm">Review letter</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          className="justify-start h-auto py-3 px-4"
                          onClick={() => setChatInput("I have a question about compliance")}
                        >
                          <span className="text-sm">Ask a question</span>
                        </Button>
                      </div>
                    </>
                  )}

                  {/* Chat Messages */}
                  {chatMessages.length > 0 && (
                    <div className="flex-1 overflow-y-auto space-y-4 mb-6">
                      {chatMessages.map((message, index) => (
                        <div key={index} className={`flex items-start gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            message.role === 'user' 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-primary/10'
                          }`}>
                            {message.role === 'user' ? (
                              <span className="text-xs font-semibold">U</span>
                            ) : (
                              <MessageCircle className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div className={`rounded-lg p-3 max-w-[80%] ${
                            message.role === 'user' 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted/50'
                          }`}>
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      ))}
                      {isLoading && (
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                            <MessageCircle className="h-4 w-4 text-primary" />
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chat Input Area */}
                  <div className="mt-auto">
                    <div className="flex gap-2 p-4 bg-background border rounded-lg">
                      <input 
                        type="text" 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask me anything..."
                        disabled={isLoading}
                        className="flex-1 px-0 py-0 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground disabled:opacity-50"
                      />
                      <Button 
                        size="sm" 
                        className="px-3"
                        onClick={handleChatSubmit}
                        disabled={isLoading || !chatInput.trim()}
                      >
                        {isLoading ? (
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Medium size view - always rendered but conditionally visible */}
          <div className={cn(
            "transition-all duration-400",
            isFullscreen ? "opacity-0 invisible pointer-events-none" : "opacity-100 visible"
          )}>
            <SmallBizCard
              title={task.title}
              description={task.description}
              variant={getVariantFromUrgency()}
              onClick={onClick}
              expandable={true}
              className="cursor-pointer origin-top-left transition-all duration-300 ease-out"
            >
              <div className="space-y-4">
                {!isGreeting && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Due: {task.due_date ? new Date(task.due_date).toLocaleDateString() : "No due date"}
                        </span>
                      </div>
                      {getUrgencyBadge()}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {getDaysUntilDue() >= 0 
                          ? `${getDaysUntilDue()} days remaining`
                          : `${Math.abs(getDaysUntilDue())} days overdue`
                        }
                      </span>
                    </div>

                    {urgency === "overdue" && (
                      <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <span className="text-sm text-destructive font-medium">
                          Action Required
                        </span>
                      </div>
                    )}
                  </>
                )}
                
                <div className="flex items-center gap-2">
                  {onAction && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsFullscreen(true);
                      }}
                      className="flex items-center gap-2 w-fit transition-all duration-200 hover:scale-105"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {actionLabel || "Chat with Ally"}
                    </Button>
                  )}
                </div>
              </div>
            </SmallBizCard>
          </div>
        </div>
      </>
    );
  }

  if (size === "full") {
    return (
      <div className="bg-card border rounded-lg shadow-lg overflow-hidden">
        {(task.title || task.description) && (
          <div className="p-6 pb-0">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{task.title}</h2>
                {task.description && (
                  <p className="text-muted-foreground mt-2">{task.description}</p>
                )}
              </div>
              {!isGreeting && getUrgencyBadge()}
            </div>
          </div>
        )}

        {!isGreeting && (
          <>
            <div className="grid gap-4 md:grid-cols-2 p-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Due Date</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : "No due date set"}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Time Remaining</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {getDaysUntilDue() >= 0 
                    ? `${getDaysUntilDue()} days remaining`
                    : `${Math.abs(getDaysUntilDue())} days overdue`
                  }
                </p>
              </div>
            </div>

            {urgency === "overdue" && (
              <div className="flex items-center gap-3 p-4 mx-6 mb-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">This task is overdue</p>
                  <p className="text-sm text-destructive/80">
                    Immediate action is required to maintain compliance
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 p-6 pt-0">
              {onAction && (
                <Button 
                  onClick={onAction}
                  className="flex-1"
                  variant={urgency === "overdue" ? "destructive" : "default"}
                >
                  {actionLabel || (urgency === "overdue" ? "Complete Now" : "Start Task")}
                </Button>
              )}
              <Button variant="outline" onClick={onClick}>
                View Details
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
};