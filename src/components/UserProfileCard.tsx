
import { User, Mail, Calendar, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserProfileCardProps {
  user: { name: string; email: string; createdAt?: Date } | null;
  onClose: () => void;
  isVisible: boolean;
}

export const UserProfileCard = ({ user, onClose, isVisible }: UserProfileCardProps) => {
  const getInitials = (name: string) => {
    if (!name || name.trim() === '') {
      return 'U'; // Default fallback for unnamed user
    }
    
    return name
      .split(' ')
      .filter(n => n && n.trim() !== '') // Filter out empty parts
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'; // Fallback if no valid initials
  };

  const formatMemberSince = (date?: Date) => {
    if (!date) return "Recent member";
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Profile Card */}
      <div className={`fixed top-4 right-4 z-50 transition-all duration-300 ease-out ${
        isVisible 
          ? 'translate-x-0 translate-y-0 opacity-100 scale-100' 
          : 'translate-x-full -translate-y-4 opacity-0 scale-95'
      }`}>
        <Card className="w-80 shadow-xl border-2">
          <CardHeader className="relative pb-4">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 h-8 w-8 p-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src="" alt={user?.name || "User"} />
                <AvatarFallback className="text-lg font-semibold bg-primary text-primary-foreground">
                  {getInitials(user?.name || "User")}
                </AvatarFallback>
              </Avatar>
              
              <div className="space-y-1">
                <CardTitle className="text-xl">{user?.name || "User"}</CardTitle>
                <p className="text-sm text-muted-foreground">Account Profile</p>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-muted rounded-full">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
               <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">
                    {user?.email || "dev@example.com (dev mode)"}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-muted rounded-full">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Account Type</p>
                  <p className="text-sm text-muted-foreground">Business Owner</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-muted rounded-full">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Member Since</p>
                  <p className="text-sm text-muted-foreground">{formatMemberSince(user?.createdAt)}</p>
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t">
              <Button variant="outline" className="w-full" onClick={onClose}>
                Close Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};
