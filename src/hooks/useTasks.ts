import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TaskRow = Database['public']['Tables']['tasks']['Row'];

interface Task extends Omit<TaskRow, 'data'> {
  due_date?: string | null;
  data?: {
    icon?: string;
    color?: string;
  } | null;
}

export const useTasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .order('due_date', { ascending: true });

      if (fetchError) throw fetchError;

      setTasks((data || []) as Task[]);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const getMostUrgentTask = (): Task | null => {
    const today = new Date();
    const pendingTasks = tasks.filter(task => task.status === 'pending');
    
    // Sort by urgency (overdue first, then by due date)
    const sortedTasks = pendingTasks
      .filter(task => task.due_date) // Only tasks with due dates
      .sort((a, b) => {
        const dueDateA = new Date(a.due_date!);
        const dueDateB = new Date(b.due_date!);
        
        const isOverdueA = dueDateA < today;
        const isOverdueB = dueDateB < today;
        
        // Overdue tasks first
        if (isOverdueA && !isOverdueB) return -1;
        if (!isOverdueA && isOverdueB) return 1;
        
        // Then by due date (earliest first)
        return dueDateA.getTime() - dueDateB.getTime();
      });

    return sortedTasks[0] || null;
  };

  const getFutureTasks = (): Task[] => {
    const mostUrgent = getMostUrgentTask();
    return tasks.filter(task => 
      task.status === 'pending' && 
      task.id !== mostUrgent?.id
    );
  };

  const getTaskUrgency = (task: Task): "overdue" | "urgent" | "normal" => {
    if (!task.due_date) return "normal";
    
    const today = new Date();
    const dueDate = new Date(task.due_date);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "overdue";
    if (diffDays <= 7) return "urgent";
    return "normal";
  };

  return {
    tasks,
    loading,
    error,
    refetch: fetchTasks,
    getMostUrgentTask,
    getFutureTasks,
    getTaskUrgency
  };
};