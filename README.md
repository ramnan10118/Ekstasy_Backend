# Ekstacy Backend

Secure serverless backend for the Ekstacy Figma grammar checking plugin.

## Features

- 🔐 **Secure API Key Storage**: OpenAI API key stored safely in Vercel environment variables
- ⚡ **Batch Processing**: Handles multiple text layers with parallel processing
- 🛡️ **CORS Support**: Properly configured for Figma plugin access
- 📊 **Request Validation**: Validates incoming requests and handles errors gracefully
- 🚀 **Serverless**: Zero-maintenance deployment on Vercel

## Deployment Instructions

### 1. Upload to GitHub

1. Create a new repository on GitHub called `ekstacy-backend`
2. Upload this entire folder to the repository:
   ```bash
   git init
   git add .
   git commit -m "Initial backend setup"
   git remote add origin https://github.com/YOUR_USERNAME/ekstacy-backend.git
   git push -u origin main
   ```

### 2. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"New Project"**
3. Import your `ekstacy-backend` GitHub repository
4. Click **"Deploy"**
5. Wait for deployment to complete

### 3. Add Environment Variables

1. In your Vercel dashboard, go to your deployed project
2. Click **"Settings"** → **"Environment Variables"**
3. Add this variable:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: Your actual OpenAI API key (e.g., `sk-...`)
4. Click **"Save"**

### 4. Get Your Backend URL

After deployment, Vercel will give you a URL like:
`https://ekstacy-backend-abc123.vercel.app`

### 5. Update Your Plugin

Update these files in your Figma plugin:

**In `src/ai-service.ts` (line 245):**
```javascript
const response = await fetch('https://YOUR_ACTUAL_URL.vercel.app/api/grammar-check', {
```

**In `manifest.json`:**
```json
{
  "networkAccess": {
    "allowedDomains": [
      "https://YOUR_ACTUAL_URL.vercel.app"
    ]
  }
}
```

### 6. Test the Plugin

1. Build your plugin: `npm run build`
2. Load it in Figma
3. Test grammar checking functionality

## API Endpoint

**POST** `/api/grammar-check`

**Request Body:**
```json
{
  "textLayers": [
    {
      "id": "layer-id",
      "name": "Layer Name", 
      "text": "Text to check",
      "issues": []
    }
  ],
  "batchConfig": {
    "concurrency": 4,
    "delay": 200
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "layer-id",
      "name": "Layer Name",
      "text": "Text to check", 
      "issues": [
        {
          "id": "layer-id-0",
          "layerId": "layer-id",
          "layerName": "Layer Name",
          "originalText": "Text to check",
          "issueText": "problematic word",
          "suggestion": "correction",
          "type": "spelling",
          "confidence": 0.9,
          "position": {"start": 0, "end": 5},
          "status": "pending"
        }
      ]
    }
  ],
  "stats": {
    "totalLayers": 1,
    "processedLayers": 1, 
    "totalIssues": 1
  }
}
```

## Security Benefits

✅ **API Key Protection**: OpenAI key never exposed to client-side code  
✅ **CORS Security**: Only allows requests from Figma plugin domains  
✅ **Rate Limiting**: Natural rate limiting through Vercel's infrastructure  
✅ **Request Validation**: Validates all incoming requests  

## Support

If you encounter any issues:
1. Check Vercel function logs in your dashboard
2. Verify environment variables are set correctly
3. Ensure your plugin is using the correct backend URL