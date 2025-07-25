import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";

interface StackedCardProps {
  id: string;
  title: string;
  index: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  content: React.ReactNode;
  expandedContent?: React.ReactNode;
}

export const StackedCard = ({
  id,
  title,
  index,
  isExpanded,
  onToggle,
  content,
  expandedContent
}: StackedCardProps) => {
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [expandedAt, setExpandedAt] = useState<number | null>(null);
  const { ref: intersectionRef, isVisible } = useIntersectionObserver({
    threshold: 0.3,
    rootMargin: '-20% 0px -20% 0px'
  });

  // Smart auto-collapse with debounce and user interaction respect
  useEffect(() => {
    if (!isVisible && isExpanded) {
      const now = Date.now();
      const timeSinceExpanded = expandedAt ? now - expandedAt : Infinity;
      
      // Don't auto-collapse if recently expanded (less than 2 seconds)
      if (timeSinceExpanded < 2000) return;
      
      // Show warning state first
      setIsCollapsing(true);
      
      // Debounced collapse after 500ms
      const timer = setTimeout(() => {
        onToggle(id);
        setIsCollapsing(false);
        setExpandedAt(null);
      }, 500);
      
      return () => clearTimeout(timer);
    } else {
      setIsCollapsing(false);
    }
  }, [isVisible, isExpanded, id, onToggle, expandedAt]);

  // Track when cards are expanded
  useEffect(() => {
    if (isExpanded && !expandedAt) {
      setExpandedAt(Date.now());
    } else if (!isExpanded) {
      setExpandedAt(null);
    }
  }, [isExpanded, expandedAt]);
  const getCardStyles = () => {
    const baseYOffset = index * 8;
    const baseXOffset = index * 12;
    
    if (isExpanded) {
      return {
        transform: `translateY(${baseYOffset}px) translateX(${baseXOffset}px) scale(1)`,
        transformOrigin: 'top left',
        zIndex: 50,
        opacity: isCollapsing ? 0.8 : 1
      };
    }

    const scale = 1 - (index * 0.02);
    const opacity = 1 - (index * 0.1);

    return {
      transform: `translateY(${baseYOffset}px) translateX(${baseXOffset}px) scale(${scale})`,
      transformOrigin: 'top left',
      zIndex: 10 - index,
      opacity: Math.max(opacity, 0.7)
    };
  };

  const cardStyles = getCardStyles();

  return (
    <Card
      ref={intersectionRef}
      className={cn(
        "absolute inset-0 cursor-pointer origin-top-left",
        "shadow-lg hover:shadow-xl border-2",
        isExpanded ? "border-primary/30" : "border-border",
        "bg-card/95 backdrop-blur-sm"
      )}
      style={{
        ...cardStyles,
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
      onClick={() => onToggle(id)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-foreground flex items-center justify-between">
          {title}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0 animate-content-fade-in">
          {expandedContent || content}
        </CardContent>
      )}
      
      {!isExpanded && (
        <CardContent className="pt-0 opacity-60">
          <div className="h-16 overflow-hidden">
            {content}
          </div>
        </CardContent>
      )}
    </Card>
  );
};