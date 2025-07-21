import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Terminal, X, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'request' | 'response' | 'error' | 'info';
  method?: string;
  url?: string;
  status?: number;
  data?: any;
  message?: string;
  duration?: number;
}

interface DevConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DevConsole = ({ isOpen, onClose }: DevConsoleProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Expose addLog function globally so other components can use it
  useEffect(() => {
    if (isOpen) {
      (window as any).devConsoleLog = addLog;
    } else {
      delete (window as any).devConsoleLog;
    }
  }, [isOpen]);

  const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newEntry: LogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    setLogs(prev => [...prev, newEntry]);
  };

  const clearLogs = () => {
    setLogs([]);
    setExpandedLogs(new Set());
  };

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  // Intercept fetch requests to log network activity
  useEffect(() => {
    if (!isOpen) return;

    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const [url, options] = args;
      const startTime = Date.now();
      
      // Log the request
      addLog({
        type: 'request',
        method: options?.method || 'GET',
        url: typeof url === 'string' ? url : url.toString(),
        data: options?.body ? JSON.parse(options.body as string) : undefined
      });

      try {
        const response = await originalFetch(...args);
        const duration = Date.now() - startTime;
        
        // Clone response to read body without consuming it
        const responseClone = response.clone();
        let responseData;
        
        try {
          responseData = await responseClone.json();
        } catch {
          responseData = await responseClone.text();
        }

        // Log the response
        addLog({
          type: 'response',
          method: options?.method || 'GET',
          url: typeof url === 'string' ? url : url.toString(),
          status: response.status,
          data: responseData,
          duration
        });

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Log the error
        addLog({
          type: 'error',
          method: options?.method || 'GET',
          url: typeof url === 'string' ? url : url.toString(),
          message: error instanceof Error ? error.message : 'Network error',
          duration
        });
        
        throw error;
      }
    };

    // Cleanup
    return () => {
      window.fetch = originalFetch;
    };
  }, [isOpen]);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [logs]);

  // Add some initial info logs
  useEffect(() => {
    if (isOpen && logs.length === 0) {
      addLog({
        type: 'info',
        message: 'Developer console initialized - monitoring network activity'
      });
    }
  }, [isOpen, logs.length]);

  if (!isOpen) return null;

  const getStatusColor = (status?: number) => {
    if (!status) return 'secondary';
    if (status >= 200 && status < 300) return 'default';
    if (status >= 400) return 'destructive';
    return 'secondary';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'request': return 'blue';
      case 'response': return 'green';
      case 'error': return 'red';
      case 'info': return 'gray';
      default: return 'gray';
    }
  };

  return (
    <Card className="fixed bottom-0 left-0 right-0 h-80 bg-black text-green-400 font-mono text-xs border-t-2 border-green-500 z-50">
      <CardHeader className="flex flex-row items-center justify-between p-3 bg-gray-900">
        <CardTitle className="flex items-center gap-2 text-green-400">
          <Terminal className="h-4 w-4" />
          Developer Console
          <Badge variant="outline" className="text-green-400 border-green-400">
            {logs.length} logs
          </Badge>
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearLogs}
            className="text-green-400 hover:bg-gray-800"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-green-400 hover:bg-gray-800"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-64 p-3" ref={scrollAreaRef}>
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="space-y-1">
                <Collapsible
                  open={expandedLogs.has(log.id)}
                  onOpenChange={() => toggleLogExpanded(log.id)}
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:bg-gray-900 p-1 rounded">
                    {expandedLogs.has(log.id) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span className="text-gray-400">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <Badge 
                      variant="outline" 
                      className={`text-${getTypeColor(log.type)}-400 border-${getTypeColor(log.type)}-400`}
                    >
                      {log.type.toUpperCase()}
                    </Badge>
                    {log.method && (
                      <Badge variant="outline" className="text-blue-400 border-blue-400">
                        {log.method}
                      </Badge>
                    )}
                    {log.status && (
                      <Badge variant={getStatusColor(log.status)}>
                        {log.status}
                      </Badge>
                    )}
                    {log.duration && (
                      <span className="text-gray-400 text-xs">
                        {log.duration}ms
                      </span>
                    )}
                    <span className="text-green-400 truncate flex-1">
                      {log.url || log.message}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="ml-5 mt-1">
                    {log.url && (
                      <div className="text-gray-300 mb-1">
                        <span className="text-gray-500">URL:</span> {log.url}
                      </div>
                    )}
                    {log.data && (
                      <div className="bg-gray-800 p-2 rounded overflow-auto max-h-32">
                        <div className="text-gray-500 mb-1">Data:</div>
                        <pre className="text-green-300 whitespace-pre-wrap">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.message && (
                      <div className="text-orange-400">
                        <span className="text-gray-500">Message:</span> {log.message}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
                <Separator className="bg-gray-800" />
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};