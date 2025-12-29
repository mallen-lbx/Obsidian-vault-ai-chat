export type NoteType = 'summary' | 'analysis' | 'outline' | 'study-guide' | 'action-items';

export interface EnhancedNoteRequest {
  topic: string;
  sourceFiles: string[];
  noteType: NoteType;
}

const TYPE_INSTRUCTIONS: Record<NoteType, string> = {
  'summary': `Create a comprehensive summary with:
- Key points and main ideas
- Important details and examples
- Connections between concepts
- A brief conclusion`,

  'analysis': `Provide an analytical note with:
- Critical examination of the content
- Strengths and weaknesses of arguments or ideas
- Your interpretations and insights
- Questions for further exploration
- Connections to broader themes`,

  'outline': `Create a structured outline with:
- Hierarchical organization (headers, sub-points)
- Logical flow of ideas
- Key terms and definitions
- Bullet points for easy scanning
- Action items or next steps if applicable`,

  'study-guide': `Create a study guide with:
- Key concepts to understand
- Important terms and definitions
- Review questions (with brief answers)
- Summary of main takeaways
- Suggested areas for deeper study`,

  'action-items': `Extract and organize action items with:
- Clear task descriptions
- Checkboxes for tracking (using - [ ] format)
- Assignees if mentioned
- Due dates if mentioned
- Priority indicators if apparent
- Grouped by project or category if applicable`
};

/**
 * Build a prompt for enhanced note generation
 */
export function buildEnhancePrompt(
  request: EnhancedNoteRequest,
  sourceContent: string
): string {
  const typeInstruction = TYPE_INSTRUCTIONS[request.noteType];
  
  return `Based on the following source material from my notes, create an enhanced ${request.noteType} note about "${request.topic}".

## Source Material

${sourceContent}

## Instructions

${typeInstruction}

## Output Format

Format the output as a complete Markdown note ready to save. Include:
1. A clear title as H1 (# Title)
2. Frontmatter with:
   - tags relevant to the content
   - source links using [[Note Name]] format
   - date created
3. Well-organized sections with appropriate headers
4. Wiki-links to source notes where relevant using [[Note Name]] format

Begin the note now:`;
}

/**
 * Build a prompt for topic summarization across vault
 */
export function buildTopicSummaryPrompt(topic: string): string {
  return `Summarize everything you know about "${topic}" based on the provided context from my notes vault.

Structure your response as:
1. **Overview**: A brief 2-3 sentence overview
2. **Key Points**: The most important information about this topic
3. **Details**: Relevant details and examples
4. **Connections**: How this topic relates to other topics in the notes
5. **Sources**: List the notes you referenced using [[Note Name]] format

Be concise but thorough. If the context doesn't contain much information about this topic, say so.`;
}

/**
 * Build a prompt for Q&A about vault content
 */
export function buildQAPrompt(question: string): string {
  return `Answer the following question based on my notes vault:

"${question}"

Instructions:
- Answer based on the provided context
- Cite sources using [[Note Name]] format
- If the answer isn't in the context, say so clearly
- Be concise and direct`;
}
