import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  const getCardStyles = () => {
    const baseYOffset = index * 8;
    const baseXOffset = index * 12;
    
    if (isExpanded) {
      return {
        transform: `translateY(${baseYOffset}px) translateX(${baseXOffset}px) scale(1)`,
        zIndex: 50,
        opacity: 1
      };
    }

    const scale = 1 - (index * 0.02);
    const opacity = 1 - (index * 0.1);

    return {
      transform: `translateY(${baseYOffset}px) translateX(${baseXOffset}px) scale(${scale})`,
      zIndex: 10 - index,
      opacity: Math.max(opacity, 0.7)
    };
  };

  const cardStyles = getCardStyles();

  return (
    <Card
      className={cn(
        "absolute inset-0 cursor-pointer transition-all duration-300 ease-out",
        "shadow-lg hover:shadow-xl border-2",
        isExpanded ? "border-primary/30" : "border-border",
        "bg-card/95 backdrop-blur-sm"
      )}
      style={cardStyles}
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
        <CardContent className="pt-0">
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