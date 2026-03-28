# MCP Services Setup Guide

This guide explains how to connect and use Figma MCP and Playwright MCP services with Windsurf IDE.

## Overview

### Figma MCP Server
- **Purpose**: Brings Figma directly into your workflow for design-informed code generation
- **Type**: Remote server (hosted by Figma)
- **Features**:
  - Read Figma files and extract design context
  - Generate code from selected frames
  - Write to Figma canvas (create/modify content)
  - Access variables, components, and layout data
  - Integration with Figma Code Connect

### Playwright MCP Server
- **Purpose**: Browser automation for testing and interaction
- **Type**: STDIO server (runs locally via npx)
- **Features**:
  - Navigate to URLs
  - Click elements and type text
  - Take screenshots
  - Get accessibility tree for page analysis
  - Automated browser testing

## Configuration

The MCP configuration is stored in `.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "figma": {
      "type": "remote",
      "url": "https://mcp.figma.com",
      "disabled": false
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "timeout": 30,
      "disabled": false
    }
  }
}
```

## Setup Instructions

### 1. Playwright MCP (Auto-installs)
The Playwright MCP server installs automatically when first used via npx. No manual installation required.

**Prerequisites:**
- Node.js 18 or newer
- npx (comes with npm)

**First run will:**
- Download Playwright MCP package
- Install required browsers (Chromium, Firefox, WebKit)

### 2. Figma MCP Setup

**Step 1: Get Figma Access Token**
1. Go to Figma → Settings → Personal Access Tokens
2. Generate a new token with these scopes:
   - `file_read` - Read files and designs
   - `file_write` - Write to canvas (if needed)
   - `code_connect` - Access Code Connect resources

**Step 2: Configure Environment**
Add your token to `.env`:
```
FIGMA_ACCESS_TOKEN=your_token_here
```

**Step 3: Verify Connection**
The Figma MCP server connects to `https://mcp.figma.com` and authenticates via your access token.

## Using MCP Services

### Playwright MCP Tools

| Tool | Description | Example Usage |
|------|-------------|---------------|
| `browser_navigate` | Navigate to URL | "Navigate to localhost:3000" |
| `browser_click` | Click element | "Click the submit button" |
| `browser_type` | Type into field | "Type 'hello' in the search box" |
| `browser_screenshot` | Take screenshot | "Take a screenshot of the page" |
| `browser_get_accessibility_tree` | Get page structure | "Analyze the page structure" |

### Figma MCP Tools

| Tool | Description | Example Usage |
|------|-------------|---------------|
| `get_file` | Read Figma file | "Get file abc123def" |
| `get_file_nodes` | Get specific nodes | "Get nodes from frame Dashboard" |
| `write_to_canvas` | Create/modify content | "Add a rectangle to the canvas" |
| `generate_code` | Generate code from frame | "Generate React code from Login page" |

## Example Workflows

### Design-to-Code Workflow
1. Use Figma MCP to read a design file
2. Extract component structure and styles
3. Generate corresponding code
4. Use Playwright MCP to test the implementation

### Testing Workflow
1. Start your development server
2. Use Playwright MCP to navigate to the app
3. Interact with elements (click, type)
4. Take screenshots for visual regression
5. Verify accessibility tree

## Troubleshooting

### Playwright Issues
- **Browsers not found**: Run `npx playwright install`
- **Timeout errors**: Increase timeout in mcp.json
- **Connection refused**: Check if port is available

### Figma Issues
- **Authentication failed**: Verify access token is valid
- **File not found**: Check file permissions and URL
- **Rate limiting**: Reduce request frequency

## Resources

- [Figma MCP Documentation](https://developers.figma.com/docs/figma-mcp-server/)
- [Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
