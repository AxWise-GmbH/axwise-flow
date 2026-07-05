/**
 * Mock data generation for testing and fallbacks
 */

import { DetailedAnalysisResult } from './types';

/**
 * Generate mock analyses data for fallback
 */
export function generateMockAnalyses(): DetailedAnalysisResult[] {
  const mockDate = new Date().toISOString();

  return [
    {
      id: 'mock-1',
      fileName: 'example-1.txt',
      fileSize: 2500,
      status: 'completed',
      createdAt: mockDate,
      themes: [
        { id: 1, name: 'User Feedback', frequency: 0.8, keywords: ['feedback', 'review'] }, // Fix ID type
        { id: 2, name: 'Product Features', frequency: 0.5, keywords: ['feature', 'capability'] } // Fix ID type
      ],
      patterns: [
        { id: "1", name: 'Feature Requests', category: 'Enhancement', description: 'Users requesting specific features', frequency: 0.7, count: 10 }, // Add count
        { id: "2", name: 'Pain Points', category: 'Issue', description: 'Common issues users face', frequency: 0.6, count: 8 } // Add count
      ],
      sentiment: [],
      sentimentOverview: {
        positive: 0.5,
        negative: 0.3,
        neutral: 0.2
      },
      // Add mock personas to the analysis results
      personas: [
        {
          name: "Design Lead Alex",
          description: "Alex is an experienced design leader who values user-centered processes and design systems. They struggle with ensuring design quality while meeting business demands and securing resources for proper research.",
          confidence: 0.85,
          patterns: ['Design System Adoption', 'Research Advocacy'], // Add patterns
          evidence: [
            "Manages UX team of 5-7 designers",
            "Responsible for design system implementation"
          ],
          role_context: {
            value: "Design team lead at medium-sized technology company",
            confidence: 0.9,
            evidence: ["Manages UX team of 5-7 designers", "Responsible for design system implementation"]
          },
          key_responsibilities: {
            value: "Oversees design system implementation. Manages team of designers. Coordinates with product and engineering",
            confidence: 0.85,
            evidence: ["Mentioned regular design system review meetings", "Discussed designer performance reviews"]
          },
          tools_used: {
            value: "Figma, Sketch, Adobe Creative Suite, Jira, Confluence",
            confidence: 0.8,
            evidence: ["Referenced Figma components", "Mentioned Jira ticketing system"]
          },
          collaboration_style: {
            value: "Cross-functional collaboration with tight integration between design and development",
            confidence: 0.75,
            evidence: ["Weekly sync meetings with engineering", "Design hand-off process improvements"]
          },
          analysis_approach: {
            value: "Data-informed design decisions with emphasis on usability testing",
            confidence: 0.7,
            evidence: ["Conducts regular user testing sessions", "Analyzes usage metrics to inform design"]
          },
          pain_points: {
            value: "Limited resources for user research. Engineering-driven decision making. Maintaining design quality with tight deadlines",
            confidence: 0.9,
            evidence: ["Expressed frustration about research budget limitations", "Mentioned quality issues due to rushed timelines"]
          }
        },
        {
          name: "Product Owner Jordan",
          description: "Jordan is a product owner who bridges business goals with user needs. Focused on defining priorities and managing stakeholder expectations while advocating for design quality.",
          confidence: 0.8,
          patterns: ['Roadmap Prioritization', 'Metric Tracking'], // Add patterns
          evidence: [
            "Discusses product roadmap planning",
            "Mentiones stakeholder management"
          ],
          role_context: {
            value: "Product Owner with 5+ years experience in SaaS products",
            confidence: 0.85,
            evidence: ["References to SaaS pricing models", "Discussions about subscription features"]
          },
          key_responsibilities: {
            value: "Defining product requirements. Prioritizing features. Managing stakeholder expectations",
            confidence: 0.9,
            evidence: ["Regular references to backlog prioritization", "Stakeholder update meetings"]
          },
          tools_used: {
            value: "Jira, Confluence, Miro, Amplitude, Google Analytics",
            confidence: 0.75,
            evidence: ["Mentioned Jira epic creation", "References to Amplitude dashboards"]
          },
          collaboration_style: {
            value: "Collaborative but directive, ensuring team alignment while providing clear direction",
            confidence: 0.7,
            evidence: ["Team planning sessions", "Decision-making frameworks mentioned"]
          },
          analysis_approach: {
            value: "Data-driven with strong emphasis on business metrics and user feedback",
            confidence: 0.8,
            evidence: ["Regular analysis of conversion metrics", "Customer feedback integration process"]
          },
          pain_points: {
            value: "Balancing technical debt with new features. Managing scope creep. Getting reliable user insights on time",
            confidence: 0.85,
            evidence: ["Expressed concern about technical debt accumulation", "Frustration with changing requirements"]
          }
        }
      ]
    }
  ];
}

/**
 * Generate mock personas data for fallback
 */
export function generateMockPersonas(): any[] {
  return [
    {
      "name": "Design Leader Alex",
      "traits": [
        { "value": "Design team lead at medium-sized technology company", "confidence": 0.9, "evidence": ["Manages UX team of 5-7 designers", "Responsible for design system implementation"] },
        { "value": "8+ years experience in UX/UI design", "confidence": 0.95, "evidence": ["Has worked on enterprise applications", "Mentions experience with design systems"] },
        { "value": "Advocates for user research and testing", "confidence": 0.85, "evidence": ["Pushes for more user testing resources", "Frustrated by decisions made without user input"] }
      ],
      "goals": [
        "Improve design consistency across products",
        "Increase design team influence in product decisions",
        "Implement better research practices"
      ],
      "painPoints": [
        "Limited resources for user research",
        "Engineering-driven decision making",
        "Maintaining design quality with tight deadlines"
      ],
      "description": "Alex is an experienced design leader who values user-centered processes and design systems. They struggle with ensuring design quality while meeting business demands and securing resources for proper research."
    }
  ];
}
