/**
 * Dashboard Task Seeding Script
 * 
 * Creates realistic task data for dashboard UX testing based on onboarding.yaml structure.
 * Shows agent-user communication patterns and proper task status distribution.
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// Use service role for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://raenkewzlvrdqufwxjpl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const TEST_USER_ID = '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934'; // Test user

async function cleanupExistingTasks() {
  console.log('🧹 Cleaning up existing test tasks...');
  
  // Delete existing task events first (foreign key constraint)
  const { error: eventsError } = await supabase
    .from('context_events')
    .delete()
    .in('context_id', (await supabase.from('tasks').select('id').eq('user_id', TEST_USER_ID)).data?.map(t => t.id) || []);
    
  if (eventsError) {
    console.log('Warning: Could not delete task events:', eventsError.message);
  }
  
  // Delete existing tasks
  const { error: tasksError } = await supabase
    .from('tasks')
    .delete()
    .eq('user_id', TEST_USER_ID);
    
  if (tasksError) {
    console.log('Warning: Could not delete tasks:', tasksError.message);
  } else {
    console.log('✅ Cleanup complete');
  }
}

function createTaskData() {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  return [
    // UPCOMING TASKS (2 tasks)
    {
      id: uuidv4(),
      user_id: TEST_USER_ID,
      title: 'Complete California Statement of Information Filing',
      description: 'Annual filing required for TechVenture Solutions LLC with CA Secretary of State',
      task_type: 'compliance',
      status: 'pending',
      priority: 'high',
      due_date: threeDaysFromNow.toISOString(),
      metadata: {
        entityType: 'LLC',
        state: 'California',
        agent_assigned: 'Legal Compliance Agent',
        filing_type: 'SI-550',
        estimated_fee: 25,
        next_action: 'Gather business officer information',
        progress_percentage: 15,
        agent_reasoning: 'High priority due to upcoming deadline. All required business information has been validated.',
        user_tasks: [
          'Review current business officer information',
          'Confirm business address is up to date',
          'Prepare payment method for $25 filing fee'
        ]
      },
      created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      updated_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString() // 30 minutes ago
    },
    {
      id: uuidv4(),
      user_id: TEST_USER_ID,
      title: 'Set Up Business Banking Account',
      description: 'Open dedicated business account with integrated accounting sync',
      task_type: 'financial_setup',
      status: 'pending',
      priority: 'medium',
      due_date: oneWeekFromNow.toISOString(),
      metadata: {
        agent_assigned: 'Financial Setup Agent',
        bank_recommendations: ['Mercury', 'Brex', 'Chase Business'],
        integration_required: 'QuickBooks Online',
        estimated_time: '2-3 hours',
        progress_percentage: 5,
        agent_reasoning: 'Business banking separation is crucial for tax compliance and professional credibility.',
        user_tasks: [
          'Compare recommended banking options',
          'Gather required business documents (EIN, Operating Agreement)',
          'Schedule appointment or begin online application'
        ],
        next_steps: [
          'Review bank comparison report prepared by agent',
          'Agent will assist with application completion',
          'Set up automated accounting integration'
        ]
      },
      created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      updated_at: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString() // 4 hours ago
    },
    
    // COMPLETED TASKS (3 tasks)
    {
      id: uuidv4(),
      user_id: TEST_USER_ID,
      title: 'Complete Business Onboarding - TechVenture Solutions',
      description: 'Initial business setup and compliance verification completed',
      task_type: 'onboarding',
      status: 'completed',
      priority: 'high',
      due_date: twoDaysAgo.toISOString(),
      completed_at: twoDaysAgo.toISOString(),
      metadata: {
        business_name: 'TechVenture Solutions LLC',
        entity_type: 'Limited Liability Company',
        state_of_formation: 'Delaware',
        ein: '88-1234567',
        industry: 'Software Development',
        agent_assigned: 'Orchestrator Agent',
        progress_percentage: 100,
        phases_completed: [
          'Profile Setup - completed by Profile Collector',
          'Business Discovery - completed by Business Discovery Agent', 
          'Compliance Assessment - completed by Compliance Analyzer',
          'Initial Tasks - completed by Orchestrator Agent'
        ],
        agent_reasoning: 'Successfully completed full onboarding workflow. Business is properly registered and compliant.',
        completion_summary: {
          total_time: '2 hours 15 minutes',
          forms_completed: 8,
          documents_generated: 5,
          compliance_items_identified: 12
        }
      },
      created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      updated_at: twoDaysAgo.toISOString()
    },
    {
      id: uuidv4(),
      user_id: TEST_USER_ID,
      title: 'Obtain Federal EIN Number',
      description: 'Successfully registered business with IRS and obtained Employer Identification Number',
      task_type: 'registration',
      status: 'completed',
      priority: 'high',
      due_date: oneWeekAgo.toISOString(),
      completed_at: oneWeekAgo.toISOString(),
      metadata: {
        ein: '88-1234567',
        agent_assigned: 'Agency Interaction Agent',
        processing_time: '15 minutes',
        progress_percentage: 100,
        agent_reasoning: 'EIN obtained instantly via IRS online system. No issues encountered.',
        completion_details: {
          application_method: 'IRS Online EIN Assistant',
          confirmation_number: 'EIN123456789',
          business_structure: 'Limited Liability Company',
          responsible_party: 'Gianmatteo Allyn'
        },
        next_actions_triggered: [
          'Business banking account setup enabled',
          'State tax registration initiated',
          'Federal tax obligations assessment scheduled'
        ]
      },
      created_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
      updated_at: oneWeekAgo.toISOString()
    },
    {
      id: uuidv4(),
      user_id: TEST_USER_ID,
      title: 'Delaware LLC Formation Filing',
      description: 'Filed Certificate of Formation with Delaware Division of Corporations',
      task_type: 'formation',
      status: 'completed',
      priority: 'urgent',
      due_date: oneDayAgo.toISOString(),
      completed_at: oneDayAgo.toISOString(),
      metadata: {
        filing_state: 'Delaware',
        entity_type: 'Limited Liability Company',
        file_number: 'DE-LLC-5678901',
        agent_assigned: 'Legal Formation Agent',
        processing_time: '1 hour 30 minutes',
        progress_percentage: 100,
        agent_reasoning: 'Delaware chosen for business-friendly laws and tax advantages for technology companies.',
        completion_details: {
          filing_method: 'Online through Delaware Division of Corporations',
          filing_fee: '$140',
          expedited_processing: true,
          registered_agent: 'Delaware Registered Agent Services LLC',
          business_address: '123 Innovation Drive, San Francisco, CA 94105'
        },
        documents_generated: [
          'Certificate of Formation (certified copy)',
          'Operating Agreement template',
          'EIN application preparation documents',
          'Delaware Franchise Tax registration'
        ]
      },
      created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      updated_at: oneDayAgo.toISOString()
    },

    // IN PROGRESS TASK (1 task)
    {
      id: uuidv4(),
      user_id: TEST_USER_ID,
      title: 'General Liability Insurance Quote & Setup',
      description: 'Obtaining competitive quotes and setting up business insurance coverage',
      task_type: 'insurance',
      status: 'in_progress',
      priority: 'medium',
      due_date: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
      metadata: {
        agent_assigned: 'Insurance Coordination Agent',
        coverage_type: 'General Liability + Professional Liability',
        quote_providers: ['NEXT Insurance', 'Hiscox', 'Progressive'],
        progress_percentage: 65,
        agent_reasoning: 'Business liability insurance is essential before client work begins. Agent has identified optimal coverage options.',
        current_status: 'Comparing quotes from 3 providers',
        quotes_received: [
          {
            provider: 'NEXT Insurance',
            monthly_premium: '$27',
            coverage_amount: '$1M/$2M',
            status: 'received'
          },
          {
            provider: 'Hiscox',
            monthly_premium: '$34',
            coverage_amount: '$1M/$2M',
            status: 'received'
          },
          {
            provider: 'Progressive',
            monthly_premium: 'pending',
            coverage_amount: '$1M/$2M',
            status: 'requested'
          }
        ],
        next_user_action: 'Review agent recommendations and approve preferred quote',
        agent_next_steps: [
          'Complete Progressive quote collection',
          'Prepare detailed comparison analysis',
          'Schedule user review meeting'
        ]
      },
      created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      updated_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
    }
  ];
}

function createTaskEvents(tasks) {
  const events = [];
  
  tasks.forEach(task => {
    const baseTime = new Date(task.created_at).getTime();
    
    // Create realistic event sequences based on task status
    if (task.status === 'completed') {
      events.push(
        ...createCompletedTaskEvents(task, baseTime)
      );
    } else if (task.status === 'in_progress') {
      events.push(
        ...createInProgressTaskEvents(task, baseTime)
      );
    } else if (task.status === 'pending') {
      events.push(
        ...createPendingTaskEvents(task, baseTime)
      );
    }
  });
  
  return events;
}

function createCompletedTaskEvents(task, baseTime) {
  const events = [];
  let eventTime = baseTime;
  
  // Task creation
  events.push({
    id: uuidv4(),
    context_id: task.id,
    operation: 'TASK_CREATED',
    actor_type: 'system',
    actor_id: 'orchestrator',
    data: {
      task_type: task.task_type,
      priority: task.priority,
      assigned_agent: task.metadata.agent_assigned
    },
    reasoning: `Task created for ${task.title}`,
    created_at: new Date(eventTime).toISOString()
  });
  
  eventTime += 5 * 60 * 1000; // 5 minutes later
  
  // Agent analysis
  events.push({
    id: uuidv4(),
    context_id: task.id,
    operation: 'AGENT_ANALYSIS_COMPLETE',
    actor_type: 'agent',
    actor_id: task.metadata.agent_assigned.toLowerCase().replace(/ /g, '_'),
    data: {
      analysis_result: 'Task requirements validated',
      estimated_duration: task.metadata.completion_summary?.total_time || '2 hours',
      complexity: 'moderate'
    },
    reasoning: `Agent analyzed task requirements and created execution plan`,
    created_at: new Date(eventTime).toISOString()
  });
  
  eventTime += 30 * 60 * 1000; // 30 minutes later
  
  // Progress updates
  events.push({
    id: uuidv4(),
    context_id: task.id,
    operation: 'PROGRESS_UPDATE',
    actor_type: 'agent',
    actor_id: task.metadata.agent_assigned.toLowerCase().replace(/ /g, '_'),
    data: {
      progress_percentage: 50,
      milestone: 'Information gathering complete',
      next_steps: ['Document preparation', 'Filing submission']
    },
    reasoning: 'Reached task midpoint - all required information collected',
    created_at: new Date(eventTime).toISOString()
  });
  
  eventTime += 45 * 60 * 1000; // 45 minutes later
  
  // Task completion
  events.push({
    id: uuidv4(),
    context_id: task.id,
    operation: 'TASK_COMPLETED',
    actor_type: 'agent',
    actor_id: task.metadata.agent_assigned.toLowerCase().replace(/ /g, '_'),
    data: {
      completion_status: 'successful',
      deliverables: task.metadata.documents_generated || ['Task completed successfully'],
      follow_up_tasks: task.metadata.next_actions_triggered || []
    },
    reasoning: `Task completed successfully - ${task.title}`,
    created_at: new Date(eventTime).toISOString()
  });
  
  return events;
}

function createInProgressTaskEvents(task, baseTime) {
  const events = [];
  let eventTime = baseTime;
  
  // Task creation
  events.push({
    id: uuidv4(),
    context_id: task.id,
    operation: 'TASK_CREATED',
    actor_type: 'system',
    actor_id: 'orchestrator',
    data: {
      task_type: task.task_type,
      priority: task.priority,
      assigned_agent: task.metadata.agent_assigned
    },
    reasoning: `Task created for ${task.title}`,
    created_at: new Date(eventTime).toISOString()
  });
  
  eventTime += 10 * 60 * 1000; // 10 minutes later
  
  // Agent started work
  events.push({
    id: uuidv4(),
    context_id: task.id,
    operation: 'AGENT_WORK_STARTED',
    actor_type: 'agent',
    actor_id: task.metadata.agent_assigned.toLowerCase().replace(/ /g, '_'),
    data: {
      work_phase: 'research_and_analysis',
      estimated_completion: task.due_date
    },
    reasoning: 'Agent began working on task requirements',
    created_at: new Date(eventTime).toISOString()
  });
  
  eventTime += 2 * 60 * 60 * 1000; // 2 hours later
  
  // Recent progress update
  events.push({
    id: uuidv4(),
    context_id: task.id,
    operation: 'PROGRESS_UPDATE',
    actor_type: 'agent',
    actor_id: task.metadata.agent_assigned.toLowerCase().replace(/ /g, '_'),
    data: {
      progress_percentage: task.metadata.progress_percentage,
      current_phase: task.metadata.current_status,
      completed_items: task.metadata.quotes_received?.filter(q => q.status === 'received').length || 2,
      pending_items: task.metadata.quotes_received?.filter(q => q.status === 'pending').length || 1
    },
    reasoning: `Progress update: ${task.metadata.current_status}`,
    created_at: new Date(eventTime).toISOString()
  });
  
  return events;
}

function createPendingTaskEvents(task, baseTime) {
  const events = [];
  let eventTime = baseTime;
  
  // Task creation
  events.push({
    id: uuidv4(),
    context_id: task.id,
    operation: 'TASK_CREATED',
    actor_type: 'system',
    actor_id: 'orchestrator',
    data: {
      task_type: task.task_type,
      priority: task.priority,
      assigned_agent: task.metadata.agent_assigned,
      due_date: task.due_date
    },
    reasoning: `Task created for ${task.title}`,
    created_at: new Date(eventTime).toISOString()
  });
  
  eventTime += 15 * 60 * 1000; // 15 minutes later
  
  // Agent preparation
  events.push({
    id: uuidv4(),
    context_id: task.id,
    operation: 'AGENT_PREPARATION_COMPLETE',
    actor_type: 'agent',
    actor_id: task.metadata.agent_assigned.toLowerCase().replace(/ /g, '_'),
    data: {
      preparation_phase: 'requirements_analysis',
      user_tasks_identified: task.metadata.user_tasks?.length || 3,
      estimated_user_time: task.metadata.estimated_time || '1-2 hours'
    },
    reasoning: `Agent prepared task requirements and identified user action items`,
    created_at: new Date(eventTime).toISOString()
  });
  
  return events;
}

async function seedTasks() {
  console.log('🌱 Seeding dashboard tasks...');
  
  const tasks = createTaskData();
  
  // Insert tasks
  console.log(`📋 Creating ${tasks.length} tasks...`);
  const { error: tasksError } = await supabase
    .from('tasks')
    .insert(tasks);
    
  if (tasksError) {
    console.error('❌ Error creating tasks:', tasksError);
    return;
  }
  
  console.log('✅ Tasks created successfully');
  
  // Summary
  const statusCounts = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});
  
  console.log('\n📈 Task Summary:');
  console.log(`  Pending (Upcoming): ${statusCounts.pending || 0} tasks`);
  console.log(`  In Progress: ${statusCounts.in_progress || 0} tasks`);
  console.log(`  Completed: ${statusCounts.completed || 0} tasks`);
  console.log('\n🎯 Dashboard should now show:');
  console.log('  • 2 upcoming task cards with proper due dates');
  console.log('  • 3 completed task cards with rich metadata');
  console.log('  • 1 in-progress task with progress indicators');
  console.log('  • Rich task details for fullscreen expansion');
  console.log('\n📝 Note: Task events will be added when the contexts table is properly set up');
}

async function main() {
  try {
    await cleanupExistingTasks();
    await seedTasks();
    console.log('\n🚀 Dashboard task seeding complete!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { seedTasks, cleanupExistingTasks, createTaskData };