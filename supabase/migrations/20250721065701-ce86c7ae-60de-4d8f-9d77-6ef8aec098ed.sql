
-- Add due_date field to tasks table
ALTER TABLE public.tasks ADD COLUMN due_date DATE;

-- Create some prototype tasks for testing the visual system
INSERT INTO public.tasks (user_id, title, description, task_type, status, priority, due_date, data) VALUES 
-- Current/urgent tasks (next 30 days)
(auth.uid(), 'Business Profile Setup', 'Complete your business profile information', 'business_profile', 'pending', 1, CURRENT_DATE + INTERVAL '5 days', '{"icon": "BP", "color": "warning"}'),
(auth.uid(), 'Statement of Information', 'Annual business filing requirement', 'statement_of_info', 'pending', 1, CURRENT_DATE + INTERVAL '15 days', '{"icon": "SI", "color": "warning"}'),
(auth.uid(), 'Tax Registration', 'Register for state taxes', 'tax_registration', 'pending', 2, CURRENT_DATE + INTERVAL '25 days', '{"icon": "TR", "color": "task"}'),

-- Next month tasks
(auth.uid(), 'Workers Compensation', 'Set up workers compensation insurance', 'workers_comp', 'pending', 2, CURRENT_DATE + INTERVAL '35 days', '{"icon": "WC", "color": "task"}'),
(auth.uid(), 'Business License', 'Apply for business license', 'business_license', 'pending', 2, CURRENT_DATE + INTERVAL '45 days', '{"icon": "BL", "color": "task"}'),
(auth.uid(), 'EIN Application', 'Apply for Employer Identification Number', 'ein_application', 'pending', 2, CURRENT_DATE + INTERVAL '50 days', '{"icon": "EIN", "color": "task"}'),

-- Future tasks (2-6 months out)
(auth.uid(), 'Quarterly Filing', 'Quarterly tax filing', 'quarterly_filing', 'pending', 3, CURRENT_DATE + INTERVAL '65 days', '{"icon": "QF", "color": "default"}'),
(auth.uid(), 'Annual Report', 'Annual business report filing', 'annual_report', 'pending', 3, CURRENT_DATE + INTERVAL '85 days', '{"icon": "AR", "color": "default"}'),
(auth.uid(), 'License Renewal', 'Renew business license', 'license_renewal', 'pending', 3, CURRENT_DATE + INTERVAL '120 days', '{"icon": "LR", "color": "default"}'),
(auth.uid(), 'Insurance Review', 'Review business insurance policies', 'insurance_review', 'pending', 3, CURRENT_DATE + INTERVAL '150 days', '{"icon": "IR", "color": "default"}'),

-- Add more tasks across different months for testing
(auth.uid(), 'Safety Training', 'Complete workplace safety training', 'safety_training', 'pending', 3, CURRENT_DATE + INTERVAL '180 days', '{"icon": "ST", "color": "default"}'),
(auth.uid(), 'Equipment Maintenance', 'Schedule equipment maintenance', 'equipment_maintenance', 'pending', 3, CURRENT_DATE + INTERVAL '200 days', '{"icon": "EM", "color": "default"}'),
(auth.uid(), 'Contract Review', 'Review vendor contracts', 'contract_review', 'pending', 3, CURRENT_DATE + INTERVAL '220 days', '{"icon": "CR", "color": "default"}'),
(auth.uid(), 'Marketing Review', 'Review marketing strategy', 'marketing_review', 'pending', 3, CURRENT_DATE + INTERVAL '240 days', '{"icon": "MR", "color": "default"}'),
(auth.uid(), 'Financial Audit', 'Annual financial audit', 'financial_audit', 'pending', 3, CURRENT_DATE + INTERVAL '280 days', '{"icon": "FA", "color": "default"}'),

-- Add tasks for next year to test month delineators
(auth.uid(), 'Year-end Planning', 'Plan for next fiscal year', 'year_end_planning', 'pending', 3, CURRENT_DATE + INTERVAL '320 days', '{"icon": "YP", "color": "default"}'),
(auth.uid(), 'Budget Review', 'Annual budget review', 'budget_review', 'pending', 3, CURRENT_DATE + INTERVAL '350 days', '{"icon": "BR", "color": "default"}'),
(auth.uid(), 'Strategic Planning', 'Strategic business planning session', 'strategic_planning', 'pending', 3, CURRENT_DATE + INTERVAL '380 days', '{"icon": "SP", "color": "default"}');

-- Create an index for better performance when sorting by due_date
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
