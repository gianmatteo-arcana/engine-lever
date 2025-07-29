import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, X, Trash2 } from 'lucide-react';

interface DebugEntry {
  id: string;
  timestamp: Date;
  type: 'request' | 'response' | 'error' | 'action';
  requestId?: string;
  data: any;
  duration?: number;
}

interface DebugConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DebugConsole({ isOpen, onClose }: DebugConsoleProps) {
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;

    // Add global debug logger
    const addDebugEntry = (entry: Omit<DebugEntry, 'id' | 'timestamp'>) => {
      const newEntry: DebugEntry = {
        ...entry,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date()
      };
      setEntries(prev => [newEntry, ...prev].slice(0, 100)); // Keep last 100 entries
    };

    // Expose globally for debugging
    (window as any).debugLog = addDebugEntry;

    return () => {
      delete (window as any).debugLog;
    };
  }, [isOpen]);

  const clearEntries = () => {
    setEntries([]);
    setExpandedEntries(new Set());
  };

  const toggleExpanded = (entryId: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'request': return 'bg-blue-500';
      case 'response': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'action': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const formatData = (data: any) => {
    if (typeof data === 'string') return data;
    return JSON.stringify(data, null, 2);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-[90vw] h-[80vh] max-w-6xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-semibold">Debug Console</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearEntries}>
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(80vh-100px)]">
            <div className="p-4 space-y-2">
              {entries.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No debug entries yet. Interact with the chat to see debug information.
                </div>
              ) : (
                entries.map((entry) => (
                  <Collapsible key={entry.id}>
                    <CollapsibleTrigger 
                      className="w-full"
                      onClick={() => toggleExpanded(entry.id)}
                    >
                      <div className="flex items-center gap-2 p-2 rounded border hover:bg-muted/50">
                        {expandedEntries.has(entry.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <Badge 
                          variant="secondary" 
                          className={`${getTypeColor(entry.type)} text-white`}
                        >
                          {entry.type}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {entry.timestamp.toLocaleTimeString()}
                        </span>
                        {entry.requestId && (
                          <span className="text-xs font-mono bg-muted px-1 rounded">
                            {entry.requestId}
                          </span>
                        )}
                        {entry.duration && (
                          <span className="text-xs text-muted-foreground">
                            {entry.duration}ms
                          </span>
                        )}
                        <span className="flex-1 text-left text-sm truncate">
                          {entry.type === 'request' ? 'Request sent' : 
                           entry.type === 'response' ? `Response: ${entry.data.message?.substring(0, 50)}...` :
                           entry.type === 'action' ? `Actions: ${entry.data.length}` :
                           'Error occurred'}
                        </span>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-6 p-2 bg-muted/30 rounded text-xs font-mono">
                        <pre className="whitespace-pre-wrap overflow-auto max-h-40">
                          {formatData(entry.data)}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}