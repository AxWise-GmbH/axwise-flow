/**
 * Browser console helper for testing research context extraction
 *
 * Usage in browser console:
 * 1. Load this script:
 *    const script = document.createElement('script'); script.src = '/cleanup-helper.js'; document.head.appendChild(script);
 * 2. Run: testCleanup()
 * 3. Or run: forceCleanupAll()
 */

window.ResearchCleanupHelper = {
    STORAGE_KEYS: {
        sessions: 'axwise_research_sessions',
        currentSession: 'axwise_current_research_session',
        userId: 'axwise_anonymous_user_id'
    },

    log: function(message, type = 'info') {
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`${prefix} ${message}`);
    },

    getSessions: function() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.sessions);
            if (!stored) return [];

            const sessions = JSON.parse(stored);
            return Array.isArray(sessions) ? sessions : Object.values(sessions);
        } catch (error) {
            this.log(`Error reading sessions: ${error.message}`, 'error');
            return [];
        }
    },

    showSessions: function() {
        const sessions = this.getSessions();

        if (sessions.length === 0) {
            this.log('No sessions found in localStorage');
            return;
        }

        this.log(`Found ${sessions.length} sessions:`);

        sessions.forEach((session, index) => {
            const hasBusinessIdea = session.business_idea && session.business_idea.trim();
            const hasTargetCustomer = session.target_customer && session.target_customer.trim();
            const hasProblem = session.problem && session.problem.trim();
            const hasMessages = session.messages && session.messages.length > 0;

            console.log(`\n--- Session ${index + 1}: ${session.session_id} ---`);
            console.log(`Business Idea: ${hasBusinessIdea ? session.business_idea : 'EMPTY'}`);
            console.log(`Target Customer: ${hasTargetCustomer ? session.target_customer : 'EMPTY'}`);
            console.log(`Problem: ${hasProblem ? session.problem : 'EMPTY'}`);
            console.log(`Messages: ${hasMessages ? session.messages.length : 0}`);
            console.log(`Questions Generated: ${session.questions_generated ? 'Yes' : 'No'}`);
        });
    },

    extractContextFromCleanedMessages: function(messages) {
        this.log(`🔍 CONTEXT EXTRACTION: Analyzing ${messages.length} messages for business context`);

        let target_customer = '';
        let problem = '';

        // Strategy 1: Look for assistant-user question-answer pairs with expanded patterns
        for (let i = 0; i < messages.length - 1; i++) {
            const currentMsg = messages[i];
            const nextMsg = messages[i + 1];

            if (currentMsg.role === 'assistant' && nextMsg.role === 'user') {
                const assistantContent = currentMsg.content.toLowerCase();
                const userResponse = nextMsg.content.trim();

                console.log(`🔍 Checking assistant question: "${assistantContent.substring(0, 100)}..."`);
                console.log(`🔍 User response: "${userResponse.substring(0, 100)}..."`);

                // Expanded patterns for target customer questions
                const targetCustomerPatterns = [
                    'target customer', 'who specifically', 'who would be your', 'who are you targeting',
                    'who is your audience', 'who would use', 'who would benefit', 'who are your customers',
                    'what type of customers', 'which customers', 'customer segment', 'target market',
                    'who would pay', 'who needs this', 'primary users', 'ideal customer'
                ];

                const isTargetCustomerQuestion = targetCustomerPatterns.some(pattern =>
                    assistantContent.includes(pattern)
                );

                if (isTargetCustomerQuestion && userResponse.length > 10) {
                    target_customer = userResponse;
                    this.log(`✅ EXTRACTED target_customer from Q&A: "${target_customer}"`, 'success');
                }

                // Expanded patterns for problem/pain point questions
                const problemPatterns = [
                    'pain point', 'problem', 'what\'s the main', 'challenge', 'difficulty',
                    'issue', 'struggle', 'frustration', 'what bothers', 'what\'s wrong',
                    'what needs fixing', 'what\'s broken', 'inefficiency', 'bottleneck',
                    'what\'s missing', 'gap in the market', 'unmet need'
                ];

                const isProblemQuestion = problemPatterns.some(pattern =>
                    assistantContent.includes(pattern)
                );

                if (isProblemQuestion && userResponse.length > 10) {
                    problem = userResponse;
                    this.log(`✅ EXTRACTED problem from Q&A: "${problem}"`, 'success');
                }
            }
        }

        // Strategy 2: Look for business context keywords in all user messages
        if (!target_customer || !problem) {
            this.log(`🔍 FALLBACK EXTRACTION: Looking for business context in all user messages`);

            for (const msg of messages) {
                if (msg.role === 'user') {
                    const content = msg.content.toLowerCase();
                    const originalContent = msg.content.trim();

                    // Look for target customer indicators in user messages
                    if (!target_customer) {
                        // Look for sentences that describe target customers
                        const customerSentencePatterns = [
                            /(.{0,50})(smes?|small businesses?|enterprises?|companies|agencies|startups|retailers|restaurants|clinics|hospitals|schools|universities|developers|designers|consultants|freelancers|professionals)(.{0,100})/i,
                            /(target|serve|help|work with|focus on)(.{0,100})/i
                        ];

                        for (const pattern of customerSentencePatterns) {
                            const match = originalContent.match(pattern);
                            if (match && match[0].length > 20) {
                                target_customer = match[0].trim();
                                this.log(`✅ EXTRACTED target_customer from context: "${target_customer}"`, 'success');
                                break;
                            }
                        }
                    }

                    // Look for problem indicators in user messages
                    if (!problem) {
                        const problemIndicators = [
                            'outdated', 'manual', 'inefficient', 'slow', 'expensive', 'difficult',
                            'time-consuming', 'error-prone', 'unreliable', 'lacking', 'missing',
                            'broken', 'frustrating', 'complicated', 'confusing'
                        ];

                        const hasProblemContext = problemIndicators.some(indicator =>
                            content.includes(indicator)
                        );

                        if (hasProblemContext && originalContent.length > 20) {
                            // Extract sentences that describe problems
                            const problemSentencePatterns = [
                                /(.{0,100})(outdated|manual|inefficient|slow|expensive|difficult|time-consuming|error-prone|unreliable|lacking|missing|broken|frustrating|complicated|confusing)(.{0,100})/i,
                                /(problem|issue|challenge|difficulty|struggle|pain|frustration)(.{0,100})/i
                            ];

                            for (const pattern of problemSentencePatterns) {
                                const match = originalContent.match(pattern);
                                if (match && match[0].length > 15) {
                                    problem = match[0].trim();
                                    this.log(`✅ EXTRACTED problem from context: "${problem}"`, 'success');
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Strategy 3: Look for comprehensive business descriptions in longer user messages
        if (!target_customer || !problem) {
            this.log(`🔍 COMPREHENSIVE EXTRACTION: Looking for detailed business descriptions`);

            for (const msg of messages) {
                if (msg.role === 'user' && msg.content.length > 50) {
                    const content = msg.content.trim();

                    // If this message contains business context keywords and is substantial
                    const businessKeywords = [
                        'business', 'company', 'service', 'product', 'customers', 'clients',
                        'market', 'industry', 'solution', 'platform', 'system', 'application'
                    ];

                    const hasBusinessContext = businessKeywords.some(keyword =>
                        content.toLowerCase().includes(keyword)
                    );

                    if (hasBusinessContext) {
                        // Extract the most relevant parts for target customer and problem
                        if (!target_customer && content.length > 30) {
                            // Look for customer-related sentences
                            const sentences = content.split(/[.!?]+/);
                            for (const sentence of sentences) {
                                const lowerSentence = sentence.toLowerCase();
                                if ((lowerSentence.includes('customer') || lowerSentence.includes('client') ||
                                     lowerSentence.includes('business') || lowerSentence.includes('company') ||
                                     lowerSentence.includes('agency') || lowerSentence.includes('sme')) &&
                                    sentence.trim().length > 20) {
                                    target_customer = sentence.trim();
                                    this.log(`✅ EXTRACTED target_customer from business description: "${target_customer}"`, 'success');
                                    break;
                                }
                            }
                        }

                        if (!problem && content.length > 30) {
                            // Look for problem-related sentences
                            const sentences = content.split(/[.!?]+/);
                            for (const sentence of sentences) {
                                const lowerSentence = sentence.toLowerCase();
                                if ((lowerSentence.includes('problem') || lowerSentence.includes('issue') ||
                                     lowerSentence.includes('challenge') || lowerSentence.includes('difficult') ||
                                     lowerSentence.includes('outdated') || lowerSentence.includes('manual') ||
                                     lowerSentence.includes('inefficient')) &&
                                    sentence.trim().length > 15) {
                                    problem = sentence.trim();
                                    this.log(`✅ EXTRACTED problem from business description: "${problem}"`, 'success');
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        this.log(`🔍 FINAL EXTRACTION RESULTS:`);
        this.log(`   target_customer: "${target_customer}"`);
        this.log(`   problem: "${problem}"`);

        return { target_customer, problem };
    },

    extractBusinessIdeaFromMessage: function(content) {
        const patterns = [
            /i want to open (.+)/i,
            /i want to create (.+)/i,
            /i want to start (.+)/i
        ];

        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }

        return content;
    },

    fixMixedContentInSession: function(session) {
        if (!Array.isArray(session.messages) || session.messages.length === 0) {
            return session;
        }

        // Detect mixed business contexts by looking for multiple business idea introductions
        const businessIntroMessages = session.messages.filter(msg =>
            msg.role === 'user' && (
                msg.content.toLowerCase().includes('i want to open') ||
                msg.content.toLowerCase().includes('i want to create') ||
                msg.content.toLowerCase().includes('i want to start')
            )
        );

        // If there are multiple business introductions, this indicates mixed content
        if (businessIntroMessages.length > 1) {
            this.log(`🚨 MIXED CONTENT DETECTED: Found ${businessIntroMessages.length} different business conversations in session ${session.session_id}`, 'warning');

            // Find the most recent business conversation by timestamp
            const sortedBusinessMessages = businessIntroMessages.sort((a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            const latestBusinessMessage = sortedBusinessMessages[0];
            const latestBusinessTimestamp = new Date(latestBusinessMessage.timestamp);

            this.log(`🔧 Keeping only the latest business conversation starting from: "${latestBusinessMessage.content}"`);

            // Keep only messages from the latest business conversation onwards
            const cleanedMessages = session.messages.filter(msg => {
                const msgTimestamp = new Date(msg.timestamp);
                return msgTimestamp >= latestBusinessTimestamp;
            });

            // Update business context to match the latest conversation
            const latestBusinessIdea = this.extractBusinessIdeaFromMessage(latestBusinessMessage.content);

            // Extract target customer and problem from the cleaned messages
            const extractedContext = this.extractContextFromCleanedMessages(cleanedMessages);

            // Remove any questionnaire messages since they're based on mixed content
            const messagesWithoutQuestionnaire = cleanedMessages.filter(msg =>
                msg.content !== 'COMPREHENSIVE_QUESTIONS_COMPONENT'
            );

            this.log(`🔧 Removed questionnaire from mixed content session - it needs to be regenerated for: "${latestBusinessIdea}"`);
            this.log(`🔧 Extracted context: target_customer="${extractedContext.target_customer}", problem="${extractedContext.problem}"`);

            const finalTargetCustomer = extractedContext.target_customer || session.target_customer || '';
            const finalProblem = extractedContext.problem || session.problem || '';

            this.log(`🔧 Final session context: target_customer="${finalTargetCustomer}", problem="${finalProblem}"`);

            return {
                ...session,
                messages: messagesWithoutQuestionnaire,
                message_count: messagesWithoutQuestionnaire.length,
                business_idea: latestBusinessIdea,
                target_customer: finalTargetCustomer,
                problem: finalProblem,
                questions_generated: false // Reset this so questionnaire can be regenerated
            };
        }

        return session;
    },

    testCleanup: function() {
        this.log('🧹 Running test cleanup...');

        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.sessions);
            if (!stored) {
                this.log('No sessions to cleanup');
                return;
            }

            const sessions = JSON.parse(stored);
            const sessionsArray = Array.isArray(sessions) ? sessions : Object.values(sessions);

            let cleanedSessions = [];
            let removedCount = 0;
            let fixedCount = 0;

            for (const session of sessionsArray) {
                const hasMessages = Array.isArray(session.messages) && session.messages.length > 0;
                const isCorrupted = session.questions_generated && !hasMessages;

                if (isCorrupted) {
                    this.log(`🧹 REMOVING corrupted session ${session.session_id} (no messages but flagged as having questionnaires)`, 'warning');
                    removedCount++;
                    continue;
                }

                // Fix sessions with mixed content by cleaning up duplicate questionnaire messages
                if (hasMessages) {
                    const cleanedSession = this.fixMixedContentInSession(session);
                    if (cleanedSession !== session) {
                        fixedCount++;
                        this.log(`🔧 FIXED mixed content in session ${session.session_id}`, 'success');
                    }
                    cleanedSessions.push(cleanedSession);
                } else {
                    cleanedSessions.push(session);
                }
            }

            if (removedCount > 0 || fixedCount > 0) {
                localStorage.setItem(this.STORAGE_KEYS.sessions, JSON.stringify(cleanedSessions));
                this.log(`🧹 Cleanup complete: removed ${removedCount} corrupted sessions, fixed ${fixedCount} sessions with mixed content`, 'success');
            } else {
                this.log(`🧹 No cleanup needed - all sessions are clean`);
            }

            return removedCount + fixedCount;
        } catch (error) {
            this.log(`Error cleaning up corrupted sessions: ${error.message}`, 'error');
            return 0;
        }
    },

    forceCleanupAll: function() {
        this.log('🔧 FORCE CLEANUP: Processing all sessions with improved extraction logic');

        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.sessions);
            if (!stored) {
                this.log('No sessions to cleanup');
                return 0;
            }

            const sessions = JSON.parse(stored);
            const sessionsArray = Array.isArray(sessions) ? sessions : Object.values(sessions);

            this.log(`Processing ${sessionsArray.length} sessions with improved extraction logic`);

            let processedCount = 0;
            const cleanedSessions = sessionsArray.map(session => {
                if (Array.isArray(session.messages) && session.messages.length > 0) {
                    this.log(`🔧 Force processing session ${session.session_id}: "${session.business_idea}"`);
                    const cleanedSession = this.fixMixedContentInSession(session);
                    if (cleanedSession !== session) {
                        processedCount++;
                    }
                    return cleanedSession;
                }
                return session;
            });

            if (processedCount > 0) {
                localStorage.setItem(this.STORAGE_KEYS.sessions, JSON.stringify(cleanedSessions));
                this.log(`🔧 Force cleanup complete: processed ${processedCount} sessions`, 'success');
            } else {
                this.log(`🔧 Force cleanup complete: no changes needed`);
            }

            return processedCount;
        } catch (error) {
            this.log(`Error in force cleanup: ${error.message}`, 'error');
            return 0;
        }
    },

    exportSessions: function() {
        const sessions = this.getSessions();
        console.log('📤 Exporting sessions data:');
        console.log(JSON.stringify(sessions, null, 2));
        return sessions;
    },

    debugSession: function(sessionId) {
        const sessions = this.getSessions();
        const session = sessions.find(s => s.session_id === sessionId);

        if (!session) {
            this.log(`Session ${sessionId} not found`, 'error');
            return null;
        }

        console.log(`\n🔍 DEBUG SESSION: ${sessionId}`);
        console.log(`Business Idea: ${session.business_idea || 'EMPTY'}`);
        console.log(`Target Customer: ${session.target_customer || 'EMPTY'}`);
        console.log(`Problem: ${session.problem || 'EMPTY'}`);
        console.log(`Messages: ${session.messages ? session.messages.length : 0}`);

        if (session.messages && session.messages.length > 0) {
            console.log('\n📝 Messages:');
            session.messages.forEach((msg, i) => {
                console.log(`${i + 1}. [${msg.role}] ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
            });

            console.log('\n🔍 Testing extraction on this session:');
            const extracted = this.extractContextFromCleanedMessages(session.messages);
            console.log(`Extracted: target_customer="${extracted.target_customer}", problem="${extracted.problem}"`);
        }

        return session;
    }
};

// Convenience functions for console
window.testCleanup = () => window.ResearchCleanupHelper.testCleanup();
window.forceCleanupAll = () => window.ResearchCleanupHelper.forceCleanupAll();
window.showSessions = () => window.ResearchCleanupHelper.showSessions();
window.exportSessions = () => window.ResearchCleanupHelper.exportSessions();
window.debugSession = (sessionId) => window.ResearchCleanupHelper.debugSession(sessionId);

console.log('🔧 Research Cleanup Helper loaded!');
console.log('Available functions:');
console.log('  - testCleanup() - Run standard cleanup');
console.log('  - forceCleanupAll() - Force cleanup all sessions with improved extraction');
console.log('  - showSessions() - Show current session status');
console.log('  - exportSessions() - Export all sessions data');
console.log('  - debugSession(sessionId) - Debug a specific session');
