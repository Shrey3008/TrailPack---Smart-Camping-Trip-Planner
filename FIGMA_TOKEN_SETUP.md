# Figma Access Token Setup Guide

## Step-by-Step Instructions

### Step 1: Go to Figma Settings
1. Open your browser and go to: https://www.figma.com/settings/personal-access-tokens
2. Log in to your Figma account if not already logged in

### Step 2: Create New Token
1. Click the **"Create new token"** button
2. Enter a name for your token (e.g., "TrailPack MCP" or "Windsurf IDE")
3. Optionally add an expiration date (recommended for security)
4. Click **"Create token"**

### Step 3: Copy Your Token
1. **IMPORTANT**: Copy the token immediately - you won't be able to see it again!
2. The token will look something like: `figd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
3. Store it securely (password manager recommended)

### Step 4: Add Token to Your Project
1. Open the `.env` file in your TrailPack project
2. Find the line: `FIGMA_ACCESS_TOKEN=your_figma_access_token_here`
3. Replace `your_figma_access_token_here` with your actual token
4. Save the file

Example:
```
FIGMA_ACCESS_TOKEN=figd_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
```

### Step 5: Restart Windsurf IDE
1. Close and reopen Windsurf IDE to load the new environment variables
2. The Figma MCP server should now be able to authenticate

## Token Scopes Required

For the Figma MCP server to work properly, your token needs these scopes:

- ✅ **File content**: Read files and design content
- ✅ **Dev resources**: Access Code Connect resources (optional but recommended)
- ✅ **Write files**: Modify files on canvas (only if you want write capabilities)

## Security Best Practices

1. **Never commit .env file to GitHub** - it's already in `.gitignore`
2. **Set an expiration date** - Figma allows 1 month to 1 year
3. **Revoke unused tokens** - delete tokens you no longer need
4. **Use different tokens for different projects** - don't reuse across multiple projects

## Troubleshooting

### "Authentication failed" Error
- Verify token is copied correctly (no extra spaces)
- Check if token has expired
- Ensure token has the required scopes

### "File not found" Error
- Make sure the Figma file is accessible to your account
- Check file permissions (must be owned by you or shared with you)
- Verify the file URL is correct

### Token Not Working
1. Go back to https://www.figma.com/settings/personal-access-tokens
2. Find your token and click **"Revoke"**
3. Create a new token following the steps above

## Quick Check

After setup, verify the token works by:
1. Opening Windsurf IDE
2. The MCP services panel should show Figma as "Connected"
3. Try asking: "Read Figma file [your-file-id]"

## Need Help?

- Figma Help: https://help.figma.com/
- MCP Documentation: https://developers.figma.com/docs/figma-mcp-server/
