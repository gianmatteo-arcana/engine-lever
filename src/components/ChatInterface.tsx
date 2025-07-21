
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User, ScanLine, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  pills?: string[];
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onPillClick?: (pill: string) => void;
  isTyping?: boolean;
  placeholder?: string;
  className?: string;
  onClose?: () => void;
  showCloseButton?: boolean;
}

export const ChatInterface = ({
  messages,
  onSendMessage,
  onPillClick,
  isTyping = false,
  placeholder = "Type your message...",
  className,
  onClose,
  showCloseButton = false
}: ChatInterfaceProps) => {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  const getPillIcon = (pill: string) => {
    if (pill === "Review letter") {
      return <ScanLine className="h-3 w-3 mr-1" />;
    }
    return null;
  };

  const handlePillClick = (pill: string) => {
    if (onPillClick) {
      onPillClick(pill);
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-card rounded-lg border shadow-sm", className)}>
      {/* Chat Header */}
      <div className="p-4 border-b bg-primary-light/30 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <div>
            <span className="font-medium text-foreground">Ally - Your AI Assistant</span>
            <p className="text-sm text-muted-foreground">
              I'm here to help with your compliance needs
            </p>
          </div>
        </div>
        {showCloseButton && onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="space-y-3">
            <div
              className={cn(
                "flex gap-3",
                message.sender === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.sender === "ai" && (
                <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
              
              <div
                className={cn(
                  "max-w-[70%] rounded-lg px-4 py-2",
                  message.sender === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>

              {message.sender === "user" && (
                <div className="flex-shrink-0 w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-secondary-foreground" />
                </div>
              )}
            </div>

            {/* Response Pills */}
            {message.sender === "ai" && message.pills && message.pills.length > 0 && (
              <div className="flex flex-wrap gap-2 ml-11">
                 {message.pills.map((pill, index) => (
                   <Button
                     key={index}
                     variant="outline"
                     size="sm"
                     onClick={() => handlePillClick(pill)}
                     className="h-8 px-3 text-sm border-primary/20 bg-primary-light/20 hover:bg-primary-light/40 hover:border-primary/40 flex items-center"
                   >
                     {getPillIcon(pill)}
                     {pill}
                   </Button>
                 ))}
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="bg-muted rounded-lg px-4 py-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-background">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};
