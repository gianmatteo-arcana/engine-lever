# E2E Real Orchestration Proof Test

This test demonstrates that REAL orchestration is happening in the Real-Time Agent Visualizer with actual event sourcing to the database, not mock data.

## What This Test Does

1. **User Management**: Deletes any existing test user (`gianmatteo.allyn.test@gmail.com`) and creates a fresh one
2. **Authentication**: Authenticates the test user 
3. **Navigation**: Navigates to the Real-Time Agent Visualizer tab
4. **Orchestration**: Clicks "Start New Onboarding" and waits for real orchestration to begin
5. **Documentation**: Takes comprehensive screenshots showing:
   - Initial onboarding task creation
   - Events appearing in the context history
   - Agent activities in progress
   - Task timeline with real events
   - Final orchestration state

## Prerequisites

1. **Frontend Running**: The frontend must be running at `http://localhost:5173`
2. **Backend Running**: The backend must be running and connected to the database
3. **Database Access**: The system must have access to Supabase for real event sourcing

## Running the Test

### Using npm scripts:
```bash
npm run test:e2e
# or
npm run test:orchestration
```

### Direct execution:
```bash
node e2e-real-orchestration-proof.js
```

## Test Configuration

The test can be configured by modifying the `TEST_CONFIG` object in the script:

```javascript
const TEST_CONFIG = {
  frontendUrl: 'http://localhost:5173',
  testUserEmail: 'gianmatteo.allyn.test@gmail.com',
  screenshotDir: path.join(__dirname, 'test-results'),
  timeouts: {
    pageLoad: 30000,
    elementWait: 15000,
    orchestrationWait: 60000, // Wait up to 1 minute for orchestration
    eventWait: 10000
  }
};
```

## Screenshots Captured

The test saves timestamped screenshots to the `test-results/` directory:

1. `page-loaded.png` - Dev toolkit page loaded
2. `before-start-onboarding.png` - Real-Time Agent Visualizer before starting
3. `onboarding-started.png` - Immediately after clicking Start New Onboarding
4. `orchestration-initial.png` - Initial orchestration state
5. `task-creation.png` - Initial onboarding task creation
6. `context-history-events.png` - Events appearing in context history
7. `agent-activities.png` - Agent activities in progress
8. `task-timeline-events.png` - Task timeline with real events
9. `final-orchestration-state.png` - Final state showing real event sourcing

## What This Proves

- **Real Database Operations**: Screenshots show actual tasks being created in the database
- **Live Event Sourcing**: Context history shows real events being recorded
- **Active Agent Orchestration**: Agent activities demonstrate real processing
- **Timeline Updates**: Task timeline shows genuine progress over time
- **No Mock Data**: All displayed information comes from actual database queries

## Browser Configuration

The test runs with:
- **Headless**: `false` (visible browser for verification)
- **Resolution**: 1920x1080 for full visibility
- **Console Logging**: Captures browser console for debugging
- **Error Handling**: Takes error screenshots if the test fails

## Troubleshooting

### Common Issues:

1. **Frontend Not Running**: Ensure `npm run dev` is running in the frontend repo
2. **Backend Not Running**: Ensure the backend is running and connected to Supabase
3. **Element Not Found**: The test includes multiple selector strategies for robustness
4. **Timeout Errors**: Increase timeout values in `TEST_CONFIG` if needed
5. **Browser Issues**: Install/update Chromium: `npx puppeteer install`

### Debug Information:

- Error screenshots are saved to `test-results/error-state.png`
- Page HTML content is saved to `test-results/error-page-content.html`
- Browser console errors are logged to the terminal

## Success Criteria

The test is successful if:
- ✅ All screenshots are captured without errors
- ✅ Screenshots show actual UI elements (not loading states)
- ✅ Context history contains real events
- ✅ Task timeline shows progression over time
- ✅ Agent activities indicate real processing

This test provides visual proof that the Real-Time Agent Visualizer is connected to real backend orchestration, not displaying mock data.