# Demo Files Directory

This directory contains all demonstration and testing code that is **isolated from production code**.

## Structure

### `/a2a-event-bus/`
Complete A2A Event Bus demonstration showcasing multi-agent coordination.

- **`agents/`** - Demo agent implementations (BusinessDiscoveryAgent, ComplianceAnalyzer)
- **`api/`** - Original demo API endpoints (for reference only)
- **`scripts/`** - Demo runner scripts and documentation
- **`templates/`** - Task templates for demo scenarios

### `/onboarding-e2e-demo.ts`** & `/run-onboarding-demo.js`
Original onboarding demonstration files.

## Important Notes

### Production Integration
The A2A Event Bus demo is integrated into the Dev Toolkit Agent Visualizer through:
- **Production API**: `src/api/a2a-demo.ts` (self-contained, no external dependencies)
- **Frontend Component**: `src/components/dev/A2AEventBusDemo.tsx` (in frontend repo)

### Code Isolation
- **Demo code lives here** - Outside production `src/` structure
- **Production code**: Uses isolated `src/api/a2a-demo.ts` that simulates demo functionality
- **No imports**: Production code NEVER imports from this `demos/` directory

## Usage

### A2A Event Bus Demo
The demo is accessible through the Dev Toolkit:
1. Open app in development mode
2. Navigate to Dev Toolkit > Agent Visualizer
3. Click "A2A Demo" tab
4. Start demo session to see real-time multi-agent coordination

### Running Standalone Demo Scripts
```bash
# From this directory
cd demos/a2a-event-bus/scripts/
node run-a2a-demo-simple.js
```

## Architecture

The demo showcases:
- **Real Agent Coordination**: Multi-agent workflow through A2A Event Bus
- **Live Event Streaming**: Server-Sent Events for real-time updates
- **Event Persistence**: Complete session and event history
- **Multi-Agent Workflows**: BusinessDiscoveryAgent → ComplianceAnalyzer coordination

This demonstrates the A2A Event Bus architecture while maintaining complete separation from production code.