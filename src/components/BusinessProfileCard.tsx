import { SmallBizCard } from "./SmallBizCard";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Calendar, Users } from "lucide-react";

interface BusinessProfile {
  name: string;
  entityType: string;
  address: string;
  lastFiled?: string;
  officers?: string[];
  status: "active" | "pending" | "unknown";
}

interface BusinessProfileCardProps {
  profile: BusinessProfile;
  onClick?: () => void;
  expanded?: boolean;
}

export const BusinessProfileCard = ({ profile, onClick, expanded = false }: BusinessProfileCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "success";
      case "pending": return "warning";
      default: return "secondary";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active": return "Active";
      case "pending": return "Needs Update";
      default: return "Unknown";
    }
  };

  return (
    <SmallBizCard
      title="Business Profile"
      description="Your registered business information"
      onClick={onClick}
      expandable={!expanded}
      className={expanded ? "w-full" : ""}
    >
      <div className="space-y-4">
        {/* Company Name & Status */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg text-foreground">{profile.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{profile.entityType}</span>
            </div>
          </div>
          <Badge variant={getStatusColor(profile.status) as any}>
            {getStatusText(profile.status)}
          </Badge>
        </div>

        {/* Address */}
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
          <span className="text-sm text-foreground">{profile.address}</span>
        </div>

        {/* Last Filed */}
        {profile.lastFiled && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Last filed: {profile.lastFiled}
            </span>
          </div>
        )}

        {/* Officers (if expanded or available) */}
        {expanded && profile.officers && profile.officers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Officers</span>
            </div>
            <div className="pl-6 space-y-1">
              {profile.officers.map((officer, index) => (
                <div key={index} className="text-sm text-muted-foreground">
                  {officer}
                </div>
              ))}
            </div>
          </div>
        )}

        {!expanded && onClick && (
          <p className="text-xs text-muted-foreground italic">
            Click to view full details
          </p>
        )}
      </div>
    </SmallBizCard>
  );
};