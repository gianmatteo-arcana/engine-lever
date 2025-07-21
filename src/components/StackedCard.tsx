
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
  const stackOffset = isActive ? 0 : (zIndex < 40 ? (40 - zIndex) * 3 : 0);
  
  return (
    <div
      className={cn(
        "absolute transition-all duration-300 ease-out cursor-pointer",
        "bg-card border border-border/50 rounded-2xl overflow-hidden",
        isActive ? "shadow-2xl shadow-black/10" : "shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/8"
      )}
      style={{
        top: `${position}px`,
        left: `${stackOffset}px`,
        right: `${stackOffset}px`,
        zIndex,
        height: isActive ? `${expandedHeight}px` : `${headerHeight}px`,
        transform: isActive 
          ? "translateY(0) scale(1)" 
          : `translateY(${stackOffset * 0.5}px) scale(${0.96 + (zIndex - 35) * 0.01})`,
        boxShadow: isActive
          ? "0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05)"
          : `0 ${4 + stackOffset}px ${8 + stackOffset * 2}px -4px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.03)`
      }}
      onClick={onClick}
    >
      {/* Subtle gradient overlay for depth on non-active cards */}
      {!isActive && (
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/5 pointer-events-none z-10" />
      )}
      
      {/* Card content */}
      <div className={cn(
        "h-full transition-all duration-300",
        isActive ? "opacity-100" : "opacity-85 hover:opacity-90"
      )}>
        {children}
      </div>
      
      {/* Stack depth indicator */}
      {!isActive && (
        <div 
          className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-primary/30 via-primary/50 to-primary/30"
          style={{
            boxShadow: `0 0 ${stackOffset + 4}px rgba(var(--primary), 0.3)`
          }}
        />
      )}
    </div>
  );
};
