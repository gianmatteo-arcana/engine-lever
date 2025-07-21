
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StackedCardProps {
  children: ReactNode;
  isActive: boolean;
  position: number;
  zIndex: number;
  headerHeight: number;
  expandedHeight: number;
  onClick: () => void;
}

export const StackedCard = ({
  children,
  isActive,
  position,
  zIndex,
  headerHeight,
  expandedHeight,
  onClick
}: StackedCardProps) => {
  return (
    <div
      className={cn(
        "absolute w-full transition-all duration-300 ease-in-out cursor-pointer",
        "bg-card border rounded-lg shadow-lg",
        isActive ? "shadow-xl" : "shadow-md hover:shadow-lg",
        "overflow-hidden"
      )}
      style={{
        top: `${position}px`,
        zIndex,
        height: isActive ? `${expandedHeight}px` : `${headerHeight}px`,
        transform: isActive ? "scale(1)" : "scale(0.98)"
      }}
      onClick={onClick}
    >
      {/* Header overlay for stacked state */}
      {!isActive && (
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card/90 z-10 pointer-events-none" />
      )}
      
      {/* Card content */}
      <div className={cn(
        "h-full transition-opacity duration-300",
        isActive ? "opacity-100" : "opacity-80"
      )}>
        {children}
      </div>
      
      {/* Peek indicator for non-active cards */}
      {!isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/20 rounded-b-lg" />
      )}
    </div>
  );
};
