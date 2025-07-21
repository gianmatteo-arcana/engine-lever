
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TaskRow = Database['public']['Tables']['tasks']['Row'];

interface Task extends Omit<TaskRow, 'data'> {
  due_date: string | null;
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

      if (fetchError) {
        console.error('Supabase error:', fetchError);
      }

      // If no tasks found (likely due to no authenticated user), create sample tasks
      if (!data || data.length === 0) {
        const sampleTasks: Task[] = [
          // January 2025
          {
            id: 'sample-1',
            user_id: 'sample',
            title: 'Business Profile Setup',
            description: 'Complete your business profile information',
            task_type: 'business_profile',
            status: 'pending',
            priority: 1,
            due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'BP', color: 'warning' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          {
            id: 'sample-2',
            user_id: 'sample',
            title: 'Statement of Information',
            description: 'Annual business filing requirement',
            task_type: 'statement_of_info',
            status: 'pending',
            priority: 1,
            due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'SI', color: 'warning' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          {
            id: 'sample-3',
            user_id: 'sample',
            title: 'Tax Registration',
            description: 'Register for state taxes',
            task_type: 'tax_registration',
            status: 'pending',
            priority: 2,
            due_date: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'TR', color: 'task' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          // February 2025
          {
            id: 'sample-4',
            user_id: 'sample',
            title: 'Quarterly Tax Filing',
            description: 'File quarterly tax returns',
            task_type: 'tax_filing',
            status: 'pending',
            priority: 1,
            due_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'QT', color: 'warning' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          {
            id: 'sample-5',
            user_id: 'sample',
            title: 'Business License Renewal',
            description: 'Renew annual business license',
            task_type: 'license_renewal',
            status: 'pending',
            priority: 2,
            due_date: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'LR', color: 'task' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          {
            id: 'sample-6',
            user_id: 'sample',
            title: 'Workers Comp Insurance',
            description: 'Review and renew workers compensation insurance',
            task_type: 'insurance',
            status: 'pending',
            priority: 2,
            due_date: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'WC', color: 'task' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          // March 2025
          {
            id: 'sample-7',
            user_id: 'sample',
            title: 'Annual Report Filing',
            description: 'Submit annual report to Secretary of State',
            task_type: 'annual_report',
            status: 'pending',
            priority: 1,
            due_date: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'AR', color: 'warning' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          {
            id: 'sample-8',
            user_id: 'sample',
            title: 'EIN Verification',
            description: 'Verify Employer Identification Number status',
            task_type: 'ein_verification',
            status: 'pending',
            priority: 2,
            due_date: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'EV', color: 'task' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          {
            id: 'sample-9',
            user_id: 'sample',
            title: 'Sales Tax Permit',
            description: 'Apply for sales tax permit',
            task_type: 'sales_tax',
            status: 'pending',
            priority: 2,
            due_date: new Date(Date.now() + 85 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'ST', color: 'task' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          {
            id: 'sample-10',
            user_id: 'sample',
            title: 'Payroll Tax Setup',
            description: 'Set up payroll tax requirements',
            task_type: 'payroll_tax',
            status: 'pending',
            priority: 2,
            due_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'PT', color: 'task' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          // April 2025
          {
            id: 'sample-11',
            user_id: 'sample',
            title: 'BOI Report Filing',
            description: 'Submit Beneficial Ownership Information report',
            task_type: 'boi_report',
            status: 'pending',
            priority: 1,
            due_date: new Date(Date.now() + 110 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'BI', color: 'warning' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          {
            id: 'sample-12',
            user_id: 'sample',
            title: 'Franchise Tax Payment',
            description: 'Submit annual franchise tax payment',
            task_type: 'franchise_tax',
            status: 'pending',
            priority: 1,
            due_date: new Date(Date.now() + 115 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'FT', color: 'warning' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          {
            id: 'sample-13',
            user_id: 'sample',
            title: 'Registered Agent Update',
            description: 'Update registered agent information',
            task_type: 'registered_agent',
            status: 'pending',
            priority: 2,
            due_date: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'RA', color: 'task' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          // May 2025
          {
            id: 'sample-14',
            user_id: 'sample',
            title: 'Business Bank Account Review',
            description: 'Review business banking requirements',
            task_type: 'banking',
            status: 'pending',
            priority: 2,
            due_date: new Date(Date.now() + 140 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'BA', color: 'task' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          },
          {
            id: 'sample-15',
            user_id: 'sample',
            title: 'Operating Agreement Review',
            description: 'Review and update operating agreement',
            task_type: 'operating_agreement',
            status: 'pending',
            priority: 2,
            due_date: new Date(Date.now() + 145 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            data: { icon: 'OA', color: 'task' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null
          }
        ];
        setTasks(sampleTasks);
        return;
      }

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
