import { cn } from "@/lib/utils";
import { SmallBizCard } from "./SmallBizCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, AlertTriangle, MessageCircle, Maximize2, Minimize2, Send } from "lucide-react";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { generateResponse, getLLMProvider } from "@/integrations/llm";
import { BusinessProfileSetup } from "./BusinessProfileSetup";
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
  const [isAutoShrinking, setIsAutoShrinking] = useState(false);
  const [mediumHeight, setMediumHeight] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string, actions?: any[]}>>([]);
  const [showBusinessProfileSetup, setShowBusinessProfileSetup] = useState(false);
  const [clickedActionIds, setClickedActionIds] = useState<Set<string>>(new Set());
  const cardRef = useRef<HTMLDivElement>(null);
  const mediumCardRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Measure the medium card height so the fullscreen view can shrink to it
  useLayoutEffect(() => {
    const measure = () => {
      if (mediumCardRef.current) {
        setMediumHeight(mediumCardRef.current.offsetHeight);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Intersection observer to detect when card is scrolled out of view
  useEffect(() => {
    if (!cardRef.current || !isFullscreen) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // If less than 50% of the card is visible, trigger auto-shrink
        if (entry.intersectionRatio < 0.5 && !isAutoShrinking) {
          setIsAutoShrinking(true);
          // Allow the shrink animation to play before collapsing
          setTimeout(() => {
            setIsFullscreen(false);
            setIsAutoShrinking(false);
          }, 400); // Match the CSS transition duration
        }
      },
      {
        threshold: 0.5 // Trigger when 50% visibility is crossed
      }
    );

    observer.observe(cardRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isFullscreen, isAutoShrinking]);

  // Auto-scroll to bottom when new messages are added or when loading state changes
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [chatMessages, isLoading]);
  
  
  const handleChatSubmit = async (message?: string, isActionInstruction = false) => {
    const messageToSend = message || chatInput.trim();
    if (!messageToSend || isLoading) return;
    
    const userMessage = messageToSend;
    console.log("=== CHAT SUBMIT START ===");
    console.log("User message:", userMessage);
    
    // Only add user message to chat if it's not an action instruction
    if (!isActionInstruction) {
      setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    }
    setChatInput("");
    setIsLoading(true);
    
    try {
      console.log("=== CHAT SUBMIT START ===");
      console.log("User message:", userMessage);
      
      const requestId = `task_${task.id}_${Date.now()}`;
      const requestStartTime = performance.now();
      
      console.log("=== TASKCARD CHAT SUBMIT START ===", requestId);
      console.log("User input:", userMessage);
      console.log("Task context:", { id: task.id, title: task.title });
      
      // Create RequestEnvelope with task context and debug info
      const requestEnvelope = {
        user_message: userMessage,
        task_prompt: `You are helping with task: ${task.title}. ${task.description || ''}`,
        task: {
          id: task.id,
          title: task.title,
          description: task.description || '',
          status: task.status as 'not_started' | 'in_progress' | 'completed' | 'snoozed' | 'ignored'
        },
        business_profile: {
          name: "Demo Business",
          type: "LLC", 
          state: "California"
        },
        memory_context: chatMessages.slice(-3).map(m => `${m.role}: ${m.content}`),
        psych_state: {
          stress_level: 'medium' as const,
          confidence_level: 'medium' as const,
          overwhelm_indicator: false,
          tone_preference: 'encouraging' as const
        },
        session_id: requestId,
        env: 'dev' as const
      };
      
      console.log("=== SENDING REQUEST ENVELOPE ===", requestId);
      console.log(JSON.stringify(requestEnvelope, null, 2));
      
      // Log to DevConsole if available
      const devLog = (window as any).devConsoleLog;
      if (devLog) {
        devLog({
          type: 'info',
          message: `🎯 TaskCard: Starting chat for task "${task.title}"`,
          data: { requestId, taskId: task.id }
        });
      }
      
      console.log("About to call generateResponse...");
      const responsePayload = await generateResponse(requestEnvelope, getLLMProvider());
      
      console.log("=== TASKCARD AI RESPONSE ANALYSIS ===");
      console.log("Full responsePayload:", JSON.stringify(responsePayload, null, 2));
      console.log("Message:", responsePayload.message);
      console.log("Actions array:", responsePayload.actions);
      console.log("Actions length:", responsePayload.actions?.length || 0);
      
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: responsePayload.message,
        actions: responsePayload.actions 
      }]);
      
    } catch (error) {
      console.error('=== CHAT ERROR CAUGHT ===');
      console.error('Error type:', typeof error);
      console.error('Error constructor:', error?.constructor?.name);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      console.error('Full error object:', error);
      
      // In dev mode, also throw to surface in dev console
      if (import.meta.env.DEV) {
        console.error('🚨 DEV MODE: Throwing error to surface in DevTools');
        // Create a more informative error for dev mode
        const devError = new Error(`TaskCard Chat Error: ${error?.message || 'Unknown error'}`);
        devError.stack = error?.stack;
        // Add original error details to the message for dev debugging
        devError.message += `\n\nOriginal Error: ${JSON.stringify({
          name: error?.constructor?.name,
          message: error?.message,
          stack: error?.stack
        }, null, 2)}`;
        
        // Don't throw in the component - just log for debugging
        console.error('DEV ERROR (not thrown to prevent component crash):', devError);
      }
      
      // Always add an error message to the chat instead of crashing
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I apologize, but I encountered an issue processing your request. Please try again or contact support if the problem persists.' 
      }]);
    } finally {
      setIsLoading(false);
      console.log("=== CHAT SUBMIT END ===");
    }
  };

  const handleActionClick = (instruction: string, actionIndex: number, messageIndex: number) => {
    // Create a unique ID for this action click
    const actionId = `${messageIndex}-${actionIndex}`;
    
    // Mark this action as clicked
    setClickedActionIds(prev => new Set(prev).add(actionId));
    
    // Send the instruction to the LLM (this is the AI instruction, not shown to user)
    handleChatSubmit(instruction, true);
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
        {/* Business Profile Setup Modal */}
        <BusinessProfileSetup
          isOpen={showBusinessProfileSetup}
          onClose={() => setShowBusinessProfileSetup(false)}
          onComplete={() => {
            setShowBusinessProfileSetup(false);
            // Handle completion if needed
          }}
          taskId="business-profile-setup"
        />

        {/* Card container */}
        <div 
          ref={cardRef}
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
                "bg-card border rounded-lg shadow-lg flex flex-col transition-all duration-[400ms] ease-in-out",
                (isFullscreen && !isAutoShrinking) ? "opacity-100 visible" : "opacity-0 invisible absolute inset-0 pointer-events-none"
              )}
              style={{
                height: isAutoShrinking
                  ? mediumHeight || 'auto'
                  : isFullscreen
                    ? '600px'
                    : 'auto',
                transformOrigin: 'top left',
                maxHeight: '600px'
              }}
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

            {/* Task Header - Fixed at top */}
            <div className="flex-shrink-0 p-6 pb-3 animate-content-fade-in">
              <div className="flex items-center gap-3 pr-12">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">{task.title}</h2>
                  {task.description && (
                    <p className="text-muted-foreground">{task.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Messages Area - Scrollable middle section */}
            <div ref={messagesRef} className="flex-1 overflow-y-auto min-h-0 px-6">
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
                      onClick={() => handleChatSubmit("What's my current compliance status?")}
                    >
                      <span className="text-sm">Review my compliance status</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className="justify-start h-auto py-3 px-4"
                      onClick={() => handleChatSubmit("How do I update my Statement of Information?")}
                    >
                      <span className="text-sm">Update Statement of Information</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className="justify-start h-auto py-3 px-4 flex items-center gap-2"
                      onClick={() => handleChatSubmit("Can you help me review a letter?")}
                    >
                      <div className="w-4 h-4 border border-current rounded flex items-center justify-center">
                        <div className="w-2 h-2 border-l border-b border-current transform rotate-45 scale-75"></div>
                      </div>
                      <span className="text-sm">Review letter</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className="justify-start h-auto py-3 px-4"
                      onClick={() => handleChatSubmit("I have a question about compliance")}
                    >
                      <span className="text-sm">Ask a question</span>
                    </Button>
                  </div>
                </>
              )}

              {/* Chat Messages */}
              {chatMessages.length > 0 && (
                <div className="space-y-4 pb-4">
                  {chatMessages.map((message, messageIndex) => (
                    <div key={messageIndex} className={`flex items-start gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
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
                         
                         {/* Action Pills for AI messages */}
                         {message.role === 'assistant' && message.actions && message.actions.length > 0 && (
                           <div className="flex flex-wrap gap-2 mt-3">
                             {message.actions.map((action, actionIndex) => {
                               const actionId = `${messageIndex}-${actionIndex}`;
                               const isClicked = clickedActionIds.has(actionId);
                               
                               return (
                                 <Button
                                   key={actionIndex}
                                   variant="outline"
                                   size="sm"
                                   onClick={() => handleActionClick(action.instruction, actionIndex, messageIndex)}
                                   disabled={isClicked}
                                   className={cn(
                                     "h-7 px-2 text-xs transition-all duration-200",
                                     isClicked
                                       ? "bg-primary text-primary-foreground border-primary opacity-75 pointer-events-none"
                                       : "border-primary/20 bg-primary-light/20 hover:bg-primary-light/40 hover:border-primary/40"
                                   )}
                                 >
                                   {action.label}
                                 </Button>
                               );
                             })}
                           </div>
                         )}
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
            </div>

            {/* Chat Input Area - Fixed at bottom */}
            <div className="flex-shrink-0 p-6 pt-4 border-t bg-card">
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
                  className="px-3 flex-shrink-0"
                  onClick={() => handleChatSubmit()}
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

          {/* Medium size view - always rendered but conditionally visible */}
          <div
            ref={mediumCardRef}
            className={cn(
              "transition-opacity duration-[400ms] ease-in-out",
              isFullscreen
                ? "opacity-0 invisible pointer-events-none"
                : "opacity-100 visible"
            )}
          >
            {task.task_type === 'business_profile' ? (
              <SmallBizCard
                title={task.title}
                description={task.description}
                variant={getVariantFromUrgency()}
                onClick={() => setShowBusinessProfileSetup(true)}
                expandable={false}
                className="cursor-pointer origin-top-left transition-all duration-300 ease-out"
              >
                <div className="space-y-4">
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
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowBusinessProfileSetup(true);
                      }}
                      className="flex items-center gap-2 w-fit transition-all duration-200 hover:scale-105"
                    >
                      Continue Setup
                    </Button>
                  </div>
                </div>
              </SmallBizCard>
            ) : (
              <SmallBizCard
                title={task.title}
                description={task.description}
                variant={getVariantFromUrgency()}
                onClick={() => setIsFullscreen(true)}
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
                          if (onAction) {
                            onAction();
                          }
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
            )}
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
