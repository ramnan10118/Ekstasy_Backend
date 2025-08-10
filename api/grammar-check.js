export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate request body
    const { textLayers, batchConfig } = req.body;
    
    if (!textLayers || !Array.isArray(textLayers)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request: textLayers array required' 
      });
    }

    console.log(`Processing ${textLayers.length} text layers`);

    // Filter layers with valid text content
    const validLayers = textLayers.filter(layer => 
      layer.text && layer.text.trim() && isValidForChecking(layer.text)
    );

    if (validLayers.length === 0) {
      console.log('No valid text content to process');
      return res.status(200).json({
        success: true,
        data: textLayers.map(layer => ({ ...layer, issues: [] }))
      });
    }

    // Process layers in parallel batches
    const CONCURRENT_REQUESTS = batchConfig?.concurrency || 4;
    const DELAY_BETWEEN_BATCHES = batchConfig?.delay || 200;
    
    const processedLayers = await processLayersInParallel(
      validLayers, 
      CONCURRENT_REQUESTS, 
      DELAY_BETWEEN_BATCHES
    );

    // Map results back to all original layers
    const finalLayers = textLayers.map(originalLayer => {
      const processedLayer = processedLayers.find(p => p.id === originalLayer.id);
      return processedLayer || { ...originalLayer, issues: [] };
    });

    console.log(`Completed processing: ${finalLayers.reduce((sum, l) => sum + l.issues.length, 0)} total issues found`);

    res.status(200).json({
      success: true,
      data: finalLayers,
      stats: {
        totalLayers: textLayers.length,
        processedLayers: validLayers.length,
        totalIssues: finalLayers.reduce((sum, l) => sum + l.issues.length, 0)
      }
    });

  } catch (error) {
    console.error('Grammar check failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Grammar check failed',
      details: error.message 
    });
  }
}

// Helper function to validate text content
function isValidForChecking(text) {
  if (!text || text.length < 2) return false;
  if (/^[\d\s\-_.,!@#$%^&*()+=\[\]{}|\\:";'<>?/`~]*$/.test(text)) return false;
  return true;
}

// Process layers in parallel batches
async function processLayersInParallel(layers, concurrency, delay) {
  const batches = [];
  for (let i = 0; i < layers.length; i += concurrency) {
    batches.push(layers.slice(i, i + concurrency));
  }

  const results = [];
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} layers)`);
    
    const batchPromises = batch.map(layer => processSingleLayer(layer));
    const batchResults = await Promise.all(batchPromises);
    
    results.push(...batchResults);
    
    // Add delay between batches (except for last batch)
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
}

// Process a single text layer
async function processSingleLayer(textLayer) {
  try {
    if (!textLayer.text || !textLayer.text.trim()) {
      return { ...textLayer, issues: [] };
    }

    // Create focused system prompt for individual text analysis
    const systemPrompt = `You are a professional grammar and spell checker. Analyze the following single text for ALL grammar, spelling, and punctuation errors.

CRITICAL REQUIREMENTS:
- Find EVERY spelling mistake, no matter how obvious (e.g., "Dsh" should be "Dash", "chking" should be "checking")
- Find EVERY grammar error (subject-verb agreement, tense errors, etc.)
- Find EVERY punctuation error (missing commas, periods, apostrophes, capitalization)
- DO NOT flag style issues - only real grammar, spelling, and punctuation mistakes
- Even simple typos MUST be detected and reported
- Be thorough and consistent

Return valid JSON in this exact format:
{
  "issues": [
    {
      "originalText": "full original text",
      "issueText": "the problematic word/phrase",
      "suggestion": "corrected version",
      "type": "grammar|spelling|punctuation", 
      "confidence": 0.9,
      "position": {
        "start": 0,
        "end": 5
      }
    }
  ]
}

IMPORTANT:
- Return empty array ONLY if text is genuinely perfect
- NEVER use placeholder corrections like "(corrected)" or "[fixed]"
- Be precise with character positions (0-indexed)
- Suggestions must be real words, not placeholders`;

    const userPrompt = `Analyze this text for grammar, spelling, and punctuation errors: "${textLayer.text}"`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.1,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI API error for layer ${textLayer.id}:`, response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    const aiContent = result.choices[0]?.message?.content;
    
    if (!aiContent) {
      throw new Error('No content received from OpenAI');
    }

    // Parse JSON response
    let grammarResult;
    try {
      const cleanedContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      grammarResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Failed to parse OpenAI JSON response:', parseError);
      throw new Error('Invalid JSON response from OpenAI');
    }

    // Convert results to TextIssue format
    const issues = (grammarResult.issues || [])
      .filter(issue => {
        // Filter out style errors and invalid suggestions
        if (issue.type === 'style') return false;
        
        const suggestion = issue.suggestion || '';
        const issueText = issue.issueText || '';
        
        // Skip invalid suggestions
        if (suggestion.includes('(mock correction)') || 
            suggestion.includes('(corrected)') || 
            suggestion.includes('[correction]') ||
            suggestion.includes('placeholder') ||
            suggestion.includes('mock') ||
            suggestion === issueText) {
          return false;
        }
        
        return true;
      })
      .map((issue, index) => ({
        id: `${textLayer.id}-${index}`,
        layerId: textLayer.id,
        layerName: textLayer.name,
        originalText: issue.originalText || textLayer.text,
        issueText: issue.issueText,
        suggestion: issue.suggestion,
        type: issue.type,
        confidence: issue.confidence || 0.9,
        position: issue.position || { start: 0, end: issue.issueText?.length || 0 },
        status: 'pending'
      }));

    console.log(`Found ${issues.length} issues in "${textLayer.text.substring(0, 50)}..."`);
    return { ...textLayer, issues };

  } catch (error) {
    console.error(`Processing failed for layer ${textLayer.id}:`, error);
    return { ...textLayer, issues: [] };
  }
}