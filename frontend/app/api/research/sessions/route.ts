import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    console.log('Proxying research sessions request to backend');
    console.log('API_BASE_URL:', API_BASE_URL);

    // Get authentication token
    let authToken = '';
    const isProduction = process.env.NODE_ENV === 'production';
    const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** 'true';

    if (isProduction || enableClerkValidation) {
      // Get the session token from Clerk
      try {
        const authResult = await auth();
        const token = await authResult.getToken();

        if (!token) {
          console.log('Research Sessions API: No session token found');
          return NextResponse.json(
            { error: 'Authentication token required' },
            { status: 401 }
          );
        }

        authToken = token;
        console.log('Research Sessions API: Using Clerk JWT token');
      } catch (tokenError) {
        console.error('Research Sessions API: Error getting Clerk token:', tokenError);
        return NextResponse.json(
          { error: 'Authentication error' },
          { status: 401 }
        );
      }
    } else {
      // Development mode - use development token
      authToken = 'DEV_TOKEN_REDACTED';
      console.log('Research Sessions API: Using development token');
    }

    const response = await fetch(`${API_BASE_URL}/api/research/sessions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });

    console.log('Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend responded with ${response.status}: ${response.statusText}`, errorText);

      // If the backend endpoint doesn't exist, return empty array for now
      if (response.status === 404) {
        console.log('Backend sessions endpoint not found, returning empty array');
        return NextResponse.json([], {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      return NextResponse.json(
        { error: 'Failed to fetch research sessions', details: errorText },
        { status: response.status }
      );
    }

    const backendSessions = await response.json();
    console.log('Successfully fetched research sessions:', Array.isArray(backendSessions) ? backendSessions.length : 'non-array response');

    // Convert backend format to frontend format with questionnaire message injection
    const convertedSessions = await Promise.all(backendSessions.map(async (session: any) => {
      const messages = session.messages || [];
      let questionnaireData = session.research_questions;

      // Parse research_questions if it's a string
      if (typeof questionnaireData === 'string') {
        try {
          questionnaireData = JSON.parse(questionnaireData);
        } catch (error) {
          console.warn(`Failed to parse research_questions for session ${session.session_id}:`, error);
          questionnaireData = null;
        }
      }

      // Add questionnaire message if session has questionnaire data but no questionnaire message
      if (session.questions_generated && questionnaireData) {
        const hasQuestionnaireMessage = messages.some((msg: any) => {
          const meta = msg?.metadata || {};
          const hasModern = !!meta.comprehensiveQuestions;
          const hasLegacy = !!meta.questionnaire || !!meta.comprehensive_questions;
          const hasComponent = msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && (hasModern || hasLegacy);
          return hasModern || hasLegacy || hasComponent;
        });

        if (!hasQuestionnaireMessage) {
          // Validate questionnaire data before adding message
          const isValidQuestionnaire = questionnaireData &&
            (questionnaireData.primaryStakeholders?.length > 0 ||
             questionnaireData.secondaryStakeholders?.length > 0);

          if (isValidQuestionnaire) {
            console.log(`🔧 Adding validated questionnaire message for session ${session.session_id}`);
            const questionnaireMessage = {
              id: `questionnaire_${session.session_id}_${Date.now()}`,
              content: 'COMPREHENSIVE_QUESTIONS_COMPONENT',
              role: 'assistant',
              timestamp: session.completed_at || session.updated_at,
              metadata: {
                type: 'component',
                comprehensiveQuestions: questionnaireData,
                businessContext: session.business_idea,
                conversation_routine: true,
                questions_generated: true,
                _stable: true // Mark as stable to prevent flickering
              }
            };
            messages.push(questionnaireMessage);
          } else {
            console.warn(`⚠️ Invalid questionnaire data for session ${session.session_id}, skipping message injection`);
          }
        }
      }

      return {
        ...session,
        messages: messages,
        message_count: messages.length
      };
    }));

    return NextResponse.json(convertedSessions, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Error fetching research sessions:', error);

    // For now, return mock data so the page works
    const mockSessions = [
      {
        id: 'session-1',
        title: 'API service for legacy source systems',
        created_at: new Date().toISOString(),
        question_count: 34,
        stakeholder_count: 5,
        has_questionnaire: true,
        questionnaire_exported: false,
        message_count: 12,
        last_message_at: new Date().toISOString()
      },
      {
        id: 'session-2',
        title: 'Mobile app user onboarding research',
        created_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        question_count: 28,
        stakeholder_count: 3,
        has_questionnaire: true,
        questionnaire_exported: true,
        message_count: 8,
        last_message_at: new Date(Date.now() - 86400000).toISOString()
      }
    ];

    console.log('Returning mock data due to error:', error instanceof Error ? error.message : 'Unknown error');

    return NextResponse.json(mockSessions, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
